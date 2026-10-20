"""Real conversions with FFmpeg on tiny generated samples (skipped without FFmpeg)."""

from __future__ import annotations

import time

import pytest
from conftest import CLIENT, needs_ffmpeg
from fastapi.testclient import TestClient
from media_factory import _run

from reelforge.main import create_app

pytestmark = [needs_ffmpeg, pytest.mark.ffmpeg]


@pytest.fixture
def client(settings):
    with TestClient(create_app(settings, extra_hosts={"testserver"})) as c:
        yield c


def import_sample(client, path):
    r = client.post("/api/media/library", json={"root": 0, "path": path.name}, headers=CLIENT)
    assert r.status_code == 200, r.text
    return r.json()


def wait_for(client, job_id, statuses=("completed", "failed", "canceled"), timeout=60):
    deadline = time.time() + timeout
    while time.time() < deadline:
        job = client.get(f"/api/jobs/{job_id}").json()
        if job["status"] in statuses:
            return job
        time.sleep(0.2)
    raise AssertionError(f"job {job_id} did not reach {statuses}: {job}")


def test_analysis_reports_real_streams(client, samples):
    m = import_sample(client, samples["h264_dts_mkv"])
    info = m["info"]
    assert info["container"] == "mkv"
    assert info["video"][0]["codec"] == "h264"
    assert info["audio"][0]["codec"] == "dts" and info["audio"][0]["channels"] == 6


def test_happy_path_audio_fix(client, samples, settings):
    m = import_sample(client, samples["h264_dts_mkv"])
    plan = client.post(
        "/api/plan", json={"media_id": m["id"], "profile_id": "universal"}, headers=CLIENT
    ).json()
    assert plan["plan"]["strategy"] == "audio_fix"
    assert plan["compatibility"]["overall"] == "audio_conversion"

    job = client.post(
        "/api/jobs", json={"media_id": m["id"], "profile_id": "universal"}, headers=CLIENT
    ).json()
    done = wait_for(client, job["id"])
    assert done["status"] == "completed", done["error"]
    assert done["validation"]["ok"] is True
    assert {i["key"] for i in done["ready"]} >= {"container", "video", "audio", "file_size"}
    out = settings.default_output_dir / f"{done['output_name']}.mp4"
    assert out.is_file() and out.stat().st_size == done["output_size"]
    # Original untouched; no temporary files left behind.
    assert samples["h264_dts_mkv"].is_file()
    assert not list(settings.default_output_dir.glob(".reelforge-*"))

    download = client.get(f"/api/jobs/{job['id']}/download")
    assert download.status_code == 200 and len(download.content) == done["output_size"]

    history = client.get("/api/history").json()
    assert history[0]["id"] == job["id"]
    assert client.delete("/api/history", headers=CLIENT).json()["deleted"] >= 1


def test_duplicate_job_is_rejected(client, samples):
    m = import_sample(client, samples["h264_aac_mkv"])
    body = {"media_id": m["id"], "profile_id": "universal"}
    first = client.post("/api/jobs", json=body, headers=CLIENT)
    second = client.post("/api/jobs", json=body, headers=CLIENT)
    assert first.status_code == 200
    assert second.status_code == 409 or first.json()["status"] != "queued"
    wait_for(client, first.json()["id"])


def test_no_conversion_needed_is_refused(client, samples):
    m = import_sample(client, samples["h264_aac_mp4"])
    r = client.post("/api/jobs", json={"media_id": m["id"], "profile_id": "universal"}, headers=CLIENT)
    assert r.status_code == 400 and "No conversion is needed" in r.json()["detail"]


# Scenario 7
def test_corrupt_input_fails_gracefully(client, samples):
    r = client.post("/api/media/library", json={"root": 0, "path": samples["corrupt"].name}, headers=CLIENT)
    assert r.status_code == 422
    assert "could not be read" in r.json()["detail"]


