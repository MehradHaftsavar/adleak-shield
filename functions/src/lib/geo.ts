// =============================================================================
// AdLeak Shield — IP Geolocation Utility
// functions/src/lib/geo.ts
//
// WHY THIS EXISTS:
// We want to show which city/country a session came from, but GDPR rules
// mean we can't store the raw IP. geoip-lite does an offline lookup against
// a bundled MaxMind GeoLite2 database (no API calls, no rate limits, free).
// This MUST be called on the raw IP before maskIp() runs — once masked, the
// IP no longer resolves to a meaningful location.
// =============================================================================

import geoip from "geoip-lite";
import { cleanIp } from "./ip-mask.js";

export interface GeoInfo {
  city: string | null;
  country: string | null; // ISO 3166-1 alpha-2 (e.g. "GB", "US")
}

/**
 * Look up the city/country for a raw IP address. Returns nulls if the IP is
 * missing, private/local, or not found in the database. Never throws.
 */
export function lookupGeo(ip: string | null | undefined): GeoInfo {
  const cleaned = cleanIp(ip);
  if (!cleaned) return { city: null, country: null };

  try {
    const result = geoip.lookup(cleaned);
    if (!result) return { city: null, country: null };
    return {
      city: result.city || null,
      country: result.country || null,
    };
  } catch {
    return { city: null, country: null };
  }
}
