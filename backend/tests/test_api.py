"""API behaviour that doesn't need FFmpeg: security, settings, profiles, uploads."""

from __future__ import annotations

import pytest
from conftest import CLIENT
from fastapi.testclient import TestClient

from reelforge.main import create_app
from reelforge.media.ffmpeg_tools import FFmpegStatus

MISSING_FFMPEG = FFmpegStatus(error="FFmpeg and FFprobe not found on this computer.")


@pytest.fixture
def client(plain_settings):
    app = create_app(plain_settings, ffmpeg_status=MISSING_FFMPEG, extra_hosts={"testserver"})
    with TestClient(app) as c:
        yield c


def test_health_and_system(client):
    assert client.get("/api/health").json()["status"] == "ok"
    system = client.get("/api/system").json()
    assert system["ffmpeg"]["available"] is False
    assert system["ffmpeg"]["install_hint"]


def test_rejects_foreign_host(plain_settings):
    app = create_app(plain_settings, ffmpeg_status=MISSING_FFMPEG)
    with TestClient(app, base_url="http://evil.example") as c:
        assert c.get("/api/health").status_code == 421
    with TestClient(app, base_url="http://127.0.0.1:8765") as c:
        assert c.get("/api/health").status_code == 200


def test_rejects_foreign_origin(client):
    r = client.get("/api/jobs", headers={"Origin": "https://evil.example"})
    assert r.status_code == 403


def test_allows_configured_origin_with_cors(client):
    r = client.get("/api/jobs", headers={"Origin": "http://localhost:3000"})
    assert r.status_code == 200
    assert r.headers["access-control-allow-origin"] == "http://localhost:3000"


def test_state_changes_require_client_header(client):
    assert client.put("/api/settings", json={}).status_code == 403
    assert client.put("/api/settings", json={}, headers=CLIENT).status_code == 200


def test_settings_validation_and_reset(client):
    r = client.put("/api/settings", json={"max_concurrent_jobs": 9}, headers=CLIENT)
    assert r.status_code == 422
    r = client.put("/api/settings", json={"output_dir": "/etc"}, headers=CLIENT)
    assert r.status_code == 403
    r = client.put("/api/settings", json={"theme": "light", "max_concurrent_jobs": 2}, headers=CLIENT)
    assert r.json()["theme"] == "light"
    assert client.post("/api/settings/reset", headers=CLIENT).json()["theme"] == "dark"


def test_custom_profile_crud(client):
    template = client.get("/api/profiles/options").json()["template"]
    profile = template | {"id": "living-room", "name": "Living room TV"}
    r = client.put("/api/profiles/living-room", json=profile, headers=CLIENT)
    assert r.status_code == 200 and r.json()["builtin"] is False
    ids = [p["id"] for p in client.get("/api/profiles").json()]
    assert "living-room" in ids and "samsung" in ids
    builtin = client.put("/api/profiles/samsung", json=profile | {"id": "samsung"}, headers=CLIENT)
    assert builtin.status_code == 400
    assert client.delete("/api/profiles/living-room", headers=CLIENT).status_code == 200
    assert client.delete("/api/profiles/universal", headers=CLIENT).status_code == 400


def test_upload_rejects_unsupported_extension(client):
    r = client.put("/api/media/upload", content=b"hello", headers={**CLIENT, "X-Filename": "notes.txt"})
    assert r.status_code == 415


def test_upload_enforces_size_limit(plain_settings):
    from dataclasses import replace

    small = replace(plain_settings, max_upload_bytes=10)
    with TestClient(create_app(small, ffmpeg_status=MISSING_FFMPEG, extra_hosts={"testserver"})) as c:
        r = c.put("/api/media/upload", content=b"x" * 100, headers={**CLIENT, "X-Filename": "a.mkv"})
        assert r.status_code == 413


def test_upload_without_ffprobe_is_cleaned_up(client, plain_settings):
    r = client.put("/api/media/upload", content=b"x" * 100, headers={**CLIENT, "X-Filename": "a.mkv"})
    assert r.status_code == 503
    leftovers = list((plain_settings.upload_dir).glob("*/*"))
    assert leftovers == []


def test_library_browse_is_confined(client, plain_settings):
    (plain_settings.media_dirs[0] / "Film.mkv").write_bytes(b"x")
    (plain_settings.media_dirs[0] / "notes.txt").write_bytes(b"x")
    (plain_settings.media_dirs[0] / ".hidden.mkv").write_bytes(b"x")
    listing = client.get("/api/library/browse", params={"root": 0}).json()
    assert [f["name"] for f in listing["files"]] == ["Film.mkv"]
    assert client.get("/api/library/browse", params={"root": 0, "path": "../.."}).status_code == 403
    assert client.get("/api/library/browse", params={"root": 7}).status_code == 404


def test_output_folder_browser_is_confined(client, plain_settings):
    plain_settings.output_roots[0].mkdir(parents=True)
    assert client.get("/api/fs/dirs", params={"path": "/"}).status_code == 403
    assert client.get("/api/fs/dirs", params={"path": str(plain_settings.output_roots[0])}).status_code == 200


def test_unknown_job_and_media(client):
    assert client.get("/api/jobs/nope").status_code == 404
    assert (
        client.post(
            "/api/plan", json={"media_id": "nope", "profile_id": "universal"}, headers=CLIENT
        ).status_code
        == 404
    )
