"use client";

import React, { useState, useEffect, useRef } from "react";
import { SWRConfig } from "swr";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LegalFooter } from "@/components/layout/LegalFooter";
import type { AccessibleDomain } from "@/types/auth";

const IMP_LABEL_COOKIE = "als_imp_label";

function ManageSubscriptionButton() {
  const [loading, setLoading] = useState(false);
  async function handlePortal() {
    setLoading(true);
    try {
      const res  = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.error("Portal error:", err);
    } finally {
      setLoading(false);
    }
  }
  return (
    <button
      onClick={handlePortal}
      disabled={loading}
      className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-60 text-gray-700 text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
    >
      {loading ? <span className="w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" /> : null}
      Manage Subscription
    </button>
  );
}

function getImpLabel(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split(";")
    .map(c => c.trim())
    .find(c => c.startsWith(IMP_LABEL_COOKIE + "="));
  return match ? decodeURIComponent(match.split("=")[1] ?? "") : null;
}

const ROLE_BADGE: Record<string, { label: string; cls: string }> = {
  owner:   { label: "Owner",  cls: "bg-indigo-100 text-indigo-700" },
  editor:  { label: "Editor", cls: "bg-blue-100 text-blue-700" },
  visitor: { label: "Viewer", cls: "bg-gray-100 text-gray-600" },
};

