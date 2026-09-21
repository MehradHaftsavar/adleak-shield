'use client';

// =============================================================================
// AdLeak Shield — Privacy wording we give customers for their own policy
// src/components/legal/PrivacyPolicyTemplate.tsx
//
// WHY THIS IS A COMPONENT AND NOT TEXT ON A PAGE:
// It is rendered in two places — the final onboarding step, where the customer
// is already editing their site, and the permanent setup guide, where they can
// find it again months later. Two hand-maintained copies is how the outcome
// legend in the dashboard fell out of date, and the stakes are higher here: if
// a sub-processor is added and only one copy is updated, half of our customers
// are handing their visitors a privacy notice that is wrong.
//
// WHAT THIS DELIBERATELY DOES NOT SAY:
// It does not tell the customer whether they need a consent banner. That is a
// conclusion about THEIR legal obligations, and stating it would make us the
// party they point at if it were ever wrong. The wording below describes what
// is collected and what happens to it — facts we can stand behind — and leaves
// the conclusion to them and their own advisers.
//
// EVERY CLAIM HERE IS VERIFIED AGAINST THE CODE:
//   no cookies / no device storage  → snippet/src/tracker.js (no storage APIs)
//   IP + user-agent, one-way hash   → functions/src/lib/ip-mask.ts hashVisitor
//   salt rotates, deleted at 48h    → functions/src/functions/janitor.ts
//   IP shortened, never stored      → ip-mask.ts maskIp, called in ingest.ts
//   90-day deletion                 → janitor.ts, and our own /privacy page
//   Sec-GPC honoured                → functions/src/functions/ingest.ts
// If any of those change, this text changes with them, and
// PRIVACY_TEMPLATE_VERSION in src/lib/legal.ts gets bumped.
// =============================================================================

import { useState } from 'react';
import { Copy, CheckCircle, FileText } from 'lucide-react';
import { PRIVACY_TEMPLATE_VERSION, formatLegalVersion } from '@/lib/legal';

// The [SQUARE BRACKETS] are the only parts a customer must edit. Kept
// deliberately obvious so an unedited paste is visible at a glance.
export const PRIVACY_POLICY_TEMPLATE = `Advertising performance measurement

We use AdLeak Shield to measure what happens after someone clicks one of our Google Ads. It records which advert and search term brought you to our website, the pages you viewed, how long you stayed, how far you scrolled, the links and buttons you clicked, and whether you contacted us.

AdLeak Shield does not use cookies. It does not store anything on your device and does not read anything from it.

To tell one visit apart from another, it uses your IP address and your browser's user-agent string — information your browser sends with every request it makes. These are combined into a one-way code using a secret that changes every day and is deleted after 48 hours, after which the code can no longer be linked back to you. Your full IP address is never stored: it is shortened first (for example 82.12.34.xxx), and used once to work out your approximate town and country.

We rely on our legitimate interests in understanding and improving the effectiveness of our advertising. Records are deleted automatically after 90 days.

AdLeak Shield acts as our data processor. It uses this information only to provide this measurement service to us, and for no purpose of its own.

How to object

If your browser sends a Global Privacy Control signal, your visit is not recorded at all. Some browsers let you turn this on in their privacy settings, and browser extensions are available that send it.

You can also object at any time, or ask what we hold about you, by contacting us at [YOUR CONTACT EMAIL].`;

interface PrivacyPolicyTemplateProps {
  /** Rendered inside an already-titled card (onboarding) vs standalone (setup guide). */
  showHeading?: boolean;
  className?: string;
}

export function PrivacyPolicyTemplate({
  showHeading = true,
  className = '',
}: PrivacyPolicyTemplateProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(PRIVACY_POLICY_TEMPLATE);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy privacy template:', err);
    }
  };

  return (
    <div className={className}>
      {showHeading && (
        <h3 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
          <FileText className="w-5 h-5 text-purple-600" />
          Privacy wording for your website
        </h3>
      )}

      <p className="text-sm text-gray-700 mb-3">
        Most websites describe their analytics in their privacy policy. Here is wording you
        can use, covering exactly what AdLeak Shield collects and what happens to it. Edit
        the part in square brackets, and check it against the rest of your policy before
        publishing.
      </p>

      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-gray-700">
            Add to your privacy policy:
          </p>
          <button
            type="button"
            onClick={copy}
            className="flex items-center gap-2 px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded transition-colors flex-shrink-0"
          >
            {copied ? (
              <>
                <CheckCircle className="w-4 h-4" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                Copy Wording
              </>
            )}
          </button>
        </div>

        <pre className="bg-white border border-gray-200 text-gray-800 p-4 rounded overflow-x-auto text-xs whitespace-pre-wrap leading-relaxed max-h-80 overflow-y-auto">
          {PRIVACY_POLICY_TEMPLATE}
        </pre>

        <p className="text-xs text-gray-500">
          Version {formatLegalVersion(PRIVACY_TEMPLATE_VERSION)}. We will email you if this
          wording changes.
        </p>
      </div>

      <p className="text-xs text-gray-500 mt-3">
        This is a description of what our software does, not legal advice. Whether your site
        needs a consent banner or anything else depends on your business, and is a question
        for you and your own advisers.
      </p>
    </div>
  );
}
