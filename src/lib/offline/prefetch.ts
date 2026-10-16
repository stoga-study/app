import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { fetchQuiz, useQuizList } from "../queries/quiz";
import { useSources } from "../queries/sources";
import { fetchStudySet } from "../queries/studyset";
import { useOnline } from "../useOnline";

const QUIZZES = 15;
const SETS = 10;

/**
 * While online and idle, save the most recent quizzes and study sets ahead of time, so they open
 * offline even if they haven't been visited lately (the offline cache keeps them for a week).
 */
export function useOfflinePrefetch() {
  const qc = useQueryClient();
  const online = useOnline();
  const quizzes = useQuizList();
  const sources = useSources();
  const quizIds = (quizzes.data ?? []).slice(0, QUIZZES).map((q) => q.id).join(",");
  const setIds = (sources.data ?? []).filter((s) => s.status === "ready" && !s.archived).slice(0, SETS).map((s) => s.id).join(",");
  useEffect(() => {
    if (!online || (!quizIds && !setIds)) return;
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 3000));
    let cancelled = false;
    idle(() => {
      void (async () => {
        // One at a time and only what's missing or old, so it never competes with what the student is doing.
        for (const id of quizIds.split(",").filter(Boolean)) {
          if (cancelled || !navigator.onLine) return;
          await qc.prefetchQuery({ queryKey: ["quiz", id], queryFn: () => fetchQuiz(id), staleTime: 6 * 3600_000 }).catch(() => {});
        }
        for (const id of setIds.split(",").filter(Boolean)) {
          if (cancelled || !navigator.onLine) return;
          await qc.prefetchQuery({ queryKey: ["studyset", id], queryFn: () => fetchStudySet(id), staleTime: 6 * 3600_000 }).catch(() => {});
        }
      })();
    });
    return () => { cancelled = true; };
  }, [online, quizIds, setIds, qc]);
}
