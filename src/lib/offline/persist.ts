import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import type { Query } from "@tanstack/react-query";
import { del, get, set } from "./kv";

// What stays available offline: enough to open the app, review due cards, read study sets and
// take saved quizzes, and read and write your own notes. The tutor and uploads always need a connection, so they are not kept.
const OFFLINE = new Set(["profile", "subjects", "sources", "source", "source-pages", "studyset", "due-cards", "due-queue", "next-due", "quiz", "quiz-list", "mistakes", "allowance", "review-history", "card-stats", "units", "notes", "note", "weak-cards", "unfinished-quiz", "class-cards", "decks", "deck", "deck-links", "mastery-cards", "unit-question-counts"]);

export const persister = createAsyncStoragePersister({
  storage: { getItem: get, setItem: set, removeItem: del },
  key: "stoga-cache",
  throttleTime: 1500,
});

export const shouldKeep = (q: Query) => q.state.status === "success" && OFFLINE.has(String(q.queryKey[0]));

/** One week; older caches are dropped rather than shown stale. */
export const MAX_AGE = 7 * 24 * 60 * 60 * 1000;

/** Bump when the shape of cached data changes, so old caches are discarded instead of loaded. */
export const CACHE_VERSION = "4";
