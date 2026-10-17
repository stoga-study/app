import { ArrowLeft, Copy, LogOut, Pencil, Plus, RefreshCw, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { ReportShared } from "@/components/ReportShared";
import { InviteClassmate } from "@/components/InviteClassmate";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/States";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/session";
import { addGroupSet, restoreGroupSet, createGroup, joinGroup, joinUrl, peekGroup, removeMember, resetCode, shareToGroup, unshareFromGroup, useGroup, useGroups, useGroupSets, useRefreshGroups } from "@/lib/queries/groups";
import { useSubjects } from "@/lib/queries/profile";
import { ShareError } from "@/lib/queries/share";
import { pageWord, useSources } from "@/lib/queries/sources";

const ERR: Record<string, string> = {
  group_limit: "You can make up to 10 groups.",
  group_full: "That group is full (40 people).",
  no_group: "No group has that code. Check it and try again.",
};
const errText = (e: unknown) => ERR[(e as ShareError)?.code] ?? "Something went wrong. Try again.";

/** /groups: your study groups, and making or joining one. */
export default function Groups() {
  const groups = useGroups();
  const navigate = useNavigate();
  const refresh = useRefreshGroups();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  if (groups.isPending) return <PageSkeleton label="Getting your groups." />;
  const make = async () => {
    setBusy(true);
    try {
      const id = await createGroup(name.trim());
      await refresh();
      navigate(`/groups/${id}`);
    } catch (e) {
      toast(errText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeader title="Study groups">Share study sets with a few classmates. Invite only, first names only, and no chat.</PageHeader>
      {groups.data?.length ? (
        <ul className="mb-6 grid gap-3 sm:grid-cols-2">
          {groups.data.map((g) => (
            <li key={g.id}>
              <Link to={`/groups/${g.id}`} className="card flex items-center gap-4 p-4 text-ink no-underline">
                <span className="tile soft"><Users /></span>
                <span className="min-w-0 flex-1"><b className="block truncate">{g.name}</b><span className="text-[0.875rem] text-muted">{g.members} {g.members === 1 ? "member" : "members"}</span></span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mb-6"><EmptyState icon={<Users />} title="No groups yet">Start one for your class or study buddies, or join with a code a friend sent you.</EmptyState></div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <form className="card flex flex-col gap-3 p-5" onSubmit={(e) => { e.preventDefault(); if (name.trim()) void make(); }}>
          <h2 className="text-[1.25rem]">Start a group</h2>
          <label htmlFor="group-name" className="sr-only">Group name</label>
          <input id="group-name" className="input" maxLength={60} placeholder="AP Bio, period 3" value={name} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" disabled={busy || !name.trim()} className="self-start"><Plus /> Start it</Button>
        </form>
        <form className="card flex flex-col gap-3 p-5" onSubmit={(e) => { e.preventDefault(); if (code.trim()) navigate(`/join/${code.trim().toUpperCase()}`); }}>
          <h2 className="text-[1.25rem]">Join with a code</h2>
          <label htmlFor="group-code" className="sr-only">Group code</label>
          <input id="group-code" className="input font-mono uppercase tracking-widest" maxLength={8} placeholder="ABCD2345" value={code} onChange={(e) => setCode(e.target.value.replace(/[^a-z0-9]/gi, ""))} />
          <Button type="submit" variant="secondary" disabled={code.trim().length !== 8} className="self-start">Join</Button>
        </form>
      </div>
    </>
  );
}

/** /join/:code: see the group's name and size, then join. */
export function JoinGroup() {
  const { code = "" } = useParams();
  const navigate = useNavigate();
  const refresh = useRefreshGroups();
  const [busy, setBusy] = useState(false);
  const peek = useQuery({ queryKey: ["peek-group", code], retry: false, queryFn: () => peekGroup(code) });
  if (peek.isPending) return <PageSkeleton label="Finding the group." />;
  if (!peek.data) return <ErrorState title="No group has that code">Check it with whoever sent it. <Link to="/groups">Your groups</Link>.</ErrorState>;
  const g = peek.data;
  const join = async () => {
    setBusy(true);
    try {
      const id = await joinGroup(code);
      await refresh();
      navigate(`/groups/${id}`, { replace: true });
    } catch (e) {
      toast(errText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="mx-auto max-w-md text-center">
      <span className="tile soft mx-auto"><Users /></span>
      <h1 className="mt-3 text-[2rem]">{g.name}</h1>
      <p className="text-muted">{g.members} {g.members === 1 ? "member" : "members"} · invite only</p>
      <p className="mt-4 text-[0.9375rem]">Members see your first name and the study sets you choose to share. There's no chat, and you can leave any time.</p>
      <Button className="mt-5" disabled={busy || g.joined} onClick={() => (g.joined ? navigate("/groups") : void join())}>{g.joined ? "You're already in" : busy ? "Joining…" : "Join the group"}</Button>
    </section>
  );
}

/** /groups/:id: members, the invite, and the shared library. */
export function GroupPage() {
  const { id } = useParams();
  const { session } = useAuth();
  const me = session!.user.id;
  const group = useGroup(id);
  const sets = useGroupSets(id);
  const subjects = useSubjects();
  const sources = useSources();
  const refresh = useRefreshGroups();
  const navigate = useNavigate();
  const [picking, setPicking] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [target, setTarget] = useState("");
  if (group.isPending) return <PageSkeleton label="Opening the group." />;
  if (!group.data) return <ErrorState title="You're not in this group">It may have been removed, or you left. <Link to="/groups">Your groups</Link>.</ErrorState>;
  const g = group.data;
  const owner = g.owner_id === me;
  const classFor = target || subjects.data?.[0]?.id || "";
  const shared = new Set((sets.data ?? []).filter((x) => x.mine_shared).map((x) => x.title));
  const mySets = (sources.data ?? []).filter((x) => (x.status === "ready" || x.status === "ready_text") && !x.archived && !x.copied_from && !x.copied_from_set);

  const act = (p: Promise<unknown>, done: string) => p.then(() => { toast(done); return refresh(); }).catch((e) => toast(errText(e)));

  return (
    <>
      <Link to="/groups" className="mb-4 inline-flex min-h-11 items-center gap-2 font-bold text-ink-2 no-underline"><ArrowLeft className="size-5" /> Groups</Link>
      <PageHeader title={g.name}>{g.members.length} {g.members.length === 1 ? "member" : "members"} · invite only · no chat</PageHeader>

      <section className="card p-5" aria-labelledby="invite-h">
        <h2 id="invite-h" className="text-[1.25rem]">Invite classmates</h2>
        <p className="text-[0.9375rem] text-muted">Share the link or the code. Up to 40 people.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <code className="rounded-xl bg-soft px-3 py-2 font-mono text-[1.25rem] tracking-[0.2em]">{g.code}</code>
          <InviteClassmate groupName={g.name} url={joinUrl(g.code)} label="Invite" />
          <Button variant="ghost" aria-label="Copy the code" onClick={() => navigator.clipboard.writeText(g.code).then(() => toast("Code copied."))}><Copy /></Button>
          {owner && <Button variant="ghost" onClick={() => act(resetCode(g.id), "New code made. The old one stops working.")}><RefreshCw /> New code</Button>}
        </div>
      </section>

      <section className="mt-4" aria-labelledby="library-h">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 id="library-h" className="flex-1 text-[1.375rem]">Shared study sets</h2>
          <Button variant="secondary" size="sm" onClick={() => setPicking((x) => !x)}><Plus /> Share one of mine</Button>
        </div>
        {picking && (
          <div className="card mb-3 p-4">
            {mySets.length ? (
              <ul className="divide-y divide-line">
                {mySets.slice(0, 30).map((x) => (
                  <li key={x.id} className="flex items-center gap-3 py-2">
                    <span className="min-w-0 flex-1 truncate">{x.filename}</span>
                    <Button size="sm" variant="ghost" disabled={shared.has(x.filename)} onClick={() => act(shareToGroup(g.id, x.id), "Shared with the group.")}>{shared.has(x.filename) ? "Shared" : "Share"}</Button>
                  </li>
                ))}
              </ul>
            ) : <p className="text-muted">Make a study set from one of your files first. Copies of other people's sets can't be reshared.</p>}
          </div>
        )}
        {sets.isPending ? <div className="skeleton h-24 rounded-[1.5rem]" /> : !sets.data?.length ? (
          <p className="text-muted">Nothing shared yet. Share a study set and everyone here can add a copy.</p>
        ) : (
          <>
            {(subjects.data?.length ?? 0) > 1 && (
              <label className="mb-2 flex flex-wrap items-center gap-2 text-[0.9375rem]"><span className="font-bold">Add copies to</span>
                <select className="input !min-h-10 w-auto" value={classFor} onChange={(e) => setTarget(e.target.value)}>{subjects.data!.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
              </label>
            )}
            <ul className="grid gap-3 sm:grid-cols-2">
              {sets.data.map((x) => (
                <li key={x.id} className="card flex flex-col gap-2 p-4">
                  <b className="break-words">{x.title}</b>
                  {x.hidden && <span className="chip chip-neutral self-start">Hidden after reports</span>}
                  <span className="text-[0.875rem] text-muted">Shared by {x.mine_shared ? "you" : x.by} · {x.counts.cards} cards · {x.counts.questions} quiz questions · {x.pages} {pageWord(x.kind, x.pages)}</span>
                  <div className="mt-auto flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" asChild><Link to={`/groups/${g.id}/sets/${x.id}`}><Pencil /> Open and edit</Link></Button>
                    {x.mine_shared ? (
                      <Button size="sm" variant="ghost" onClick={() => act(unshareFromGroup(x.id), "Taken out of the group.")}>Stop sharing</Button>
                    ) : x.added_id ? (
                      <Button size="sm" variant="secondary" asChild><Link to={`/sources/${x.added_id}`}>Open my copy</Link></Button>
                    ) : (
                      <Button size="sm" disabled={!classFor} onClick={() => addGroupSet(x.id, classFor).then((r) => { toast("Added to your class."); navigate(`/sources/${r.source_id}`); }).catch(() => toast("We couldn't add it. Try again."))}><Plus /> Add to my class</Button>
                    )}
                    {owner && !x.mine_shared && <Button size="sm" variant="ghost" onClick={() => act(unshareFromGroup(x.id), "Taken down.")}><Trash2 /> Take down</Button>}
                    {owner && x.hidden && <Button size="sm" variant="ghost" onClick={() => act(restoreGroupSet(x.id), "Restored for the group.")}>Restore</Button>}
                    {!x.mine_shared && !x.hidden && <ReportShared type="group_set" id={x.id} compact onHidden={() => void refresh()} />}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="card mt-4 p-5" aria-labelledby="members-h">
        <h2 id="members-h" className="text-[1.25rem]">Members</h2>
        <ul className="mt-2 divide-y divide-line">
          {g.members.map((m) => (
            <li key={m.user_id} className="flex items-center gap-3 py-2">
              <span className="flex-1">{m.display_name}{m.user_id === me ? " (you)" : ""}{m.user_id === g.owner_id ? <span className="ml-2 text-[0.8125rem] font-bold text-brand">Owner</span> : null}</span>
              {owner && m.user_id !== me && <Button size="sm" variant="ghost" onClick={() => act(removeMember(g.id, m.user_id), `${m.display_name} was removed.`)}>Remove</Button>}
            </li>
          ))}
        </ul>
        {confirmLeave ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="flex-1 text-[0.9375rem]">Leave {g.name}? The sets you shared leave with you.{owner && g.members.length > 1 ? " The next member becomes the owner." : ""}</span>
            <Button size="sm" onClick={() => removeMember(g.id, me).then(() => refresh()).then(() => navigate("/groups")).catch((e) => toast(errText(e)))}>Leave</Button>
            <Button size="sm" variant="secondary" onClick={() => setConfirmLeave(false)}>Stay</Button>
          </div>
        ) : (
          <Button variant="ghost" className="mt-2" onClick={() => setConfirmLeave(true)}><LogOut /> Leave the group</Button>
        )}
      </section>
    </>
  );
}
