// The coach card on Home: one line, written by rules (no AI), and what tapping it says to the coach.
import type { Readiness } from "./readiness";

export type Nudge = { text: string; say: string | null; cta: string };
export type NudgeInput = {
  hasClasses: boolean;
  /** Tests and quizzes from today on, nearest first. */
  exams: { title: string; className: string | null; daysLeft: number; fresh: number; cards: number; readiness: Readiness | null }[];
  overdue: number;
};

const when = (n: number) => (n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`);

/**
 * In order: a test today, a test within a week (new cards, needs work, or looking ready), overdue
 * homework, then an empty calendar. Null when there is nothing worth saying.
 */
export function coachNudge(i: NudgeInput): Nudge | null {
  const next = i.exams[0];
  if (next && next.daysLeft === 0) {
    return { text: `${next.title} is today. You've put the work in, so trust it.`, say: `I have my ${next.title} today and I'm a bit nervous`, cta: "Talk it through" };
  }
  if (next && next.daysLeft <= 7) {
    const name = !next.className || next.title.toLowerCase().startsWith(next.className.toLowerCase()) ? next.title : `${next.className} ${next.title}`;
    if (next.cards > 0 && next.fresh / next.cards >= 0.5) {
      const share = next.fresh === next.cards ? "none of its cards are started yet" : `${next.fresh} of its ${next.cards} cards are still new`;
      return { text: `${name} ${when(next.daysLeft)}, and ${share}. Want tonight's plan?`, say: `Make me a plan for tonight for my ${next.title}`, cta: "Get tonight's plan" };
    }
    if (next.readiness?.level === "needs" || next.readiness?.level === "getting") {
      return { text: `${name} ${when(next.daysLeft)}. ${next.readiness.reason}. Want help deciding what to do first?`, say: `What should I focus on for my ${next.title}?`, cta: "Ask the coach" };
    }
    if (next.readiness?.level === "ready") {
      return { text: `${name} ${when(next.daysLeft)}, and you're looking ready. A quick practice quiz keeps it fresh.`, say: null, cta: "Open the coach" };
    }
    // Nothing to study from yet: still worth a plan.
    return { text: `${name} ${when(next.daysLeft)}. Want a plan for it?`, say: `Help me plan for my ${next.title}`, cta: "Make a plan" };
  }
  if (i.overdue > 0) {
    return { text: `${i.overdue === 1 ? "One thing is" : `${i.overdue} things are`} past due. Want to sort out when to get ${i.overdue === 1 ? "it" : "them"} done?`, say: "Help me catch up on my late homework", cta: "Make a catch-up plan" };
  }
  if (!i.exams.length && i.hasClasses) {
    return { text: "Nothing on your calendar yet. Tell the coach about your next test, like “bio test friday on unit 4”, and it plans the rest.", say: null, cta: "Open the coach" };
  }
  return null;
}
