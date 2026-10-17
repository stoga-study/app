import "@fontsource/newsreader/latin-400.css";
import "@fontsource/newsreader/latin-500.css";
import "@fontsource/newsreader/latin-400-italic.css";
import "@fontsource/geist/latin-400.css";
import "@fontsource/geist/latin-500.css";
import "@fontsource/geist/latin-600.css";
import "@fontsource/geist-mono/latin-400.css";
import "@fontsource/geist-mono/latin-500.css";
import "@/styles/brand-preview.css";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/session";
import { cn } from "@/lib/cn";
import { supabase } from "@/lib/supabase";

// /preview/brand: testers compare today's look (real screenshots) with a proposed one (built live, same
// content) across five screens, then vote. Sample content only; nothing here reads the student's data.
export const SURVEY = "look-2026-10";
type Choice = "current" | "new" | "none";
const SCREENS = [
  { key: "home", label: "Home" },
  { key: "class", label: "A class" },
  { key: "review", label: "Flashcards" },
  { key: "quiz", label: "Quiz" },
  { key: "calendar", label: "Calendar" },
] as const;
type ScreenKey = (typeof SCREENS)[number]["key"];

/** Whether the app is showing dark mode right now (a chosen theme, or the device's). */
function useDark() {
  const read = () => {
    const t = document.documentElement.getAttribute("data-theme");
    return t ? t === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  };
  const [dark, setDark] = useState(read);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setDark(read());
    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    mq.addEventListener("change", update);
    return () => { obs.disconnect(); mq.removeEventListener("change", update); };
  }, []);
  return dark;
}

const Svg = ({ d }: { d: string }) => <svg viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>;
const ICON = {
  home: "M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4v-5h-6v5H5a1 1 0 0 1-1-1z",
  cal: "M5 6.5h14a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7.5a1 1 0 0 1 1-1zM4 10.5h16M8.5 4v4M15.5 4v4",
  up: "M12 15V4M7.5 8.5 12 4l4.5 4.5M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15",
  chat: "M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v6a2.5 2.5 0 0 1-2.5 2.5H11l-4 4v-4A2 2 0 0 1 5 13z",
  cards: "M8 4h10a2 2 0 0 1 2 2v10M6 7h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-3.5-3.5",
  back: "M15 5l-7 7 7 7",
  x: "M6 6l12 12M18 6 6 18",
};

function Frame({ tab, children, bar = true }: { tab: ScreenKey; children: ReactNode; bar?: boolean }) {
  const on = tab === "home" ? "Home" : tab === "calendar" ? "Calendar" : tab === "review" ? "Review" : "";
  return (
    <div className="bpn" aria-hidden="true">
      {bar && (
        <div className="n-bar">
          <span className="n-mark"><img src="/icons/seal.png" alt="" />Stoga.study</span>
          <span className="n-bar-r"><span className="n-round"><Svg d={ICON.search} /></span><span className="n-round">A</span></span>
        </div>
      )}
      <div className="n-body">{children}</div>
      <nav className="n-tabs">
        {([["Home", ICON.home], ["Calendar", ICON.cal], ["Upload", ICON.up], ["Tutor", ICON.chat], ["Review", ICON.cards]] as const).map(([l, d]) => (
          <span key={l} className={cn("n-tab", l === on && "on")}><Svg d={d} />{l}</span>
        ))}
      </nav>
    </div>
  );
}

