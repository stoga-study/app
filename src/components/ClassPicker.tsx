import { Check, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { catalog, catalogIsCurrent, currentSchoolYear, DEPARTMENTS, LEVEL_LABEL, mergeSameLevel, sectionsForGrade, type Course, type Picks, type Section } from "@/lib/catalog";
import type { Grade } from "@/lib/grade";

function matches(course: Course, q: string) {
  if (!q) return true;
  const hay = [course.title, ...course.sections.flatMap((s) => [s.name, s.code])].join(" ").toLowerCase();
  return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
}

function meta(course: Course) {
  const credit = course.credits === null ? null : `${course.credits} credit${course.credits === 1 ? "" : "s"}`;
  return [course.duration, credit].filter(Boolean).join(" · ");
}

function levelText(s: Section, grade: Grade | null, course?: Course, options?: Section[]) {
  let label = s.level ? LEVEL_LABEL[s.level] : "Standard";
  // When two options share a level, say what tells them apart: the term, or the version's name.
  if (course && options && options.filter((o) => o.level === s.level).length > 1) {
    const distinct = s.term ?? (s.name !== course.title ? s.name : null);
    if (distinct) label = s.level ? `${distinct} · ${label}` : distinct;
  }
  return grade && s.approvalGrades.includes(grade) ? `${label}, with approval` : label;
}

/** Pick core classes for a grade, one level per course. */
export function ClassPicker({ grade, value, onChange }: { grade: Grade | null; value: Picks; onChange: (next: Picks) => void }) {
  const [query, setQuery] = useState("");
  const [allGrades, setAllGrades] = useState(false);
  const shownGrade = allGrades ? null : grade;

  const groups = useMemo(
    () =>
      DEPARTMENTS.map((dept) => ({
        dept,
        courses: catalog.courses.filter(
          (c) => c.department === dept && matches(c, query.trim()) && (c.id in value || sectionsForGrade(c, shownGrade).length > 0),
        ),
      })).filter((g) => g.courses.length > 0),
    [query, shownGrade, value],
  );

  function toggle(course: Course, options: Section[]) {
    const next = { ...value };
    if (course.id in next) delete next[course.id];
    else next[course.id] = options.length === 1 ? options[0].code : "";
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden="true" />
          <label htmlFor="class-search" className="sr-only">Search classes</label>
          <input id="class-search" className="input !pl-12" placeholder="Search, e.g. Algebra 2 or 2150" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <nav aria-label="Departments" className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
          {groups.map((g) => (
            <button key={g.dept} type="button" className="chip chip-neutral flex-none" onClick={() => document.getElementById(`dept-${g.dept}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}>
              {g.dept}
            </button>
          ))}
        </nav>
        {grade && (
          <label className="flex min-h-11 items-center gap-3 text-[0.9375rem] text-muted">
            <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={allGrades} onChange={(e) => setAllGrades(e.target.checked)} />
            Also show classes usually taken in other grades
          </label>
        )}
      </div>

      {!catalogIsCurrent && (
        <p className="callout neutral">
          The {currentSchoolYear} Program of Studies is not out yet, so these are the {catalog.schoolYear} classes. They update when the new one is published.
        </p>
      )}

      {groups.length === 0 && <p className="callout neutral">No classes match “{query}”. Try a shorter search or the course code.</p>}

      {groups.map((g) => (
        <section key={g.dept} id={`dept-${g.dept}`} aria-labelledby={`dept-h-${g.dept}`} className="scroll-mt-4">
          <h2 id={`dept-h-${g.dept}`} className="eyebrow mb-2">{g.dept}</h2>
          <ul className="grid items-start gap-2 lg:grid-cols-2">
            {g.courses.map((course) => {
              const picked = course.id in value;
              const chosen = value[course.id];
              let options = sectionsForGrade(course, shownGrade);
              if (chosen && !options.some((s) => s.code === chosen)) options = [...options, ...course.sections.filter((s) => s.code === chosen)];
              if (options.length === 0) options = course.sections;
              const choices = mergeSameLevel(options);
              const needsLevel = picked && !chosen;
              const hasTracks = choices.some((s) => s.track);
              return (
                <li key={course.id} className={`card overflow-hidden !shadow-none ${picked ? "!border-primary" : ""}`}>
                  <button type="button" aria-pressed={picked} onClick={() => toggle(course, choices)} className="flex w-full items-start gap-3 p-4 text-left">
                    <span className={`mt-0.5 grid size-6 flex-none place-items-center rounded-full border-2 ${picked ? "border-primary bg-primary text-white" : "border-line-strong"}`}>
                      {picked && <Check className="size-3.5" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold">{(chosen && course.sections.find((s) => s.code === chosen)?.track && course.sections.find((s) => s.code === chosen)?.name) || course.title}</span>
                      <span className="block text-[0.875rem] text-muted">{meta(course)}{course.prerequisite ? ` · Prerequisite: ${course.prerequisite}` : ""}</span>
                    </span>
                  </button>
                  {picked && choices.length > 1 && (
                    <div className="border-t border-line bg-soft px-4 py-3">
                      <p id={`lvl-${course.id}`} className={`mb-2 text-[0.875rem] font-bold ${needsLevel ? "text-brand" : "text-muted"}`}>
                        {needsLevel ? (hasTracks ? "Which version are you in?" : "Which level are you in?") : hasTracks ? "Version" : "Level"}
                      </p>
                      {hasTracks ? (
                        <div role="radiogroup" aria-labelledby={`lvl-${course.id}`} className="flex flex-col gap-2">
                          {choices.map((s) => {
                            const on = s.codes.includes(chosen);
                            return (
                              <button key={s.code} type="button" role="radio" aria-checked={on} onClick={() => onChange({ ...value, [course.id]: s.code })}
                                className={`flex items-center gap-3 rounded-[0.875rem] border-2 bg-card px-3 py-2.5 text-left ${on ? "border-primary bg-tint" : "border-line"}`}>
                                <span className={`grid size-5 flex-none place-items-center rounded-full border-2 ${on ? "border-primary bg-primary text-white" : "border-line-strong"}`}>
                                  {on && <Check className="size-3" />}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block font-bold">{s.name} <span className="font-normal text-muted">· {levelText(s, shownGrade)}</span></span>
                                  {s.trackNote && <span className="block text-[0.8125rem] text-muted">{s.trackNote}</span>}
                                </span>
                                <span className="tabular text-[0.8125rem] text-muted">{s.codes.join(" / ")}</span>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                      <div role="radiogroup" aria-labelledby={`lvl-${course.id}`} className="flex flex-wrap gap-2">
                        {choices.map((s) => (
                          <button key={s.code} type="button" role="radio" aria-checked={s.codes.includes(chosen)} className="pill-option !min-h-10 !text-[0.875rem]" onClick={() => onChange({ ...value, [course.id]: s.codes.includes(chosen) ? chosen : s.code })}>
                            {s.codes.includes(chosen) && <Check />}
                            {levelText(s, shownGrade, course, choices)}
                            <span className="font-normal text-muted tabular">{s.codes.join(" / ")}</span>
                          </button>
                        ))}
                      </div>
                      )}
                      {choices.some((s) => choices.some((o) => o !== s && levelText(o, shownGrade, course, choices) === levelText(s, shownGrade, course, choices))) && (
                        <p className="mt-2 text-[0.8125rem] text-muted">Two sections share a level. Pick the code that is on your schedule.</p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
