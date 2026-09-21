# Questions for the ICO

Free service for small organisations: https://ico.org.uk/global/contact-us/contact-us-sme/

Read the background out first — the answers depend on the detail, and a generic
"do I need a cookie banner?" will get a generic answer.

---

## Background to give them

AdLeak Shield is a UK analytics product for small businesses running Google Ads.
ICO registration **C1953337**. Our customer installs a script on their own
website; we are the processor, they are the controller of their visitors' data.

The script:

- Sets **no cookies** and uses **no** `localStorage`, `sessionStorage` or
  `IndexedDB`. Verified by search: the shipped file contains none of these APIs.
- Reads **one** device characteristic via JavaScript — `window.innerWidth` —
  bucketed immediately into three values (`mobile` / `tablet` / `desktop`) and
  sent as a session attribute. It is **not** used to identify anyone.
- Otherwise reads only the page's own URL, `document.referrer`, scroll position
  and the text of elements the visitor clicks.

The visitor identifier is computed **server-side**, from the IP address and
user-agent the browser sends with every request, as
`HMAC-SHA256(daily_salt, domain | ip | user_agent)`. The salt rotates daily and
is **deleted after 48 hours**, after which the identifier cannot be linked to
anyone.

The full IP address is never stored. It is used once, in memory, for an offline
town/country lookup, then shortened to `/24` (e.g. `82.12.34.xxx`). The
user-agent is never stored at all.

Visitor records are deleted after 90 days. Requests carrying `Sec-GPC: 1` are
discarded before the body is read or the IP extracted.

---

## Question 1 — Is regulation 6 engaged at all?

Given nothing is stored on or read from the device other than
`window.innerWidth`, and the identifier is derived server-side from information
the browser transmits anyway:

**Does PECR regulation 6 apply to this design?**

And specifically: **does reading `window.innerWidth`, bucketed to three values
and not used for identification, count as "gaining access to information stored
in the terminal equipment"?**

Your April 2026 guidance says fingerprinting is in scope where a technology
"accesses or derives information from terminal equipment", but also frames the
analytics question as being about "how, not who". This single value is squarely
"how". We would like to know whether you agree.

*If the answer is no, the remaining questions are moot but still worth asking as
a fallback.*

## Question 2 — Does the statistical-purposes exception cover us?

If regulation 6 **is** engaged, we would rely on the statistical-purposes
exception introduced by the Data (Use and Access) Act 2025.

**Does that exception cover a third-party analytics provider in our position** —
acting solely on the site operator's instructions, using the data only to
provide measurement to that operator, never for our own purposes, never combined
across customers, never sold or shared?

And: **is honouring Global Privacy Control sufficient as the "simple means of
objecting, free of charge"**, or is a visible on-site control also expected?

## Question 3 — Is a `/24`-masked IP personal data?

We store `82.12.34.xxx` — the final octet removed — alongside an approximate
town, for up to 90 days.

**Should we treat that as personal data?** We currently do, and apply
legitimate interests plus the safeguards above. We would rather confirm than
assume.

## Question 4 — Is the visit identifier anonymous after 48 hours?

The identifier is an HMAC keyed with a salt that is permanently deleted 48 hours
after generation. Once the salt is gone, the input cannot be recovered or
re-derived, by us or by anyone who compels us.

**After the salt is deleted, is the remaining identifier anonymous information
outside the scope of UK GDPR, or still pseudonymous personal data?**

This determines whether our 90-day retention is holding personal data for 88 of
those days, or non-personal data.

---

## Record the answers here

| Q | Date asked | Who answered | Answer |
|---|---|---|---|
| 1 | | | |
| 2 | | | |
| 3 | | | |
| 4 | | | |

Keep this file updated — it is the accountability record showing the position was
checked rather than assumed, and it is what makes a later solicitor review cheap.
