# Data Processing Agreement — DRAFT

**Status: DRAFT. Not yet published or presented to customers.**

Built against the ICO's Article 28 contract checklist and the system as it
actually behaves (every factual clause below is traceable to code — see the
references in square brackets, which should be **removed before publishing**).

Intended home: a schedule appended to the Terms of Service at `/terms`, accepted
by the existing signup tickbox. When published, bump `TERMS_VERSION` in
`src/lib/legal.ts` and remove this status block.

---

## 1. Parties and roles

**You** (the "Customer") are the **controller** of personal data relating to
visitors to your website. **We** ("AdLeak Shield") are the **processor**, acting
only on your instructions.

Your account data and billing data are outside this Agreement — for those we act
as controller, and our own Privacy Policy applies.

## 2. Subject matter, duration, nature and purpose

**Subject matter.** Measurement of visitor behaviour following clicks on your
Google Ads campaigns.

**Duration.** For as long as your subscription is active, plus the retention
periods in clause 7.

**Nature and purpose.** Recording which advert and search term brought a visitor
to your site, what they did while there, and whether they contacted you — so
that you can identify advertising spend that is not producing enquiries.

We process this data **only** to provide that service to you. We do not use it
for any purpose of our own, do not combine it across customers, and do not sell
or share it for anyone else's purposes.

## 3. Categories of data subject and types of personal data

**Data subjects.** Visitors to your website who arrive via your Google Ads.

**Personal data processed:**

| Data | Handling |
|---|---|
| IP address | Read from the request header, used once for an offline town/country lookup, then shortened (e.g. `82.12.34.xxx`). The full address is never written to storage. [`functions/src/lib/ip-mask.ts`, `ingest.ts`] |
| Browser user-agent | Used only as an input to the visit identifier. Never stored. |
| Visit identifier | A one-way HMAC of the domain, IP and user-agent, keyed with a secret that rotates daily and is deleted after 48 hours. [`hashVisitor`, `janitor.ts`] |
| Approximate location | Town and country, derived offline. No third-party lookup service receives the IP. |
| Advertising parameters | Keyword, match type, campaign, ad group, ad, gclid. |
| On-site behaviour | Page paths (query strings excluded), link and button targets (query strings excluded), text of clicked elements, form field *labels* (never values typed), scroll depth, dwell time. |

**No special category data** is knowingly processed. **No cookies are set**, and
nothing is stored on a visitor's device. While a page is open, the script does
read interaction information — viewport size category, scroll position, tab
visibility and clicked elements — and sends it to us.

**Consent under PECR.** The ICO treats a script sending device-generated
information to an outside party as access under PECR regulation 6, and its
statistical-purposes exception does not apply to advertising measurement.
Whether you must obtain visitors' consent before the script loads is therefore
a decision for you as controller; where you use a consent tool, you may
configure it to load the script only after consent.

## 4. Our obligations (UK GDPR Article 28(3))

**(a) Documented instructions.** We process personal data only on your
documented instructions, which are these Terms plus your configuration in the
dashboard. If we believe an instruction breaches data protection law, we will
tell you and may suspend that processing.

**(b) Confidentiality.** Everyone we authorise to process the data is bound by a
duty of confidence.

**(c) Security.** We maintain measures appropriate to the risk, including:
encryption in transit and at rest; row-level security in the database so one
customer's data is not reachable from another's context; managed-identity
authentication with no stored database passwords; masking of IP addresses before
storage; and rotating, short-lived salts.

**(d) Sub-processors.** You give general authorisation for the sub-processors in
clause 5. We impose equivalent data-protection obligations on each, and remain
liable to you for their performance. We will give you notice before adding or
replacing one, and you may object.

**(e) Data subject rights.** We will assist you in responding to visitor
requests. Note the practical limit created by the design: once the daily salt is
deleted at 48 hours, a visit can no longer be linked to any individual, so we
may be unable to locate records older than that.

**(f) Breach, DPIAs, consultation.** We will notify you **without undue delay**
after becoming aware of a personal data breach, with the information you need for
your own notification duties, and will assist with data protection impact
assessments and prior consultation.

**(g) Deletion or return.** On termination we delete the data per clause 7, or
return it on your request before deletion.

**(h) Demonstrating compliance.** We will make available the information
necessary to show compliance with this clause, and allow for audits, including
inspections, on reasonable notice.

## 5. Sub-processors

| Sub-processor | Purpose | Location |
|---|---|---|
| Microsoft Azure | Hosting, database, storage queues, serverless functions | UK / West Europe |
| Vercel | Hosting of the web application and the tracking script | Global edge |
| Resend | Transactional and report email | — |
| Stripe | Subscription billing (**account data only** — no visitor data) | — |

Geolocation is performed by an offline database bundled with our own code; no
third party receives visitor IP addresses.

> **TO VERIFY BEFORE PUBLISHING:** the Azure region, and each provider's
> current UK transfer mechanism (adequacy / IDTA / UK Addendum to the EU SCCs).

## 6. International transfers

Where a sub-processor processes data outside the UK, that transfer relies on UK
adequacy regulations or on an International Data Transfer Agreement / UK Addendum,
as applicable.

## 7. Retention and deletion

| Data | Deleted |
|---|---|
| Daily hash salts | After 48 hours [`janitor.ts`] |
| Visitor sessions and journey events | After 90 days |
| All data for a cancelled subscription | 90 days after cancellation |
| All data for an expired, unconverted trial | 30 days after trial end |

## 8. Visitor objection

We honour the **Global Privacy Control** signal on your behalf: a request
carrying `Sec-GPC: 1` is discarded before its body is read or any IP address is
extracted, and nothing about that visit is recorded
[`functions/src/functions/ingest.ts`]. This is an opt-out, not consent — absence
of the signal is not treated as an objection.

## 9. Your obligations

You confirm that you have a lawful basis for the processing you instruct, that
your own privacy information describes it (we provide wording for this at
`/setup-guide#privacy-wording`), and that you will not instruct us to process
special category data or data relating to children.

## 10. Liability and precedence

Where this Agreement conflicts with the Terms of Service on the processing of
visitor personal data, this Agreement prevails.

---

## Open items before this is published

1. Confirm the Azure region and each sub-processor's transfer mechanism (clause 5/6).
2. Decide the notice period for adding a sub-processor, and the objection route.
3. Confirm the trading entity name — no registered company name appears anywhere
   in the codebase, so this reads as a sole trader. State it correctly.
4. Strip the bracketed code references.
5. Add a link from `/terms` clause 6, and bump `TERMS_VERSION`.
6. Optional: run clauses 4–7 past the ICO's SME advice line, together with the
   four questions in `legal/ICO-QUESTIONS.md`.
