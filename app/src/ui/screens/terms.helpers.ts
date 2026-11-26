// Term Bridge: English-Tamil technical terms from the bilingual papers, to read Tamil-medium material.
import type { ContentBundle, Term } from "../../core/types";

/** Terms whose English or Tamil contains the query (case-insensitive for English). Empty query keeps all. */
export function filterTerms(terms: Term[], query: string): Term[] {
  const q = query.trim().toLowerCase();
  if (!q) return terms;
  return terms.filter((t) => t.en.toLowerCase().includes(q) || t.ta.includes(query.trim()));
}

/** Terms grouped by unit, in the bundle's unit order; units with no terms left out. */
export function termsByUnit(bundle: ContentBundle, terms: Term[]): { unitId: string; name: string; terms: Term[] }[] {
  return bundle.units
    .map((u) => ({ unitId: u.id, name: u.nameEn, terms: terms.filter((t) => t.unitId === u.id) }))
    .filter((g) => g.terms.length > 0);
}

/** The terms that come from one question, for the question screen. */
export function termsForQuestion(terms: Term[] | undefined, questionId: string): Term[] {
  return (terms ?? []).filter((t) => t.questionIds.includes(questionId));
}
