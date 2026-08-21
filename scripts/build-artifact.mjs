// Bundles the app into ONE self-contained HTML file, for viewing it in a browser
// without installing anything. Run: npm run build:artifact
//
// The desktop build code-splits; this one does not. Everything — CSS, every route
// chunk — is inlined so the page travels as a single document with no fetches.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "dist-artifact");

execFileSync("npx", ["vite", "build", "--config", "vite.artifact.config.ts"], {
  cwd: root,
  stdio: "inherit",
});

const css = fs.readFileSync(path.join(out, "app.css"), "utf8");
// A literal `</script` inside the bundle would close the inline tag early.
const js = fs.readFileSync(path.join(out, "app.js"), "utf8").replace(/<\/script/gi, "<\\/script");

const file = path.join(out, "meridian.html");
fs.writeFileSync(
  file,
  `<title>Meridian</title>\n<style>\n${css}\n</style>\n<div id="root"></div>\n<script type="module">\n${js}\n</script>\n`,
);

console.log(`\nmeridian.html  ${(fs.statSync(file).size / 1024).toFixed(0)} kB  →  ${file}`);
