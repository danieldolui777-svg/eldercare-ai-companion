"use client";
import { useEffect } from "react";

/** Registers the service worker so the app is installable on the home screen. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Installability is a bonus; ignore failures (e.g. unsupported browser).
      });
    }
  }, []);
  return null;
}
