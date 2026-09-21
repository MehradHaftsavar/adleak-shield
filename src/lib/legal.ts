// =============================================================================
// AdLeak Shield — Legal document versions
// src/lib/legal.ts
//
// Bump TERMS_VERSION whenever the Terms of Service or the Data Processing
// Agreement schedule changes in a way a customer would need to agree to again
// — most commonly adding a sub-processor, changing retention, or changing what
// data is collected. Typo fixes do not count.
//
// The value is stamped into Tenants.terms_version at signup (migration 010),
// so a bump immediately makes existing tenants distinguishable from new ones:
//
//   SELECT email FROM Tenants
//    WHERE deleted_at IS NULL AND (terms_version IS NULL OR terms_version <> '<new>')
//
// That query is the list of people to email. Without the stamp there is no way
// to produce it.
//
// PRIVACY_TEMPLATE_VERSION is separate on purpose. The wording customers paste
// into their own privacy policy can change without altering our contract with
// them, and vice versa — tying them together would either force needless
// re-acceptance or silently leave pasted policies out of date.
// =============================================================================

/** Version of the Terms of Service + DPA schedule presented at signup. */
export const TERMS_VERSION = '2026-09-18';

/** Version of the privacy wording we give customers for their own policy. */
export const PRIVACY_TEMPLATE_VERSION = '2026-09-21';

/**
 * Human-readable form of a version stamp, for display in the UI.
 * Versions are ISO dates, so this is just a friendlier rendering.
 */
export function formatLegalVersion(version: string): string {
  const parsed = new Date(`${version}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return version;
  return parsed.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
