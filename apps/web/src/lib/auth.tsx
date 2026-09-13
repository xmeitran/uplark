"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { primaryAuthRole } from "./auth-role";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id?: string;
  name: string;
  email: string;
  initials: string;
  avatarColor: string; // hex
  avatarUrl?: string;
  role: string;
  roleCodes?: string[];
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}
const AuthContext = createContext<AuthContextValue>({ user: null, isLoading: true, refresh: async () => {}, logout: async () => {} });
const PUBLIC_AUTH_PATHS = new Set(["/login", "/signup", "/forgot-password", "/reset-password", "/verify-email"]);
// The public pilot preview runs with a server-side synthetic session. Keep the
// client auth guard in the same mode so a fresh browser can open deep links
// (for example /projects/p3) without being bounced to the Lark OAuth flow.
const LOCAL_DEMO_AUTH_BYPASS =
  (process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_CRM_LOCAL_DEMO_BYPASS === "true") ||
  (typeof window !== "undefined" &&
    window.location.hostname.endsWith(".trycloudflare.com"));

interface SessionPrincipal {
  displayName?: string;
  email?: string;
  avatarUrl?: string;
  roleCodes?: string[];
  subjectId?: string;
}

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
  return initials || "B2B";
}

function authUserFromPrincipal(principal: SessionPrincipal): AuthUser {
  const name = principal.displayName?.trim() || "Workspace User";
  return {
    name,
    id: principal.subjectId,
    email: principal.email ?? principal.subjectId ?? "",
    initials: initialsFromName(name),
    avatarColor: "#059669",
    avatarUrl: principal.avatarUrl,
    role: primaryAuthRole(principal.roleCodes),
    roleCodes: principal.roleCodes ?? []
  };
}

async function fetchSessionUser() {
  const response = await fetch("/api/auth/me", {
    cache: "no-store",
    credentials: "same-origin"
  });

  if (!response.ok) {
    return null;
  }

  return authUserFromPrincipal((await response.json()) as SessionPrincipal);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]           = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router   = useRouter();
  const pathname = usePathname();
  const logoutInFlight = useRef<Promise<void> | null>(null);

  const refresh = useCallback(async () => { setUser(await fetchSessionUser()); }, []);

  useEffect(() => {
    let mounted = true;
    // Remove the former UI-only identity cache. It is never an authentication source.
    localStorage.removeItem("crm_auth_user");
    fetchSessionUser().then(value => { if (mounted) setUser(value); })
      .catch(() => { if (mounted) setUser(null); })
      .finally(() => { if (mounted) setIsLoading(false); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const isPublicPreview =
      typeof window !== "undefined" &&
      window.location.hostname.endsWith(".trycloudflare.com");
    if (
      !isLoading &&
      !user &&
      !PUBLIC_AUTH_PATHS.has(pathname) &&
      !LOCAL_DEMO_AUTH_BYPASS &&
      !isPublicPreview
    ) {
      router.replace(`/login?returnTo=${encodeURIComponent(pathname)}`);
    }
  }, [user, isLoading, pathname, router]);

  const logout = useCallback(() => {
    if (logoutInFlight.current) return logoutInFlight.current;

    const operation = (async () => {
      localStorage.removeItem("crm_auth_user");
      setIsLoading(true);

      const form = document.createElement("form");
      form.method = "POST";
      form.action = "/api/auth/session/logout";
      form.hidden = true;
      document.body.appendChild(form);
      form.submit();
    })();

    logoutInFlight.current = operation;
    return operation;
  }, []);

  // ── Loading screen ─────────────────────────────────────────────────────────
  // Block rendering the entire app until we know auth state.
  // This eliminates the race condition where Effect 2 fires before Effect 1
  // has finished reading localStorage and setting the user.
  if (isLoading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "var(--color-background, #0f172a)",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width: 40,
              height: 40,
              border: "3px solid rgba(37,99,235,0.2)",
              borderTopColor: "#2563eb",
              borderRadius: "50%",
              animation: "spin 0.7s linear infinite",
              margin: "0 auto 12px",
            }}
          />
          <p style={{ fontSize: 12, color: "#64748b", fontFamily: "var(--font-sans)" }}>
            Loading workspace...
          </p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth() {
  return useContext(AuthContext);
}
