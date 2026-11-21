// Local, offline-first store (NFR-02). Everything is wrapped: storage can be unavailable or full.
import type { ContentBundle, LearningEvent } from "../core/types";

const K = { token: "tj.token", device: "tj.device", bundle: "tj.bundle", events: "tj.events", pending: "tj.pending", progress: "tj.progress" };

function get<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function set(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: the session still works in memory */
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
  bundle: () => get<ContentBundle | null>(K.bundle, null),
  setBundle: (b: ContentBundle) => set(K.bundle, b),
  events: () => get<LearningEvent[]>(K.events, []),
  addEvent(e: LearningEvent) {
    set(K.events, [...store.events(), e]);
    set(K.pending, [...store.pending(), e.eventId]);
  },
  pending: () => get<string[]>(K.pending, []),
  markSynced(ids: Set<string>) {
    set(K.pending, store.pending().filter((id) => !ids.has(id)));
  },
  progress: () => get<Record<string, number>>(K.progress, {}),
  setProgress(section: string, index: number) {
    set(K.progress, { ...store.progress(), [section]: index });
  },
};