function DomainDropdown({
  domains,
  activeTenantId,
  ownTenantId,
  onSwitch,
}: {
  domains:        AccessibleDomain[];
  activeTenantId: string;
  ownTenantId:    string;
  onSwitch:       (tenantId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const active = domains.find(d => d.tenantId === activeTenantId);
  const displayLabel = active
    ? `${active.domainName}`
    : domains.find(d => d.tenantId === ownTenantId)?.domainName ?? "My account";

  if (domains.length === 0) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors max-w-[200px]"
      >
        <span className="truncate font-medium text-gray-800">{displayLabel}</span>
        {active && (
          <span className={`flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${ROLE_BADGE[active.role]?.cls ?? ''}`}>
            {ROLE_BADGE[active.role]?.label}
          </span>
        )}
        <svg className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-40 bg-white border border-gray-200 rounded-xl shadow-lg min-w-[220px] py-1 overflow-hidden">
          {/* Group by tenantOwnerEmail */}
          {Array.from(new Set(domains.map(d => d.tenantOwnerEmail))).map(ownerEmail => {
            const group = domains.filter(d => d.tenantOwnerEmail === ownerEmail);
            const isOwner = group[0]?.role === 'owner';
            return (
              <div key={ownerEmail}>
                <div className="px-3 py-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider bg-gray-50">
                  {isOwner ? "My account" : ownerEmail}
                </div>
                {group.map(d => (
                  <button
                    key={d.domainId}
                    type="button"
                    onClick={() => { onSwitch(d.tenantId); setOpen(false); }}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left transition-colors ${
                      d.tenantId === activeTenantId
                        ? "bg-indigo-50 text-indigo-700 font-medium"
                        : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <span className="truncate">{d.domainName}</span>
                    <span className={`flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${ROLE_BADGE[d.role]?.cls ?? ''}`}>
                      {ROLE_BADGE[d.role]?.label}
                    </span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface DashboardShellProps {
  email: string;
  tenantId: string;
  children: React.ReactNode;
}

export function DashboardShell({ email, tenantId, children }: DashboardShellProps) {
  const [thawVisible,     setThawVisible]     = useState(false);
  const [thawProgress,    setThawProgress]    = useState(0);
  const [impLabel,        setImpLabel]        = useState<string | null>(null);
  const [stoppingImp,     setStoppingImp]     = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [menuOpen,        setMenuOpen]        = useState(false);
  const [justSubscribed,  setJustSubscribed]  = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    if (new URLSearchParams(window.location.search).get("payment") === "success") {
      sessionStorage.setItem("als_just_subscribed", "true");
      return true;
    }
    return sessionStorage.getItem("als_just_subscribed") === "true";
  });

  const router = useRouter();
  const { data: session, status, update } = useSession();

  const subscriptionStatus = session?.user?.subscriptionStatus as string | undefined;
  const isActive    = subscriptionStatus === "active" || justSubscribed;
  const isCancelled = subscriptionStatus === "canceled";

  // Domain switching state
  const allDomains     = (session?.user?.allAccessibleDomains ?? []) as AccessibleDomain[];
  const activeTenantId = (session?.user?.activeTenantId ?? tenantId) as string;
  const ownTenantId    = (session?.user?.tenantId ?? tenantId) as string;
  const isViewingOwnTenant = activeTenantId === ownTenantId;
  const isOwner        = session?.user?.isOwner as boolean | undefined;

  async function handleDomainSwitch(newTenantId: string) {
    await update({ activeTenantId: newTenantId });
    // Reload the page so SWR and server components pick up the new effective tenant
    window.location.reload();
  }

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/login");
  }, [status, router]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("payment") === "success") {
      update().then(() => {
        setJustSubscribed(false);
        sessionStorage.removeItem("als_just_subscribed");
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubscribe() {
    setCheckoutLoading(true);
    try {
      const res  = await fetch("/api/stripe/checkout", { method: "POST" });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } finally {
      setCheckoutLoading(false);
    }
  }

  useEffect(() => {
    setImpLabel(getImpLabel());
  }, []);

  async function stopImpersonation() {
    setStoppingImp(true);
    try {
      await fetch("/api/admin/impersonate/stop", { method: "POST" });
      window.location.href = "/admin";
    } finally {
      setStoppingImp(false);
    }
  }

  useEffect(() => {
    const start    = Date.now();
    const thawTimer = setTimeout(() => {
      setThawVisible(true);
      setThawProgress(30);
      setTimeout(() => setThawProgress(90), 500);
    }, 2000);

    fetch("/api/wake")
      .then(() => {
        clearTimeout(thawTimer);
        if (Date.now() - start > 2000) {
          setThawProgress(100);
          setTimeout(() => { setThawVisible(false); setThawProgress(0); }, 400);
        }
      })
      .catch(() => clearTimeout(thawTimer));

    return () => clearTimeout(thawTimer);
  }, []);

  const swrConfig = {
    fetcher: (url: string) => fetch(url).then(r => r.json()),
    revalidateOnFocus: true,
    dedupingInterval: 30_000,
  };

  // Subscription buttons only shown when viewing own account as owner
  const showSubscriptionControls = isViewingOwnTenant && isOwner;

  return (
    <SWRConfig value={swrConfig}>
      {/* Thaw progress bar */}
      {thawVisible && (
        <div
          className="fixed left-0 top-0 z-50 h-1 bg-indigo-500 transition-all"
          style={{
            width: `${thawProgress}%`,
            transitionDuration: thawProgress === 90 ? "25000ms" : "500ms",
            transitionTimingFunction: thawProgress === 90 ? "linear" : "cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        />
      )}

      {/* Impersonation banner */}
      {impLabel && (
        <div className="bg-amber-400 text-gray-900 px-4 py-2 text-center text-sm font-medium flex items-center justify-center gap-4">
          <span>👁 Viewing as <strong>{impLabel}</strong> — read-only, all writes blocked</span>
          <button
            onClick={stopImpersonation}
            disabled={stoppingImp}
            className="bg-gray-900 text-amber-400 px-3 py-0.5 rounded text-xs font-semibold hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            {stoppingImp ? "Stopping…" : "← Back to admin"}
          </button>
        </div>
      )}

      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200 relative z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">

            {/* ── Left: logo + nav links ── */}
            <div className="flex items-center gap-4">
              <span className="text-base font-bold text-gray-900 tracking-tight whitespace-nowrap">
                AdLeak Shield
              </span>

              {/* Domain dropdown — always visible when at least one domain exists */}
              {allDomains.length > 0 && (
                <DomainDropdown
                  domains={allDomains}
                  activeTenantId={activeTenantId}
                  ownTenantId={ownTenantId}
                  onSwitch={handleDomainSwitch}
                />
              )}

              <div className="hidden md:flex items-center gap-5">
                <Link href="/dashboard" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                  Dashboard
                </Link>
                <Link href="/settings" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                  Setup
                </Link>
                {isOwner && (
                  <Link href="/settings/team" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                    Team
                  </Link>
                )}
                {isOwner && (
                  <Link href="/settings/subscription" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                    Subscription
                  </Link>
                )}
              </div>
            </div>

            {/* ── Right: desktop extras + hamburger ── */}
            <div className="flex items-center gap-3">
              <div className="hidden md:flex items-center gap-3">
                <span className="text-xs text-gray-400 max-w-[160px] truncate">{email}</span>
                <button
                  onClick={() => signOut({ callbackUrl: "/auth/login" })}
                  className="text-sm text-gray-500 hover:text-gray-900 transition-colors whitespace-nowrap"
                >
                  Sign out
                </button>
              </div>

              {/* Hamburger — mobile only */}
              <button
                onClick={() => setMenuOpen(o => !o)}
                className="md:hidden p-2 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                aria-label="Open menu"
              >
                {menuOpen ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile dropdown */}
        {menuOpen && (
          <div className="md:hidden border-t border-gray-200 bg-white shadow-lg">
            <div className="px-4 py-3 space-y-1">
              <p className="text-xs text-gray-400 pb-2 border-b border-gray-100 truncate">{email}</p>

              <Link href="/dashboard" onClick={() => setMenuOpen(false)}
                className="block px-2 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg transition-colors">
                Dashboard
              </Link>
              <Link href="/settings" onClick={() => setMenuOpen(false)}
                className="block px-2 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg transition-colors">
                Setup
              </Link>
              {isOwner && (
                <Link href="/settings/team" onClick={() => setMenuOpen(false)}
                  className="block px-2 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg transition-colors">
                  Team
                </Link>
              )}
              {isOwner && (
                <Link href="/settings/subscription" onClick={() => setMenuOpen(false)}
                  className="block px-2 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg transition-colors">
                  Subscription
                </Link>
              )}

              <div className="pt-2 border-t border-gray-100">
                <button
                  onClick={() => signOut({ callbackUrl: "/auth/login" })}
                  className="w-full text-left px-2 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  Sign out
                </button>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Main content */}
      <main className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>

      <LegalFooter />
    </SWRConfig>
  );
}
