// GitHub as storage (spec D-14). Content: tnpsc-content (read). Events: tnpsc-data (append, one file per device per day).
import { mergeEvents } from "../core/scoring";
import type { ContentBundle, LearningEvent } from "../core/types";

export const OWNER = "arunkumarvel2705-sudo";
const API = "https://api.github.com/repos";
const BUNDLE_PATH = "gold/bundles/ccse4_2025.json";

function headers(token: string, accept = "application/vnd.github+json"): HeadersInit {
  return { Authorization: `Bearer ${token}`, Accept: accept, "X-GitHub-Api-Version": "2022-11-28" };
}

export class AuthError extends Error {}

async function check(r: Response, what: string): Promise<Response> {
  if (r.status === 401 || r.status === 403) throw new AuthError(`${what}: GitHub refused the token (HTTP ${r.status})`);
  if (!r.ok && r.status !== 404) throw new Error(`${what}: HTTP ${r.status}`);
  return r;
}

export async function fetchBundle(token: string): Promise<ContentBundle> {
  const r = await check(await fetch(`${API}/${OWNER}/tnpsc-content/contents/${BUNDLE_PATH}`,
    { cache: "no-store", headers: headers(token, "application/vnd.github.raw+json") }), "Content");
  if (r.status === 404) throw new Error("Content bundle not found in tnpsc-content");
  return r.json();
}

/** Fresh signed link to an LFS file (AT-S4): JSON details, then download_url. Links expire, so ask each time. */
export async function pdfLink(token: string, path: string): Promise<string> {
  const r = await check(await fetch(`${API}/${OWNER}/tnpsc-content/contents/${path}`, { cache: "no-store", headers: headers(token) }), "PDF");
  return (await r.json()).download_url as string;
}

const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const unb64 = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\n/g, "")), (c) => c.charCodeAt(0)));

/**
 * Push queued events: per (day, device) file, read what is there, merge by eventId, write back.
 * Idempotent: pushing the same events twice leaves one copy (AT-S1). Returns the eventIds now on GitHub.
 */
export async function pushEvents(token: string, events: LearningEvent[]): Promise<Set<string>> {
  const done = new Set<string>();
  const groups = new Map<string, LearningEvent[]>();
  for (const e of events) {
    const path = `events/${e.at.slice(0, 10)}_${e.deviceId}.jsonl`;
    groups.set(path, [...(groups.get(path) ?? []), e]);
  }
  for (const [path, group] of groups) {
    const url = `${API}/${OWNER}/tnpsc-data/contents/${path}`;
    const got = await check(await fetch(url, { cache: "no-store", headers: headers(token) }), "Sync read");
    let existing: LearningEvent[] = [];
    let sha: string | undefined;
    if (got.status !== 404) {
      const j = await got.json();
      sha = j.sha;
      existing = unb64(j.content).split("\n").filter(Boolean).map((l) => JSON.parse(l));
    }
    const merged = mergeEvents(existing, group);
    if (merged.length !== existing.length) {
      const body = { message: `events: ${path}`, content: b64(merged.map((e) => JSON.stringify(e)).join("\n") + "\n"), ...(sha ? { sha } : {}) };
      await check(await fetch(url, { method: "PUT", headers: { ...headers(token), "Content-Type": "application/json" }, body: JSON.stringify(body) }), "Sync write");
    }
    merged.forEach((e) => done.add(e.eventId));
  }
  return done;
}