def test_upload_streams_to_disk_and_analyses(client, samples):
    data = samples["h264_aac_mkv"].read_bytes()
    r = client.put("/api/media/upload", content=data, headers={**CLIENT, "X-Filename": "My%20Movie.mkv"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["name"] == "My Movie.mkv" and body["source_kind"] == "upload"
    assert body["location"] is None
    assert client.delete(f"/api/media/{body['id']}", headers=CLIENT).status_code == 200


# Scenario 8
def test_insufficient_disk_space_stops_safely(client, samples, settings, monkeypatch):
    from reelforge.jobs import manager

    monkeypatch.setattr(manager, "free_space", lambda _p: 1024)
    m = import_sample(client, samples["h264_dts_mkv"])
    job = client.post(
        "/api/jobs",
        json={"media_id": m["id"], "profile_id": "universal", "options": {"keep_metadata": False}},
        headers=CLIENT,
    ).json()
    done = wait_for(client, job["id"])
    assert done["status"] == "failed"
    assert "Not enough free space" in done["error"]
    assert not list(settings.default_output_dir.glob("*.mp4"))


# Scenario 9
def test_cancel_terminates_ffmpeg(client, settings, tmp_path):
    long_sample = settings.media_dirs[0] / "long.mkv"
    if not long_sample.exists():
        _run(
            [
                "-f",
                "lavfi",
                "-i",
                "testsrc2=size=1280x720:rate=30:duration=90",
                "-f",
                "lavfi",
                "-i",
                "sine=duration=90",
                "-c:v",
                "libx264",
                "-preset",
                "ultrafast",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                "-shortest",
                str(long_sample),
            ]
        )
    m = import_sample(client, long_sample)
    job = client.post(
        "/api/jobs",
        json={
            "media_id": m["id"],
            "profile_id": "universal",
            "options": {"mode": "full", "encoder_preset": "slow"},
        },
        headers=CLIENT,
    ).json()
    wait_for(client, job["id"], statuses=("running",))
    time.sleep(1.0)
    state = client.app.state.reelforge
    proc = state.jobs._procs.get(job["id"])
    assert client.post(f"/api/jobs/{job['id']}/cancel", headers=CLIENT).status_code == 200
    done = wait_for(client, job["id"])
    assert done["status"] == "canceled"
    if proc is not None:
        assert proc.returncode is not None
    assert not list(settings.default_output_dir.glob(".reelforge-*"))
    retry = client.post(f"/api/jobs/{job['id']}/retry", headers=CLIENT)
    assert retry.status_code == 200 and retry.json()["retry_of"] == job["id"]
    client.post(f"/api/jobs/{retry.json()['id']}/cancel", headers=CLIENT)
    wait_for(client, retry.json()["id"])


# Scenario 10 (end to end)
def test_failed_validation_marks_job_unsuccessful(client, samples, settings, monkeypatch):
    from reelforge.jobs import manager
    from reelforge.jobs.validate import ValidationCheck, ValidationResult

    monkeypatch.setattr(
        manager,
        "validate_output",
        lambda *_a: ValidationResult(
            ok=False, checks=[ValidationCheck(name="Duration", ok=False, detail="Too short.")]
        ),
    )
    m = import_sample(client, samples["h264_dts_mkv"])
    job = client.post(
        "/api/jobs",
        json={"media_id": m["id"], "profile_id": "universal", "options": {"keep_chapters": False}},
        headers=CLIENT,
    ).json()
    done = wait_for(client, job["id"])
    assert done["status"] == "failed"
    assert "validation failed" in done["error"]
    assert not any(p.suffix == ".mp4" for p in settings.default_output_dir.glob("*"))


def test_interrupted_jobs_are_recovered_on_restart(settings, samples):
    app = create_app(settings, extra_hosts={"testserver"})
    with TestClient(app) as c:
        m = import_sample(c, samples["h264_dts_mkv"])
        state = c.app.state.reelforge
        partial = settings.default_output_dir / ".reelforge-zzz.partial.mp4"
        partial.parent.mkdir(parents=True, exist_ok=True)
        partial.write_bytes(b"partial")
        state.db.insert_job(
            {
                "id": "zzz",
                "media_id": m["id"],
                "source_name": "x",
                "source_size": 1,
                "profile_id": "universal",
                "profile_name": "Universal",
                "profile_json": "{}",
                "options_json": "{}",
                "plan_json": "{}",
                "strategy": "audio_fix",
                "status": "running",
                "output_name": "x",
                "dedupe_key": "k",
                "created_at": "2026-01-01T00:00:00+00:00",
                "temp_path": str(partial),
            }
        )
        state.jobs.recover_interrupted()
        row = state.db.get_job("zzz")
        assert row["status"] == "interrupted" and "Retry" in row["error"]
        assert not partial.exists()


def test_subtitles_and_sidecar_srt(client, samples, settings):
    m = import_sample(client, samples["subs_mkv"])
    job = client.post(
        "/api/jobs",
        json={"media_id": m["id"], "profile_id": "universal", "options": {"external_srt": True}},
        headers=CLIENT,
    ).json()
    done = wait_for(client, job["id"])
    assert done["status"] == "completed", done["error"]
    assert done["srt_available"] is True
    assert client.get(f"/api/jobs/{job['id']}/subtitles").text.startswith("1")
