// Practice builder: labels and the session title. Logic lives in core/builder.
import { SUBJECTS, subjectOf, type BuilderSpec, type BuilderStatus } from "../../core/builder";
import type { ContentBundle } from "../../core/types";

export const STATUS_LABEL: Record<BuilderStatus, string> = { any: "Any", new: "New", wrong: "Got wrong", unsure: "Not sure", mistakes: "Open mistakes" };

/** Short chip label for a paper: its year. */
export function paperYear(p: ContentBundle["papers"][number]): string {
  return p.date.slice(0, 4);
}

/** Units for the unit picker: the subject's, or all of them grouped by subject. */
export function unitGroups(bundle: ContentBundle, subject: BuilderSpec["subject"]) {
  return SUBJECTS.filter((s) => subject === "all" || s.id === subject)
    .map((s) => ({ ...s, units: bundle.units.filter((u) => subjectOf(u.id) === s.id) }))
    .filter((g) => g.units.length > 0);
}

export function topicsOf(bundle: ContentBundle, unitId: string | null) {
  return unitId ? (bundle.topics ?? []).filter((t) => t.unitId === unitId) : [];
}

/** Session header: the narrowest scope picked, then the status if not "any". "Practice: Parliament · got wrong". */
export function builderTitle(bundle: ContentBundle, spec: BuilderSpec): string {
  const topic = spec.topicId ? (bundle.topics ?? []).find((t) => t.id === spec.topicId)?.nameEn : undefined;
  const unit = spec.unitId ? bundle.units.find((u) => u.id === spec.unitId)?.nameEn : undefined;
  const subject = spec.subject === "all" ? "Mixed" : SUBJECTS.find((s) => s.id === spec.subject)?.label;
  const scope = topic ?? unit ?? subject ?? "Mixed";
  return spec.status === "any" ? `Practice: ${scope}` : `Practice: ${scope} · ${STATUS_LABEL[spec.status].toLowerCase()}`;
}
