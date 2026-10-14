"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  PARENT_TERMS_VERSION,
  PRIVACY_POLICY_VERSION,
} from "@/lib/legal/consent-versions";

type Mode = "login" | "register" | "forgot";
type Feedback = { kind: "error" | "success" | "info"; text: string } | null;

function BrandMark() {
  return (
    <span className="auth-brand-mark" aria-hidden="true">
      <img src="/favicon-192x192.png" alt="" width={36} height={36} />
    </span>
  );
}

function formatCooldown(seconds: number) {
  if (seconds >= 3600) {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours}h ${mins}m ${secs < 10 ? "0" : ""}${secs}s`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
}

function FeedbackMessage({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null;
  const isError = feedback.kind === "error";
  const isInfo = feedback.kind === "info";
  return (
    <div
      className={`auth-feedback ${feedback.kind}`}
      role={isError ? "alert" : "status"}
    >
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
        {isError ? (
          <path
            d="M10 6v4m0 3h.01M10 2.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        ) : isInfo ? (
          <path
            d="M10 9v4m0-7h.01M10 2.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        ) : (
          <path
            d="m5 10 3.2 3.2L15.5 6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
      <span>{feedback.text}</span>
    </div>
  );
}

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [registeredEmail, setRegisteredEmail] = useState("");
  const [resetCooldown, setResetCooldown] = useState(0);
  const [hasSentReset, setHasSentReset] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("pw_reset_cooldown_until");
      if (saved) {
        const unlockTime = parseInt(saved, 10);
        const diff = Math.ceil((unlockTime - Date.now()) / 1000);
        if (diff > 0) {
          setResetCooldown(diff);
          setHasSentReset(true);
        } else {
          localStorage.removeItem("pw_reset_cooldown_until");
        }
      }
    } catch {
      // Ignore if localStorage unavailable
    }
  }, []);

  useEffect(() => {
    if (resetCooldown <= 0) {
      try {
        localStorage.removeItem("pw_reset_cooldown_until");
      } catch {}
      return;
    }
    const interval = setInterval(() => {
      setResetCooldown((val) => (val > 1 ? val - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [resetCooldown]);

  function switchMode(nextMode: Mode) {
    setMode(nextMode);
    setFeedback(null);
    setPassword("");
    setConfirm("");
    setLegalAccepted(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    if (!event.currentTarget.checkValidity()) {
      event.currentTarget.reportValidity();
      return;
    }
    if (mode === "register") {
      if (password.length < 12) {
        setFeedback({
          kind: "error",
          text: "Choose a password with at least 12 characters.",
        });
        return;
      }
      if (password !== confirm) {
        setFeedback({
          kind: "error",
          text: "Those passwords do not match. Please check and try again.",
        });
        return;
      }
    }
    setPending(true);
    try {
      const action = mode === "forgot" ? "reset" : mode;
      const payload =
        mode === "register"
          ? {
              action,
              email,
              password,
              name,
              legalAcceptance: {
                accepted: legalAccepted,
                termsVersion: PARENT_TERMS_VERSION,
                privacyVersion: PRIVACY_POLICY_VERSION,
              },
            }
          : mode === "forgot"
          ? { action, email }
          : { action, email, password };
      const response = await fetch("/api/auth", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (response.status === 429 || result.rateLimited) {
        const cooldown =
          typeof result.retryAfter === "number" ? result.retryAfter : 120;
        setResetCooldown(cooldown);
        try {
          localStorage.setItem(
            "pw_reset_cooldown_until",
            (Date.now() + cooldown * 1000).toString()
          );
        } catch {}
        setFeedback({
          kind: result.maxAttemptsReached ? "error" : "info",
          text:
            result.error ||
            "A reset link was recently sent. For security, please wait before requesting another.",
        });
        return;
      }
      if (!response.ok || result.error)
        throw new Error(
          result.error || "We couldn’t complete that request. Please try again."
        );
      if (mode === "login") {
        const destination =
          typeof result.redirect === "string" &&
          result.redirect.startsWith("/") &&
          !result.redirect.startsWith("//")
            ? result.redirect
            : "/access-pending";
        window.location.assign(destination);
      } else if (mode === "register") {
        setRegisteredEmail(email);
        setFeedback({
          kind: "success",
          text: `${
            result.message ? `${result.message} ` : ""
          }Check your email for a confirmation link to finish setting up your parent account. Staff activation is still required before workspace access.`,
        });
      } else {
        setHasSentReset(true);
        const cooldown =
          typeof result.retryAfter === "number" ? result.retryAfter : 120;
        setResetCooldown(cooldown);
        try {
          localStorage.setItem(
            "pw_reset_cooldown_until",
            (Date.now() + cooldown * 1000).toString()
          );
        } catch {}
        setFeedback({
          kind: result.maxAttemptsReached ? "info" : "success",
          text:
            result.message ||
            "If an account matches that email, password reset instructions are on their way. Check your inbox and spam folder.",
        });
      }
    } catch (error) {
      setFeedback({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "Something went wrong. Please try again.",
      });
    } finally {
      setPending(false);
    }
  }

  const isRegistrationComplete =
    mode === "register" && feedback?.kind === "success";
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canSubmit =
    mode === "login"
      ? email.trim().length > 0 && password.length > 0
      : mode === "forgot"
      ? validEmail && resetCooldown === 0
      : name.trim().length >= 2 &&
        validEmail &&
        password.length >= 12 &&
        confirm === password &&
        legalAccepted;
  const panelHeading =
    mode === "login"
      ? ["Welcome back", "Sign in to your ProsperWork account."]
      : mode === "register"
      ? [
          "Create a parent account",
          "Start with a secure place for your family’s music journey.",
        ]
      : [
          "Reset your password",
          "We’ll send a secure password reset link to your email.",
        ];

  return (
    <main className="auth-root">
      <div className="auth-noise" aria-hidden="true" />
      <a
        className="auth-brand auth-login-brand"
        href="/login"
        aria-label="ProsperWork sign in"
      >
        <BrandMark />
        <span className="auth-brand-copy">
          <span className="auth-brand-name">ProsperWork</span>
          <span className="auth-brand-caption">Music Concepts</span>
        </span>
      </a>
      <div className="auth-layout auth-login-layout">
        <section className="auth-main auth-login-main">
          <div className="auth-panel">
            <a
              className="auth-mobile-brand"
              href="/login"
              aria-label="ProsperWork sign in"
            >
              <BrandMark />
              <span className="auth-brand-copy">
                <span className="auth-brand-name">ProsperWork</span>
                <span className="auth-brand-caption">Music Concepts</span>
              </span>
            </a>
            {isRegistrationComplete ? (
              <div className="auth-success-state">
                <div className="auth-panel-heading">
                  <div className="auth-overline">One more step</div>
                  <h2>Confirm your email</h2>
                  <p>
                    We’ve sent account confirmation instructions to{" "}
                    <strong className="auth-pending-email">
                      {registeredEmail}
                    </strong>
                    .
                  </p>
                </div>
                <FeedbackMessage feedback={feedback} />
                <p className="auth-helper">
                  Your account will be reviewed by ProsperWork staff after you
                  confirm. Access is not active until staff approval.
                </p>
                <button
                  type="button"
                  className="auth-submit"
                  onClick={() => switchMode("login")}
                >
                  Return to sign in
                </button>
              </div>
            ) : (
              <>
                <header className="auth-panel-heading">
                  <div className="auth-overline">
                    {mode === "login"
                      ? "Your academy, in reach"
                      : mode === "register"
                      ? "For parents and guardians"
                      : "Account recovery"}
                  </div>
                  <h2>{panelHeading[0]}</h2>
                  <p>{panelHeading[1]}</p>
                </header>

                {mode !== "forgot" && (
                  <div
                    className="auth-tabs"
                    role="tablist"
                    aria-label="Account access"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={mode === "login"}
                      onClick={() => switchMode("login")}
                    >
                      Sign in
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={mode === "register"}
                      onClick={() => switchMode("register")}
                    >
                      Create account
                    </button>
                  </div>
                )}

                <FeedbackMessage feedback={feedback} />
                <form className="auth-form" onSubmit={submit} noValidate>
                  {mode === "register" && (
                    <div className="auth-field">
                      <label htmlFor="auth-name">Your name</label>
                      <input
                        className="auth-input"
                        id="auth-name"
                        name="name"
                        type="text"
                        autoComplete="name"
                        placeholder="e.g. Amara Okafor"
                        required
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                      />
                    </div>
                  )}
                  <div className="auth-field">
                    <label htmlFor="auth-email">
                      {mode === "login"
                        ? "Email address or username"
                        : "Email address"}
                    </label>
                    <input
                      className="auth-input"
                      id="auth-email"
                      name="email"
                      type={mode === "login" ? "text" : "email"}
                      autoComplete={mode === "login" ? "username" : "email"}
                      placeholder={
                        mode === "login"
                          ? "Email or student username"
                          : "you@example.com"
                      }
                      required
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                    />
                  </div>
                  {mode !== "forgot" && (
                    <div className="auth-field">
                      <label htmlFor="auth-password">Password</label>
                      <div className="auth-input-wrap">
                        <input
                          className="auth-input has-toggle"
                          id="auth-password"
                          name="password"
                          type={showPassword ? "text" : "password"}
                          autoComplete={
                            mode === "login"
                              ? "current-password"
                              : "new-password"
                          }
                          placeholder={
                            mode === "register"
                              ? "At least 12 characters"
                              : "Enter your password"
                          }
                          minLength={mode === "register" ? 12 : undefined}
                          required
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                        />
                        <button
                          className="auth-show"
                          type="button"
                          aria-label={
                            showPassword ? "Hide password" : "Show password"
                          }
                          onClick={() => setShowPassword((value) => !value)}
                        >
                          {showPassword ? "Hide" : "Show"}
                        </button>
                      </div>
                      {mode === "register" && (
                        <p className="auth-helper">
                          Use at least 12 characters for a stronger password.
                        </p>
                      )}
                    </div>
                  )}
                  {mode === "register" && (
                    <div className="auth-field">
                      <label htmlFor="auth-confirm">Confirm password</label>
                      <input
                        className="auth-input"
                        id="auth-confirm"
                        name="confirmPassword"
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        placeholder="Enter your password again"
                        minLength={12}
                        required
                        value={confirm}
                        onChange={(event) => setConfirm(event.target.value)}
                      />
                    </div>
                  )}
                  {mode === "register" && (
                    <div className="auth-legal-agreement">
                      <input
                        id="auth-legal-agreement"
                        name="legalAcceptance"
                        type="checkbox"
                        required
                        checked={legalAccepted}
                        onChange={(event) =>
                          setLegalAccepted(event.target.checked)
                        }
                      />
                      <label htmlFor="auth-legal-agreement">
                        I confirm I am the child’s parent or guardian and agree
                        to the{" "}
                        <a
                          href="/terms-and-conditions"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Terms and Conditions
                        </a>
                        . I have read the{" "}
                        <a
                          href="/privacy-policy"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Privacy Policy
                        </a>{" "}
                        and understand how family information is used to manage
                        lessons and our account.
                      </label>
                    </div>
                  )}
                  {mode === "login" && (
                    <div className="auth-form-meta">
                      <button
                        className="auth-link"
                        type="button"
                        onClick={() => switchMode("forgot")}
                      >
                        Forgot password?
                      </button>
                    </div>
                  )}
                  <button
                    className="auth-submit"
                    type="submit"
                    disabled={pending || !canSubmit || (mode === "forgot" && resetCooldown > 0)}
                  >
                    {pending
                      ? "Please wait…"
                      : mode === "login"
                      ? "Sign in securely"
                      : mode === "register"
                      ? "Create parent account"
                      : resetCooldown > 0
                      ? `Resend available in ${formatCooldown(resetCooldown)}`
                      : hasSentReset
                      ? "Resend reset instructions"
                      : "Send reset instructions"}
                    {!pending && (mode !== "forgot" || resetCooldown === 0) && (
                      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                        <path
                          d="M4 10h11m-4-4 4 4-4 4"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </button>
                </form>
                {mode === "forgot" && (
                  <button
                    className="auth-back"
                    type="button"
                    onClick={() => switchMode("login")}
                  >
                    <span aria-hidden="true">←</span> Back to sign in
                  </button>
                )}
                {mode === "login" && (
                  <div className="auth-security-note">
                    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                      <path
                        d="M6 8V6a4 4 0 0 1 8 0v2m-9 0h10a1 1 0 0 1 1 1v7H4V9a1 1 0 0 1 1-1Z"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M10 11v2"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </svg>
                    <span>
                      Your sign-in is private and protected. We never share
                      family records.
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
