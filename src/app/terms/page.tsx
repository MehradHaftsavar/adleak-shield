import { MarketingShell } from '@/components/layout/MarketingShell';

export const metadata = {
  title: 'Terms of Service — AdLeak Shield',
};

export default function TermsPage() {
  return (
    <MarketingShell>
      <div className="bg-gray-50">
        <div className="max-w-3xl mx-auto px-6 py-16">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Terms of Service</h1>
          <p className="text-sm text-gray-500 mb-10">Last updated: June 2025</p>

          <div className="space-y-10 text-sm text-gray-700 leading-relaxed">

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">1. Acceptance of Terms</h2>
              <p>
                By creating an account or using AdLeak Shield ("<strong>the Service</strong>"), you agree to
                be bound by these Terms of Service ("<strong>Terms</strong>") and our{' '}
                <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Privacy Policy</a> and{' '}
                <a href="/cookies" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Cookie Policy</a>. If you do not
                agree, do not use the Service.
              </p>
              <p className="mt-2">
                The Service is operated by <strong>Mehrad Haftsavar (trading as AdLeak Shield)</strong>
                ("<strong>AdLeak Shield</strong>", "<strong>we</strong>", "<strong>us</strong>"), based in the
                United Kingdom. These Terms constitute a legally binding agreement between you and us.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">2. Description of Service</h2>
              <p>
                AdLeak Shield is a subscription-based analytics platform that identifies wasted spend in Google
                Ads campaigns by tracking visitor behaviour on your website. The Service includes:
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
                <li>A JavaScript tracking snippet you install on your website</li>
                <li>A dashboard to view keyword performance, session data, and wasted spend analysis</li>
                <li>Campaign management and setup tools</li>
                <li>Data retention, reporting, and export features</li>
              </ul>
              <p className="mt-2">
                We reserve the right to modify, suspend, or discontinue any part of the Service at any time
                with reasonable notice.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">3. Account Registration</h2>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li>You must be at least 18 years old and have legal capacity to enter into contracts.</li>
                <li>You must provide a valid email address and verify it before using the Service.</li>
                <li>You are responsible for maintaining the confidentiality of your password.</li>
                <li>You are responsible for all activity that occurs under your account.</li>
                <li>You must not share your account with others or create accounts on behalf of third parties without their consent.</li>
                <li>One account per person or business. Creating multiple accounts to circumvent the free trial is prohibited and will result in immediate termination.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">4. Free Trial</h2>
              <p>
                New accounts receive a <strong>14-day free trial</strong>. No payment information is required
                to start a trial. During the trial:
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
                <li>All features are available without restriction.</li>
                <li>Data collection is active for your registered campaigns.</li>
                <li>At trial end, data collection pauses until you subscribe.</li>
              </ul>
              <p className="mt-2">
                The free trial is limited to one per domain and one per Google Ads campaign ID. Registering a
                previously trialled domain or campaign on a new account will result in the new account
                beginning immediately in a paid state with no trial period.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">5. Subscription and Payment</h2>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li>
                  The current subscription price is <strong>£12.99 per month</strong> (inclusive of any
                  applicable VAT). Prices may change with 30 days' notice.
                </li>
                <li>
                  Subscriptions are billed monthly in advance via Stripe. Your first payment is due at the
                  time of subscribing.
                </li>
                <li>
                  Subscriptions automatically renew each month unless cancelled before the renewal date.
                </li>
                <li>
                  You may cancel at any time via the Manage Subscription portal. Cancellation takes effect at
                  the end of the current billing period. No partial refunds are issued for unused time.
                </li>
                <li>
                  If payment fails, we will retry the charge. If payment remains unsuccessful after reasonable
                  attempts, your account will be downgraded and data collection will pause.
                </li>
                <li>
                  All payments are processed by Stripe. By subscribing, you also agree to{' '}
                  <a href="https://stripe.com/gb/legal" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                    Stripe's terms of service
                  </a>.
                </li>
              </ul>
            </section>

            <section id="merchant">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">6. Your Responsibilities as a Merchant</h2>
              <p className="mb-3">
                By installing the AdLeak Shield tracking snippet on your website, you take on certain legal
                responsibilities. You agree to the following:
              </p>

              <h3 className="font-semibold text-gray-800 mb-1">6.1 Privacy Disclosure</h3>
              <p>
                You must disclose the use of AdLeak Shield in your website's privacy policy, informing your
                visitors that a third-party service collects anonymised analytics data about their visit (including
                keyword, device type, and masked IP address) when they arrive via a paid Google Ads click.
              </p>

              <h3 className="font-semibold text-gray-800 mt-4 mb-1">6.2 Cookie Banners and Consent</h3>
              <p>
                The AdLeak Shield tracker does not set cookies on your visitors' browsers. However, it does
                process data about your visitors. Depending on your jurisdiction and your legal basis for
                processing:
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
                <li>
                  <strong>UK / EEA merchants</strong>: You should ensure you have a lawful basis under UK/EU
                  GDPR for processing visitor data. Legitimate interest is the most common basis for
                  analytics. You should document this assessment.
                </li>
                <li>
                  <strong>Consent-based processing</strong>: If your consent management platform (CMP) or
                  cookie banner governs tracking consent, you should configure it appropriately to ensure
                  the AdLeak Shield snippet is only loaded for consenting visitors.
                </li>
                <li>
                  <strong>Other jurisdictions</strong>: You are responsible for complying with any applicable
                  local data protection laws (CCPA, LGPD, etc.).
                </li>
              </ul>
              <p className="mt-2">
                We strongly recommend seeking independent legal advice if you are uncertain about your
                obligations. AdLeak Shield cannot be held responsible for your failure to comply with
                applicable law on your own website.
              </p>

              <h3 className="font-semibold text-gray-800 mt-4 mb-1">6.3 Data Processing Agreement</h3>
              <p>
                For the purposes of UK/EU GDPR, you are the <strong>data controller</strong> and AdLeak
                Shield is the <strong>data processor</strong> with respect to your visitors' data. A Data
                Processing Agreement (DPA) is available upon request at{' '}
                <a href="mailto:privacy@adleakshield.com" className="text-blue-600 hover:underline">
                  privacy@adleakshield.com
                </a>.
              </p>

              <h3 className="font-semibold text-gray-800 mt-4 mb-1">6.4 Lawful Use Only</h3>
              <p>
                You must only install the tracking snippet on websites you own or have authorisation to modify.
                You must not use AdLeak Shield to track websites you do not control or to collect data about
                individuals without a lawful basis.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">7. Acceptable Use</h2>
              <p className="mb-2">You agree not to:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Use the Service for any unlawful purpose or in violation of any applicable law</li>
                <li>Attempt to gain unauthorised access to any part of the Service or another user's data</li>
                <li>Reverse engineer, decompile, or disassemble the Service or the tracking snippet</li>
                <li>Use automated tools to scrape, extract, or mass-query the Service</li>
                <li>Introduce malicious code, viruses, or disruptive content</li>
                <li>Resell, sublicense, or commercialise access to the Service without our written permission</li>
                <li>Abuse the free trial system, including creating multiple accounts to avoid payment</li>
                <li>Misrepresent your identity or affiliation when registering</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">8. Intellectual Property</h2>
              <p>
                All content, software, design, and technology that makes up AdLeak Shield — including the
                tracking snippet, dashboard, and APIs — is the exclusive property of AdLeak Shield and is
                protected by copyright and other intellectual property laws.
              </p>
              <p className="mt-2">
                We grant you a limited, non-exclusive, non-transferable licence to use the Service for its
                intended purpose during the term of your subscription. This licence does not include the right
                to copy, modify, distribute, or create derivative works from the Service.
              </p>
              <p className="mt-2">
                Your data (campaign data, keyword data, session data) remains yours. We process it solely to
                provide the Service.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">9. Disclaimer of Warranties</h2>
              <p>
                The Service is provided "<strong>as is</strong>" and "<strong>as available</strong>" without
                warranties of any kind, either express or implied, including but not limited to implied
                warranties of merchantability, fitness for a particular purpose, or non-infringement.
              </p>
              <p className="mt-2">
                We do not warrant that the Service will be uninterrupted, error-free, or free from harmful
                components. We do not guarantee that data captured by the tracking snippet will be 100%
                complete or accurate — tracking may be affected by ad blockers, browser privacy settings, or
                network issues beyond our control.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">10. Limitation of Liability</h2>
              <p>
                To the maximum extent permitted by applicable law, AdLeak Shield shall not be liable for any
                indirect, incidental, special, consequential, or punitive damages, including but not limited
                to loss of profits, loss of data, or business interruption, arising from your use of or
                inability to use the Service.
              </p>
              <p className="mt-2">
                Our total aggregate liability for any claim arising out of or related to these Terms or the
                Service shall not exceed the total fees paid by you to AdLeak Shield in the 12 months
                preceding the claim.
              </p>
              <p className="mt-2">
                Nothing in these Terms excludes or limits our liability for death or personal injury caused by
                our negligence, fraud, or any other liability that cannot be excluded by law.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">11. Termination</h2>
              <p>
                You may terminate your account at any time by deleting it from Settings → Danger Zone or by
                contacting us. Upon termination, all your data is permanently deleted.
              </p>
              <p className="mt-2">
                We may suspend or terminate your account immediately if you breach these Terms, engage in
                fraudulent activity, or if we are required to do so by law. We will provide notice where
                reasonably possible.
              </p>
              <p className="mt-2">
                Sections 8 (Intellectual Property), 9 (Disclaimer), 10 (Limitation of Liability), and 12
                (Governing Law) survive termination.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">12. Governing Law and Disputes</h2>
              <p>
                These Terms are governed by the laws of <strong>England and Wales</strong>. Any disputes
                arising from or relating to these Terms or the Service shall be subject to the exclusive
                jurisdiction of the courts of England and Wales.
              </p>
              <p className="mt-2">
                Before initiating formal proceedings, you agree to contact us at{' '}
                <a href="mailto:legal@adleakshield.com" className="text-blue-600 hover:underline">
                  legal@adleakshield.com
                </a>{' '}
                to attempt to resolve the dispute informally. We will endeavour to resolve any complaint
                within 14 days.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">13. Changes to These Terms</h2>
              <p>
                We may update these Terms from time to time. Material changes will be communicated by email
                and by a prominent notice in the dashboard at least 14 days before they take effect. Continued
                use of the Service after that date constitutes acceptance of the revised Terms.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">14. Contact</h2>
              <address className="not-italic text-gray-600">
                <strong>AdLeak Shield — Legal</strong><br />
                Email:{' '}
                <a href="mailto:legal@adleakshield.com" className="text-blue-600 hover:underline">
                  legal@adleakshield.com
                </a><br />
                Manchester, United Kingdom
              </address>
            </section>

          </div>
        </div>
      </div>
    </MarketingShell>
  );
}
