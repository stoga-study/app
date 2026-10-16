import { BookOpen, CalendarDays, HeartHandshake, Heart, Home, Layers, MessageCircle, MessageSquare, Search, Settings, TrendingUp, Upload } from "lucide-react";
import type { ReactNode } from "react";
import { NavLink, Outlet } from "react-router";
import { cn } from "@/lib/cn";
import { Brand } from "./Brand";
import { OfflineBanner } from "./OfflineBanner";
import { useNoteSync } from "@/lib/queries/notes";
import { useOfflinePrefetch } from "@/lib/offline/prefetch";
import { KeyboardShortcuts } from "./KeyboardShortcuts";
import { useFaces } from "@/lib/queries/profile";
import { Face } from "./Face";

type Item = { to: string; label: string; icon: ReactNode; end?: boolean };

const MAIN: Item[] = [
  { to: "/", label: "Home", icon: <Home />, end: true },
  { to: "/subjects", label: "Subjects", icon: <BookOpen /> },
  { to: "/calendar", label: "Calendar", icon: <CalendarDays /> },
  { to: "/coach", label: "Coach", icon: <HeartHandshake /> },
  { to: "/upload", label: "Upload", icon: <Upload /> },
  { to: "/tutor", label: "Tutor", icon: <MessageCircle /> },
  { to: "/review", label: "Review", icon: <Layers /> },
  { to: "/progress", label: "Progress", icon: <TrendingUp /> },
];
// Phones get five tabs: Subjects and the coach live on Home there, and Progress is a button in the top bar.
const TABS = MAIN.filter((i) => i.to !== "/subjects" && i.to !== "/progress" && i.to !== "/coach");

const SECONDARY: Item[] = [
  { to: "/search", label: "Search", icon: <Search /> },
  { to: "/plans", label: "Plans and funding", icon: <Heart /> },
  { to: "/feedback", label: "Send feedback", icon: <MessageSquare /> },
  { to: "/settings", label: "Settings", icon: <Settings /> },
];

function SideLink({ item }: { item: Item }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        cn(
          "flex min-h-11 items-center gap-3 rounded-[0.875rem] px-3 text-[0.9375rem] font-bold text-ink-2 no-underline [&_svg]:size-5",
          isActive ? "bg-tint text-brand" : "hover:bg-card",
        )
      }
    >
      {item.icon}
      {item.label}
    </NavLink>
  );
}

export function Shell({ aside }: { aside?: ReactNode }) {
  useNoteSync();
  useOfflinePrefetch();
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[17rem_1fr] print:block">
      <a href="#main" className="sr-only-focusable btn btn-primary fixed left-4 top-4 z-50">Skip to content</a>

      {/* Desktop sidebar: 272px, per the brand layout spec. */}
      <aside className="sticky top-0 hidden h-dvh print:!hidden flex-col gap-1 border-r border-line px-4 py-5 lg:flex" aria-label="Sidebar">
        <NavLink to="/" className="mb-6 px-1 text-ink no-underline">
          <Brand />
        </NavLink>
        <nav aria-label="Main" className="flex flex-col gap-1">
          {MAIN.map((i) => <SideLink key={i.to} item={i} />)}
        </nav>
        <div className="mt-auto flex flex-col gap-1">
          {aside}
          {SECONDARY.map((i) => <SideLink key={i.to} item={i} />)}
        </div>
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-col">
        {/* Phone and tablet top bar; the sidebar carries the brand on desktop. */}
        <header className="flex items-center justify-between print:hidden px-5 pt-[calc(1rem+env(safe-area-inset-top))] md:px-8 lg:hidden">
          <NavLink to="/" className="text-ink no-underline">
            <Brand descriptor={false} />
          </NavLink>
          <div className="flex items-center gap-2">
            <NavLink
              to="/progress"
              aria-label="Progress"
              className="grid size-11 place-items-center rounded-full border-2 border-line bg-card text-ink [&_svg]:size-5"
            >
              <TrendingUp />
            </NavLink>
            <NavLink
              to="/search"
              aria-label="Search"
              className="grid size-11 place-items-center rounded-full border-2 border-line bg-card text-ink [&_svg]:size-5"
            >
              <Search />
            </NavLink>
            <NavLink
              to="/settings"
              aria-label="Settings"
              className="grid size-11 place-items-center overflow-hidden rounded-full border-2 border-line bg-card text-ink [&_svg]:size-5"
            >
              <MeFace />
            </NavLink>
          </div>
        </header>
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[70rem] flex-1 px-5 pb-28 pt-5 outline-none md:px-8 lg:px-12 lg:pb-12 lg:pt-8">
          <OfflineBanner />
          <KeyboardShortcuts />
          <Outlet />
        </main>

        {/* Phone and tablet tab bar. */}
        <nav
          aria-label="Main"
          className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 print:hidden border-t border-line bg-card px-1 pt-1.5 pb-[calc(0.5rem+env(safe-area-inset-bottom))] lg:hidden"
        >
          {TABS.map((i) => (
            <NavLink
              key={i.to}
              to={i.to}
              end={i.end}
              className={({ isActive }) =>
                cn(
                  "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[0.8125rem] no-underline [&_svg]:size-5",
                  isActive ? "font-bold text-brand" : "text-muted",
                )
              }
            >
              {i.icon}
              {i.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}

/** The student's face in the top bar (the settings icon until the profile loads). */
function MeFace() {
  const faces = useFaces();
  return faces.ready ? <Face face={faces.me} size={40} mood="still" /> : <Settings />;
}
