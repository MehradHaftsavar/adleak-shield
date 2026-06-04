'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const NAV_LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'Contact', href: '#contact' },
];

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
}

// =============================================================================
// NAVBAR
// =============================================================================
function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-200 ${scrolled ? 'bg-white/95 backdrop-blur-sm shadow-sm' : 'bg-transparent'}`}>
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <span className="text-xl font-bold text-slate-900 tracking-tight">
          AdLeak<span className="text-blue-600">Shield</span>
        </span>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-8">
          {NAV_LINKS.map(l => (
            <button
              key={l.label}
              onClick={() => scrollTo(l.href.slice(1))}
              className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
            >
              {l.label}
            </button>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-3">
          <Link href="/auth/login" className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
            Log in
          </Link>
          <Link
            href="/auth/signup"
            className="text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
          >
            Start free trial
          </Link>
        </div>

        {/* Mobile menu button */}
        <button className="md:hidden p-2" onClick={() => setMenuOpen(o => !o)}>
          <div className={`w-5 h-0.5 bg-slate-800 transition-all ${menuOpen ? 'rotate-45 translate-y-1' : ''}`} />
          <div className={`w-5 h-0.5 bg-slate-800 mt-1 ${menuOpen ? 'opacity-0' : ''}`} />
          <div className={`w-5 h-0.5 bg-slate-800 mt-1 transition-all ${menuOpen ? '-rotate-45 -translate-y-1.5' : ''}`} />
        </button>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div className="md:hidden bg-white border-t border-slate-100 px-6 py-4 space-y-3">
          {NAV_LINKS.map(l => (
            <button
              key={l.label}
              onClick={() => { scrollTo(l.href.slice(1)); setMenuOpen(false); }}
              className="block w-full text-left text-sm font-medium text-slate-700 py-1"
            >
              {l.label}
            </button>
          ))}
          <div className="pt-2 flex flex-col gap-2">
            <Link href="/auth/login" className="text-sm font-medium text-slate-600 py-1">Log in</Link>
            <Link href="/auth/signup" className="text-sm font-semibold bg-blue-600 text-white px-4 py-2 rounded-lg text-center">
              Start free trial
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

// =============================================================================
// HERO
// =============================================================================
function Hero() {
  return (
    <section className="pt-24 pb-24 px-6 bg-gradient-to-b from-slate-50 to-white">
      <div className="max-w-4xl mx-auto text-center">
        <span className="inline-block text-xs font-semibold uppercase tracking-widest text-blue-600 bg-blue-50 px-3 py-1 rounded-full mb-6">
          For small businesses
        </span>
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-slate-900 leading-tight mb-6">
          Stop burning your<br />
          <span className="text-blue-600">Google Ads budget</span><br />
          on junk clicks
        </h1>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto mb-10 leading-relaxed">
          AdLeak Shield tracks every visitor from your Google Ads campaigns and shows you exactly which keywords are wasting your money — so you can pause them and get your budget back.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/auth/signup"
            className="w-full sm:w-auto px-8 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors text-base"
          >
            Start your free 7-day trial
          </Link>
          <button
            onClick={() => scrollTo('features')}
            className="w-full sm:w-auto px-8 py-3.5 border border-slate-300 hover:border-slate-400 text-slate-700 font-semibold rounded-lg transition-colors text-base"
          >
            See how it works
          </button>
        </div>
        <p className="mt-4 text-sm text-slate-400">No credit card required · Cancel anytime</p>
      </div>
    </section>
  );
}

// =============================================================================
// STATS BAR
// =============================================================================
function StatsBar() {
  const stats = [
    { value: '< 5KB', label: 'Tracking script size' },
    { value: '7 days', label: 'Free trial' },
    { value: '3', label: 'Campaigns monitored' },
    { value: '£12.99', label: 'Per month' },
  ];
  return (
    <section className="border-y border-slate-100 bg-white py-8">
      <div className="max-w-6xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8">
        {stats.map(s => (
          <div key={s.label} className="text-center">
            <p className="text-2xl font-bold text-slate-900">{s.value}</p>
            <p className="text-sm text-slate-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// =============================================================================
// FEATURES
// =============================================================================
const FEATURES = [
  {
    icon: '📊',
    title: 'Wasted Spend Analysis',
    desc: 'See every keyword ranked by estimated wasted spend. Filter by match type, campaign, and date range. Know exactly where your budget is leaking.',
  },
  {
    icon: '🗺️',
    title: 'Visitor Journey Timeline',
    desc: 'Replay every visitor session — pages visited, time spent, scroll depth, clicks, and whether they converted or bounced. Full picture, zero guesswork.',
  },
  {
    icon: '⚡',
    title: 'Lightweight Tracking Script',
    desc: 'A tiny <5KB script you paste once into your site header. No plugins, no cookies. Works on any website — WordPress, Squarespace, custom code.',
  },
  {
    icon: '📧',
    title: 'Monday Morning Report',
    desc: 'Every Monday at 8am, get a weekly email showing your top wasted keywords from the past 7 days with a direct link to pause them in Google Ads.',
  },
  {
    icon: '🔒',
    title: 'Privacy-First by Design',
    desc: 'Zero cookies. IPs are masked before storage. Session fingerprinting only. Fully compliant with GDPR — no consent banner needed for tracking.',
  },
  {
    icon: '🛡️',
    title: 'Double-Lock Validation',
    desc: 'Every click is validated against your registered campaign IDs and domain. Rogue or spoofed traffic is flagged automatically so your data stays clean.',
  },
  {
    icon: '🚨',
    title: 'Unregistered Traffic Alerts',
    desc: 'If we detect clicks from campaign IDs not in your account, you\'ll see an alert on your dashboard — useful for spotting misconfigurations early.',
  },
  {
    icon: '📅',
    title: '7-Day Free Trial',
    desc: 'Full access for 7 days, no credit card required. See real data from your campaigns before you decide. Cancel in one click if it\'s not for you.',
  },
];

function Features() {
  return (
    <section id="features" className="py-24 px-6 bg-slate-50">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
            Everything you need to stop ad waste
          </h2>
          <p className="text-slate-600 max-w-xl mx-auto">
            Built specifically for small businesses running Google Ads — no bloat, no enterprise complexity.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {FEATURES.map(f => (
            <div key={f.title} className="bg-white rounded-xl p-6 border border-slate-100 hover:border-blue-100 hover:shadow-sm transition-all">
              <span className="text-2xl mb-4 block">{f.icon}</span>
              <h3 className="font-semibold text-slate-900 mb-2">{f.title}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// PRICING
// =============================================================================
const PLAN_FEATURES = [
  '1 domain',
  'Up to 3 Google Ads campaigns',
  'Wasted Spend Leak Table',
  'Visitor Journey Timeline',
  'Monday morning email report',
  '7-day free trial (no card required)',
  'Privacy-first, GDPR compliant',
  'Unregistered traffic alerts',
  'Cancel anytime via billing portal',
  'Right to erasure — delete your account instantly',
];

function Pricing() {
  return (
    <section id="pricing" className="py-24 px-6 bg-white">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
            Simple, transparent pricing
          </h2>
          <p className="text-slate-600">One plan. Everything included. No surprises.</p>
        </div>

        <div className="max-w-md mx-auto">
          <div className="bg-white border-2 border-blue-600 rounded-2xl p-8 shadow-lg">
            <div className="flex items-baseline gap-1 mb-1">
              <span className="text-4xl font-bold text-slate-900">£12.99</span>
              <span className="text-slate-500">/month</span>
            </div>
            <p className="text-sm text-slate-500 mb-6">per month</p>

            <div className="space-y-3 mb-8">
              {PLAN_FEATURES.map(f => (
                <div key={f} className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm text-slate-700">{f}</span>
                </div>
              ))}
            </div>

            <Link
              href="/auth/signup"
              className="block w-full text-center px-6 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
            >
              Start free 7-day trial
            </Link>
            <p className="text-center text-xs text-slate-400 mt-3">No credit card required to start</p>
          </div>
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// CONTACT
// =============================================================================
function Contact() {
  const [form, setForm] = useState({ name: '', email: '', website: '', message: '' });
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('sending');
    setErrorMsg('');

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Failed to send message');
        setStatus('error');
        return;
      }
      setStatus('sent');
      setForm({ name: '', email: '', website: '', message: '' });
    } catch {
      setErrorMsg('Network error. Please try again.');
      setStatus('error');
    }
  };

  return (
    <section id="contact" className="py-24 px-6 bg-slate-50">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">Get in touch</h2>
          <p className="text-slate-600">Have a question or want to know more? Send us a message and we'll get back to you.</p>
        </div>

        {status === 'sent' ? (
          <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="font-semibold text-slate-900 mb-1">Message sent</h3>
            <p className="text-sm text-slate-600">Thanks for reaching out. We'll get back to you shortly.</p>
            <button onClick={() => setStatus('idle')} className="mt-4 text-sm text-blue-600 hover:underline">
              Send another message
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-100 p-8 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Jane Smith"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Email <span className="text-red-500">*</span></label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="jane@example.com"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Website</label>
              <input
                type="text"
                value={form.website}
                onChange={e => setForm(f => ({ ...f, website: e.target.value }))}
                placeholder="example.com"
                className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Message <span className="text-red-500">*</span></label>
              <textarea
                required
                rows={5}
                value={form.message}
                onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                placeholder="Tell us what you'd like to know..."
                className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
            </div>

            {status === 'error' && (
              <p className="text-sm text-red-600">{errorMsg}</p>
            )}

            <button
              type="submit"
              disabled={status === 'sending'}
              className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
            >
              {status === 'sending' && (
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              )}
              {status === 'sending' ? 'Sending…' : 'Send message'}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}

// =============================================================================
// FOOTER
// =============================================================================
function Footer() {
  return (
    <footer className="bg-slate-900 text-slate-400 py-10 px-6">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <span className="text-white font-bold text-lg">
          AdLeak<span className="text-blue-400">Shield</span>
        </span>
        <div className="flex items-center gap-6 text-sm">
          {NAV_LINKS.map(l => (
            <button key={l.label} onClick={() => scrollTo(l.href.slice(1))} className="hover:text-white transition-colors">
              {l.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/auth/login" className="hover:text-white transition-colors">Log in</Link>
          <Link href="/auth/signup" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg transition-colors font-medium">
            Get started
          </Link>
        </div>
      </div>
      <div className="max-w-6xl mx-auto mt-8 pt-8 border-t border-slate-800 text-xs text-slate-600">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <span>© {new Date().getFullYear()} AdLeak Shield · Helping businesses stop wasting Google Ads budget</span>
          <nav className="flex items-center gap-4">
            <a href="/privacy" className="hover:text-slate-400 transition-colors">Privacy Policy</a>
            <a href="/terms"   className="hover:text-slate-400 transition-colors">Terms of Service</a>
            <a href="/cookies" className="hover:text-slate-400 transition-colors">Cookie Policy</a>
          </nav>
        </div>
      </div>
    </footer>
  );
}

// =============================================================================
// PAGE
// =============================================================================
export default function HomePage() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <StatsBar />
        <Features />
        <Pricing />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
