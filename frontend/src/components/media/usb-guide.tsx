"use client";

import { HardDrive, Usb } from "lucide-react";

import { useStoredValue } from "@/lib/storage";

import { Badge } from "../ui/badge";
import { Checkbox } from "../ui/form";

const FILESYSTEMS = [
  {
    name: "FAT32",
    tone: "warning" as const,
    tag: "4 GiB file limit",
    body:
      "Read by almost every TV, but a single file can't be larger than 4 GiB minus one byte. Most full-length HD movies are bigger than that.",
  },
  {
    name: "exFAT",
    tone: "success" as const,
    tag: "Usually the best choice",
    body:
      "No practical file-size limit and supported by most TVs made in recent years. Works on both Mac and Windows.",
  },
  {
    name: "NTFS",
    tone: "neutral" as const,
    tag: "Check your TV",
    body:
      "No practical file-size limit. Many TVs read it, but some don't, and Macs can read but not write NTFS without extra software.",
  },
];

const CHECKLIST = [
  "Check that your TV supports the output format (see its manual or support page).",
  "Confirm your TV can read the USB drive's filesystem.",
  "Make sure the drive has enough free space for the file.",
  "Copy the finished file, then eject the drive safely before unplugging it.",
  "Play the movie on the actual TV, including a skip to the middle and the end.",
];

const CHECK_KEY = "reelforge-usb-checklist";

function parseChecklist(raw: string): boolean[] {
  try {
    const saved = JSON.parse(raw);
    if (Array.isArray(saved) && saved.length === CHECKLIST.length) return saved.map(Boolean);
  } catch {
    // Unreadable value: start fresh.
  }
  return CHECKLIST.map(() => false);
}

export function UsbGuide() {
  const [stored, setStored] = useStoredValue(CHECK_KEY, "[]");
  const checked = parseChecklist(stored);
  const toggle = (i: number, value: boolean) =>
    setStored(JSON.stringify(checked.map((v, j) => (j === i ? value : v))));

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-3">
        {FILESYSTEMS.map((fs) => (
          <div key={fs.name} className="rounded-xl border border-line bg-sunken/50 p-4">
            <div className="flex items-center gap-2">
              <HardDrive className="size-4 text-accent" />
              <p className="font-semibold">{fs.name}</p>
            </div>
            <Badge tone={fs.tone} className="mt-2">
              {fs.tag}
            </Badge>
            <p className="mt-2.5 text-[13px] leading-relaxed text-muted">{fs.body}</p>
          </div>
        ))}
      </div>
      <p className="text-[13px] leading-relaxed text-muted">
        Before reformatting a USB drive, check which filesystems your TV supports. Formatting erases everything on
        the drive. ReelForge never formats drives or deletes files on them.
      </p>
      <div>
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Usb className="size-4 text-accent" /> Playback checklist
        </p>
        <div className="space-y-0.5">
          {CHECKLIST.map((item, i) => (
            <Checkbox key={item} checked={checked[i]} onChange={(v) => toggle(i, v)} label={item} />
          ))}
        </div>
      </div>
    </div>
  );
}
