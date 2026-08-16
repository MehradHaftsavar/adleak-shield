// =============================================================================
// AdLeak Shield — IP Masking Utility
// functions/src/lib/ip-mask.ts
//
// WHY THIS EXISTS:
// UK GDPR requires we don't store full IP addresses — they're personal data.
// We mask the last octet (IPv4) or last 80 bits (IPv6) BEFORE the data ever
// enters the queue. The original IP never touches our infrastructure beyond
// the HTTP function's memory.
//
// This is a one-way operation — once masked, we can't recover the original.
// That's the point.
// =============================================================================

import { createHmac } from "node:crypto";

/**
 * Strip transport noise (port suffix, leading/trailing whitespace) from a raw
 * X-Forwarded-For style IP string so it's safe to pass to maskIp() or a geoip
 * lookup. Returns the cleaned IPv4/IPv6 string, unchanged if already clean.
 */
export function cleanIp(ip: string | null | undefined): string {
  if (!ip || typeof ip !== "string") return "";

  // Strip any port suffix (e.g. "82.12.34.56:443" → "82.12.34.56")
  return ip.split(",")[0].trim().split(":").length > 2
    ? ip.split(",")[0].trim() // probably IPv6
    : ip.split(",")[0].trim().split(":")[0]; // IPv4 with port
}

/**
 * Mask an IP address for GDPR-compliant storage.
 *
 * IPv4: "82.12.34.56"  →  "82.12.34.xxx"
 * IPv6: "2001:db8:1::1" → "2001:db8::xxxx"
 *
 * Returns "0.0.0.xxx" if the input is missing or unparseable —
 * we never want this function to throw.
 */
export function maskIp(ip: string | null | undefined): string {
  if (!ip || typeof ip !== "string") return "0.0.0.xxx";

  const cleanedIp = cleanIp(ip);

  // IPv4 detection (4 octets separated by dots)
  const ipv4Match = cleanedIp.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/);
  if (ipv4Match) {
    return `${ipv4Match[1]}.${ipv4Match[2]}.${ipv4Match[3]}.xxx`;
  }

  // IPv6 — keep first two groups, mask the rest
  if (cleanedIp.includes(":")) {
    const parts = cleanedIp.split(":");
    if (parts.length >= 2) {
      return `${parts[0]}:${parts[1]}::xxxx`;
    }
  }

  // Unparseable — return safe default
  return "0.0.0.xxx";
}

/**
 * Derive the per-visit identifier.
 *
 * WHY THIS REPLACED THE CLIENT-SIDE FINGERPRINT:
 * The tracker used to build an identifier in the browser and keep it in
 * sessionStorage. Both of those touch the visitor's device, which puts us
 * inside ePrivacy Article 5(3) and means a consent banner is required.
 *
 * Computing it here instead uses only information the browser already sends
 * with every HTTP request — the IP (assigned by their ISP) and the User-Agent
 * (sent by the browser). Neither is read from, nor stored on, the device, so
 * Article 5(3) never applies. This is the same approach Plausible and Fathom
 * use to operate without a consent banner.
 *
 * The salt rotates daily and is deleted after 48h, so yesterday's hashes can
 * no longer be linked to anything — by us or anyone else.
 */
export function hashVisitor(
  salt: string,
  domain: string,
  ip: string,
  userAgent: string
): string {
  return createHmac("sha256", salt)
    .update(`${domain}|${cleanIp(ip)}|${userAgent}`)
    .digest("hex")
    .substring(0, 64);
}

/**
 * Extract the client IP from Azure Functions HTTP request headers.
 * Azure puts the original IP in X-Forwarded-For after the load balancer.
 */
export function extractClientIp(headers: Headers | Record<string, string>): string {
  // Headers may be a Headers object or plain object depending on runtime
  const get = (name: string): string => {
    if (typeof (headers as Headers).get === "function") {
      return (headers as Headers).get(name) ?? "";
    }
    const obj = headers as Record<string, string>;
    return obj[name] ?? obj[name.toLowerCase()] ?? "";
  };

  // X-Forwarded-For format: "client, proxy1, proxy2" — first entry is the real client
  const xff = get("x-forwarded-for") || get("X-Forwarded-For");
  if (xff) {
    return xff.split(",")[0].trim();
  }

  // Fallbacks
  return (
    get("x-real-ip") ||
    get("x-client-ip") ||
    get("cf-connecting-ip") ||
    "0.0.0.0"
  );
}
