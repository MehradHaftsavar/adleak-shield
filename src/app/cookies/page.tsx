import { MarketingShell } from '@/components/layout/MarketingShell';

export const metadata = {
  title: 'Cookie Policy — AdLeak Shield',
  robots: { index: false, follow: false },
};

export default function CookiesPage() {
  return (
    <MarketingShell>
      <div className="bg-gray-50">
        <div className="max-w-3xl mx-auto px-6 py-16">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Cookie Policy</h1>
          <p className="text-sm text-gray-500 mb-10">Last updated: June 2026</p>

          <div className="space-y-10 text-sm text-gray-700 leading-relaxed">

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">1. What Are Cookies?</h2>
              <p>
                Cookies are small text files placed on your device by a website. They are widely used to make
                websites work efficiently and to provide information to the site owner. This policy explains
                how AdLeak Shield uses cookies and similar technologies on{' '}
                <strong>www.adleakshield.com</strong>.
              </p>
              <p className="mt-2">
                This policy does not cover cookies set by third-party websites you link to from the dashboard,
                or cookies set by the AdLeak Shield tracking snippet on <em>your</em> website — the snippet
                does not set any cookies on your visitors' browsers.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">2. Cookies We Use</h2>

              {/* Strictly necessary */}
              <h3 className="font-semibold text-gray-800 mb-2">2.1 Strictly Necessary Cookies</h3>
              <p className="mb-3">
                These cookies are essential for the Service to function. They cannot be disabled. No consent
                is required for these cookies under UK PECR / EU ePrivacy rules.
              </p>
              <div className="overflow-x-auto mb-6">
                <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-4 py-2 text-gray-700 font-medium">Cookie</th>
                      <th className="text-left px-4 py-2 text-gray-700 font-medium">Purpose</th>
                      <th className="text-left px-4 py-2 text-gray-700 font-medium">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    <tr>
                      <td className="px-4 py-2 font-mono text-xs">next-auth.session-token</td>
                      <td className="px-4 py-2">Authenticates your login session. Removed when you sign out or it expires.</td>
                      <td className="px-4 py-2">Session / 30 days</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 font-mono text-xs">next-auth.csrf-token</td>
                      <td className="px-4 py-2">Prevents cross-site request forgery attacks on auth requests.</td>
                      <td className="px-4 py-2">Session</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 font-mono text-xs">next-auth.callback-url</td>
                      <td className="px-4 py-2">Remembers where to redirect you after login.</td>
                      <td className="px-4 py-2">Session</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 font-mono text-xs">als_imp</td>
                      <td className="px-4 py-2">Used internally by admin accounts only for account impersonation (support tool). httpOnly — not accessible to JavaScript.</td>
                      <td className="px-4 py-2">2 hours</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Analytics — Umami */}
              <h3 className="font-semibold text-gray-800 mb-2">2.2 Analytics and Performance</h3>
              <p className="mb-3">
                We use <strong>Umami Analytics</strong> on our public marketing pages to understand how
                visitors find and use the website (page views, referrer, browser, device type). Umami is
                self-hosted on our own infrastructure and is <strong>cookieless by design</strong> — it does
                not set any cookies on your device and does not track you across websites. All data is
                anonymised and aggregated. No consent banner is required because no cookies or persistent
                identifiers are used.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-4 py-2 text-gray-700 font-medium">Service</th>
                      <th className="text-left px-4 py-2 text-gray-700 font-medium">Purpose</th>
                      <th className="text-left px-4 py-2 text-gray-700 font-medium">Cookies set</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="px-4 py-2 font-medium">Umami Analytics (self-hosted)</td>
                      <td className="px-4 py-2">Anonymised page view and referrer tracking on public marketing pages only</td>
                      <td className="px-4 py-2">None</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Marketing — placeholder */}
              <h3 className="font-semibold text-gray-800 mt-6 mb-2">2.3 Marketing and Retargeting Cookies</h3>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-amber-800">
                <p className="font-semibold mb-1">Coming soon</p>
                <p>
                  We may use marketing cookies on our public-facing website in the future (e.g. Google Ads
                  conversion tracking, retargeting pixels). When we do, we will update this policy and
                  obtain your consent before setting any such cookies.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">3. Third-Party Cookies</h2>
              <p className="mb-3">
                Some pages may cause third-party services to set their own cookies. Currently:
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-4 py-2 text-gray-700 font-medium">Service</th>
                      <th className="text-left px-4 py-2 text-gray-700 font-medium">Context</th>
                      <th className="text-left px-4 py-2 text-gray-700 font-medium">More Info</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    <tr>
                      <td className="px-4 py-2 font-medium">Stripe</td>
                      <td className="px-4 py-2">Stripe may set cookies when you visit the payment or billing portal pages.</td>
                      <td className="px-4 py-2">
                        <a href="https://stripe.com/gb/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                          stripe.com/gb/privacy
                        </a>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">4. Managing Cookies</h2>
              <p>
                You can control and delete cookies through your browser settings. Deleting or blocking the
                strictly necessary cookies will prevent you from logging in to AdLeak Shield.
              </p>
              <p className="mt-2">Instructions for common browsers:</p>
              <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
                <li><a href="https://support.google.com/chrome/answer/95647" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Google Chrome</a></li>
                <li><a href="https://support.mozilla.org/en-US/kb/cookies-information-websites-store-on-your-computer" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Mozilla Firefox</a></li>
                <li><a href="https://support.apple.com/en-gb/guide/safari/sfri11471/mac" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Apple Safari</a></li>
                <li><a href="https://support.microsoft.com/en-us/microsoft-edge/delete-cookies-in-microsoft-edge-63947406-40ac-c3b8-57b9-2a946a29ae09" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Microsoft Edge</a></li>
              </ul>
              <p className="mt-3">
                Our current analytics (Umami) are cookieless and require no action from you. If we introduce
                optional marketing cookies in the future, a cookie banner will appear allowing you to accept
                or decline them before any such cookies are set.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">5. Note for AdLeak Shield Users — Your Own Website</h2>
              <p>
                The AdLeak Shield tracking snippet you install on your website <strong>does not set any
                cookies</strong> on your visitors' browsers. It reads URL parameters (keyword, campaign ID,
                device type) and may use browser sessionStorage to maintain session continuity. It does not
                write to localStorage or set any first-party or third-party cookies.
              </p>
              <p className="mt-2">
                However, as the website operator, you are still the data controller for data collected about
                your visitors. Please see Section 6 of our{' '}
                <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Terms of Service</a> and our{' '}
                <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Privacy Policy</a> for your
                obligations regarding visitor disclosure and consent.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">6. Changes to This Policy</h2>
              <p>
                We will update this policy before introducing any new categories of cookie. The "Last updated"
                date at the top of this page reflects the most recent revision.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">7. Contact</h2>
              <p>
                For any questions about our use of cookies:{' '}
                <a href="mailto:info@adleakshield.com" className="text-blue-600 hover:underline">
                  info@adleakshield.com
                </a>
              </p>
            </section>

          </div>
        </div>
      </div>
    </MarketingShell>
  );
}
