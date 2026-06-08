// =============================================================================
// AdLeak Shield — Tracking Script (Vanilla JS, no dependencies)
// snippet/src/tracker.js
//
// WHAT THIS DOES (in plain language):
// This is the script that lives on a customer's website. When a visitor lands
// on their site after clicking a Google Ad, this code:
//
//   1. Reads the URL parameters Google adds to ad clicks (keyword, gclid, etc.)
//   2. If the parameters are missing, it does NOTHING — saves database space
//   3. Generates a unique fingerprint for the visitor (no cookies)
//   4. Records every page they visit, how long they stayed, how far they scrolled
//   5. Records every link/button click for the Journey Timeline
//   6. Marks "success events" — phone calls, emails, WhatsApp, form submits
//   7. Sends all of this to AdLeak Shield's ingestion endpoint
//   8. Uses the Beacon API so data sends even if the user closes the tab
//
// CRITICAL CONSTRAINTS:
// - Must be under 5KB after minification (PRD requirement, Core Web Vitals)
// - Vanilla JS only — no jQuery, no React, no dependencies
// - Zero persistent cookies — sessionStorage only
// - Fails silently if anything goes wrong — never break the customer's site
// =============================================================================

(function () {
  "use strict";

  // ===========================================================================
  // CONFIG
  // The CDN serving this file replaces __INGEST_URL__ with the real URL when
  // serving the script. This way we have one source file but multiple deploys.
  // ===========================================================================
  var INGEST_URL = "__INGEST_URL__"; // e.g. https://adleak-functions.azurewebsites.net/api/ingest
  var HEARTBEAT_MS = 15000;          // Send heartbeat every 15 seconds
  var STORAGE_KEY = "_als_session";   // sessionStorage key for our data
  var SUCCESS_HOSTS = ["wa.link", "wa.me"]; // WhatsApp link patterns

  // ===========================================================================
  // PRE-WARM CONNECTION
  // Inject a <link rel="preconnect"> immediately so the browser establishes
  // TCP+TLS with the ingest endpoint before any beacon fires. Without this,
  // sub-1s clicks (phone taps, instant navigations) lose the race against
  // the cold connection setup and their beacons never reach Azure.
  // ===========================================================================
  try {
    var _pc = document.createElement("link");
    _pc.rel = "preconnect";
    _pc.href = new URL(INGEST_URL).origin;
    document.head.appendChild(_pc);
  } catch (e) { /* silently ignore */ }

  // ===========================================================================
  // EARLY EXIT — drop silently if no Google Ads parameters present
  // This is critical: only sessions from real ad clicks should be tracked.
  // Saves database space and respects organic traffic privacy.
  // ===========================================================================
  var params = new URLSearchParams(window.location.search);
  var session = loadSession();

  // First-time landing on this domain in this session
  if (!session) {
    var keyword = params.get("keyword");
    var gclid = params.get("gclid");

    // No ad context = not a tracked session. Silently exit.
    if (!gclid || !keyword) return;

    // Build the new session record
    session = {
      // Generated server-side after the first ping confirms validity
      sessionFingerprint: generateFingerprint(),
      keyword: keyword.substring(0, 255),
      matchType: (params.get("matchtype") || "").substring(0, 20),
      campaignId: (params.get("campaignid") || "").substring(0, 20),
      adgroupId: (params.get("adgroupid") || "").substring(0, 20),
      adId: (params.get("adid") || "").substring(0, 50),         // {creative}
      adPosition: (params.get("adposition") || "").substring(0, 20), // {adposition}
      gclid: gclid.substring(0, 100),
      device: detectDevice(),
      landedAt: Date.now(),
      landingPath: window.location.pathname,
    };
    saveSession(session);

    // Send the initial "landing" event — this creates the Session in our DB
    send("session_start", {
      session: session,
      pagePath: window.location.pathname,
      referrerHost: getReferrerHost(),
    });
  }

  // ===========================================================================
  // PAGEVIEW
  // Fires on every page load (including SPA route changes via popstate)
  // ===========================================================================
  var pageStart = Date.now();
  var maxScrollPct = 0;

  send("pageview", {
    sessionFingerprint: session.sessionFingerprint,
    pagePath: window.location.pathname,
  });

  // ===========================================================================
  // SCROLL DEPTH
  // Track the deepest scroll percentage on this page.
  // Throttled to fire at most every 250ms to avoid performance hits.
  // ===========================================================================
  var scrollTimer = null;
  window.addEventListener(
    "scroll",
    function () {
      if (scrollTimer) return;
      scrollTimer = setTimeout(function () {
        scrollTimer = null;
        var docHeight = Math.max(
          document.body.scrollHeight,
          document.documentElement.scrollHeight
        );
        var scrolled = window.scrollY + window.innerHeight;
        var pct = Math.min(100, Math.round((scrolled / docHeight) * 100));
        if (pct > maxScrollPct) maxScrollPct = pct;
      }, 250);
    },
    { passive: true }
  );

  // ===========================================================================
  // CLICK TRACKING
  // Universal listener on all clicks — feeds the Journey Timeline.
  // Detects success events (phone, email, WhatsApp, form submit) separately.
  // ===========================================================================
  document.addEventListener(
    "click",
    function (e) {
      var target = e.target;
      // Walk up to find the closest <a> or <button>
      var el = target.closest ? target.closest("a, button") : null;
      if (!el) return;

      var tag = el.tagName.toLowerCase();
      var href = (el.getAttribute("href") || "").toLowerCase();
      var isSuccess = false;

      if (href.indexOf("tel:") === 0) isSuccess = true;
      else if (href.indexOf("mailto:") === 0) isSuccess = true;
      else if (href.indexOf("https://") === 0) {
        // Check WhatsApp link patterns
        for (var i = 0; i < SUCCESS_HOSTS.length; i++) {
          if (href.indexOf("https://" + SUCCESS_HOSTS[i]) === 0) {
            isSuccess = true;
            break;
          }
        }
      }

      var eventType = isSuccess ? "success_event" : "click";
      send(eventType, {
        sessionFingerprint: session.sessionFingerprint,
        pagePath: window.location.pathname,
        elementTag: tag,
        elementHref: href.substring(0, 500),
      });

      // For external navigation links (success events that open dialer/WhatsApp),
      // delay navigation by 60ms so the beacon has time to be queued before
      // pagehide fires. Only applies to <a> tags that would cause navigation.
      if (isSuccess && tag === "a" && href && href.indexOf("#") !== 0 && href.indexOf("javascript") !== 0) {
        e.preventDefault();
        setTimeout(function () {
          window.location.href = el.getAttribute("href");
        }, 60);
      }
    },
    true // Capture phase — fires even if the click is intercepted
  );

  // ===========================================================================
  // FORM SUBMIT — also a success event (typically a contact form)
  // ===========================================================================
  document.addEventListener(
    "submit",
    function () {
      send("success_event", {
        sessionFingerprint: session.sessionFingerprint,
        pagePath: window.location.pathname,
        elementTag: "form",
      });
    },
    true
  );

  // ===========================================================================
  // HEARTBEAT
  // Tells the server "this user is still on the page" every 15 seconds.
  // Stops when the tab is hidden (user switched tabs or minimised).
  // Resumes when the tab becomes visible again.
  // ===========================================================================
  var heartbeatInterval = null;

  function startHeartbeat() {
    if (heartbeatInterval) return;
    heartbeatInterval = setInterval(function () {
      if (document.hidden) return; // Don't track inactive tabs
      send("heartbeat", {
        sessionFingerprint: session.sessionFingerprint,
        pagePath: window.location.pathname,
        dwellMs: Date.now() - pageStart,
        scrollPct: maxScrollPct,
      });
    }, HEARTBEAT_MS);
  }

  function stopHeartbeat() {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stopHeartbeat();
    else startHeartbeat();
  });

  startHeartbeat();

  // ===========================================================================
  // UNLOAD — final dwell-time send
  // pagehide fires reliably on mobile Safari where unload doesn't.
  // Beacon API guarantees the request is sent even as the page is closing.
  // ===========================================================================
  window.addEventListener("pagehide", function () {
    send("page_end", {
      sessionFingerprint: session.sessionFingerprint,
      pagePath: window.location.pathname,
      dwellMs: Date.now() - pageStart,
      scrollPct: maxScrollPct,
    });
  });

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  function loadSession() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function saveSession(s) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch (e) {
      // Silently ignore — sessionStorage may be disabled
    }
  }

  function generateFingerprint() {
    // Lightweight fingerprint: timestamp + random + a small browser signature.
    // This is NOT cryptographic — it's just a session identifier.
    // The server combines this with the masked IP for the final fingerprint.
    var sig =
      navigator.userAgent.length +
      "|" +
      screen.width +
      "x" +
      screen.height +
      "|" +
      (navigator.language || "") +
      "|" +
      Date.now() +
      "|" +
      Math.random().toString(36).slice(2, 10);
    return sig.substring(0, 200);
  }

  function detectDevice() {
    var w = window.innerWidth;
    if (w < 768) return "mobile";
    if (w < 1024) return "tablet";
    return "desktop";
  }

  function getReferrerHost() {
    try {
      if (!document.referrer) return "";
      return new URL(document.referrer).hostname.substring(0, 253);
    } catch (e) {
      return "";
    }
  }

  // ===========================================================================
  // SEND — the only function that talks to the server
  // Uses sendBeacon if available (fire-and-forget, survives tab close).
  // Falls back to fetch with keepalive for older browsers.
  // ===========================================================================
  function send(eventType, payload) {
    try {
      var body = JSON.stringify({
        eventType: eventType,
        payload: payload,
        domain: window.location.hostname,
        ts: Date.now(),
      });

      // Beacon API: best for unload events, no blocking, no response needed
      if (navigator.sendBeacon) {
        var blob = new Blob([body], { type: "text/plain" });
        navigator.sendBeacon(INGEST_URL, blob);
        return;
      }

      // Fallback for browsers without sendBeacon
      fetch(INGEST_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body,
        keepalive: true,
        mode: "no-cors",
      }).catch(function () {
        // Silently swallow errors — never break the host site
      });
    } catch (e) {
      // Silently swallow — never break the host site
    }
  }
})();
