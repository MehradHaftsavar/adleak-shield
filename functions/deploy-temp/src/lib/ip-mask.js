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
 * Mask an IP address for GDPR-compliant storage.
 *
 * IPv4: "82.12.34.56"  →  "82.12.34.xxx"
 * IPv6: "2001:db8:1::1" → "2001:db8::xxxx"
 *
 * Returns "0.0.0.xxx" if the input is missing or unparseable —
 * we never want this function to throw.
 */
export function maskIp(ip) {
    if (!ip || typeof ip !== "string")
        return "0.0.0.xxx";
    // Strip any port suffix (e.g. "82.12.34.56:443" → "82.12.34.56")
    const cleanIp = ip.split(",")[0].trim().split(":").length > 2
        ? ip.split(",")[0].trim() // probably IPv6
        : ip.split(",")[0].trim().split(":")[0]; // IPv4 with port
    // IPv4 detection (4 octets separated by dots)
    const ipv4Match = cleanIp.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/);
    if (ipv4Match) {
        return `${ipv4Match[1]}.${ipv4Match[2]}.${ipv4Match[3]}.xxx`;
    }
    // IPv6 — keep first two groups, mask the rest
    if (cleanIp.includes(":")) {
        const parts = cleanIp.split(":");
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
export function extractClientIp(headers) {
    // Headers may be a Headers object or plain object depending on runtime
    const get = (name) => {
        if (typeof headers.get === "function") {
            return headers.get(name) ?? "";
        }
        const obj = headers;
        return obj[name] ?? obj[name.toLowerCase()] ?? "";
    };
    // X-Forwarded-For format: "client, proxy1, proxy2" — first entry is the real client
    const xff = get("x-forwarded-for") || get("X-Forwarded-For");
    if (xff) {
        return xff.split(",")[0].trim();
    }
    // Fallbacks
    return (get("x-real-ip") ||
        get("x-client-ip") ||
        get("cf-connecting-ip") ||
        "0.0.0.0");
}
//# sourceMappingURL=ip-mask.js.map