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