function NewHome() {
  return (
    <Frame tab="home">
      <div>
        <div className="n-label">Friday, October 16</div>
        <h3 className="n-h1" style={{ marginTop: 4 }}>Today, Ava</h3>
      </div>
      <div className="n-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span className="n-h2">Today’s plan</span><span className="n-link">Calendar</span>
        </div>
        <div className="n-small" style={{ marginTop: 2 }}>About 16 minutes</div>
        <div style={{ marginTop: 6 }}>
          {[["Review 30 cards", "For AP Statistics midterm", "6 min"], ["Practice quiz: Unit 4", "Sampling distributions", "8 min"], ["Review 8 cards", "For Bones of the skull quiz", "2 min"], ["Read chapter 7", "Homework · Honors Anatomy", "Tomorrow"]].map(([t, s, m]) => (
            <div key={t} className="n-row"><span className="n-ck" /><span className="n-grow"><b>{t}</b><span className="n-small">{s}</span></span><span className="n-time">{m}</span></div>
          ))}
        </div>
      </div>
      <div className="n-rule" style={{ paddingTop: 10 }}>
        <div className="n-label accent">Coach</div>
        <p className="n-quote" style={{ marginTop: 5 }}>AP Statistics midterm in 3 days. No practice quiz taken yet. Want help deciding what to do first?</p>
        <span className="n-link" style={{ display: "inline-block", marginTop: 7 }}>Ask the coach</span>
      </div>
    </Frame>
  );
}

function NewClass() {
  return (
    <Frame tab="class">
      <span className="n-small" style={{ display: "flex", alignItems: "center", gap: 3 }}><svg className="n-ico" viewBox="0 0 24 24"><path d={ICON.back} /></svg>Subjects</span>
      <div>
        <div className="n-label">Science</div>
        <h3 className="n-h1" style={{ marginTop: 3 }}>AP Statistics</h3>
      </div>
      <div style={{ display: "flex", gap: 6 }}><span className="n-btn">Add notes</span><span className="n-btn sec">Write notes</span></div>
      <div className="n-card" style={{ padding: "4px 12px" }}>
        <div className="n-row" style={{ alignItems: "flex-start", padding: "10px 0" }}>
          <span className="n-grow">
            <span className="n-h2" style={{ fontSize: 15 }}>Flashcards</span>
            <span className="n-small">30 due · about 13 minutes</span>
            <span style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}><span className="n-bar-track" style={{ width: 56 }}><span style={{ width: "38%" }} /></span><span className="n-pill">Getting there</span></span>
          </span>
          <span className="n-btn" style={{ minHeight: 28 }}>Review</span>
        </div>
        <div className="n-row" style={{ alignItems: "flex-start", padding: "10px 0" }}>
          <span className="n-grow">
            <span className="n-h2" style={{ fontSize: 15 }}>Practice quizzes</span>
            <span className="n-small">Sampling distributions quiz</span>
            <span className="n-link" style={{ marginTop: 4 }}>Timed practice test</span>
          </span>
        </div>
        <div className="n-row" style={{ alignItems: "flex-start", padding: "10px 0" }}>
          <span className="n-grow">
            <span className="n-h2" style={{ fontSize: 15 }}>AI tutor</span>
            <span className="n-small">Hints first, from your own notes.</span>
            <span className="n-link" style={{ marginTop: 4 }}>Ask a question</span>
          </span>
        </div>
      </div>
    </Frame>
  );
}

function NewReview() {
  return (
    <Frame tab="review">
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <svg className="n-ico" viewBox="0 0 24 24" style={{ width: 16, height: 16 }}><path d={ICON.back} /></svg>
        <span><span className="n-h2" style={{ display: "block" }}>AP Statistics</span><span className="n-label">Card 1 of 30</span></span>
      </div>
      <div className="n-bar-track"><span style={{ width: "4%" }} /></div>
      <div className="n-card" style={{ minHeight: 168, display: "flex", flexDirection: "column", gap: 8, padding: 14 }}>
        <span className="n-label accent">Answer</span>
        <p className="n-h2" style={{ fontSize: 16, lineHeight: 1.3 }}>For large n, the sampling distribution of the mean is approximately normal.</p>
        <span className="n-small" style={{ marginTop: "auto" }}>What does the central limit theorem say?</span>
      </div>
      <div style={{ display: "flex", gap: 14 }}><span className="n-link">Edit card</span><span className="n-link">Explain this</span><span className="n-small">Something wrong?</span></div>
      <div>
        <div className="n-small" style={{ marginBottom: 6 }}>How did that feel?</div>
        <div className="n-rate">{[["Again", "10 min"], ["Hard", "4 days"], ["Good", "5 days"], ["Easy", "8 days"]].map(([a, b]) => <span key={a}>{a}<small>{b}</small></span>)}</div>
      </div>
    </Frame>
  );
}

