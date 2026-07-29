import { readFileSync, writeFileSync } from "node:fs";
import { minify } from "terser";

const src = readFileSync("snippet/src/tracker.js", "utf8");

const targets = [
  { url: "https://adleak-functions-ajbraxdhf4hwgudf.westeurope-01.azurewebsites.net/api/ingest", out: "public/tracker.js" },
  { url: "https://adleak-functions-staging-auhmeda0bce7fnak.westeurope-01.azurewebsites.net/api/ingest", out: "public/tracker-staging.js" },
];

for (const t of targets) {
  const withUrl = src.replace(/__INGEST_URL__/g, t.url);
  const result = await minify(withUrl, {
    compress: { passes: 3, drop_console: true, unsafe: false },
    mangle: { reserved: ["sessionStorage", "navigator", "document", "window"] },
    format: { comments: false, ascii_only: true },
    ecma: 2017,
  });
  if (result.error) { console.error(t.out, result.error); process.exit(1); }
  writeFileSync(t.out, result.code, "utf8");
  console.log("Wrote", t.out, "—", result.code.length, "bytes");
}
