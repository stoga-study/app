import { Archive, CalendarDays, Camera, CheckSquare, ClipboardList, CloudOff, Columns2, Copy, Download, Flag, Flame, FolderOpen, FolderTree, Gauge, Gift, History, Layers, Lightbulb, ListChecks, MessageCircleQuestion, NotebookPen, Pin, PenLine, Quote, Repeat, Scan, Search, Settings, Shuffle, Sparkles, Tag, TrendingUp, UserCheck, Users, Wand2, type LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  choose: Wand2, amount: ListChecks, more: Layers, free: Gift, photo: Camera, photos: Camera,
  unit: FolderOpen, pin: Pin, group: Users,
  notes: NotebookPen, side: Columns2, checklist: CheckSquare, offline: CloudOff,
  continue: History, history: History, weak: Flame, retention: Gauge,
  browse: Search, search: Search, tag: Tag, deck: Layers, select: CheckSquare, cards: Layers,
  type: PenLine, check: Sparkles, self: UserCheck, review: Layers,
  mastery: TrendingUp, unitquiz: Shuffle, summary: ClipboardList, terms: ClipboardList,
  archive: Archive, copy: Copy, calendar: CalendarDays, import: Download, repeat: Repeat,
  settings: Settings, explain: MessageCircleQuestion, example: Lightbulb, quote: Quote, flag: Flag,
  scan: Scan, slides: Columns2, viewer: Search, focus: FolderTree, depth: Gauge, tidy: Wand2, gaps: Sparkles, paste: Copy, scope: FolderTree,
};

/** The icon for a changelog highlight (a sparkle if it has none of its own). */
export function ReleaseIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? Sparkles;
  return <Icon className={className} aria-hidden="true" />;
}
