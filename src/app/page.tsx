// Server component — no 'use client'.
// Only the three interactive parts (Navbar, FAQAccordion, ContactSection) are
// client components. Everything else is pure static HTML, so the browser paints
// the hero text the moment the CSS arrives — no JS hydration delay.

import Link   from 'next/link';
import Script from 'next/script';
import { Navbar }         from '@/components/marketing/Navbar';
import { FAQAccordion }   from '@/components/marketing/FAQAccordion';
import { ContactSection } from '@/components/marketing/ContactSection';

const NAV_LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'Pricing',  href: '#pricing'  },
  { label: 'Blog',     href: '/blog'     },
  { label: 'FAQ',      href: '#faq'      },
  { label: 'Contact',  href: '#contact'  },
];

// =============================================================================
// HERO
// =============================================================================
function Hero() {
  return (
    <section className="pt-28 pb-12 px-6 bg-gradient-to-b from-slate-50 to-white">
      <div className="max-w-4xl mx-auto text-center">
        <span className="inline-block text-xs font-semibold uppercase tracking-widest text-blue-600 bg-blue-50 px-3 py-1 rounded-full mb-6">
          For small businesses
        </span>
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-slate-900 leading-tight mb-6">
          Stop burning your<br />
          <span className="text-blue-600">Google Ads budget</span><br />
          on junk clicks
        </h1>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto mb-8 leading-relaxed">
          AdLeak Shield tracks every visitor from your Google Ads campaigns and shows you exactly which keywords are wasting your money — so you can pause them and get your budget back.
        </p>

        {/* Privacy trust badges */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-10">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-50 border border-green-200 text-green-800 text-xs font-semibold rounded-full">
            🍪 Zero cookies
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-50 border border-green-200 text-green-800 text-xs font-semibold rounded-full">
            ✓ No consent banner required
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-50 border border-green-200 text-green-800 text-xs font-semibold rounded-full">
            🔒 GDPR compliant by design
          </span>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/auth/signup"
            className="w-full sm:w-auto px-8 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors text-base"
          >
            Start your free 7-day trial
          </Link>
          {/* Anchor link — smooth scroll handled by CSS scroll-behavior in globals.css */}
          <a
            href="#features"
            className="w-full sm:w-auto px-8 py-3.5 border border-slate-300 hover:border-slate-400 text-slate-700 font-semibold rounded-lg transition-colors text-base text-center"
          >
            See how it works
          </a>
        </div>
        <p className="mt-4 text-sm text-slate-500">No credit card required · Cancel anytime</p>
      </div>
    </section>
  );
}

// =============================================================================
// PAIN SECTION
// =============================================================================
function PainSection() {
  const pains = [
    "You're getting clicks on your Google Ads but the phone never rings.",
    "You've spent hundreds this month and got only a handful of leads — if any.",
    "You can see your budget disappearing in Google Ads but can't tell which keywords are the problem.",
    "Your ads attract clicks from people who clearly weren't looking for what you sell.",
    "You've been told to \"add negative keywords\" but have no idea which ones.",
  ];

  return (
    <section className="py-12 px-6 bg-white">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-10">
          <span className="inline-block text-xs font-semibold uppercase tracking-widest text-red-500 bg-red-50 px-3 py-1 rounded-full mb-4">
            Sound familiar?
          </span>
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
            Getting clicks on Google Ads<br className="hidden sm:block" /> but no calls, leads, or sales?
          </h2>
          <p className="text-slate-600">
            You're not alone. Most small businesses running Google Ads are silently bleeding budget on keywords that will never convert — and Google won't tell you which ones.
          </p>
        </div>

        <div className="space-y-3 mb-10">
          {pains.map((pain, i) => (
            <div key={i} className="flex items-start gap-3 bg-red-50 border border-red-100 rounded-xl px-5 py-4">
              <span className="text-red-400 font-bold text-lg leading-tight flex-shrink-0 mt-0.5">✕</span>
              <p className="text-slate-700 text-sm leading-relaxed">{pain}</p>
            </div>
          ))}
        </div>

        <div className="bg-blue-600 rounded-2xl px-8 py-7 text-center text-white">
          <p className="text-lg font-semibold mb-1">The problem isn't your ads — it's the keywords triggering them.</p>
          <p className="text-blue-100 text-sm">
            AdLeak Shield tracks every Google Ads click, identifies which keywords produce nothing but bounces, and gives you a one-click export to block them in Google Ads — stopping the waste permanently.
          </p>
        </div>
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
    desc: "If we detect clicks from campaign IDs not in your account, you'll see an alert on your dashboard — useful for spotting misconfigurations early.",
  },
  {
    icon: '📅',
    title: '7-Day Free Trial',
    desc: "Full access for 7 days, no credit card required. See real data from your campaigns before you decide. Cancel in one click if it's not for you.",
  },
];

function Features() {
  return (
    <section id="features" className="py-14 px-6 bg-slate-50">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-10">
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
  'Cookieless tracking — no consent banner required',
  'GDPR compliant by design',
  'Unregistered traffic alerts',
  'Cancel anytime via billing portal',
  'Right to erasure — delete your account instantly',
];

function Pricing() {
  return (
    <section id="pricing" className="py-14 px-6 bg-white">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
            Simple, transparent pricing
          </h2>
          <p className="text-slate-600">One plan. Everything included. No surprises.</p>
        </div>

        <div className="max-w-md mx-auto">
          <div className="bg-white border-2 border-blue-600 rounded-2xl p-8 shadow-lg">
            <div className="flex items-baseline gap-1 mb-1">
              <span className="text-4xl font-bold text-slate-900">£12.99</span>
              {/* text-slate-600 passes contrast on white (6.6:1) */}
              <span className="text-slate-600">/month</span>
            </div>
            <p className="text-sm text-slate-600 mb-6">per month</p>

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
            {/* text-slate-500 still slightly fails; use text-slate-600 for safe contrast */}
            <p className="text-center text-xs text-slate-600 mt-3">No credit card required to start</p>
          </div>
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// FAQ — section wrapper is server; accordion interaction is client
// =============================================================================
const FAQS = [
  {
    q: "Why am I getting Google Ads clicks but no calls, leads, or sales?",
    a: "The most common cause is keyword leaks — search terms that trigger your ads but attract visitors with no intention to buy. For example, a plumber bidding on 'plumbing' might attract people searching for DIY plumbing guides rather than an emergency plumber. AdLeak Shield identifies exactly which keywords are causing this by tracking whether visitors engage with your site or leave within seconds of arriving.",
  },
  {
    q: "How do I find out which Google Ads keywords are wasting my budget?",
    a: "Google Ads shows you clicks and costs per keyword, but not what visitors actually did on your website after clicking. AdLeak Shield bridges that gap — it tracks every ad click on your site, measures session quality (time on site, pages visited, scroll depth), and flags keywords where a high percentage of visitors bounce immediately. You get a ranked table of every leaking keyword alongside the estimated money already wasted on each one.",
  },
  {
    q: "What are negative keywords and how do they help?",
    a: "Negative keywords are words you tell Google Ads to never trigger your ads for. For example, if you're a plumber and you keep attracting people searching for 'plumbing courses', you'd add 'courses' as a negative keyword. Once added, those searches will never match your ads again — stopping that wasted spend permanently. AdLeak Shield exports your worst-performing keywords as a negative keyword list ready to upload directly into Google Ads.",
  },
  {
    q: "Does AdLeak Shield work for any type of business?",
    a: "Yes — if you run Google Ads and have a website, AdLeak Shield works for you. It's been designed for small and medium businesses: tradespeople, local service businesses, e-commerce stores, consultants, solicitors, dentists, accountants — any business paying per click on Google Ads who wants to know whether those clicks are turning into real opportunities.",
  },
  {
    q: "How long does it take to set up?",
    a: "About 15 minutes. You paste a small code snippet into your website's header (works on any platform — WordPress, Shopify, Wix, or custom code), add a tracking template to your Google Ads campaigns, and you're done. Data starts appearing in your dashboard as soon as the first ad click comes through.",
  },
  {
    q: "Will it slow down my website or affect my visitors?",
    a: "No. The tracking snippet is under 5KB and loads asynchronously — meaning it never blocks your page from loading. Your visitors won't notice any difference. It also uses zero cookies, so you don't need to update your cookie banner or consent mechanism.",
  },
  {
    q: "Is AdLeak Shield GDPR compliant?",
    a: "Yes, and by design. We don't use cookies. IP addresses are masked before storage (last octet removed). No personally identifiable information about your visitors is collected or stored. You don't need a consent banner to run the tracking snippet. AdLeak Shield is registered with the UK Information Commissioner's Office (ICO) under registration number C1953337.",
  },
  {
    q: "How much does it cost and is there a free trial?",
    a: "AdLeak Shield is £12.99 per month, with everything included — no feature tiers, no per-click charges. You get a full 7-day free trial with no credit card required. You'll see real data from your campaigns before you decide whether to continue.",
  },
];

const FAQ_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map(({ q, a }) => ({
    "@type": "Question",
    name: q,
    acceptedAnswer: { "@type": "Answer", text: a },
  })),
};

function FAQSection() {
  return (
    <section id="faq" className="py-14 px-6 bg-slate-50">
      {/* JSON-LD structured data — tells Google to show rich snippets */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSON_LD) }}
      />
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
            Frequently asked questions
          </h2>
          <p className="text-slate-600">
            Everything you need to know about stopping wasted Google Ads spend.
          </p>
        </div>
        <FAQAccordion faqs={FAQS} />
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
        <nav className="flex items-center gap-6 text-sm">
          {NAV_LINKS.map(l => (
            <a key={l.label} href={l.href} className="hover:text-white transition-colors">
              {l.label}
            </a>
          ))}
        </nav>
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
      {/* text-slate-400 on slate-900 = 6.6:1 contrast ratio — passes */}
      <div className="max-w-6xl mx-auto mt-8 pt-8 border-t border-slate-800 text-xs text-slate-400">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <span>© {new Date().getFullYear()} AdLeak Shield · Helping businesses stop wasting Google Ads budget</span>
          <nav className="flex items-center gap-4">
            <a href="/privacy" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Privacy Policy</a>
            <a href="/terms"   target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Terms of Service</a>
            <a href="/cookies" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Cookie Policy</a>
          </nav>
        </div>
      </div>
    </footer>
  );
}

// =============================================================================
// PAGE — server component, no JS hydration for static sections
// =============================================================================
export default function HomePage() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <PainSection />
        <Features />
        <Pricing />
        <FAQSection />
        <ContactSection />
      </main>
      <Footer />
      {/* Umami analytics — cookieless, no consent banner required */}
      <Script
        src="https://umami-five-rho-99.vercel.app/script.js"
        data-website-id="b04d6612-6e8a-444f-90fd-7a74f0133857"
        strategy="afterInteractive"
      />
      {/* AdLeak Shield tracker */}
      <Script src="https://www.adleakshield.com/tracker.js" strategy="afterInteractive" />
    </>
  );
}
