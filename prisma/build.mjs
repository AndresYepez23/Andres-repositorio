import { cp, copyFile, mkdir, rm, readFile, writeFile } from "node:fs/promises";
import { generateSeoPages } from "./seo/generate.mjs";
// Abort publication if Core can no longer discover or safely chain its tools.
import "./tests/core-agent-routing.test.mjs";
import "./tests/cloudflare-whisper.test.mjs";

const output = new URL("./dist/", import.meta.url);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const file of ["index.html", "styles.css", "aurora-system.css", "_headers", "privacy.html", "manifest.webmanifest"]) {
  await copyFile(new URL("./" + file, import.meta.url), new URL("./dist/" + file, import.meta.url));
}

await copyFile(new URL("./seo/landing.css", import.meta.url), new URL("./dist/seo.css", import.meta.url));

for (const dir of ["src", "assets"]) {
  await cp(new URL("./" + dir, import.meta.url), new URL("./dist/" + dir, import.meta.url), { recursive: true });
}

// Cache version changes on every deploy; prevent stale PWA shells and exclude API/auth responses.
const sw = await readFile(new URL("./sw.js", import.meta.url), "utf8");
await writeFile(new URL("./dist/sw.js", import.meta.url), sw.replace("__BUILD_VERSION__", Date.now().toString(36)));
await generateSeoPages(output);
// Validate the generated static HTML as part of the Cloudflare deployment gate.
await import("./tests/seo-build.test.mjs");
await import("./tests/seo-capabilities.test.mjs");
await import("./tests/performance-layout.test.mjs");
console.log("PRISMA build complete: dist/ contains the public application, generated SEO landings and PWA shell.");
