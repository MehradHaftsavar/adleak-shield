'use client';
// =============================================================================
// AdLeak Shield — Marketing Shell
// src/components/layout/MarketingShell.tsx
//
// Shared Navbar + Footer used on standalone marketing pages (Privacy, Terms,
// Cookies, Setup Guide). Section links use href="/#..." so they navigate back
// to the homepage and scroll to the right section.
//
// The homepage (page.tsx) keeps its own inline Navbar with smooth-scroll
// onClick handlers — this shell is only for non-homepage pages.
// =============================================================================

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Script from 'next/script';

const NAV_LINKS = [
  { label: 'Features', href: '/#features' },
  { label: 'Pricing',  href: '/#pricing'  },
  { label: 'Blog',     href: '/blog'      },
  { label: 'FAQ',      href: '/#faq'      },
  { label: 'Contact',  href: '/#contact'  },
];

// -----------------------------------------------------------------------------
// Navbar
// -----------------------------------------------------------------------------
function MarketingNav() {
  const [scrolled,  setScrolled]  = useState(false);
  const [menuOpen,  setMenuOpen]  = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-200 ${
        scrolled ? 'bg-white/95 backdrop-blur-sm shadow-sm' : 'bg-white shadow-sm'
      }`}
    >
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="text-xl font-bold text-slate-900 tracking-tight">
          AdLeak<span className="text-blue-600">Shield</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-8">
          {NAV_LINKS.map(l => (
            <Link
              key={l.label}
              href={l.href}
              className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        {/* Desktop CTA */}
        <div className="hidden md:flex items-center gap-3">
          <Link
            href="/auth/login"
            className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
          >
            Log in
          </Link>
          <Link
            href="/auth/signup"
            className="text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
          >
            Start free trial
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden p-2"
          onClick={() => setMenuOpen(o => !o)}
          aria-label="Toggle menu"
        >
          <div className={`w-5 h-0.5 bg-slate-800 transition-all ${menuOpen ? 'rotate-45 translate-y-1' : ''}`} />
          <div className={`w-5 h-0.5 bg-slate-800 mt-1 ${menuOpen ? 'opacity-0' : ''}`} />
          <div className={`w-5 h-0.5 bg-slate-800 mt-1 transition-all ${menuOpen ? '-rotate-45 -translate-y-1.5' : ''}`} />
        </button>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div className="md:hidden bg-white border-t border-slate-100 px-6 py-4 space-y-3">
          {NAV_LINKS.map(l => (
            <Link
              key={l.label}
              href={l.href}
              onClick={() => setMenuOpen(false)}
              className="block text-sm font-medium text-slate-700 py-1"
            >
              {l.label}
            </Link>
          ))}
          <div className="pt-2 flex flex-col gap-2">
            <Link href="/auth/login" className="text-sm font-medium text-slate-600 py-1">
              Log in
            </Link>
            <Link
              href="/auth/signup"
              className="text-sm font-semibold bg-blue-600 text-white px-4 py-2 rounded-lg text-center"
            >
              Start free trial
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

// -----------------------------------------------------------------------------
// Footer
// -----------------------------------------------------------------------------
function MarketingFooter() {
  return (
    <footer className="bg-slate-900 text-slate-400 py-10 px-6">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <Link href="/" className="text-white font-bold text-lg">
          AdLeak<span className="text-blue-400">Shield</span>
        </Link>
        <div className="flex items-center gap-6 text-sm">
          {NAV_LINKS.map(l => (
            <Link key={l.label} href={l.href} className="hover:text-white transition-colors">
              {l.label}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/auth/login" className="hover:text-white transition-colors">Log in</Link>
          <Link
            href="/auth/signup"
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg transition-colors font-medium"
          >
            Get started
          </Link>
        </div>
      </div>
      <div className="max-w-6xl mx-auto mt-8 pt-8 border-t border-slate-800 text-xs text-slate-600">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <span>© {new Date().getFullYear()} AdLeak Shield · Helping businesses stop wasting Google Ads budget</span>
          <nav className="flex items-center gap-4">
            <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="hover:text-slate-400 transition-colors">Privacy Policy</Link>
            <Link href="/terms"   target="_blank" rel="noopener noreferrer" className="hover:text-slate-400 transition-colors">Terms of Service</Link>
            <Link href="/cookies" target="_blank" rel="noopener noreferrer" className="hover:text-slate-400 transition-colors">Cookie Policy</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}

// -----------------------------------------------------------------------------
// Shell wrapper
// -----------------------------------------------------------------------------
export function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen">
      <MarketingNav />
      {/* pt-16 pushes content below the fixed h-16 navbar */}
      <main className="flex-1 pt-16">
        {children}
      </main>
      <MarketingFooter />
      {/* Umami analytics — cookieless, no consent banner required */}
      <Script
        src="https://umami-five-rho-99.vercel.app/script.js"
        data-website-id="b04d6612-6e8a-444f-90fd-7a74f0133857"
        strategy="afterInteractive"
      />
    </div>
  );
}