function NewQuiz() {
  return (
    <Frame tab="quiz" bar={false}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 12 }}>
        <span className="n-round"><Svg d={ICON.x} /></span>
        <span className="n-steps"><span className="on" /><span /></span>
        <span className="n-time">1 of 2</span>
      </div>
      <div>
        <div className="n-label accent">Standard error</div>
        <p className="n-h2" style={{ marginTop: 5, fontSize: 16, lineHeight: 1.3 }}>A population has σ = 12. What is the standard error of the mean for samples of n = 36?</p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div className="n-opt"><span className="k">A</span>12</div>
        <div className="n-opt mine"><span className="k">B</span>6<span className="s">Your answer</span></div>
        <div className="n-opt right"><span className="k">C</span>2<span className="s">Correct</span></div>
        <div className="n-opt"><span className="k">D</span>0.33</div>
      </div>
      <div className="n-rule" style={{ paddingTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
        <b style={{ fontSize: 12 }}>Not quite, and that is useful to know.</b>
        <span className="n-small">Divide σ by the square root of n: 12 ÷ 6 = 2. Added to your mistake review.</span>
        <span className="n-link">From your notes, page 2</span>
      </div>
      <span className="n-btn block">Next question</span>
    </Frame>
  );
}

function NewCalendar() {
  return (
    <Frame tab="calendar">
      <div>
        <h3 className="n-h1">Calendar</h3>
        <div className="n-small" style={{ marginTop: 3 }}>Tests, quizzes, homework and projects, all in one place.</div>
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}><span className="n-btn">Add</span><span className="n-btn sec">Ask the coach</span><span className="n-link" style={{ marginLeft: 4 }}>Import</span></div>
      <div className="n-card">
        <div className="n-label">Next test</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 4 }}><span className="n-num">3</span><span className="n-muted" style={{ fontSize: 12 }}>days to go</span></div>
        <div className="n-h2" style={{ fontSize: 15, marginTop: 6 }}>AP Statistics midterm</div>
        <div className="n-small">Unit 4 · Sampling distributions · Monday, Oct 19</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}><span className="n-pill">Getting there</span><span className="n-small">No practice quiz taken yet</span></div>
        <span className="n-btn block" style={{ marginTop: 9 }}>Take a practice test</span>
      </div>
      <div className="n-seg"><span className="on">Agenda</span><span>Month</span><span>Study plan</span></div>
      <div>
        {[["17", "Sat", "Read chapter 7", "Homework · Honors Anatomy"], ["19", "Mon", "AP Statistics midterm", "Test · Unit 4"]].map(([d, m, t, s], i) => (
          <div key={t} className="n-agenda" style={i === 0 ? { borderTop: 0 } : undefined}>
            <span className="d">{d}</span><b style={{ fontSize: 11.5 }}>{t}</b><span className="m">{m}</span><span className="n-small">{s}</span>
          </div>
        ))}
      </div>
    </Frame>
  );
}

const NEW: Record<ScreenKey, () => ReactNode> = { home: NewHome, class: NewClass, review: NewReview, quiz: NewQuiz, calendar: NewCalendar };

function Strip({ look, dark }: { look: "current" | "new"; dark: boolean }) {
  return (
    <div className="-mx-4 flex snap-x snap-mandatory gap-5 overflow-x-auto px-4 pt-1 pb-4" role="list">
      {SCREENS.map((s) => {
        const New = NEW[s.key];
        return (
          <figure key={s.key} role="listitem" className="m-0 flex flex-none flex-col items-center gap-2">
            <div className="bp-phone">
              {look === "current"
                ? <img src={`/brand-preview/current-${s.key}-${dark ? "dark" : "light"}.jpg`} alt={`Today's look: ${s.label}`} loading="lazy" />
                : <New />}
            </div>
            <figcaption className="text-[0.875rem] font-bold text-muted">{s.label}</figcaption>
          </figure>
        );
      })}
    </div>
  );
}

