import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./ui/App";
import "./ui/styles.css";

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);

// Offline shell (NFR-02). Questions and answers live in local storage, so practice works without signal.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => { /* app still works online */ });
  });
}
