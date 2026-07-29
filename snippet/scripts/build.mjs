// =============================================================================
// AdLeak Shield — Tracker Build Script
// snippet/scripts/build.mjs
//
// WHAT THIS DOES:
// 1. Reads the source tracker.js
// 2. Minifies it with terser (removes whitespace, shortens variable names)
// 3. Replaces __INGEST_URL__ with the real URL from environment variables
// 4. Validates the final file is under 6KB (6144 bytes)
// 5. Writes it to public/tracker.js so it's served by Next.js
// 6. Generates a SHA-256 hash of the file for SRI (Subresource Integrity)
//
// WHY MINIFY?
// The source file is ~7KB. Minified, it should be ~3KB.
// The 6KB hard limit comes from Core Web Vitals — anything larger noticeably
// slows down a customer's website on mobile.
//
// HOW TO RUN:
// node snippet/scripts/build.mjs
// =============================================================================

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { minify } from "terser";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ROOT = resolve(__dirname, "../..");
const SRC = resolve(ROOT, "snippet/src/tracker.js");
const OUT_DIR = resolve(ROOT, "public");
const OUT = resolve(OUT_DIR, "tracker.js");
const SIZE_LIMIT_BYTES = 6144; // 6KB hard limit

// =============================================================================
// 1. READ THE SOURCE
// =============================================================================
const source = readFileSync(SRC, "utf8");
console.log(`[Build] Source size: ${source.length} bytes`);

// =============================================================================
// 2. INJECT THE INGEST URL
// We require this at build time — never ship a tracker with __INGEST_URL__ in it.
// =============================================================================
const ingestUrl = process.env.TRACKER_INGEST_URL;
if (!ingestUrl) {
  console.error(
    "[Build] ERROR: TRACKER_INGEST_URL environment variable is not set."
  );
  console.error(
    "[Build] Set it before building, e.g.:"
  );
  console.error(
    "[Build]   $env:TRACKER_INGEST_URL = 'https://adleak-functions.azurewebsites.net/api/ingest'"
  );
  console.error(
    "[Build]   node snippet/scripts/build.mjs"
  );
  process.exit(1);
}

const withUrl = source.replace(/__INGEST_URL__/g, ingestUrl);

// =============================================================================
// 3. MINIFY WITH TERSER
// Aggressive settings to maximise size savings while keeping the code working.
// =============================================================================
const result = await minify(withUrl, {
  compress: {
    passes: 3,           // Run compression 3 times for maximum reduction
    drop_console: true,  // Remove any console.log if present
    pure_funcs: [],
    unsafe: false,       // Stay safe — don't enable unsafe transforms
  },
  mangle: {
    // Shorten variable names but preserve property names
    // (in case the host site uses any of them)
    reserved: ["sessionStorage", "navigator", "document", "window"],
  },
  format: {
    comments: false,     // Strip all comments from output
    ascii_only: true,    // Use \uXXXX escapes for non-ASCII chars
  },
  ecma: 2017,            // Target ES2017 (broad browser support)
});

if (result.error) {
  console.error("[Build] Minification failed:", result.error);
  process.exit(1);
}

const minified = result.code ?? "";
console.log(`[Build] Minified size: ${minified.length} bytes`);

// =============================================================================
// 4. ENFORCE THE 6KB LIMIT
// If we breach it, fail the build immediately. The PRD is non-negotiable.
// =============================================================================
if (minified.length > SIZE_LIMIT_BYTES) {
  console.error(
    `[Build] ERROR: Tracker is ${minified.length} bytes, exceeds 6KB limit (${SIZE_LIMIT_BYTES} bytes).`
  );
  console.error(
    `[Build] Reduce features or simplify the source before re-running.`
  );
  process.exit(1);
}

const headroom = SIZE_LIMIT_BYTES - minified.length;
const pctUsed = ((minified.length / SIZE_LIMIT_BYTES) * 100).toFixed(1);
console.log(
  `[Build] Size budget: ${pctUsed}% used (${headroom} bytes free)`
);

// =============================================================================
// 5. WRITE THE OUTPUT FILE
// =============================================================================
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, minified, "utf8");
console.log(`[Build] Wrote: ${OUT}`);

// =============================================================================
// 6. GENERATE SRI HASH
// Customers can use this hash in their <script integrity="..."> tag to verify
// the file hasn't been tampered with. Best-practice security feature.
// =============================================================================
const hash = createHash("sha384").update(minified).digest("base64");
const integrity = `sha384-${hash}`;
console.log(`[Build] SRI integrity: ${integrity}`);

writeFileSync(
  resolve(OUT_DIR, "tracker.integrity.txt"),
  integrity,
  "utf8"
);

console.log(`[Build] Done.`);
