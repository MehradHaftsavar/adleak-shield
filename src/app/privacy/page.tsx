import { MarketingShell } from '@/components/layout/MarketingShell';

export const metadata = {
  title: 'Privacy Policy — AdLeak Shield',
};

export default function PrivacyPage() {
  return (
    <MarketingShell>
      <div className="bg-gray-50">
        <div className="max-w-3xl mx-auto px-6 py-16">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
          <p className="text-sm text-gray-500 mb-10">Last updated: June 2025</p>

          <div className="prose prose-gray max-w-none space-y-10 text-sm text-gray-700 leading-relaxed">

            {/* 1 */}
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">1. Who We Are</h2>
              <p>
                AdLeak Shield ("<strong>we</strong>", "<strong>us</strong>", "<strong>our</strong>") is a
                software-as-a-service platform that helps businesses identify wasted Google Ads spend. We are
                operated by <strong>Mehrad Haftsavar (trading as AdLeak Shield)</strong>, based in the <strong>United Kingdom</strong>.
              </p>
              <p className="mt-2">
                Contact:{' '}
                <a href="mailto:info@adleakshield.com" className="text-blue-600 hover:underline">
                  info@adleakshield.com
                </a>
              </p>
            </section>

            {/* 2 */}
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">2. Data We Collect</h2>

              <h3 className="font-semibold text-gray-800 mb-1">2.1 Account Data</h3>
              <p>
                When you register, we collect your email address and a hashed version of your password. We
                never store your password in plain text.
              </p>

              <h3 className="font-semibold text-gray-800 mt-4 mb-1">2.2 Billing Data</h3>
              <p>
                Subscription payments are handled by Stripe. We store only your Stripe Customer ID and
                subscription status. We never see or store your full card number, CVV, or bank details —
                those remain with Stripe. See Stripe's privacy policy at{' '}
                <a href="https://stripe.com/gb/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                  stripe.com/gb/privacy
                </a>.
              </p>

              <h3 className="font-semibold text-gray-800 mt-4 mb-1">2.3 Tracking Data (Processed on Your Behalf)</h3>
              <p>
                When you install the AdLeak Shield tracking snippet on your website, we collect the following
                data about visitors to <em>your</em> site who arrive via Google Ads:
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
                <li>The Google Ads keyword that triggered the ad click</li>
                <li>Match type and device type (desktop, mobile, tablet)</li>
                <li>A masked, truncated IP address (last octet removed — not re-identifiable)</li>
                <li>Page paths visited during the session</li>
                <li>Session duration and engagement signals (scroll depth, clicks)</li>
                <li>Google Click ID (gclid) — used to link sessions, not stored permanently</li>
              </ul>
              <p className="mt-2">
                You, as the website owner, are the <strong>data controller</strong> for this visitor data.
                AdLeak Shield acts as a <strong>data processor</strong> on your behalf. See Section 8 and our
                Terms of Service for your responsibilities in this regard.
              </p>

              <h3 className="font-semibold text-gray-800 mt-4 mb-1">2.4 Usage Data</h3>
              <p>
                We collect standard server logs and application usage data to operate, maintain, and improve
                the service (e.g. which features are used, error rates). This data is not sold or shared with
                third parties for marketing purposes.
              </p>

              <h3 className="font-semibold text-gray-800 mt-4 mb-1">2.5 Cookie and Browser Data</h3>
              <p>
                We use session cookies for authentication and, where you have consented, analytics cookies to
                understand how the dashboard is used. See our{' '}
                <a href="/cookies" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Cookie Policy</a> for full details.
              </p>
            </section>

            {/* 3 */}
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">3. How We Use Your Data</h2>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>To provide, operate, and improve the AdLeak Shield service</li>
                <li>To process payments and manage your subscription via Stripe</li>
                <li>To send transactional emails (account verification, password reset, billing receipts)</li>
                <li>To detect abuse, enforce our Terms of Service, and prevent fraud</li>
                <li>To fulfil legal obligations (e.g. retaining billing records)</li>
                <li>To contact you about material changes to this policy or the service</li>
              </ul>
              <p className="mt-3">
                We do not sell your data to third parties. We do not use your data for advertising purposes.
              </p>
            </section>

            {/* 4 */}
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">4. Data Retention</h2>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li>
                  <strong>Visitor tracking data</strong> (sessions, keywords, journey events): automatically
                  deleted after <strong>90 days</strong> by our automated data retention process.
                </li>
                <li>
                  <strong>Account data</strong>: retained for the lifetime of your account, then anonymised
                  immediately upon account deletion (email replaced with an anonymised identifier, password
                  hash cleared).
                </li>
                <li>
                  <strong>Billing records</strong>: retained for 7 years as required by UK financial
                  regulations.
                </li>
                <li>
                  <strong>Email logs</strong>: retained for up to 30 days for delivery troubleshooting.
                </li>
              </ul>
            </section>

            {/* 5 */}
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">5. Third-Party Services</h2>
              <p className="mb-3">We share data with the following sub-processors to operate the service:</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-4 py-2 text-gray-700 font-medium">Service</th>
                      <th className="text-left px-4 py-2 text-gray-700 font-medium">Purpose</th>
                      <th className="text-left px-4 py-2 text-gray-700 font-medium">Location</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    <tr>
                      <td className="px-4 py-2 font-medium">Stripe</td>
                      <td className="px-4 py-2">Payment processing and subscription management</td>
                      <td className="px-4 py-2">USA / EU</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 font-medium">Microsoft Azure</td>
                      <td className="px-4 py-2">Database hosting and background processing</td>
                      <td className="px-4 py-2">West Europe</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 font-medium">Vercel</td>
                      <td className="px-4 py-2">Frontend hosting and edge network</td>
                      <td className="px-4 py-2">USA / EU</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 font-medium">Resend</td>
                      <td className="px-4 py-2">Transactional email delivery</td>
                      <td className="px-4 py-2">USA</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="mt-3">
                All sub-processors are contractually bound to process data only as instructed and to maintain
                appropriate security measures. Where data is transferred outside the UK/EEA, appropriate
                safeguards (such as Standard Contractual Clauses) are in place.
              </p>
            </section>

            {/* 6 */}
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">6. Your Rights Under GDPR / UK GDPR</h2>
              <p className="mb-3">If you are located in the UK or EEA, you have the following rights:</p>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li><strong>Right of access</strong> — request a copy of the personal data we hold about you</li>
                <li><strong>Right to rectification</strong> — request correction of inaccurate data</li>
                <li><strong>Right to erasure</strong> — delete your account at any time from Settings → Danger Zone. This immediately anonymises your account data and permanently deletes all tracking data.</li>
                <li><strong>Right to data portability</strong> — request your data in a machine-readable format</li>
                <li><strong>Right to object</strong> — object to processing based on legitimate interests</li>
                <li><strong>Right to restrict processing</strong> — request we limit how we use your data</li>
                <li><strong>Right to withdraw consent</strong> — where processing is based on consent, you may withdraw it at any time</li>
              </ul>
              <p className="mt-3">
                To exercise any of these rights, email{' '}
                <a href="mailto:info@adleakshield.com" className="text-blue-600 hover:underline">
                  info@adleakshield.com
                </a>. We will respond within 30 days. You also have the right to lodge a complaint with the
                Information Commissioner's Office (ICO) at{' '}
                <a href="https://ico.org.uk" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                  ico.org.uk
                </a>.
              </p>
            </section>

            {/* 7 */}
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">7. Legal Basis for Processing</h2>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li><strong>Contract performance</strong> — processing your account data and tracking data to provide the service you signed up for</li>
                <li><strong>Legal obligation</strong> — retaining billing records as required by law</li>
                <li><strong>Legitimate interests</strong> — fraud detection, abuse prevention, service improvement</li>
                <li><strong>Consent</strong> — analytics cookies (where applicable)</li>
              </ul>
            </section>

            {/* 8 */}
            <section id="merchant">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">8. Your Responsibilities as a Merchant</h2>
              <p>
                By using AdLeak Shield, you install a tracking script on your website. As the operator of that
                website, <strong>you are the data controller</strong> for your visitors' data. You are
                responsible for:
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
                <li>Disclosing the use of AdLeak Shield in your own website's Privacy Policy</li>
                <li>Ensuring you have a lawful basis for collecting visitor data (e.g. legitimate interest or consent)</li>
                <li>Providing your visitors with appropriate notice of data collection and tracking</li>
                <li>Complying with the UK GDPR, EU GDPR, PECR, or any other applicable data protection law in your jurisdiction</li>
              </ul>
              <p className="mt-2">
                AdLeak Shield collects only the minimum data necessary (masked IP, keyword, device type, page
                paths). No full IP addresses or personally identifiable visitor information is stored. You may
                request a Data Processing Agreement (DPA) by emailing{' '}
                <a href="mailto:info@adleakshield.com" className="text-blue-600 hover:underline">
                  info@adleakshield.com
                </a>.
              </p>
            </section>

            {/* 9 */}
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">9. Security</h2>
              <p>
                We implement appropriate technical and organisational measures to protect your data, including
                encryption in transit (TLS), hashed password storage (bcrypt), row-level security on our
                database (tenant data is fully isolated), and regular automated data purges. However, no system
                is 100% secure. If you discover a security issue, please disclose it responsibly to{' '}
                <a href="mailto:info@adleakshield.com" className="text-blue-600 hover:underline">
                  info@adleakshield.com
                </a>.
              </p>
            </section>

            {/* 10 */}
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">10. Children</h2>
              <p>
                AdLeak Shield is not directed at children under 16. We do not knowingly collect personal data
                from anyone under 16. If you believe a child has provided us with personal data, please contact
                us and we will delete it promptly.
              </p>
            </section>

            {/* 11 */}
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">11. Changes to This Policy</h2>
              <p>
                We may update this policy from time to time. Material changes will be communicated by email or
                by a prominent notice in the dashboard at least 14 days before they take effect. The "Last
                updated" date at the top of this page reflects the most recent revision.
              </p>
            </section>

            {/* 12 */}
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">12. Contact</h2>
              <p>
                For any privacy-related queries, requests, or complaints:
              </p>
              <address className="mt-2 not-italic text-gray-600">
                <strong>AdLeak Shield — Privacy</strong><br />
                Email:{' '}
                <a href="mailto:info@adleakshield.com" className="text-blue-600 hover:underline">
                  info@adleakshield.com
                </a><br />
                Manchester, United Kingdom
              </address>
            </section>

            {/* ICO registration */}
            <section className="border-t border-gray-200 pt-6">
              <p className="text-xs text-gray-500">
                AdLeak Shield is registered with the Information Commissioner's Office (ICO) under registration number <strong>C1953337</strong>.
              </p>
            </section>

          </div>
        </div>
      </div>
    </MarketingShell>
  );
}
