// Settings: reading language, content updates, sync, a backup of AK's own data, and signing out.
import { useState } from "react";
import type { ContentBundle, LearningEvent } from "../../core/types";
import type { GsLang } from "../format";

export function Settings({ bundle, log, deviceId, pending, syncState, gsLang, onGsLang, onCheckContent, onSyncNow, onBackup, onSignOut, onExit }: {
  bundle: ContentBundle;
  log: LearningEvent[];
  deviceId: string;
  pending: number;
  syncState: { state: "idle" | "busy" | "error"; msg?: string };
  gsLang: GsLang;
  onGsLang: (l: GsLang) => void;
  onCheckContent: () => Promise<string>; // resolves to a one-line result for the screen
  onSyncNow: () => void;
  onBackup: () => void;
  onSignOut: () => void;
  onExit: () => void;
}) {
  const [checking, setChecking] = useState(false);
  const [checkMsg, setCheckMsg] = useState<string | null>(null);
  const count = (type: LearningEvent["type"]) => log.filter((e) => e.type === type).length;
  const check = async () => {
    setChecking(true);
    setCheckMsg(await onCheckContent().catch((e: Error) => `Could not check: ${e.message}`));
    setChecking(false);
  };
  return (
    <main className="wrap">
      <header className="qhead">
        <button className="link" onClick={onExit}>← Back</button>
        <span className="muted">Settings</span>
      </header>

      <section className="card st">
        <h4>Reading</h4>
        <p className="muted small">General Studies questions open in this language. You can still switch on any question. Part A is always Tamil.</p>
        <div className="row" role="radiogroup" aria-label="General Studies language">
          <button role="radio" aria-checked={gsLang === "en"} className={gsLang === "en" ? "primary" : ""} onClick={() => onGsLang("en")}>English</button>
          <button role="radio" aria-checked={gsLang === "ta"} className={gsLang === "ta" ? "primary" : ""} lang="ta" onClick={() => onGsLang("ta")}>தமிழ்</button>
        </div>
      </section>

      <section className="card st">
        <h4>Content</h4>
        <p>Version {bundle.version} · {bundle.papers.length} papers · {bundle.questions.length} questions{bundle.terms ? ` · ${bundle.terms.length} terms` : ""}</p>
        <p className="muted small">New content also arrives by itself the next time the app opens online.</p>
        <button disabled={checking} onClick={check}>{checking ? "Checking…" : "Check for new content"}</button>
        {checkMsg && <p className="small">{checkMsg}</p>}
      </section>

      <section className="card st">
        <h4>Sync</h4>
        <p>{syncState.state === "busy" ? "Syncing…" : pending ? `${pending} answers waiting to sync` : "Everything is synced"}</p>
        {syncState.state === "error" && <p className="error small">Last sync failed: {syncState.msg}</p>}
        <p className="muted small">This device: {deviceId}</p>
        {pending > 0 && syncState.state !== "busy" && <button onClick={onSyncNow}>Sync now</button>}
      </section>

      <section className="card st">
        <h4>Your data</h4>
        <p>{count("answer")} answers · {count("errorTag")} mistake reasons · {count("tagReview")} tag reviews</p>
        <p className="muted small">Everything is also on GitHub once synced. The backup is a file of the same events, for safekeeping.</p>
        <button onClick={onBackup}>Download a backup</button>
      </section>

      <section className="card st">
        <h4>Account</h4>
        <p className="muted small">Signing out removes the GitHub token from this device. Your answers stay on the device and on GitHub.</p>
        <button onClick={onSignOut}>Sign out</button>
      </section>
    </main>
  );
}
