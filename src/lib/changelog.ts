import { useQuery } from "@tanstack/react-query";

export type Release = {
  version: string;
  date: string;
  title: string;
  intro?: string;
  highlights: { icon: string; title: string; text: string }[];
  fixes?: string[];
};

/** Compare "1.10.2" with "1.9.0": positive when a is newer. */
export function compareVersions(a: string, b: string) {
  const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** Releases newer than the one a student last saw, newest first. */
export function unseen(releases: Release[], lastSeen: string | null | undefined) {
  return lastSeen ? releases.filter((r) => compareVersions(r.version, lastSeen) > 0) : [];
}

/** The changelog (public/changelog.json), newest first. Also read by the release email. */
export function useChangelog() {
  return useQuery({
    queryKey: ["changelog"],
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<Release[]> => {
      const res = await fetch("/changelog.json", { cache: "no-cache" });
      if (!res.ok) throw new Error(`changelog ${res.status}`);
      const data = (await res.json()) as { releases: Release[] };
      return [...data.releases].sort((a, b) => compareVersions(b.version, a.version));
    },
  });
}
