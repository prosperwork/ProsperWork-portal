"use client";

import { useState } from "react";
import type { FormEvent } from "react";

function BrandMark() {
  return <span className="auth-brand-mark" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><path d="M6 20.5 16 7l10 13.5M9 24h14M13 24v-5.5h6V24" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"/><circle cx="16" cy="10" r="1.5" fill="currentColor"/></svg></span>;
}

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!event.currentTarget.checkValidity()) {
      event.currentTarget.reportValidity();
      return;
    }
    if (password.length < 12) {
      setError("Choose a password with at least 12 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Those passwords do not match. Please check and try again.");
      return;
    }
    setPending(true);
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "updatePassword", password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.error) throw new Error(data.error || "We couldn’t update your password. Please try again.");
      setComplete(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "We couldn’t update your password. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return <main className="auth-root">
    <div className="auth-noise" aria-hidden="true" />
    <div className="auth-layout">
      <aside className="auth-aside" aria-label="ProsperWork">
        <a className="auth-brand" href="/login" aria-label="ProsperWork"><BrandMark /><span className="auth-brand-copy"><span className="auth-brand-name">ProsperWork</span><span className="auth-brand-caption">Music Concepts</span></span></a>
        <div className="auth-aside-message">
          <div className="auth-kicker">Keep your records yours</div>
          <h1>A fresh key for your <em>private space.</em></h1>
          <p>Choose a strong password to protect your family’s lessons and academy records.</p>
          <div className="auth-score"><span className="auth-score-line" /><strong>Private by design. Ready when you are.</strong></div>
        </div>
        <div className="auth-aside-foot"><span>PROSPERWORK MUSIC CONCEPTS</span><span>PRIVATE FAMILY WORKSPACE</span></div>
      </aside>
      <section className="auth-main">
        <div className="auth-panel">
          <a className="auth-mobile-brand" href="/login" aria-label="ProsperWork"><BrandMark /><span className="auth-brand-copy"><span className="auth-brand-name">ProsperWork</span><span className="auth-brand-caption">Music Concepts</span></span></a>
          {complete ? <>
            <div className="pending-symbol" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="m5 12 4.5 4.5L19 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
            <header className="auth-panel-heading">
              <div className="auth-overline">Password updated</div>
              <h2>You’re all set.</h2>
              <p>Your new password is ready to use. Sign in to continue to your ProsperWork workspace.</p>
            </header>
            <a className="auth-submit" href="/login">Return to sign in</a>
          </> : <>
            <header className="auth-panel-heading">
              <div className="auth-overline">Secure account recovery</div>
              <h2>Choose a new password</h2>
              <p>Make it at least 12 characters and confirm it below.</p>
            </header>
            {error && <div className="auth-feedback error" role="alert"><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 6v4m0 3h.01M10 2.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg><span>{error}</span></div>}
            <form className="auth-form" onSubmit={submit} noValidate>
              <div className="auth-field">
                <label htmlFor="new-password">New password</label>
                <div className="auth-input-wrap">
                  <input id="new-password" className="auth-input has-toggle" name="password" type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={12} required placeholder="At least 12 characters" value={password} onChange={event => setPassword(event.target.value)} />
                  <button className="auth-show" type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(value => !value)}>{showPassword ? "Hide" : "Show"}</button>
                </div>
              </div>
              <div className="auth-field">
                <label htmlFor="confirm-password">Confirm new password</label>
                <input id="confirm-password" className="auth-input" name="confirmPassword" type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={12} required placeholder="Enter your new password again" value={confirm} onChange={event => setConfirm(event.target.value)} />
              </div>
              <p className="auth-helper">Use 12 or more characters that are hard to guess.</p>
              <button className="auth-submit" type="submit" disabled={pending}>{pending ? "Updating password…" : "Set new password"}{!pending && <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 10h11m-4-4 4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>}</button>
            </form>
            <div className="auth-security-note"><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M6 8V6a4 4 0 0 1 8 0v2m-9 0h10a1 1 0 0 1 1 1v7H4V9a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M10 11v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg><span>This form only works from a verified recovery session.</span></div>
          </>}
        </div>
      </section>
    </div>
  </main>;
}
