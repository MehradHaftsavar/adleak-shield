import Link from 'next/link';
import { MarketingShell } from '@/components/layout/MarketingShell';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Why Your Google Ads Are Getting Clicks But No Calls | AdLeak Shield',
  description: "Spending on Google Ads but the phone isn't ringing? Discover the six most common reasons your campaign is leaking budget,and how to fix each one.",
  openGraph: {
    title: 'Why Your Google Ads Are Getting Clicks But No Calls',
    description: "Spending on Google Ads but the phone isn't ringing? Discover the six most common reasons your campaign is leaking budget,and how to fix each one.",
    type: 'article',
    publishedTime: '2026-06-16',
    authors: ['Mehrad Haftsavar'],
    siteName: 'AdLeak Shield',
  },
};

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'Why are my Google Ads getting clicks but no calls?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: "The most common reasons include targeting keywords with the wrong intent (people researching rather than ready to buy), a landing page that doesn't match your ad's promise, invalid or bot clicks that look real but never convert, running ads outside business hours, and broken conversion tracking that hides the problem from view.",
      },
    },
    {
      '@type': 'Question',
      name: 'What causes Google Ads clicks but no conversions?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: "Google Ads clicks but no conversions typically stem from broad keyword targeting attracting the wrong audience, a landing page that doesn't continue the ad's message, invalid clicks from bots or competitor fraud, poor mobile experience causing visitors to bounce, or misconfigured conversion tracking that isn't recording real leads.",
      },
    },
    {
      '@type': 'Question',
      name: 'Are invalid clicks in Google Ads refundable?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes, in many cases. Google automatically filters some invalid traffic before charging for it, but a significant portion still slips through. If you can identify patterns of invalid click activity,unusual traffic spikes, near-100% bounce rates, or repeated clicks from the same source,you can apply for a credit through Google Ads support. Independent click tracking tools help you document these patterns with evidence.',
      },
    },
    {
      '@type': 'Question',
      name: 'What is a good Google Ads conversion rate for local service businesses?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'For local service businesses, a typical Google Ads conversion rate ranges from 3% to 12% depending on the industry, keyword intent, and landing page quality. Emergency services like locksmiths and plumbers tend to see higher rates due to urgent purchase intent. If your rate is below 2–3%, investigate keyword intent, landing page relevance, and whether invalid traffic is affecting your numbers.',
      },
    },
    {
      '@type': 'Question',
      name: 'How can I see what visitors do after clicking my Google Ads?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: "Google Analytics shows aggregated behaviour, but session-level tracking tools,ones that tie each individual visitor's journey directly back to the specific keyword and ad that brought them,give you the clearest picture. They show whether each paid visitor scrolled to your phone number, clicked your contact button, or bounced within seconds, helping you pinpoint exactly where the drop-off happens for each keyword.",
      },
    },
  ],
};

const articleSchema = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: "Why Your Google Ads Are Getting Clicks But No Calls,And What's Really Draining Your Budget",
  description: "Spending on Google Ads but the phone isn't ringing? Discover the six most common reasons your campaign is leaking budget,and how to fix each one.",
  publisher: { '@type': 'Organization', name: 'AdLeak Shield', url: 'https://adleakshield.com' },
  datePublished: '2026-06-16',
  dateModified: '2026-06-16',
  url: 'https://adleakshield.com/blog/google-ads-clicks-but-no-calls',
};

const tocItems = [
  { id: 'wrong-kind-of-click', label: "1. You're attracting the wrong kind of click" },
  { id: 'landing-page',        label: '2. Your landing page breaks the promise your ad makes' },
  { id: 'invalid-clicks',      label: '3. Invalid clicks are burning through your budget' },
  { id: 'ad-scheduling',       label: "4. You're running ads when nobody answers" },
  { id: 'broken-tracking',     label: "5. Your tracking is broken (and you probably don't know it)" },
  { id: 'no-visibility',       label: '6. You have no visibility into what happens after the click' },
];

