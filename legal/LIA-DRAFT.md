# Legitimate Interests Assessment — DRAFT

**Status: DRAFT. Internal accountability record, not published.**

Follows the ICO's three-part test (purpose, necessity, balancing). The ICO's
own template is at
`https://ico.org.uk/media2/for-organisations/forms/2258435/gdpr-guidance-legitimate-interests-sample-lia-template.docx`
— transfer this content into it if you prefer their format.

**Scope note.** Our customers are the controllers for visitor data, so strictly
each of them should hold their own LIA. This one exists because (a) we design the
processing and are best placed to document it, and (b) we give customers the
privacy wording, so we should be able to show our own reasoning. Provide it to
customers as a starting point, not as their assessment.

**Date:** 18 September 2026 (revised 21 September 2026)
**Processing assessed:** measurement of visitor behaviour after a Google Ads click

> **PECR scope note — read first.** This assessment covers the UK GDPR lawful
> basis only. It does not settle PECR. The ICO treats a script sending
> device-generated information (clicks, scroll position, screen size) to an
> outside party as access under PECR regulation 6, and the statistical-purposes
> exception excludes advertising measurement. Where a site obtains PECR consent
> before loading the script, the ICO expects **consent** to be the UK GDPR basis
> for the processing that follows, not legitimate interests. This LIA therefore
> applies where PECR consent is not required — for example visitors outside the
> UK and EU.

---

## Part 1 — Purpose test

**What is the legitimate interest?**

A small business spending money on Google Ads cannot see which clicks produce
enquiries and which are wasted. Google reports clicks and cost; it does not
report whether the visitor did anything on arrival. Without that link, budget is
spent on keywords that never generate a call, indefinitely.

The interest is the advertiser's: understanding and improving the effectiveness
of their own advertising spend.

**Who benefits?**

- The advertiser — stops paying for traffic that never converts.
- Visitors — advertising becomes more relevant to genuine intent, and fewer
  misleading adverts are shown for searches they do not match.
- Us — commercially, as the provider.

**Is it a recognised interest?** Yes — direct marketing and the measurement of
its effectiveness are recognised as capable of being legitimate interests
(UK GDPR recital 47).

Note what this does **not** rely on: the PECR statistical-purposes exception
introduced by the Data (Use and Access) Act 2025. The ICO's guidance says that
exception does not apply to advertising purposes at all, so it is not available
for this processing.

**How important is it?** Moderate but real. For a business spending a few hundred
pounds a month on ads, wasted spend is material.

---

## Part 2 — Necessity test

**Does the processing actually achieve the purpose?** Yes. Linking an ad click to
what followed is the only way to distinguish a keyword that produces enquiries
from one that does not.

**Is there a less intrusive way?**

| Alternative | Why rejected |
|---|---|
| Google Ads' own reporting | Reports clicks and cost only, not on-site behaviour |
| Aggregate totals with no per-visit link | Cannot attribute an enquiry to a keyword, which is the entire purpose |
| Cookies or device storage | **More** intrusive — persists on the visitor's device |
| Client-side fingerprinting | **More** intrusive — reads device characteristics and is designed to persist |
| Server logs alone | Do not carry the advertising parameters or in-page behaviour |

The chosen design is the least intrusive option that works: no device storage, no
persistent identifier, and an identifier that becomes permanently unlinkable
after 48 hours.

**Conclusion:** necessary, and minimised.

---

## Part 3 — Balancing test

### Nature of the data

Not special category. Not criminal offence data. Not children's data (customer
sites are B2C trade services; we prohibit instructing us to process children's
data).

The identifying elements are the weakest practicable:

- Full IP address — **never stored**; used once in memory for an offline
  town/country lookup, then shortened to a `/24`.
- User-agent — **never stored**; input to the hash only.
- Visit identifier — HMAC keyed with a salt that rotates daily and is deleted at
  48 hours. After that the identifier cannot be linked to any person, by us or
  by anyone compelling us.
- Form field **labels** are recorded; values typed are never sent.
- Query strings are stripped from both page paths and link targets, so anything
  a visitor typed into a URL cannot reach storage.

### Reasonable expectations

A visitor clicking a paid advert would reasonably expect the advertiser to
measure whether the advert worked. This is first-party measurement of the
visitor's interaction with the site they chose to visit.

What would fall outside expectations — and which we do not do — is cross-site
tracking, profile building, audience selling, or retargeting.

### Likely impact

Low. There is no decision made about the individual, no profile retained, no
content personalised, and no communication sent to them. The output is aggregate
keyword-level reporting to the advertiser.

**Worst case:** a database compromise within 48 hours of a visit could link a
`/24`-masked IP and behaviour to a live hash. Mitigated by encryption at rest,
row-level security, managed-identity authentication with no stored passwords, and
the absence of any full IP or user-agent to correlate against.

### Safeguards

1. No cookies; nothing stored on the device. (The script does read interaction
   information while the page is open — see the PECR scope note above.)
2. Full IP never persisted.
3. Salt rotation and 48-hour deletion, making identifiers permanently unlinkable.
4. 90-day deletion of all visitor records.
5. Global Privacy Control honoured before the request body is read.
6. Query strings stripped from paths and link targets.
7. Row-level security isolating each customer's data.
8. Processor-only use: never used for our own purposes, never combined across
   customers, never sold or shared.

### Would a visitor object?

Some would — privacy-conscious visitors object to any measurement. That is why
GPC is honoured, and why an explicit objection route appears in the privacy
wording we give customers. Because the signal is respected before processing, a
visitor who has expressed a preference is not measured at all.

### Could they be told?

Yes, and they are: we supply customers with ready-made privacy wording and
display it during setup and permanently at `/setup-guide#privacy-wording`.

---

## Outcome

**Subject to the PECR scope note at the top** — i.e. where PECR consent is not
required — **legitimate interests is an appropriate lawful basis**, on the basis that the
processing is first-party measurement, the data is minimised to the point of
becoming unlinkable within 48 hours, nothing is stored on the visitor's device,
and an effective opt-out is honoured before processing.

**Review triggers:** any new data field collected; any increase in retention; any
new sub-processor; any use of the data beyond providing the service to the
customer; any change to the GPC handling. Otherwise review annually.

**Next review due:** 18 September 2027

---

## Open items

1. Confirm whether any customer's site is likely to attract visitors under 18;
   if so, reassess.
2. Confirm the `/24` masking question with the ICO (see `legal/ICO-QUESTIONS.md`)
   — if a `/24` masked IP is treated as personal data, the safeguards above still
   hold, but the balancing test should say so explicitly.
3. Transfer into the ICO template if a formal format is preferred.
