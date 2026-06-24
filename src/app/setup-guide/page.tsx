// =============================================================================
// AdLeak Shield — Platform Setup Guide
// /setup-guide
// Public page — no auth required.
// Linked from SnippetStep with platform-specific anchors.
// =============================================================================

export const metadata = {
  title: 'Setup Guide — AdLeak Shield',
  description: 'Step-by-step instructions for installing AdLeak Shield on WordPress, Shopify, Wix, and hand-coded websites.',
  alternates: {
    canonical: 'https://www.adleakshield.com/setup-guide',
  },
};

const CSP_SCRIPT  = 'https://adleakshield.com';
const CSP_CONNECT = 'https://adleak-functions-ajbraxdhf4hwgudf.westeurope-01.azurewebsites.net';

export default function SetupGuidePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <span className="font-bold text-gray-900 text-lg">AdLeak Shield — Setup Guide</span>
          <nav className="hidden sm:flex items-center gap-5 text-sm font-medium text-gray-500">
            <a href="#wordpress"  className="hover:text-gray-900 transition-colors">WordPress</a>
            <a href="#shopify"    className="hover:text-gray-900 transition-colors">Shopify</a>
            <a href="#wix"        className="hover:text-gray-900 transition-colors">Wix</a>
            <a href="#html"       className="hover:text-gray-900 transition-colors">Hand-coded</a>
          </nav>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12 space-y-20">

        {/* Intro */}
        <section>
          <h1 className="text-3xl font-bold text-gray-900 mb-3">Platform Setup Guide</h1>
          <p className="text-gray-600">
            Follow the instructions below for your website platform. Each section covers two things:
            how to install the tracking snippet, and how to configure your Content Security Policy (CSP) if you have one.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {[
              { label: 'WordPress',    href: '#wordpress' },
              { label: 'Shopify',      href: '#shopify' },
              { label: 'Wix',          href: '#wix' },
              { label: 'Hand-coded',   href: '#html' },
            ].map(({ label, href }) => (
              <a
                key={href}
                href={href}
                className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:border-purple-400 hover:text-purple-700 transition-colors shadow-sm"
              >
                {label}
              </a>
            ))}
          </div>
        </section>

        {/* ── WORDPRESS ────────────────────────────────────────────────────── */}
        <section id="wordpress" className="scroll-mt-20">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-xl">🟦</div>
            <h2 className="text-2xl font-bold text-gray-900">WordPress</h2>
          </div>

          {/* Script Setup */}
          <div className="mb-10">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">
              Script Setup
            </h3>
            <p className="text-sm text-gray-600 mb-5">
              The easiest way is to use a free plugin that lets you paste code into your site's{' '}
              <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">&lt;head&gt;</code> without
              editing theme files.
            </p>

            <ol className="space-y-4 text-sm text-gray-700">
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center text-xs font-semibold">1</span>
                <span>In your WordPress dashboard, go to <strong>Plugins → Add New Plugin</strong>.</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center text-xs font-semibold">2</span>
                <span>Search for <strong>WPCode</strong> (also listed as "Insert Headers and Footers"). Install and activate it.</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center text-xs font-semibold">3</span>
                <span>In the left menu, go to <strong>Code Snippets → Header &amp; Footer</strong>.</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center text-xs font-semibold">4</span>
                <span>Paste your AdLeak Shield tracking snippet into the <strong>Header</strong> box.</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center text-xs font-semibold">5</span>
                <span>Click <strong>Save Changes</strong>.</span>
              </li>
            </ol>

            <div className="mt-5 bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-600">
              <p className="font-medium text-gray-800 mb-1">Alternative: edit theme files directly</p>
              <p>
                Go to <strong>Appearance → Theme File Editor → header.php</strong>. Paste the snippet
                directly before the closing{' '}
                <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">&lt;/head&gt;</code> tag, then
                click <strong>Update File</strong>. Note: theme updates may overwrite this — a plugin is safer
                for long-term use.
              </p>
            </div>
          </div>

          {/* CSP */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">
              Content Security Policy (CSP)
            </h3>
            <p className="text-sm text-gray-600 mb-5">
              Most WordPress sites don't have a CSP configured — if you haven't deliberately set one up,
              you can skip this section. If you do have a CSP, add the following two directives.
            </p>

            <p className="text-sm font-medium text-gray-800 mb-2">The two values you need to allow:</p>
            <div className="bg-gray-900 text-gray-100 rounded-lg p-4 text-xs font-mono mb-5 overflow-x-auto">
              <div className="text-gray-400 mb-1">{`# script-src — allows the tracker script to load`}</div>
              <div>{CSP_SCRIPT}</div>
              <div className="text-gray-400 mt-3 mb-1">{`# connect-src — allows the tracker to send data`}</div>
              <div>{CSP_CONNECT}</div>
            </div>

            <p className="text-sm font-semibold text-gray-800 mb-2">Option A — via .htaccess (Apache)</p>
            <p className="text-sm text-gray-600 mb-2">
              Open the <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">.htaccess</code> file in
              the root of your WordPress installation and add:
            </p>
            <div className="bg-gray-900 text-gray-100 rounded-lg p-4 text-xs font-mono mb-5 overflow-x-auto">
              {`<IfModule mod_headers.c>
  Header always append Content-Security-Policy "script-src 'self' ${CSP_SCRIPT}; connect-src 'self' ${CSP_CONNECT};"
</IfModule>`}
            </div>

            <p className="text-sm font-semibold text-gray-800 mb-2">Option B — via plugin</p>
            <p className="text-sm text-gray-600">
              Install the free plugin <strong>HTTP Headers</strong> by JL Faucher. Under{' '}
              <strong>Settings → HTTP Headers → Security</strong>, find{' '}
              <strong>Content-Security-Policy</strong> and add the two values above to the{' '}
              <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">script-src</code> and{' '}
              <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">connect-src</code> fields.
            </p>
          </div>
        </section>

        <hr className="border-gray-200" />

        {/* ── SHOPIFY ──────────────────────────────────────────────────────── */}
        <section id="shopify" className="scroll-mt-20">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center text-xl">🟢</div>
            <h2 className="text-2xl font-bold text-gray-900">Shopify</h2>
          </div>

          {/* Script Setup */}
          <div className="mb-10">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">
              Script Setup
            </h3>
            <p className="text-sm text-gray-600 mb-5">
              Shopify themes use a single master template file called{' '}
              <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">theme.liquid</code>. Adding the
              snippet there puts it on every page automatically.
            </p>

            <ol className="space-y-4 text-sm text-gray-700">
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-xs font-semibold">1</span>
                <span>In your Shopify admin, go to <strong>Online Store → Themes</strong>.</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-xs font-semibold">2</span>
                <span>Next to your active theme, click the <strong>three dots (⋯)</strong> then <strong>Edit code</strong>.</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-xs font-semibold">3</span>
                <span>In the file list on the left, under <strong>Layout</strong>, click <strong>theme.liquid</strong>.</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-xs font-semibold">4</span>
                <span>
                  Use <strong>Ctrl+F</strong> (or Cmd+F on Mac) to search for{' '}
                  <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">&lt;/head&gt;</code>.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-xs font-semibold">5</span>
                <span>
                  Paste your tracking snippet on the line directly <strong>above</strong>{' '}
                  <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">&lt;/head&gt;</code>.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-xs font-semibold">6</span>
                <span>Click <strong>Save</strong> in the top right corner.</span>
              </li>
            </ol>
          </div>

          {/* CSP */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">
              Content Security Policy (CSP)
            </h3>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-800">
              <p className="font-semibold mb-1">No action required.</p>
              <p>
                Shopify fully controls the HTTP headers for your storefront and does not allow merchants to
                set custom CSP headers. Shopify's default policy permits external scripts embedded in your
                theme to make fetch requests to third-party URLs, so the tracking snippet works without any
                changes on your end.
              </p>
            </div>
          </div>
        </section>

        <hr className="border-gray-200" />

        {/* ── WIX ──────────────────────────────────────────────────────────── */}
        <section id="wix" className="scroll-mt-20">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center text-xl">🟡</div>
            <h2 className="text-2xl font-bold text-gray-900">Wix</h2>
          </div>

          {/* Script Setup */}
          <div className="mb-10">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">
              Script Setup
            </h3>
            <p className="text-sm text-gray-600 mb-5">
              Wix provides a built-in Custom Code section in your site settings — no Velo or coding
              knowledge required.
            </p>

            <ol className="space-y-4 text-sm text-gray-700">
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-yellow-500 text-white rounded-full flex items-center justify-center text-xs font-semibold">1</span>
                <span>Log in to your Wix dashboard and select your site.</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-yellow-500 text-white rounded-full flex items-center justify-center text-xs font-semibold">2</span>
                <span>In the left sidebar, go to <strong>Settings</strong>.</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-yellow-500 text-white rounded-full flex items-center justify-center text-xs font-semibold">3</span>
                <span>Scroll down to the <strong>Advanced</strong> section and click <strong>Custom Code</strong>.</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-yellow-500 text-white rounded-full flex items-center justify-center text-xs font-semibold">4</span>
                <span>Click <strong>+ Add Custom Code</strong> in the top right.</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-yellow-500 text-white rounded-full flex items-center justify-center text-xs font-semibold">5</span>
                <span>Paste your tracking snippet into the code box.</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-yellow-500 text-white rounded-full flex items-center justify-center text-xs font-semibold">6</span>
                <span>
                  Set <strong>Add Code to Pages</strong> to <strong>All Pages</strong> and set{' '}
                  <strong>Place Code in</strong> to <strong>Head</strong>.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-yellow-500 text-white rounded-full flex items-center justify-center text-xs font-semibold">7</span>
                <span>Give it a name (e.g. <em>AdLeak Shield</em>) and click <strong>Apply</strong>.</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-yellow-500 text-white rounded-full flex items-center justify-center text-xs font-semibold">8</span>
                <span><strong>Publish</strong> your site for the change to take effect.</span>
              </li>
            </ol>
          </div>

          {/* CSP */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">
              Content Security Policy (CSP)
            </h3>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-800">
              <p className="font-semibold mb-1">No action required.</p>
              <p>
                Wix manages all HTTP response headers on your behalf and does not provide access to CSP
                configuration. Custom code added through Wix's Custom Code section is permitted to make
                external requests by default, so the tracking snippet works without any changes.
              </p>
            </div>
          </div>
        </section>

        <hr className="border-gray-200" />

        {/* ── HAND-CODED ───────────────────────────────────────────────────── */}
        <section id="html" className="scroll-mt-20">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center text-xl">🖥️</div>
            <h2 className="text-2xl font-bold text-gray-900">Hand-coded / Custom</h2>
          </div>

          {/* Script Setup */}
          <div className="mb-10">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">
              Script Setup
            </h3>
            <p className="text-sm text-gray-600 mb-5">
              Paste the snippet into the{' '}
              <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">&lt;head&gt;</code> section of
              every page. If you use a shared template (PHP include, Jinja base template, Blade layout, etc.),
              add it once to that file and it will apply everywhere.
            </p>

            <ol className="space-y-4 text-sm text-gray-700">
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-gray-700 text-white rounded-full flex items-center justify-center text-xs font-semibold">1</span>
                <span>Open your HTML file or shared header template in a text editor.</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-gray-700 text-white rounded-full flex items-center justify-center text-xs font-semibold">2</span>
                <span>
                  Find the closing{' '}
                  <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">&lt;/head&gt;</code> tag.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-gray-700 text-white rounded-full flex items-center justify-center text-xs font-semibold">3</span>
                <span>
                  Paste your tracking snippet on the line directly above{' '}
                  <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">&lt;/head&gt;</code>.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-gray-700 text-white rounded-full flex items-center justify-center text-xs font-semibold">4</span>
                <span>Save and deploy your changes.</span>
              </li>
            </ol>
          </div>

          {/* CSP */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">
              Content Security Policy (CSP)
            </h3>
            <p className="text-sm text-gray-600 mb-5">
              If you have a CSP configured, you need to allow the tracker script source and the data
              endpoint. Add these to your existing policy:
            </p>

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm mb-5">
              <p className="font-medium text-gray-800 mb-2">Add to <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">script-src</code></p>
              <code className="text-purple-700 text-xs">{CSP_SCRIPT}</code>
              <p className="font-medium text-gray-800 mt-4 mb-2">Add to <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">connect-src</code></p>
              <code className="text-purple-700 text-xs">{CSP_CONNECT}</code>
            </div>

            <div className="space-y-6">
              <div>
                <p className="text-sm font-semibold text-gray-800 mb-2">Apache — .htaccess</p>
                <div className="bg-gray-900 text-gray-100 rounded-lg p-4 text-xs font-mono overflow-x-auto">
                  {`<IfModule mod_headers.c>
  Header always append Content-Security-Policy "script-src 'self' ${CSP_SCRIPT}; connect-src 'self' ${CSP_CONNECT};"
</IfModule>`}
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-gray-800 mb-2">Nginx — server block</p>
                <div className="bg-gray-900 text-gray-100 rounded-lg p-4 text-xs font-mono overflow-x-auto">
                  {`add_header Content-Security-Policy "script-src 'self' ${CSP_SCRIPT}; connect-src 'self' ${CSP_CONNECT};";`}
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-gray-800 mb-2">Node.js / Express</p>
                <div className="bg-gray-900 text-gray-100 rounded-lg p-4 text-xs font-mono overflow-x-auto">
                  {`res.setHeader(
  "Content-Security-Policy",
  "script-src 'self' ${CSP_SCRIPT}; connect-src 'self' ${CSP_CONNECT};"
);`}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Or use the <strong>helmet</strong> package:{' '}
                  <code className="bg-gray-100 px-1 py-0.5 rounded">npm install helmet</code> then configure{' '}
                  <code className="bg-gray-100 px-1 py-0.5 rounded">contentSecurityPolicy</code> in its options.
                </p>
              </div>

              <div>
                <p className="text-sm font-semibold text-gray-800 mb-2">Meta tag (quick test only)</p>
                <div className="bg-gray-900 text-gray-100 rounded-lg p-4 text-xs font-mono overflow-x-auto">
                  {`<meta http-equiv="Content-Security-Policy"
  content="script-src 'self' ${CSP_SCRIPT}; connect-src 'self' ${CSP_CONNECT};">`}
                </div>
                <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                  <strong>Note:</strong> The meta tag approach is useful for testing but is not recommended for
                  production. It doesn't support all CSP directives and can be bypassed more easily than an
                  HTTP header.
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Footer spacing */}
        <div className="pb-4" />

      </main>
    </div>
  );
}