function useMyVote() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["brand-vote", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.from("brand_votes").select("choice, comment").eq("survey", SURVEY).maybeSingle();
      if (error) throw error;
      return data as { choice: Choice; comment: string } | null;
    },
  });
}

function Vote() {
  const qc = useQueryClient();
  const mine = useMyVote();
  const [choice, setChoice] = useState<Choice | null>(null);
  const [comment, setComment] = useState<string | null>(null);
  const picked = choice ?? mine.data?.choice ?? null;
  const text = comment ?? mine.data?.comment ?? "";
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("brand_votes").upsert({ survey: SURVEY, choice: picked!, comment: text.trim().slice(0, 1000), updated_at: new Date().toISOString() }, { onConflict: "user_id,survey" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Thanks. Your vote is in"); return qc.invalidateQueries({ queryKey: ["brand-vote"] }); },
    onError: () => toast.error("Couldn't save your vote. Check your connection and try again."),
  });
  const submit = (e: FormEvent) => { e.preventDefault(); if (picked) save.mutate(); };
  const OPTIONS: { value: Choice; title: string; sub: string }[] = [
    { value: "current", title: "Today’s look", sub: "Keep it as it is" },
    { value: "new", title: "The new look", sub: "Switch to the calmer design" },
    { value: "none", title: "No preference", sub: "Either is fine" },
  ];
  return (
    <form onSubmit={submit} className="card mt-6 flex flex-col gap-4 p-6" aria-labelledby="vote-h">
      <h2 id="vote-h" className="text-[1.375rem]">Which would you rather use every day?</h2>
      <fieldset className="m-0 grid gap-3 border-0 p-0 sm:grid-cols-3">
        <legend className="sr-only">Your choice</legend>
        {OPTIONS.map((o) => (
          <label key={o.value} className={cn("flex cursor-pointer items-start gap-3 rounded-[1rem] border-2 p-4", picked === o.value ? "border-primary bg-tint" : "border-line")}>
            <input type="radio" name="choice" value={o.value} checked={picked === o.value} onChange={() => setChoice(o.value)} className="mt-1" />
            <span><b className="block">{o.title}</b><span className="text-[0.875rem] text-muted">{o.sub}</span></span>
          </label>
        ))}
      </fieldset>
      <label htmlFor="vote-comment" className="field-label">What do you like or dislike? (optional)</label>
      <textarea id="vote-comment" className="input min-h-24" maxLength={1000} value={text} onChange={(e) => setComment(e.target.value)} placeholder="For example: the new one is easier to read, but I miss the colour." />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={!picked || save.isPending}>{mine.data ? "Update my vote" : "Send my vote"}</Button>
        {mine.data && <span className="text-[0.875rem] text-muted">You voted for {OPTIONS.find((o) => o.value === mine.data!.choice)?.title.toLowerCase()}. You can change it any time.</span>}
      </div>
      <p className="field-hint">Only the Stoga.study team sees your answer.</p>
    </form>
  );
}

export default function BrandPreview() {
  const dark = useDark();
  const [look, setLook] = useState<"current" | "new">("current");
  return (
    <>
      <PageHeader title="Help pick Stoga.study’s look">
        We’re thinking about a calmer, cleaner design. Here are the same five screens in today’s look and in the new one, with the same example classes. Look through both, then vote below.
      </PageHeader>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Which look" className="inline-flex gap-1 rounded-full border-2 border-line bg-card p-1">
          {(["current", "new"] as const).map((l) => (
            <button key={l} type="button" aria-pressed={look === l} onClick={() => setLook(l)} className={cn("min-h-11 rounded-full px-5 font-bold", look === l ? "bg-primary text-white" : "text-muted")}>
              {l === "current" ? "Today’s look" : "New look"}
            </button>
          ))}
        </div>
        <span className="text-[0.875rem] text-muted">Swipe sideways to see all five. Showing {dark ? "dark" : "light"} mode, like your app.</span>
      </div>
      <Strip look={look} dark={dark} />
      <Vote />
    </>
  );
}
