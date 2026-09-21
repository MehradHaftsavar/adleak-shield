// =============================================================================
// AdLeak Shield — Tracking Script (Vanilla JS, no dependencies)
// snippet/src/tracker.js
//
// WHAT THIS DOES (in plain language):
// This is the script that lives on a customer's website. When a visitor lands
// on their site after clicking a Google Ad, this code:
//
//   1. Reads the URL parameters Google adds to ad clicks (keyword, gclid, etc.)
//   2. Records every page they visit, how long they stayed, how far they scrolled
//   3. Records every link/button click for the Journey Timeline
//   4. Marks "success events" — phone calls, emails, WhatsApp, form submits
//   5. Sends all of this to AdLeak Shield's ingestion endpoint
//   6. Uses the Beacon API so data sends even if the user closes the tab
//
// WHAT IT DELIBERATELY DOES NOT DO:
// It stores nothing on the visitor's device — no cookies, no sessionStorage,
// no localStorage — and does no device fingerprinting. The visitor identifier
// is derived on the server from the IP and User-Agent the browser already
// sends with every request.
//
// WHAT IT DOES READ — stated plainly, because an earlier version of this
// comment said "reads nothing" and that was wrong: while the page is open it
// reads the viewport width (bucketed to mobile/tablet/desktop), scroll
// position, tab visibility and the elements the visitor clicks, and sends
// them to the ingest endpoint. The ICO's April 2026 guidance treats a script
// sending device-generated information to an outside party as "access" under
// PECR regulation 6 — and its statistical-purposes exception expressly
// excludes advertising measurement, which is this script's whole purpose.
//
// Those are statements of fact about this file, deliberately kept separate
// from any conclusion about what a given site operator's legal obligations
// are. Whether a particular site needs a consent mechanism is a question for
// that operator and their own advisers, not a claim this codebase makes.
//
// Visitors who object are honoured server-side: the ingest function drops
// every event carrying "Sec-GPC: 1". That is an opt-out, so collection stays
// on by default and bots — which never set the header — are still counted.
//
// CRITICAL CONSTRAINTS:
// - Must be under 6KB after minification (PRD requirement, Core Web Vitals)
// - Vanilla JS only — no jQuery, no React, no dependencies
// - Nothing may ever be written to the visitor's device (no cookies, no web
//   storage); nothing may be read beyond what measuring the ad visit needs
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
  var SUCCESS_HOSTS = ["wa.link", "wa.me", "api.whatsapp.com", "web.whatsapp.com"]; // WhatsApp link patterns

  // Tier 1 — safe to match ANYWHERE on the page, no form required. These are
  // words with essentially no legitimate use except opening a direct
  // communication channel (unlike "quote"/"contact us", which are commonly
  // just navigation links to another page).
  var TIER1_TEXT_MATCHES = [
    "whatsapp", "messenger", "live chat", "chat with us", "chat now", "start chat", "click to chat",
  ];

  // Tier 2 — only counts as a conversion when the element is the completing
  // action of a REAL <form> the visitor has already typed into (see
  // interactedForms below). Deliberately excludes words like "continue"/
  // "next" (multi-step form navigation, not completion) and "learn more"/
  // "read more" (generic navigation).
  var TIER2_FORM_TEXT_MATCHES = [
    "send message", "send enquiry", "send an enquiry", "submit",
    "request a callback", "request callback", "get a quote", "get quote",
    "request a quote", "request quote", "book now", "book appointment", "confirm booking",
    "request info", "enquire now", "make an enquiry",
    "get in touch", "contact us", "sign up", "register", "schedule",
    "claim offer",
  ];
  var interactedForms = []; // <form> elements the visitor has typed into — gates Tier 2 matches

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
  // WHO IS THIS VISITOR? — deliberately, we do not know and do not ask.
  //
  // This script used to build an identifier from screen size, language and
  // user agent, then keep it in sessionStorage. Both of those touch the
  // visitor's device — the thing PECR regulation 6 turns on — and a consent
  // gate would also mean a bot that never clicks "accept" is never recorded.
  //
  // The identifier is now derived on the server from the IP and User-Agent
  // that the browser already sends with every request, so the identifier
  // needs nothing stored on, or read from, the device.
  //
  // The consequence here: this script has no memory. It cannot tell whether
  // this visit came from an ad, so it reports every page and lets the server
  // decide what is relevant. That is why there is no early exit any more.
  // ===========================================================================
  var params = new URLSearchParams(window.location.search);

  // Sent with EVERY event, not just the first. document.referrer is fixed for
  // the life of a page load, so on the page after the ad click it still holds
  // the landing URL including its gclid — which is how a journey survives the
  // visitor's IP changing mid-visit (phone moving from WiFi to mobile data).
  var referrer = "";
  try { referrer = (document.referrer || "").substring(0, 500); } catch (e) {}

  // Read fresh from the URL on every page. Present on the landing page only.
  var gclid = (params.get("gclid") || "").substring(0, 100);
  var keyword = (params.get("keyword") || "").substring(0, 255);

  if (gclid && keyword) {
    send("session_start", {
      session: {
        keyword: keyword,
        matchType: (params.get("matchtype") || "").substring(0, 20),
        campaignId: (params.get("campaignid") || "").substring(0, 20),
        adgroupId: (params.get("adgroupid") || "").substring(0, 20),
        adId: (params.get("adid") || "").substring(0, 50),         // {creative}
        adPosition: (params.get("adposition") || "").substring(0, 20), // {adposition}
        gclid: gclid,
        device: detectDevice(),
        landedAt: Date.now(),
        landingPath: window.location.pathname,
      },
      pagePath: window.location.pathname,
      referrer: referrer,
    });
  }

  // ===========================================================================
  // PAGEVIEW
  // ===========================================================================
  var pageStart = Date.now();
  var maxScrollPct = 0;

  // Browsers without bfcache (e.g. Android WebView) have no choice but to do
  // a real reload on back/forward — this catches that case via the standard
  // Navigation Timing API so it's labelled the same as a true bfcache
  // restore, without needing any browser/device detection.
  var cameFromBack;
  try { cameFromBack = performance.getEntriesByType("navigation")[0].type === "back_forward"; } catch (e) {}

  // gclid is sent whenever this page load IS an ad landing — i.e. the click ID
  // is still in the URL. Empty on every other page, which is exactly the point:
  // it tells the server "this page view belongs to click X", instead of leaving
  // it to guess from the visitor's identity.
  //
  // Without it, a visitor clicking the ad a SECOND time produced a landing page
  // recorded against their previous visit as well as the new one, because the
  // only beacon carrying the new click ID was session_start.
  send(cameFromBack ? "bfpv" : "pageview", {
    referrer: referrer,
    pagePath: window.location.pathname,
    gclid: gclid || undefined,
  });

  // ===========================================================================
  // BACK/FORWARD-CACHE RESTORE
  // Pressing the browser's back/forward button (or a swipe-back gesture) can
  // restore this exact page from bfcache instead of doing a real reload — the
  // script does NOT re-run, so the "pageview" send above never fires for that
  // return visit. pageshow with persisted=true is the browser's own signal
  // that this happened, so send a distinct marker for it instead (existing
  // click/heartbeat/etc. listeners are still alive and already work fine).
  // ===========================================================================
  window.addEventListener("pageshow", function (e) {
    if (e.persisted) {
      send("bfpv", {
        referrer: referrer,
        pagePath: window.location.pathname,
      });
      // Restored from bfcache. The stretch since this page was hidden was spent
      // on ANOTHER page, not away from the browser — so consume it here rather
      // than leaving it for the visibilitychange that follows.
      //
      // Clearing didHide alone is not enough: pageshow fires BEFORE
      // visibilitychange, so the guard would already be down by the time the
      // visible handler ran, and a 90-second detour to another page was
      // reported as "left the tab for 90 seconds".
      //
      // Banking it into totalHiddenMs matters just as much — drop it and that
      // same stretch silently becomes time on this page.
      if (hiddenAt > 0) {
        totalHiddenMs += Date.now() - hiddenAt;
        hiddenAt = 0;
      }
      didHide = false;
    }
  });

  // ===========================================================================
  // ACTIVE DWELL TIME
  // Tracks how long the user was actually LOOKING at the page — not counting
  // time the tab was hidden (switched away, minimised). This makes bounce
  // detection accurate: a user who opens the tab and immediately switches
  // to another app for 10 minutes hasn't "engaged" for 10 minutes.
  // ===========================================================================
  var hiddenAt = document.hidden ? Date.now() : 0; // if already hidden on load
  var totalHiddenMs = 0;
  // How much of this page's dwell time has already been sent via page_end.
  // A bfcache-restored page can fire pagehide more than once for the SAME
  // script instance (pageStart never resets) — without this, each later
  // page_end would resend the FULL cumulative dwell, and the server (which
  // adds each page_end's value on top of what's already banked) would count
  // the earlier portion twice.
  var reportedDwellMs = 0;

  function activeDwellMs() {
    var currentHidden = (hiddenAt > 0) ? (Date.now() - hiddenAt) : 0;
    return Math.max(0, Date.now() - pageStart - totalHiddenMs - currentHidden);
  }

  // Time on this page the server has NOT already banked. Every dwell figure we
  // send means this, so the server can apply one consistent rule.
  //
  // It matters after a page_end. The server permanently banks that page_end
  // into completed_pages_duration_ms, then adds each later dwell figure on top
  // of that banked base. A bfcache-restored page keeps running this same script
  // instance (pageStart never resets), so activeDwellMs() still counts from the
  // original load — sending it raw would add the already-banked stretch a
  // second time and inflate a 20s visit to 35s. Until the first page_end,
  // reportedDwellMs is 0 and this is simply activeDwellMs().
  function unbankedDwellMs() {
    return Math.max(0, activeDwellMs() - reportedDwellMs);
  }

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
      // Walk up to find the closest <a>, <button>, or button-like <input>
      var el = target.closest ? target.closest("a, button, input[type=button], input[type=submit]") : null;
      if (!el) return;

      var tag = el.tagName.toLowerCase();
      var href = (el.getAttribute("href") || "").toLowerCase();
      var text = (el.textContent || el.getAttribute("aria-label") || el.getAttribute("value") || "").trim();
      var isSuccess = false;

      var lowerText = text.toLowerCase();

      if (href.indexOf("tel:") === 0 || href.indexOf("mailto:") === 0) isSuccess = true;
      else if (href.indexOf("https://") === 0) {
        isSuccess = SUCCESS_HOSTS.some(function (h) { return href.indexOf("https://" + h) === 0; });
      }

      // Tier 1 — text match, safe anywhere on the page (direct channel-opening actions)
      if (!isSuccess) {
        isSuccess = TIER1_TEXT_MATCHES.some(function (m) { return lowerText.indexOf(m) !== -1; });
      }

      // Tier 2 — text match, ONLY when this is the completing action of a
      // <form> the visitor has actually typed into. Three independent
      // conditions must all hold: inside a real form, that form already had
      // form_interact fire, and the text matches a submission-intent phrase.
      if (!isSuccess && el.closest) {
        var parentForm = el.closest("form");
        if (parentForm && interactedForms.indexOf(parentForm) !== -1) {
          var looksLikeCancel =
            (el.getAttribute("type") || "").toLowerCase() === "reset" ||
            lowerText.indexOf("cancel") !== -1 ||
            lowerText.indexOf("clear") !== -1 ||
            lowerText.indexOf("reset") !== -1;
          if (!looksLikeCancel) {
            isSuccess = TIER2_FORM_TEXT_MATCHES.some(function (m) { return lowerText.indexOf(m) !== -1; });
          }
        }
      }

      var payload = {
        referrer: referrer,
        pagePath: window.location.pathname,
        elementTag: tag,
        elementHref: hrefForStorage(href),
        elementText: text.substring(0, 100),
      };

      // A conversion is the last thing many visits ever do, so bank the dwell
      // time with it rather than hoping a later beacon gets out. A WhatsApp or
      // tel: link hands off to another app: with target="_blank" the page never
      // unloads at all so pagehide never fires, and even on a same-tab
      // navigation the beacon is racing the handoff. Waiting for page_end lost
      // a real 15-second converted visit on 16 Aug — it displayed as "< 1s".
      // Same cumulative-for-this-page semantics as a heartbeat, so the server's
      // monotonic guard makes a duplicate harmless.
      if (isSuccess) {
        payload.dwellMs = unbankedDwellMs();
        payload.scrollPct = maxScrollPct;
      }

      send(isSuccess ? "success_event" : "click", payload);

      // For success events on <a> links: delay navigation by 150ms so the
      // beacon has time to be queued before pagehide fires.
      // Respects target="_blank" — opens in new tab instead of navigating.
      if (isSuccess && tag === "a" && href && href.indexOf("#") !== 0 && href.indexOf("javascript") !== 0) {
        e.preventDefault();
        var actualHref = el.getAttribute("href");
        var newTab = el.getAttribute("target") === "_blank" || el.getAttribute("target") === "_new";
        setTimeout(function () {
          newTab ? window.open(actualHref) : (window.location.href = actualHref);
        }, 150);
      }
    },
    true // Capture phase — fires even if the click is intercepted
  );

  // ===========================================================================
  // FORM SUBMIT — also a success event (typically a contact form)
  // ===========================================================================
  document.addEventListener(
    "submit",
    function (e) {
      var form = e.target;
      var formLabel =
        (form && (form.id || form.getAttribute("name") || form.getAttribute("action"))) || "";
      send("success_event", {
        referrer: referrer,
        pagePath: window.location.pathname,
        elementTag: "form",
        elementText: formLabel.substring(0, 100),
        dwellMs: unbankedDwellMs(), // see the click handler — banked at conversion
        scrollPct: maxScrollPct,
      });
    },
    true
  );

  // ===========================================================================
  // FORM INTERACT — fires once PER FIELD the first time a visitor actually
  // types/changes a value in it (textarea, select, or a real text-like input
  // — excludes hidden/submit/button/reset). Uses the "input" event, not
  // focus, since merely tabbing into a field without typing isn't a
  // meaningful engagement signal. Throttled by element reference (not by
  // the computed label) so two different fields that happen to produce the
  // same fallback text never silently collide.
  // ===========================================================================
  var interactedFields = [];

  function fieldLabel(el, tag, type) {
    var lbl = el.labels && el.labels[0] && el.labels[0].textContent;
    if (lbl && lbl.trim()) return lbl.trim();
    var ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();
    var name = el.getAttribute("name");
    if (name && name.trim()) return name.trim();
    var placeholder = el.getAttribute("placeholder");
    if (placeholder && placeholder.trim()) return placeholder.trim();
    var id = el.getAttribute("id");
    if (id && id.trim()) return id.trim();
    if (tag === "textarea") return "a text area";
    if (tag === "select") return "a dropdown";
    if (type) return "a " + type + " field";
    return "a field";
  }

  // Picks a verb matching what actually happened — typing text is not the
  // same action as ticking a box, dragging a slider, or picking a colour.
  function fieldVerb(tag, type) {
    if (tag === "select" || type === "checkbox" || type === "radio") return "Selected";
    if (type === "range") return "Adjusted";
    if (type === "color" || type === "file") return "Interacted with";
    return "Typed into";
  }

  document.addEventListener(
    "input",
    function (e) {
      var target = e.target;
      if (!target) return;
      var tag = (target.tagName || "").toLowerCase();
      var type = ((target.getAttribute && target.getAttribute("type")) || "").toLowerCase();
      var isFormField =
        tag === "textarea" ||
        tag === "select" ||
        (tag === "input" && ["hidden", "submit", "button", "reset"].indexOf(type) === -1);
      if (!isFormField) return;

      // Remember which <form> this field belongs to — powers the click
      // handler's Tier 2 "submit button inside an engaged form" detection
      // above, independent of whether we've already sent form_interact
      // for this exact field.
      var parentForm = target.closest ? target.closest("form") : null;
      if (parentForm && interactedForms.indexOf(parentForm) === -1) {
        interactedForms.push(parentForm);
      }

      // Fire once per field (by element reference), not once per session.
      if (interactedFields.indexOf(target) !== -1) return;
      interactedFields.push(target);

      var message = fieldVerb(tag, type) + " " + fieldLabel(target, tag, type);
      send("form_interact", {
        referrer: referrer,
        pagePath: window.location.pathname,
        elementText: message.substring(0, 100),
      });
    },
    true
  );

  // ===========================================================================
  // HEARTBEAT
  // Tells the server "this user is still on the page" periodically.
  // Uses ACTIVE dwell time (excludes time tab was hidden).
  //
  // First heartbeat fires at 5s — catches engaged visits (5-15s) where
  // page_end might be lost before the regular 15s heartbeat fires.
  // Regular heartbeat fires every 15s after that.
  // ===========================================================================
  var heartbeatInterval = null;

  // ===========================================================================
  // TAB SWITCHING
  // didHide records that the page actually went away (navigated or unloaded),
  // as opposed to merely being hidden. Without it, every internal link click
  // would be reported as the visitor leaving and returning: the browser fires
  // "hidden" on navigation too, and a back-button restore then fires "visible"
  // with the whole time spent on the other page looking like an absence.
  // ===========================================================================
  var didHide = false;
  var tabReturns = 0;

  // force=true sends even while the page is hidden. That is only ever used by
  // the visibilitychange handler below, which needs to flush the dwell clock at
  // the exact moment the page goes away — by then document.hidden is already
  // true, so the normal guard would suppress the one send that matters most.
  function sendHeartbeat(force) {
    if (document.hidden && force !== true) return;
    send("heartbeat", {
      referrer: referrer,
      pagePath: window.location.pathname,
      dwellMs: unbankedDwellMs(),
      scrollPct: maxScrollPct,
    });
  }

  function startHeartbeat() {
    if (heartbeatInterval) return;
    heartbeatInterval = setInterval(sendHeartbeat, HEARTBEAT_MS);
  }

  function stopHeartbeat() {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }

  // Early heartbeat at 5s — marks visits of 5s+ as Engaged even if page_end
  // never arrives (tab killed between 5-15s before first regular heartbeat)
  var earlyHeartbeat = setTimeout(sendHeartbeat, 5000);

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      // Flush before banking the hidden clock, so activeDwellMs() still
      // reports the time actually spent looking at the page.
      //
      // On mobile this is the ONLY reliable "the page is going away" signal:
      // tapping a WhatsApp/tel: link, switching apps, opening a target="_blank"
      // link or hitting the home button all fire visibilitychange, while
      // pagehide may never fire at all (the page is backgrounded, not
      // unloaded). Without this, everything since the last heartbeat — up to
      // 15 seconds — was simply lost.
      // Only flush when there is something left to report. On a navigation,
      // pagehide fires first and banks the page's time, so this would otherwise
      // send a heartbeat carrying 0-4ms — a row that says nothing, one per page
      // change. Six of the 41 events in one real session on 21 Aug were these.
      if (unbankedDwellMs() >= 1000) sendHeartbeat(true);
      hiddenAt = Date.now();
      stopHeartbeat();
    } else {
      if (hiddenAt > 0) {
        var awayMs = Date.now() - hiddenAt;
        totalHiddenMs += awayMs;
        hiddenAt = 0;
        // Report a real tab switch, not a navigation (didHide) and not a
        // momentary focus change like clicking the address bar (3s floor).
        // Capped so a compulsive tab-switcher cannot flood the journey.
        if (!didHide && awayMs >= 3000 && tabReturns < 20) {
          tabReturns++;
          send("tab_return", {
            referrer: referrer,
            pagePath: window.location.pathname,
            awayMs: awayMs,
          });
        }
      }
      startHeartbeat();
    }
  });

  startHeartbeat();

  // ===========================================================================
  // UNLOAD — final dwell-time send using ACTIVE dwell (tab-hidden time excluded)
  // pagehide fires reliably on mobile Safari where unload doesn't.
  // Beacon API guarantees the request is sent even as the page is closing.
  // ===========================================================================
  window.addEventListener("pagehide", function () {
    didHide = true;
    clearTimeout(earlyHeartbeat); // no point sending both
    var newDwell = unbankedDwellMs();
    reportedDwellMs += newDwell; // this stretch is now banked server-side
    send("page_end", {
      referrer: referrer,
      pagePath: window.location.pathname,
      dwellMs: newDwell,
      scrollPct: maxScrollPct,
    });
  });

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  function detectDevice() {
    var w = window.innerWidth;
    if (w < 768) return "mobile";
    if (w < 1024) return "tablet";
    return "desktop";
  }

  // A link's query string can carry something the visitor typed on the
  // customer's site — a registration in a "get a quote" link, an address in a
  // booking link. Page paths never had this exposure (window.location.pathname
  // excludes the query by definition), so this closes the one remaining route
  // by which such a value could reach the database.
  //
  // Applied only where the href is stored, never where it is inspected: the
  // tel:/mailto:/WhatsApp checks above still run against the full attribute,
  // so conversion detection is unchanged. Fragments are kept — "#contact" says
  // which section was clicked and carries no typed input.
  function hrefForStorage(h) {
    var i = h.indexOf("?");
    return (i === -1 ? h : h.substring(0, i)).substring(0, 500);
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
        domain: window.location.host,
        ts: Date.now(),
      });

      // sendBeacon returns false when the browser refuses to queue the request
      // (its beacon queue is full, or the payload is over the ~64KB limit).
      // Ignoring that return value silently drops the event, so fall through
      // to fetch when it fails rather than assuming it was delivered.
      if (navigator.sendBeacon) {
        var blob = new Blob([body], { type: "text/plain" });
        if (navigator.sendBeacon(INGEST_URL, blob)) return;
      }

      fetch(INGEST_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body,
        keepalive: true,
        mode: "no-cors",
      }).catch(function () {});
    } catch (e) {}
  }
})();
