// Local, offline-first store (NFR-02). Everything is wrapped: storage can be unavailable or full.
import { normalizeBundle, type RawBundle } from "../core/content";
import type { ContentBundle, LearningEvent } from "../core/types";
import type { GsLang } from "../ui/format";
import type { MockDraft } from "../ui/mock";
import { migrateProgress, migrateSession, type Session } from "../ui/session";

const K = { token: "tj.token", device: "tj.device", bundle: "tj.bundle", events: "tj.events", pending: "tj.pending", progress: "tj.progress", session: "tj.session", mock: "tj.mock", gsLang: "tj.gsLang", builder: "tj.builder" };

function get<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
/** Returns false when storage is full or blocked; callers that must not lose data check it. */
function set(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false; /* storage full or blocked: the session still works in memory */
  }
}

export const store = {
  token: () => get<string | null>(K.token, null),
  setToken: (t: string | null) => (t ? set(K.token, t) : localStorage.removeItem(K.token)),
  deviceId(): string {
    let id = get<string | null>(K.device, null);
    if (!id) {
      id = `${/Mobi|Android/i.test(navigator.userAgent) ? "phone" : "laptop"}-${crypto.randomUUID().slice(0, 6)}`;
      set(K.device, id);
    }
    return id;
  },
  /** The cached bundle may predate multi-paper content (no paperId on questions): normalised on read. */
  bundle(): ContentBundle | null {
    const b = get<RawBundle | null>(K.bundle, null);
    return b ? normalizeBundle(b) : null;
  },
  setBundle: (b: ContentBundle) => set(K.bundle, b),
  events: () => get<LearningEvent[]>(K.events, []),
  addEvent(e: LearningEvent) {
    set(K.events, [...store.events(), e]);
    set(K.pending, [...store.pending(), e.eventId]);
  },
  /**
   * Many events in one write (a submitted mock is up to 200). Events whose eventId is already stored are
   * skipped, so re-submitting the same answers never duplicates them. Returns false if storage refused
   * the write; then nothing was added.
   */
  addEvents(list: LearningEvent[]): boolean {
    const current = store.events();
    const have = new Set(current.map((e) => e.eventId));
    const fresh = list.filter((e) => !have.has(e.eventId));
    if (!fresh.length) return true;
    if (!set(K.events, [...current, ...fresh])) return false;
    set(K.pending, [...store.pending(), ...fresh.map((e) => e.eventId)]);
    return true;
  },
  pending: () => get<string[]>(K.pending, []),
  markSynced(ids: Set<string>) {
    set(K.pending, store.pending().filter((id) => !ids.has(id)));
  },
  /** Resume pointers by progressKey ("<paperId>:<section>"); older bare-section keys are migrated on read. */
  progress: () => migrateProgress(get<Record<string, number>>(K.progress, {})),
  setProgress(key: string, index: number) {
    set(K.progress, { ...store.progress(), [key]: index }); // writes back migrated: bare keys go on first save
  },
  /** The mock in progress, saved on every change (AT-U6: the clock keeps running while the app is closed). */
  mock: () => get<MockDraft | null>(K.mock, null),
  setMock(d: MockDraft | null) {
    if (d) set(K.mock, d);
    else {
      try { localStorage.removeItem(K.mock); } catch { /* ignore */ }
    }
  },
  /** Language for General Studies questions (Part B); English until the learner switches. */
  gsLang: (): GsLang => (get<string>(K.gsLang, "en") === "ta" ? "ta" : "en"),
  setGsLang: (l: GsLang) => set(K.gsLang, l),
  /** The Practice builder's last choices, raw: the shell checks them against the bundle (core/builder.sanitizeSpec). */
  builder: (): unknown => get<unknown>(K.builder, null),
  setBuilder: (spec: unknown) => set(K.builder, spec),
  /** The one session in progress, kept so closing the app mid-session resumes at the same question (AT-U2). */
  session(): Session | null {
    const s = get<Session | null>(K.session, null);
    return s ? migrateSession(s) : null;
  },
  setSession(s: Session | null) {
    if (s) set(K.session, s);
    else {
      try { localStorage.removeItem(K.session); } catch { /* ignore */ }
    }
  },
};