export default function BlogPostPage() {
  return (
    <MarketingShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }} />

      <div className="bg-white">
        {/* Header */}
        <div className="bg-gray-50 border-b border-gray-100">
          <div className="max-w-3xl mx-auto px-6 py-12">
            <div className="flex items-center gap-3 mb-6">
              <Link href="/blog" className="text-sm text-gray-500 hover:text-blue-600 transition-colors">
                ← Blog
              </Link>
              <span className="text-gray-300">|</span>
              <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full">
                Google Ads
              </span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 leading-tight mb-6">
              Why Your Google Ads Are Getting Clicks But No Calls, And What&apos;s Really Draining Your Budget
            </h1>
            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
              <time dateTime="2026-06-16">16 June 2026</time>
              <span>·</span>
              <span>6 min read</span>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="max-w-3xl mx-auto px-6 py-12">

          {/* Lead */}
          <p className="text-lg text-gray-700 leading-relaxed mb-6">
            You&apos;ve set up the campaigns. You&apos;re paying for clicks. The dashboard shows traffic. But the phone isn&apos;t
            ringing, enquiries aren&apos;t coming in, and you&apos;re left wondering where exactly your money is going.
          </p>
          <p className="text-gray-700 leading-relaxed mb-10">
            If your <strong>Google Ads are getting clicks but no calls</strong>, you&apos;re not alone, and you&apos;re not
            imagining it. It&apos;s one of the most common frustrations among small business owners running paid search
            campaigns. The clicks are real. The spend is real. The silence, however, is a signal that something in the chain is broken.
          </p>

          {/* Table of Contents */}
          <nav aria-label="Table of contents" className="bg-gray-50 border border-gray-200 rounded-xl p-6 mb-12">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">In this article</p>
            <ol className="space-y-2.5">
              {tocItems.map(item => (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    className="text-sm text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          {/* Sections */}
          <div className="space-y-12 text-gray-700 leading-relaxed">

            <section id="wrong-kind-of-click">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">1. You&apos;re attracting the wrong kind of click</h2>
              <p className="mb-4">
                Not all clicks are created equal. Google&apos;s broad match keyword targeting,turned on by default in most
                campaigns,casts a wide net. Too wide, in many cases.
              </p>
              <p className="mb-4">
                A roofing company bidding on &ldquo;roof repair&rdquo; might find their ad appearing for &ldquo;DIY roof repair
                guide&rdquo; or &ldquo;roof repair cost calculator.&rdquo; These searchers aren&apos;t looking to hire anyone.
                They&apos;re researchers. They click, they don&apos;t find what they need, and they leave without ever picking
                up the phone.
              </p>
              <p>
                This is the <strong>Google Ads high click-through rate, low conversions</strong> pattern in its most common
                form. High CTR tells you your ad is attractive. Low conversions tell you the wrong people are clicking it. The
                fix is tighter keyword matching,exact match and phrase match,combined with a well-maintained negative
                keyword list that filters out research-intent traffic before it costs you money.{' '}
                <strong>Google Ads clicks but no conversions</strong> at this level usually means your targeting is letting in
                everyone when you only want the people ready to buy.
              </p>
            </section>

            <section id="landing-page">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                2. Your landing page breaks the promise your ad makes
              </h2>
              <p className="mb-4">
                A user searches &ldquo;emergency plumber Manchester,&rdquo; clicks your ad, and lands on your homepage,a
                generic page about your company history with no phone number above the fold. They&apos;re gone within seconds.
              </p>
              <p className="mb-4">
                This is message mismatch, and it silently kills conversion rates at scale. Your ad makes a specific promise
                (&ldquo;Emergency plumber, available now&rdquo;). Your landing page needs to immediately deliver on that exact
                promise,same service, same location, same urgency,with a phone number that&apos;s impossible to miss and a
                single clear call to action.
              </p>
              <p>
                <strong>Google Ads clicks but no conversions</strong> are frequently traced back here: not because the ad
                failed, but because the landing page didn&apos;t continue the conversation the ad started. If you&apos;re
                running multiple ad groups targeting different services or locations, each should ideally point to a dedicated
                landing page, not a generic homepage. A 2026 industry benchmark found that a{' '}
                <strong>high click-through rate with low conversions</strong> is now the single most reported pattern in small
                business Google Ads accounts,and landing page mismatch is cited as the cause in over half of diagnosed cases.
              </p>
            </section>

            <section id="invalid-clicks">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                3. Invalid clicks are burning through your budget
              </h2>
              <p className="mb-4">
                Here&apos;s the problem nobody talks about enough: a significant portion of the clicks on your ads may not be
                from potential customers at all.
              </p>
              <p className="mb-4">
                <strong>Invalid clicks in Google Ads</strong> include bot traffic, accidental clicks (disproportionately common
                on mobile), competitor click fraud, and automated scripts designed to exhaust competitor budgets. Google
                estimates it catches and filters the majority of invalid traffic automatically,but &ldquo;majority&rdquo; is
                doing a lot of heavy lifting in that sentence. Independent research suggests that over £13 billion in global ad
                spend was lost to <strong>invalid clicks in Google Ads</strong> in 2024 alone, with small and medium businesses
                absorbing a disproportionate share.
              </p>
              <p className="mb-4">
                The signs are subtle: a high bounce rate from paid traffic, sessions that last under two seconds, spikes in
                clicks with no corresponding increase in calls or enquiries. <strong>Invalid clicks in Google Ads</strong> are
                particularly insidious because they inflate your cost-per-click over time,Google&apos;s algorithm interprets
                the high bounce rate as a signal that your ad isn&apos;t relevant and raises your bids accordingly.
              </p>
              <p>
                For small businesses with modest budgets, even a handful of invalid clicks per day compounds into hundreds of
                pounds of <strong>wasted Google Ads budget</strong> per month. Google&apos;s own reporting won&apos;t surface
                this clearly. That&apos;s why independent session-level tracking,something that shows you what each ad click
                actually did on your site,is increasingly essential, not optional.
              </p>
            </section>

            <section id="ad-scheduling">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                4. You&apos;re running ads when nobody answers
              </h2>
              <p className="mb-4">
                Ad scheduling is underused and frequently misconfigured. If your ads run 24/7 but your business only takes
                calls between 9am and 6pm, you&apos;re paying for clicks at 11pm from people who call, get no answer, and move
                on to the next result.
              </p>
              <p>
                The fix is straightforward: review your conversion data by hour of day and day of week, then restrict your ad
                schedule to hours when calls are actually answered. If you&apos;re a sole trader or small team, running ads
                during your lunch break when you can&apos;t answer the phone is a quiet drain on your budget that&apos;s easy
                to overlook. Either tighten your ad schedule or implement a call answering service to ensure every click has a
                genuine chance of converting.
              </p>
            </section>

            <section id="broken-tracking">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                5. Your tracking is broken (and you probably don&apos;t know it)
              </h2>
              <p className="mb-4">
                It&apos;s remarkably common: conversion tracking that was set up once, never verified, and quietly stopped
                working after a website update. Or tracking that fires on the wrong event,&ldquo;page loaded&rdquo; instead
                of &ldquo;form submitted.&rdquo; Or call tracking with a duration threshold set so high that real enquiries
                don&apos;t register as conversions.
              </p>
              <p>
                If your conversion tracking is unreliable, you can&apos;t diagnose any of the problems above. Before adjusting
                bids, pausing keywords, or rewriting ad copy, verify your tracking is actually recording what you think it is.
                A 2026 audit of small business Google Ads accounts found that over 40% had some form of tracking
                misconfiguration,meaning nearly half of advertisers were optimising campaigns based on incomplete or
                inaccurate data.
              </p>
            </section>

            <section id="no-visibility">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                6. You have no visibility into what happens after the click
              </h2>
              <p className="mb-4">
                Most businesses running Google Ads know their click volume and their cost per click. Very few know what those
                visitors actually <em>did</em> on their site,which pages they visited, whether they scrolled to the phone
                number, whether they tried to call and couldn&apos;t find it, or whether they bounced within three seconds of
                landing.
              </p>
              <p>
                This is the core of the <strong>wasted Google Ads budget</strong> problem: without visibility into the
                post-click journey for each individual visitor, tied back to the specific keyword and ad that brought them, you
                can&apos;t identify where the drop-off is happening. You end up guessing,pausing keywords that might have
                been fine, keeping the ones that are the actual culprit, rewriting ad copy when the real issue is the landing
                page. Session-level tracking tools that show you the full journey for every paid visitor give you the evidence
                to make those decisions correctly rather than by instinct.
              </p>
            </section>

            <section id="bottom-line" className="border-t border-gray-100 pt-10">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">The bottom line</h2>
              <p className="mb-4">
                If your <strong>Google Ads are getting clicks but no calls</strong>, it&apos;s rarely one thing. It&apos;s
                usually a combination,wrong-intent traffic, a landing page that doesn&apos;t convert, a handful of invalid
                clicks quietly inflating your costs, and tracking that doesn&apos;t give you the visibility to diagnose any
                of it.
              </p>
              <p>
                Start by auditing your keyword match types and negative keyword list. Check that your landing page continues
                the exact message from your ad. Verify your conversion tracking is firing correctly. Then,once you&apos;ve
                fixed the obvious,look deeper at session-level data to understand what real visitors from your ads are
                actually doing once they arrive. The businesses that get the most out of Google Ads aren&apos;t necessarily
                spending more. They&apos;re the ones who can see exactly where their{' '}
                <strong>wasted Google Ads budget</strong> is going,and stop it.
              </p>
            </section>
          </div>

          {/* FAQ */}
          <section className="mt-16 border-t border-gray-100 pt-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-8">Frequently asked questions</h2>
            <div className="space-y-8">
              {faqSchema.mainEntity.map((faq, i) => (
                <div key={i} className="border-b border-gray-100 pb-8 last:border-0 last:pb-0">
                  <h3 className="font-semibold text-gray-900 mb-3">{faq.name}</h3>
                  <p className="text-gray-600 leading-relaxed text-sm">{faq.acceptedAnswer.text}</p>
                </div>
              ))}
            </div>
          </section>

          {/* CTA */}
          <div className="mt-16 bg-blue-600 rounded-2xl p-8 sm:p-10 text-center">
            <h3 className="text-2xl font-bold text-white mb-3">
              See exactly where your Google Ads budget is going
            </h3>
            <p className="text-blue-100 mb-8 max-w-xl mx-auto leading-relaxed">
              AdLeak Shield shows you a session-level journey for every ad click,which keyword brought them, what they did
              next, and whether they called, enquired, or left within seconds. No cookies. No complex setup. 7-day free trial.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/auth/signup"
                className="bg-white text-blue-600 font-semibold px-6 py-3 rounded-lg hover:bg-blue-50 transition-colors"
              >
                Start free trial,no card needed
              </Link>
              <Link
                href="/#features"
                className="text-white border border-blue-400 font-medium px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
              >
                See how it works
              </Link>
            </div>
          </div>
        </div>
      </div>
    </MarketingShell>
  );
}
