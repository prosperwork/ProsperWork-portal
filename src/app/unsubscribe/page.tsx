"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Check, ShieldCheck, X } from "lucide-react";

export default function UnsubscribePage() {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState("");
  const attempted = useRef(false);
  useEffect(() => {
    const url = new URL(window.location.href);
    const queryToken = url.searchParams.get("token");
    setToken(queryToken ?? "");
    if (queryToken) {
      url.searchParams.delete("token");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }, []);

  const confirmWithdrawal = async () => {
    if (!token || busy || attempted.current) return;
    attempted.current = true; setBusy(true); setError("");
    try {
      const response = await fetch("/api/unsubscribe", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const result = await response.json().catch(() => ({})) as { ok?: boolean };
      if (!response.ok || result.ok === false) throw new Error(`The request could not be completed (${response.status}).`);
      setFinished(true);
    } catch (cause) {
      attempted.current = false;
      setError(cause instanceof Error && cause.message.startsWith("The request could not") ? cause.message : "Your preference could not be updated. Please try again.");
    } finally { setBusy(false); }
  };

  return <main className="cm-public">
    <section className="cm-public-card" aria-labelledby="unsubscribe-title">
      <Link href="/" className="cm-brand" aria-label="ProsperWork home"><img src="/favicon-192x192.png" alt="" /><span><strong>ProsperWork</strong><small>Music Academy</small></span></Link>
      <div className="cm-public-mark" style={{ marginTop: 29 }}>{finished ? <Check size={21} /> : <ShieldCheck size={21} />}</div>
      <div className="cm-kicker" style={{ marginTop: 18 }}>Email preferences</div>
      <h1 id="unsubscribe-title">{finished ? "Preference updated." : "Withdraw marketing consent?"}</h1>
      {finished
        ? <p>Your marketing preference has been updated. Future queued marketing will stop; an email already in flight cannot be recalled. Operational lesson reminders are unaffected.</p>
        : <><p>Confirm only if you want to stop future ProsperWork marketing emails. Loading this page has not changed your preference.</p><p>Withdrawal stops future queued marketing, but cannot recall an email already in flight. Operational lesson reminders are unaffected.</p>
          {!token && <div className="cm-alert error" role="alert"><X size={15} />This link is missing its unsubscribe token. No preference has been changed.</div>}
          {error && <div className="cm-alert error" role="alert"><X size={15} />{error}</div>}
          <div className="cm-actions"><button type="button" className="cm-btn primary" onClick={() => void confirmWithdrawal()} disabled={!token || busy}>{busy ? "Updating preference…" : "Confirm unsubscribe"}</button><Link href="/" className="cm-link">Keep my preference</Link></div>
        </>}
      <p className="cm-hint" style={{ marginTop: 25 }}>ProsperWork Music Concepts · academy communications</p>
    </section>
  </main>;
}
