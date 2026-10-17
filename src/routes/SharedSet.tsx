import { useQuery } from "@tanstack/react-query";
import { BookOpen, Layers, ListChecks, NotebookPen, Plus } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { ErrorState, PageSkeleton } from "@/components/States";
import { ReportShared } from "@/components/ReportShared";
import { Button } from "@/components/ui/button";
import { shortDate } from "@/lib/calendar";
import { useSubjects } from "@/lib/queries/profile";
import { addShare, previewShare, ShareError } from "@/lib/queries/share";
import { pageWord } from "@/lib/queries/sources";

/** /s/:token: a study set someone shared. Preview it, then add a private copy to one of your classes. */
export default function SharedSet() {
  const { token } = useParams();
  const subjects = useSubjects();
  const navigate = useNavigate();
  const [subject, setSubject] = useState("");
  const [busy, setBusy] = useState(false);
  const preview = useQuery({ queryKey: ["share-preview", token], enabled: !!token, retry: false, queryFn: () => previewShare(token!) });
  if (preview.isPending || subjects.isPending) return <PageSkeleton label="Opening the shared study set." />;
  if (preview.isError) {
    const gone = preview.error instanceof ShareError && preview.error.code === "gone";
    return <ErrorState title={gone ? "This link doesn't work anymore" : "We couldn't open this link"}>{gone ? "It may have expired or been turned off. Ask whoever sent it for a new one." : "Check your connection, then try again."} <Link to="/">Go to today</Link>.</ErrorState>;
  }
  const s = preview.data!;
  const chosen = subject || subjects.data?.[0]?.id || "";
  const parts = [
    [s.counts.notes, "note sections", <NotebookPen key="n" />],
    [s.counts.cards, "flashcards", <Layers key="c" />],
    [s.counts.questions, "quiz questions", <ListChecks key="q" />],
    [s.counts.guide, "study guide sections", <BookOpen key="g" />],
  ].filter(([n]) => (n as number) > 0) as [number, string, React.ReactNode][];

  const add = async () => {
    setBusy(true);
    try {
      const r = await addShare(token!, chosen);
      toast(r.already ? "You already have this one." : "Added to your class. Your cards start fresh.");
      navigate(`/sources/${r.source_id}`);
    } catch (e) {
      toast(e instanceof ShareError && e.code === "gone" ? "This link stopped working." : "We couldn't add it. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mx-auto max-w-xl" aria-labelledby="shared-title">
      <div className="ink-panel burgundy p-6">
        <span className="circle circle-big right-[-4rem] top-[-5rem] size-52" aria-hidden="true" />
        <p className="text-[0.9375rem] text-[#F7EAEC]">{s.by ? `${s.by} shared a study set` : "A shared study set"}</p>
        <h1 id="shared-title" className="mt-1 break-words text-[1.75rem]">{s.title}</h1>
        <p className="mt-1 text-[#F7EAEC]">{s.pages} {pageWord(s.kind, s.pages)}{s.with_file ? ", with the original file" : ""} · link works until {shortDate(s.expires_at.slice(0, 10))}</p>
      </div>
      {!s.mine && <div className="mt-2 flex justify-end"><ReportShared type="share_link" id={s.id} onHidden={() => navigate("/")} /></div>}
      <ul className="card mt-4 grid gap-3 p-5 sm:grid-cols-2">
        {parts.map(([n, label, icon]) => <li key={label} className="flex items-center gap-3"><span className="tile soft">{icon}</span><span><b className="tabular">{n}</b> {label}</span></li>)}
      </ul>
      {s.mine ? (
        <p className="callout neutral mt-4"><span>This is your own study set. Send the link to a classmate and they can add a copy.</span></p>
      ) : s.added_id ? (
        <div className="mt-4 flex flex-wrap items-center gap-3"><p className="flex-1 text-muted">You've already added this one.</p><Button asChild><Link to={`/sources/${s.added_id}`}>Open it</Link></Button></div>
      ) : !subjects.data?.length ? (
        <p className="callout neutral mt-4"><span>Add your classes first, then come back to this link. <Link to="/classes">Add classes</Link></span></p>
      ) : (
        <div className="card mt-4 flex flex-col gap-3 p-5">
          <label htmlFor="share-class" className="font-bold">Add it to</label>
          <select id="share-class" className="input" value={chosen} onChange={(e) => setSubject(e.target.value)}>
            {subjects.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <p className="text-[0.875rem] text-muted">You get your own copy to study and change. Nothing you do with it is shared back.</p>
          <Button disabled={busy || !chosen} onClick={() => void add()}><Plus /> {busy ? "Adding…" : "Add to my class"}</Button>
        </div>
      )}
    </section>
  );
}
