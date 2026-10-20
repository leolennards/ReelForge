"use client";

import {
  ChevronsLeft,
  ChevronsRight,
  Keyboard,
  Menu,
  Moon,
  Settings as SettingsIcon,
  Sun,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Dialog as RDialog } from "radix-ui";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { cn } from "@/lib/cn";
import { useStoredValue } from "@/lib/storage";

import { useJobs } from "../providers/jobs";
import { useTheme } from "../providers/theme";
import { Button, ButtonLink } from "../ui/button";
import { Kbd } from "../ui/feedback";
import { Dialog, Tooltip } from "../ui/overlays";
import { Logo } from "./logo";
import { NAV_ITEMS, titleFor } from "./nav";
import { LocalBadge, SidebarStatus } from "./status";

const COLLAPSE_KEY = "reelforge-sidebar-collapsed";

function NavList({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { jobs } = useJobs();
  const active = jobs.filter((j) => j.status === "running" || j.status === "validating" || j.status === "queued").length;
  return (
    <nav aria-label="Main" className="space-y-1">
      {NAV_ITEMS.map((item) => {
        const current = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        const Icon = item.icon;
        const link = (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={current ? "page" : undefined}
            className={cn(
              "group relative flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
              current ? "bg-accent-soft text-fg" : "text-muted hover:bg-surface-hover hover:text-fg",
              collapsed && "justify-center px-0",
            )}
          >
            {current && (
              <motion.span
                layoutId="nav-active"
                className="absolute top-2 bottom-2 left-0 w-[3px] rounded-full bg-accent"
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
              />
            )}
            <Icon className={cn("size-[18px] shrink-0", current ? "text-accent" : "text-faint group-hover:text-fg")} />
            {!collapsed && <span className="truncate">{item.label}</span>}
            {!collapsed && item.href === "/queue" && active > 0 && (
              <span className="ml-auto rounded-full bg-accent-strong px-1.5 py-0.5 text-[10px] font-semibold text-white">
                {active}
              </span>
            )}
          </Link>
        );
        return collapsed ? (
          <Tooltip key={item.href} content={item.label} side="right">
            {link}
          </Tooltip>
        ) : (
          link
        );
      })}
    </nav>
  );
}

function ThemeToggle() {
  const { resolved, setChoice } = useTheme();
  const next = resolved === "dark" ? "light" : "dark";
  return (
    <Tooltip content={`Switch to ${next} theme`}>
      <Button variant="ghost" size="icon" aria-label={`Switch to ${next} theme`} onClick={() => setChoice(next)}>
        {resolved === "dark" ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
      </Button>
    </Tooltip>
  );
}

function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Keyboard shortcuts" size="sm">
      <ul className="space-y-2.5 text-sm">
        {NAV_ITEMS.map((n) => (
          <li key={n.href} className="flex items-center justify-between">
            <span className="text-muted">Go to {n.label}</span>
            <Kbd>{n.shortcut}</Kbd>
          </li>
        ))}
        <li className="flex items-center justify-between">
          <span className="text-muted">Toggle sidebar</span>
          <Kbd>[</Kbd>
        </li>
        <li className="flex items-center justify-between">
          <span className="text-muted">Show this list</span>
          <Kbd>?</Kbd>
        </li>
      </ul>
    </Dialog>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsedValue, setCollapsedValue] = useStoredValue(COLLAPSE_KEY, "0");
  const collapsed = collapsedValue === "1";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const toggleCollapsed = useCallback(
    () => setCollapsedValue(collapsed ? "0" : "1"),
    [collapsed, setCollapsedValue],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (target?.closest("input, textarea, select, [contenteditable=true], [role=dialog]")) return;
      const item = NAV_ITEMS.find((n) => n.shortcut === e.key);
      if (item) {
        e.preventDefault();
        router.push(item.href);
      } else if (e.key === "?") {
        setShortcutsOpen(true);
      } else if (e.key === "[") {
        toggleCollapsed();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, toggleCollapsed]);

  return (
    <div className="backdrop-cinema flex min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-lg focus:bg-elevated focus:px-3 focus:py-2"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-elevated/70 backdrop-blur-xl transition-[width] duration-200 lg:flex",
          collapsed ? "w-[76px]" : "w-[264px]",
        )}
      >
        <div className={cn("flex h-16 items-center px-5", collapsed && "justify-center px-0")}>
          <Link href="/" aria-label="ReelForge dashboard" className="rounded-lg">
            <Logo collapsed={collapsed} />
          </Link>
        </div>
        <div className="film-edge mx-5 h-2.5 opacity-60" aria-hidden />
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <NavList collapsed={collapsed} />
        </div>
        <div className="space-y-2 p-3">
          <SidebarStatus collapsed={collapsed} />
          <Button
            variant="ghost"
            size="sm"
            className={cn("w-full justify-start text-faint", collapsed && "justify-center")}
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            icon={collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
          >
            {!collapsed && "Collapse"}
          </Button>
        </div>
      </aside>

      {/* Mobile drawer */}
      <RDialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <AnimatePresence>
          {mobileOpen && (
            <RDialog.Portal forceMount>
              <RDialog.Overlay asChild forceMount>
                <motion.div
                  className="fixed inset-0 z-40 bg-black/60 lg:hidden"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                />
              </RDialog.Overlay>
              <RDialog.Content asChild forceMount>
                <motion.aside
                  className="fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col border-r border-line bg-elevated p-3 lg:hidden"
                  initial={{ x: -300 }}
                  animate={{ x: 0 }}
                  exit={{ x: -300 }}
                  transition={{ type: "spring", stiffness: 420, damping: 40 }}
                >
                  <RDialog.Title className="sr-only">Navigation</RDialog.Title>
                  <RDialog.Description className="sr-only">Main navigation</RDialog.Description>
                  <div className="flex h-14 items-center justify-between px-2">
                    <Logo />
                    <RDialog.Close asChild>
                      <Button variant="ghost" size="icon" aria-label="Close navigation">
                        <X className="size-4" />
                      </Button>
                    </RDialog.Close>
                  </div>
                  <div className="flex-1 py-3">
                    <NavList collapsed={false} onNavigate={() => setMobileOpen(false)} />
                  </div>
                  <SidebarStatus collapsed={false} />
                </motion.aside>
              </RDialog.Content>
            </RDialog.Portal>
          )}
        </AnimatePresence>
      </RDialog.Root>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-bg/70 px-4 backdrop-blur-xl sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label="Open navigation"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="size-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="hidden text-[11px] font-medium tracking-wide text-faint uppercase sm:block">ReelForge</p>
            <h1 className="truncate text-[15px] font-semibold tracking-tight">{titleFor(pathname)}</h1>
          </div>
          <LocalBadge />
          <Tooltip content="Keyboard shortcuts (?)">
            <Button
              variant="ghost"
              size="icon"
              className="hidden md:inline-flex"
              aria-label="Keyboard shortcuts"
              onClick={() => setShortcutsOpen(true)}
            >
              <Keyboard className="size-[18px]" />
            </Button>
          </Tooltip>
          <ThemeToggle />
          <Tooltip content="Settings">
            <ButtonLink href="/settings" variant="ghost" size="icon" aria-label="Settings">
              <SettingsIcon className="size-[18px]" />
            </ButtonLink>
          </Tooltip>
        </header>

        <main id="main" className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
          >
            {children}
          </motion.div>
        </main>
      </div>

      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  );
}
