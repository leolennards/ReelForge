"use client";

import {
  ArrowRight,
  CheckCircle2,
  Clapperboard,
  HardDriveDownload,
  History,
  ListVideo,
  Lock,
  MonitorSmartphone,
  ScanSearch,
  Sparkles,
  Tv,
} from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { STATUS } from "@/components/jobs/job-card";
import { DropZone, UploadList } from "@/components/media/drop-zone";
import { LibraryBrowser } from "@/components/media/library-browser";
import { EngineBanner } from "@/components/shell/engine-banner";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import { formatBytes, relativeTime } from "@/lib/format";
import { useHistory, useStats } from "@/lib/hooks";

const STEPS = [
  { icon: HardDriveDownload, label: "Import" },
  { icon: ScanSearch, label: "Analyse" },
  { icon: MonitorSmartphone, label: "Choose device" },
  { icon: Sparkles, label: "Optimise & convert" },
  { icon: Tv, label: "Watch" },
];

function StatTile({ label, value, icon, href }: { label: string; value: string | number | undefined; icon: React.ReactNode; href: string }) {
  return (
    <Link href={href} className="group rounded-[var(--radius-card)]">
      <Card interactive className="h-full p-4">
        <div className="flex items-center justify-between text-faint">
          <span className="text-xs font-medium">{label}</span>
          <span className="transition-colors group-hover:text-accent">{icon}</span>
        </div>
        {value === undefined ? (
          <Skeleton className="mt-3 h-7 w-12" />
        ) : (
          <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
        )}
      </Card>
    </Link>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const stats = useStats();
  const history = useHistory();
  const [browsing, setBrowsing] = useState(false);
  const recent = (history.data ?? []).slice(0, 5);

  return (
    <div className="space-y-8">
      <EngineBanner />

      <section className="relative overflow-hidden rounded-[28px] border border-line bg-elevated/60 p-6 shadow-card sm:p-10">
        <div
          className="pointer-events-none absolute -top-40 -right-20 size-[520px] rounded-full opacity-60 blur-3xl"
          style={{ background: "radial-gradient(circle, var(--accent-glow), transparent 65%)" }}
          aria-hidden
        />
        <div className="film-edge absolute inset-x-0 top-3 h-2.5 opacity-40" aria-hidden />
        <div className="relative grid gap-8 lg:grid-cols-[1.05fr_1fr] lg:items-center">
          <div>
            <Badge tone="accent" icon={<Lock className="size-3" />}>
              Private · processed on this computer
            </Badge>
            <motion.h2
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="mt-4 text-4xl font-semibold tracking-tight text-balance sm:text-5xl"
            >
              Your movies.
              <br />
              <span className="bg-gradient-to-r from-[#b3a6ff] to-accent bg-clip-text text-transparent">
                Ready for your screen.
              </span>
            </motion.h2>
            <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-muted">
              ReelForge checks what&apos;s inside a movie, spots what your TV may not play, and makes the smallest change
              needed, often just the audio, so the picture keeps its original quality.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <ButtonLink href="/convert" variant="primary" size="lg" icon={<Clapperboard className="size-5" />}>
                Convert a Movie
              </ButtonLink>
              <ButtonLink href="/profiles" variant="secondary" size="lg">
                Device profiles
              </ButtonLink>
            </div>
            <ol className="mt-8 flex flex-wrap items-center gap-x-2 gap-y-2 text-xs text-faint" aria-label="How it works">
              {STEPS.map((s, i) => (
                <li key={s.label} className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-sunken/70 px-2.5 py-1 text-muted">
                    <s.icon className="size-3.5 text-accent" />
                    {s.label}
                  </span>
                  {i < STEPS.length - 1 && <ArrowRight className="size-3" aria-hidden />}
                </li>
              ))}
            </ol>
          </div>
          <div className="space-y-3">
            <DropZone
              onFilesAdded={(added) => {
                if (added.some((u) => u.status !== "error")) router.push("/convert");
              }}
              onBrowseLibrary={() => setBrowsing(true)}
            />
            <UploadList />
          </div>
        </div>
      </section>

      <section aria-label="Statistics" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Completed" value={stats.data?.completed} icon={<CheckCircle2 className="size-4" />} href="/history" />
        <StatTile
          label="In the queue"
          value={stats.data ? stats.data.queued + stats.data.active : undefined}
          icon={<ListVideo className="size-4" />}
          href="/queue"
        />
        <StatTile label="Imported movies" value={stats.data?.imported} icon={<HardDriveDownload className="size-4" />} href="/convert" />
        <StatTile
          label="Converted output"
          value={stats.data ? formatBytes(stats.data.output_bytes) : undefined}
          icon={<Sparkles className="size-4" />}
          href="/history"
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader
            title="Recent conversions"
            description="The latest movies ReelForge has finished."
            icon={<History className="size-4" />}
            action={
              recent.length > 0 && (
                <ButtonLink href="/history" size="sm" variant="ghost">
                  View all
                </ButtonLink>
              )
            }
          />
          <CardBody>
            {history.isLoading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-14" />
                ))}
              </div>
            ) : recent.length === 0 ? (
              <EmptyState
                icon={<Clapperboard className="size-5" />}
                title="Nothing converted yet"
                description="Drop a movie above or open the converter. Finished movies will appear here."
                action={
                  <ButtonLink href="/convert" variant="primary" size="sm">
                    Convert your first movie
                  </ButtonLink>
                }
              />
            ) : (
              <ul className="divide-y divide-line">
                {recent.map((job) => {
                  const s = STATUS[job.status];
                  return (
                    <li key={job.id} className="flex items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{job.source_name}</p>
                        <p className="truncate text-xs text-faint">
                          {job.strategy_label} · {job.profile_name} · {relativeTime(job.finished_at)}
                        </p>
                      </div>
                      <span className="hidden text-xs text-muted tabular-nums sm:block">
                        {formatBytes(job.output_size ?? job.source_size)}
                      </span>
                      <Badge tone={s.tone} icon={s.icon}>
                        {s.label}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Device profile" description="Most recently used." icon={<Tv className="size-4" />} />
            <CardBody>
              {stats.data?.last_profile ? (
                <div>
                  <p className="font-medium">{stats.data.last_profile.name}</p>
                  <p className="mt-1 line-clamp-3 text-[13px] leading-relaxed text-muted">
                    {stats.data.last_profile.description}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {stats.data.last_profile.containers.slice(0, 3).map((c) => (
                      <Badge key={c}>{c.toUpperCase()}</Badge>
                    ))}
                    <Badge>
                      Up to {stats.data.last_profile.max_height >= 2160 ? "4K" : `${stats.data.last_profile.max_height}p`}
                    </Badge>
                  </div>
                </div>
              ) : (
                <p className="text-[13px] leading-relaxed text-muted">
                  No profile used yet. Not sure which TV you have? Start with{" "}
                  <span className="text-fg">Universal USB Playback</span>, which favours broadly supported formats.
                </p>
              )}
              <ButtonLink href="/profiles" size="sm" variant="ghost" className="mt-3 -ml-3">
                Manage profiles <ArrowRight className="size-3.5" />
              </ButtonLink>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Stays on your computer" icon={<Lock className="size-4" />} />
            <CardBody className="space-y-2 text-[13px] leading-relaxed text-muted">
              <p>
                Movies are analysed and converted by FFmpeg running locally. Nothing is uploaded to the internet and
                there is no tracking.
              </p>
              <p>Your originals are never modified or deleted; converted copies are saved as new files.</p>
            </CardBody>
          </Card>
        </div>
      </div>

      <LibraryBrowser
        open={browsing}
        onOpenChange={setBrowsing}
        onImported={(m) => {
          setBrowsing(false);
          router.push(`/convert?media=${m.id}`);
        }}
      />
    </div>
  );
}
