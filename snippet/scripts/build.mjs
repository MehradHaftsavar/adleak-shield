// =============================================================================
// AdLeak Shield — Tracker Build Script
// snippet/scripts/build.mjs
//
// WHAT THIS DOES:
// 1. Reads the source tracker.js
// 2. For EACH target (production and staging):
//      - Replaces __INGEST_URL__ with that environment's ingest URL
//      - Minifies it with terser (removes whitespace, shortens variable names)
//      - Validates the result is under 6KB (6144 bytes)
//      - Writes it to public/
// 3. Generates a SHA-384 SRI hash — production only
//
// WHY BOTH TARGETS IN ONE RUN:
// This script used to write a single hardcoded path, public/tracker.js. The
// staging file could therefore only be produced by building with the staging
// URL, copying the result to tracker-staging.js by hand, then building AGAIN
// with the production URL to restore tracker.js.
//
// Three steps, done from memory, every time the tracker changed. Miss the copy
// and staging silently tests old code. Miss the final rebuild and the file
// every customer loads points at the STAGING backend — their live traffic
// quietly flows into the wrong environment.
//
// Building both from one source read makes divergence impossible rather than
// merely detectable, which is the only reason to touch a working script.
//
// WHY MINIFY?
// The source file is ~27KB. Minified, it's under 6KB.
// The 6KB hard limit comes from Core Web Vitals — anything larger noticeably
// slows down a customer's website on mobile.
//
// HOW TO RUN:
//   $env:TRACKER_INGEST_URL         = 'https://<prod>/api/ingest'
//   $env:TRACKER_INGEST_URL_STAGING = 'https://<staging>/api/ingest'
//   node snippet/scripts/build.mjs
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
const SIZE_LIMIT_BYTES = 6144; // 6KB hard limit

// Only production gets an integrity file. Customers put that hash in their
// <script integrity="..."> tag; nobody does that for a staging build, and a
// second hash file would just be another thing to keep in sync.
const TARGETS = [
  {
    name: "production",
    envVar: "TRACKER_INGEST_URL",
    outFile: "tracker.js",
    writeIntegrity: true,
  },
  {
    name: "staging",
    envVar: "TRACKER_INGEST_URL_STAGING",
    outFile: "tracker-staging.js",
    writeIntegrity: false,
  },
];

// =============================================================================
// 1. VALIDATE ENVIRONMENT UP FRONT
//
// Checked before any work starts, and ALL missing variables are reported at
// once — finding out about the second one only after fixing the first is a
// waste of a build. Both are required deliberately: making staging optional
// would reintroduce exactly the drift this script exists to prevent.
// =============================================================================
const missing = TARGETS.filter((t) => !process.env[t.envVar]);

if (missing.length > 0) {
  console.error("[Build] ERROR: required environment variables are not set:");
  for (const t of missing) {
    console.error(`[Build]   ${t.envVar}  (${t.name})`);
  }
  console.error("[Build]");
  console.error("[Build] Set them before building, e.g.:");
  console.error(
    "[Build]   $env:TRACKER_INGEST_URL = 'https://adleak-functions-ajbraxdhf4hwgudf.westeurope-01.azurewebsites.net/api/ingest'"
  );
  console.error(
    "[Build]   $env:TRACKER_INGEST_URL_STAGING = 'https://adleak-functions-staging-auhmeda0bce7fnak.westeurope-01.azurewebsites.net/api/ingest'"
  );
  console.error("[Build]   node snippet/scripts/build.mjs");
  process.exit(1);
}

// =============================================================================
// 2. READ THE SOURCE — once, shared by every target
// =============================================================================
const source = readFileSync(SRC, "utf8");
console.log(`[Build] Source size: ${source.length} bytes`);

mkdirSync(OUT_DIR, { recursive: true });

// =============================================================================
// 3. BUILD EACH TARGET
// =============================================================================
for (const target of TARGETS) {
  const ingestUrl = process.env[target.envVar];

  console.log("");
  console.log(`[Build] --- ${target.name} ---`);

  // ---- Inject the ingest URL -------------------------------------------
  // Never ship a tracker with __INGEST_URL__ still in it.
  const withUrl = source.replace(/__INGEST_URL__/g, ingestUrl);

  // ---- Minify with terser ----------------------------------------------
  // Aggressive settings to maximise size savings while keeping the code working.
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
    console.error(`[Build] Minification failed for ${target.name}:`, result.error);
    process.exit(1);
  }

  const minified = result.code ?? "";
  console.log(`[Build] Minified size: ${minified.length} bytes`);

  // ---- Enforce the 6KB limit -------------------------------------------
  // Checked per target. The staging URL is longer than the production one, so
  // staging is always the larger file — it can breach the limit while
  // production still fits, and that must fail the build too.
  if (minified.length > SIZE_LIMIT_BYTES) {
    console.error(
      `[Build] ERROR: ${target.name} tracker is ${minified.length} bytes, exceeds 6KB limit (${SIZE_LIMIT_BYTES} bytes).`
    );
    console.error(
      `[Build] Reduce features or simplify the source before re-running.`
    );
    process.exit(1);
  }

  const headroom = SIZE_LIMIT_BYTES - minified.length;
  const pctUsed = ((minified.length / SIZE_LIMIT_BYTES) * 100).toFixed(1);
  console.log(`[Build] Size budget: ${pctUsed}% used (${headroom} bytes free)`);

  // ---- Write the output file -------------------------------------------
  const outPath = resolve(OUT_DIR, target.outFile);
  writeFileSync(outPath, minified, "utf8");
  console.log(`[Build] Wrote: ${outPath}`);

  // ---- SRI hash (production only) --------------------------------------
  // Customers can use this hash in their <script integrity="..."> tag to verify
  // the file hasn't been tampered with. Best-practice security feature.
  if (target.writeIntegrity) {
    const hash = createHash("sha384").update(minified).digest("base64");
    const integrity = `sha384-${hash}`;
    console.log(`[Build] SRI integrity: ${integrity}`);

    writeFileSync(resolve(OUT_DIR, "tracker.integrity.txt"), integrity, "utf8");
  }
}

console.log("");
console.log(`[Build] Done — ${TARGETS.length} targets built.`);
