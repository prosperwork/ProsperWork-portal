"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  LogOut,
  Menu,
  UserRound,
  X,
  Eye,
  ShieldAlert,
  ShieldCheck,
  ArrowLeft,
} from "lucide-react";
import type { Role } from "@/lib/types";
import { portalNavigation } from "../_lib/portal-navigation";
import WorkspacePageFrame from "./WorkspacePageFrame";
import PortalAiChatBubble from "./PortalAiChatBubble";

type Profile = {
  id: string;
  name: string;
  role: Role;
  status?: string;
  email?: string;
  timezone?: string;
  username?: string;
  avatar_file_id?: string | null;
  impersonated?: boolean;
  realAdminId?: string;
  realAdminName?: string;
};
type ProfileResult = { profile?: Profile; avatarUrl?: string | null };
function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0] ?? "")
      .join("")
      .toUpperCase() || "PW"
  );
}

function roleTitle(role?: Role) {
  if (!role) return "Account";
  return role
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function pageLabel(path: string) {
  if (path === "/onboarding") return "Academy Onboarding";
  return (
    portalNavigation.find((item) => path === item.href)?.label || "Workspace"
  );
}

export default function PortalShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const accountButton = useRef<HTMLButtonElement>(null);
  const accountMenu = useRef<HTMLDivElement>(null);

  const refreshProfile = useCallback(async () => {
    try {
      const response = await fetch("/api/profile", {
        credentials: "include",
        cache: "no-store",
      });
      if (response.status === 401) {
        window.location.assign("/login?reason=credentials_changed");
        return;
      }
      const result = (await response.json().catch(() => ({}))) as ProfileResult;
      if (!response.ok || !result.profile) return;
      setProfile((current) =>
        current ? { ...current, ...result.profile } : result.profile ?? null
      );
      setAvatarUrl(result.avatarUrl ?? null);
    } catch {
      // The authenticated session remains usable if the signed photo URL is temporarily unavailable.
    }
  }, []);

  const loadSession = useCallback(async () => {
    setSessionLoading(true);
    setSessionError("");
    try {
      const response = await fetch("/api/session", {
        credentials: "include",
        cache: "no-store",
      });
      const result = await response.json().catch(() => ({}));
      if (result?.reason === "email_changed") {
        window.location.assign("/login?reason=email_changed");
        return;
      }
      if (result?.reason === "password_changed") {
        window.location.assign("/login?reason=password_changed");
        return;
      }
      if (!response.ok || !result?.profile)
        throw new Error(
          result?.error || "Your signed-in profile could not be confirmed."
        );
      setProfile(result.profile as Profile);
      await refreshProfile();
    } catch (cause) {
      setProfile(null);
      setSessionError(
        cause instanceof Error
          ? cause.message
          : "Your signed-in profile could not be confirmed."
      );
    } finally {
      setSessionLoading(false);
    }
  }, [refreshProfile]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  // Auto-logout after 10 minutes of inactivity
  useEffect(() => {
    if (!profile) return;
    const INACTIVITY_LIMIT_MS = 10 * 60 * 1000; // 10 minutes
    const ACTIVITY_KEY = "pw_portal_last_active";

    const recordActivity = () => {
      try {
        localStorage.setItem(ACTIVITY_KEY, Date.now().toString());
      } catch {}
    };

    recordActivity();

    const activityEvents = [
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
      "click",
    ];
    activityEvents.forEach((ev) => {
      window.addEventListener(ev, recordActivity, { passive: true });
    });

    const checkInterval = window.setInterval(async () => {
      try {
        const lastActiveStr = localStorage.getItem(ACTIVITY_KEY);
        const lastActive = lastActiveStr
          ? parseInt(lastActiveStr, 10)
          : Date.now();
        if (Date.now() - lastActive >= INACTIVITY_LIMIT_MS) {
          localStorage.removeItem(ACTIVITY_KEY);
          try {
            await fetch("/api/auth", {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "logout" }),
            });
          } catch {}
          window.location.assign("/login?reason=inactivity");
        }
      } catch {}
    }, 15_000);

    return () => {
      activityEvents.forEach((ev) => {
        window.removeEventListener(ev, recordActivity);
      });
      window.clearInterval(checkInterval);
    };
  }, [profile]);

  useEffect(() => {
    const onProfileUpdated = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          profile?: Partial<Profile>;
          avatarUrl?: string | null;
        }>
      ).detail;
      if (detail?.profile)
        setProfile((current) =>
          current ? { ...current, ...detail.profile } : current
        );
      if (detail && Object.prototype.hasOwnProperty.call(detail, "avatarUrl"))
        setAvatarUrl(detail.avatarUrl ?? null);
      void refreshProfile();
    };
    window.addEventListener("pw-profile-updated", onProfileUpdated);
    const refreshTimer = window.setInterval(
      () => void refreshProfile(),
      90_000
    );
    return () => {
      window.removeEventListener("pw-profile-updated", onProfileUpdated);
      window.clearInterval(refreshTimer);
    };
  }, [refreshProfile]);
  useEffect(() => {
    if (drawerOpen) {
      setDrawerOpen(false);
      menuButton.current?.focus();
    }
  }, [pathname]);
  useEffect(() => {
    if (!drawerOpen) return;
    closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDrawerOpen(false);
        menuButton.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen]);
  useEffect(() => {
    if (!accountMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!accountMenu.current?.contains(event.target as Node))
        setAccountMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAccountMenuOpen(false);
        accountButton.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [accountMenuOpen]);

  const visibleNav = useMemo(() => {
    if (!profile) return [];
    const nav = portalNavigation.filter((item) => item.roles.includes(profile.role));
    if (profile.status === "policy_required" || pathname === "/onboarding") {
      return [
        {
          href: "/onboarding",
          label: "Onboarding",
          icon: ShieldCheck,
          roles: [profile.role],
        },
        ...nav,
      ];
    }
    return nav;
  }, [profile, pathname]);
  const activeLabel = pageLabel(pathname);
  const activeNavPath = portalNavigation.find((item) => item.href === pathname);

  async function signOut() {
    setAccountMenuOpen(false);
    setSessionError("");
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
      if (!response.ok) throw new Error("Sign-out failed. Please try again.");
      window.location.assign("/login");
    } catch (cause) {
      setSessionError(
        cause instanceof Error
          ? cause.message
          : "Sign-out failed. Please try again."
      );
    }
  }

  async function exitViewAs() {
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "exit_view_as" }),
      });
      if (res.ok) {
        window.location.assign("/accounts");
      }
    } catch {
      window.location.reload();
    }
  }

  return (
    <div className="portal-frame">
      <aside
        className={`portal-sidebar${drawerOpen ? " is-open" : ""}`}
        aria-label="Portal navigation"
      >
        <Link
          className="portal-brand"
          href="/"
          aria-label="ProsperWork overview"
        >
          <span className="portal-brand-mark">
            <img src="/favicon-192x192.png" alt="" width="34" height="34" />
          </span>
          <span>
            <strong>ProsperWork</strong>
            <small>Music Concepts</small>
          </span>
        </Link>
        <button
          ref={closeButton}
          type="button"
          className="portal-close"
          aria-label="Close navigation"
          onClick={() => {
            setDrawerOpen(false);
            menuButton.current?.focus();
          }}
        >
          <X size={17} />
        </button>
        {profile && (
          <div className="portal-nav-caption">
            {profile.impersonated
              ? `Viewing as ${profile.name}`
              : "Your workspace"}
          </div>
        )}
        <nav id="portal-navigation" className="portal-nav">
          {!sessionLoading &&
            visibleNav.map((item) => {
              const Icon = item.icon;
              const active =
                pathname === item.href ||
                (item.href !== "/" && pathname.startsWith(`${item.href}/`));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`portal-nav-link${active ? " active" : ""}`}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon size={16} strokeWidth={1.8} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
        </nav>
        {sessionLoading && (
          <div className="portal-nav-skeleton" aria-label="Loading navigation">
            <i />
            <i />
            <i />
          </div>
        )}
        {!sessionLoading && sessionError && (
          <div className="portal-sidebar-error" role="alert">
            Navigation unavailable until your account is confirmed.
          </div>
        )}
        <div className="portal-sidebar-foot">
          <div className="portal-sidebar-foot-brand">
            <span className="portal-status-dot" aria-hidden="true" />
            <span>ProsperWork Music Academy</span>
          </div>
          <div className="portal-sidebar-foot-meta">
            <span>v2.5.0</span>
            <span className="portal-sidebar-foot-dot">·</span>
            <span>Portal Platform</span>
          </div>
        </div>
      </aside>
      {drawerOpen && (
        <button
          className="portal-scrim"
          aria-label="Close navigation"
          onClick={() => {
            setDrawerOpen(false);
            menuButton.current?.focus();
          }}
        />
      )}
      <div className="portal-content">
        {profile?.impersonated && (
          <div
            role="status"
            style={{
              background: "#fffbeb",
              borderBottom: "1px solid #fde68a",
              color: "#92400e",
              padding: "8px 16px",
              fontSize: "13px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              zIndex: 900,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Eye size={16} color="#d97706" />
              <span>
                <strong>Owner Preview Active:</strong> You are viewing the live
                portal as <strong>{profile.name}</strong> (
                {roleTitle(profile.role)}).
              </span>
            </div>
            <button
              type="button"
              onClick={() => void exitViewAs()}
              style={{
                background: "#b45309",
                color: "#ffffff",
                border: "none",
                padding: "4px 10px",
                borderRadius: "6px",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <ArrowLeft size={13} />
              <span>Exit Preview &amp; Return to Owner</span>
            </button>
          </div>
        )}
        <header className="portal-topbar">
          <div className="portal-topbar-left">
            <button
              ref={menuButton}
              className="portal-menu"
              type="button"
              aria-label={drawerOpen ? "Navigation open" : "Open navigation"}
              aria-expanded={drawerOpen}
              aria-controls="portal-navigation"
              onClick={() => setDrawerOpen((value) => !value)}
            >
              <Menu size={19} />
            </button>
            <div className="portal-breadcrumb">
              <span>Academy</span>
              <ChevronRight size={13} />
              <strong>{activeNavPath?.label || activeLabel}</strong>
            </div>
          </div>
          <div className="portal-account" ref={accountMenu}>
            {profile && (
              <button
                ref={accountButton}
                type="button"
                className="portal-account-trigger"
                aria-label={`Account options for ${profile.name}`}
                aria-expanded={accountMenuOpen}
                aria-controls="portal-account-menu"
                onClick={() => {
                  const next = !accountMenuOpen;
                  setAccountMenuOpen(next);
                  if (next)
                    window.requestAnimationFrame(() =>
                      accountMenu.current
                        ?.querySelector<HTMLElement>("[data-account-item]")
                        ?.focus()
                    );
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setAccountMenuOpen(true);
                    window.requestAnimationFrame(() =>
                      accountMenu.current
                        ?.querySelector<HTMLElement>("[data-account-item]")
                        ?.focus()
                    );
                  }
                }}
              >
                <span className="portal-account-trigger-identity">
                  <strong>{profile.name}</strong>
                  <small>
                    {roleTitle(profile.role)}{" "}
                    {profile.impersonated ? "(Preview)" : ""}
                  </small>
                </span>
                <span className="portal-account-avatar">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt=""
                      onError={() => setAvatarUrl(null)}
                    />
                  ) : (
                    <span aria-hidden="true">{initials(profile.name)}</span>
                  )}
                </span>
                <span className="portal-account-chevron" aria-hidden="true">
                  <ChevronDown size={10} />
                </span>
              </button>
            )}
            {accountMenuOpen && profile && (
              <div
                id="portal-account-menu"
                className="portal-account-menu"
                aria-label="Account options"
                onBlur={(event) => {
                  if (
                    event.relatedTarget instanceof Node &&
                    !accountMenu.current?.contains(event.relatedTarget)
                  )
                    setAccountMenuOpen(false);
                }}
              >
                {profile.impersonated ? (
                  <button
                    type="button"
                    data-account-item
                    onClick={() => void exitViewAs()}
                  >
                    <ArrowLeft size={15} aria-hidden="true" />
                    Exit user view
                  </button>
                ) : (
                  <Link
                    href="/profile"
                    data-account-item
                    onClick={() => setAccountMenuOpen(false)}
                  >
                    <UserRound size={15} aria-hidden="true" />
                    My profile
                  </Link>
                )}
                <button
                  type="button"
                  data-account-item
                  onClick={() => void signOut()}
                >
                  <LogOut size={15} aria-hidden="true" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </header>
        {sessionError && (
          <div className="portal-session-error" role="alert">
            <AlertCircle size={17} />
            <span>{sessionError}</span>
            <button type="button" onClick={() => void loadSession()}>
              Retry
            </button>
          </div>
        )}
        <div id="portal-route-content" className="portal-route-content">
          <WorkspacePageFrame pathname={pathname}>
            {children}
          </WorkspacePageFrame>
        </div>
      </div>
      <PortalAiChatBubble profile={profile} avatarUrl={avatarUrl} />
    </div>
  );
}
