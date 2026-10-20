import { cn } from "@/lib/cn";

/** ReelForge mark: a film reel whose centre is a play button. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden>
      <defs>
        <linearGradient id="rf-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a594ff" />
          <stop offset="1" stopColor="#5b43f5" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#rf-g)" />
      <circle cx="16" cy="16" r="9.5" fill="none" stroke="white" strokeOpacity=".9" strokeWidth="1.6" />
      {[0, 72, 144, 216, 288].map((deg) => (
        <circle
          key={deg}
          cx={(16 + 6 * Math.cos(((deg - 90) * Math.PI) / 180)).toFixed(2)}
          cy={(16 + 6 * Math.sin(((deg - 90) * Math.PI) / 180)).toFixed(2)}
          r="1.35"
          fill="white"
          fillOpacity=".55"
        />
      ))}
      <path d="M14.2 12.9v6.2l5-3.1z" fill="white" />
    </svg>
  );
}

export function Logo({ collapsed }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark className="shrink-0 drop-shadow-[0_6px_16px_rgba(116,97,255,0.45)]" />
      {!collapsed && (
        <div className="leading-none">
          <p className="text-[15px] font-semibold tracking-tight">ReelForge</p>
          <p className="mt-1 text-[11px] text-faint">Movie conversion studio</p>
        </div>
      )}
    </div>
  );
}
