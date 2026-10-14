"use client";

import { useEffect, useState } from "react";

export default function WelcomePage() {
  const [name, setName] = useState("");
  const [greetingReady, setGreetingReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let redirectTimer = 0;

    async function loadSignedInProfile() {
      try {
        const response = await fetch("/api/session", {
          credentials: "include",
          cache: "no-store",
        });
        if (response.status === 401) {
          window.location.replace("/login");
          return;
        }
        const result = await response.json();
        if (!response.ok || !result.profile) {
          throw new Error(result.error || "Your workspace could not be opened.");
        }

        const next = ["active", "on_leave"].includes(result.profile.status) ? "/" : "/access-pending";
        if (cancelled) return;
        setName(typeof result.profile.name === "string" ? result.profile.name.trim() : "");
        setGreetingReady(true);
        const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1250;
        redirectTimer = window.setTimeout(() => window.location.replace(next), delay);
      } catch (requestError) {
        if (cancelled) return;
        setError(requestError instanceof Error ? requestError.message : "Your workspace could not be opened.");
      }
    }

    void loadSignedInProfile();
    return () => {
      cancelled = true;
      window.clearTimeout(redirectTimer);
    };
  }, []);

  return <main className="welcome-root">
    <section className={`welcome-splash${error ? " is-error" : ""}`} role="status" aria-live="polite">
      <div className="welcome-logo-frame" aria-hidden="true">
        <span className="welcome-spinner" />
        <img src="/favicon-192x192.png" alt="" width={52} height={52} />
      </div>
      {greetingReady && <h1 className="welcome-greeting">Welcome{name ? `, ${name}` : ""}</h1>}
      {error && <>
        <p className="welcome-error" role="alert">{error}</p>
        <a className="welcome-return" href="/login">Return to sign in</a>
      </>}
    </section>
  </main>;
}
