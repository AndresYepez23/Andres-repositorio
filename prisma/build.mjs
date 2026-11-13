import { cp, copyFile, mkdir, rm, readFile, writeFile } from "node:fs/promises";
import { generateSeoPages } from "./seo/generate.mjs";
import { generateInternationalPages } from "./seo/generate-international.mjs";
// Abort publication if Core can no longer discover or safely chain its tools.
import "./tests/core-agent-routing.test.mjs";
import "./tests/core-model-session.test.mjs";
import "./tests/conversation-history.test.mjs";
import "./tests/provider-orchestration.test.mjs";
import "./tests/core-intelligence-benchmark.test.mjs";
import "./tests/developer-api.test.mjs";
import "./tests/cloudflare-whisper.test.mjs";
import "./tests/welcome-email.test.mjs";
import "./tests/settings-ui.test.mjs";
import "./tests/core-mobile-prism-layout.test.mjs";
import "./tests/i18n.test.mjs";

const output = new URL("./dist/", import.meta.url);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const file of ["index.html", "styles.css", "aurora-system.css", "_headers", "privacy.html", "manifest.webmanifest", "ads.txt"]) {
  await copyFile(new URL("./" + file, import.meta.url), new URL("./dist/" + file, import.meta.url));
}

await import("./tests/ads-txt.test.mjs");

await copyFile(new URL("./seo/landing.css", import.meta.url), new URL("./dist/seo.css", import.meta.url));

for (const dir of ["src", "assets"]) {
  await cp(new URL("./" + dir, import.meta.url), new URL("./dist/" + dir, import.meta.url), { recursive: true });
}

// Stamp the deployed bridge and public build manifest with the same immutable
// generation. An idle PWA can detect stale JS and reload before claiming jobs.
const deploymentBuild = /^[a-f0-9]{7,40}$/i.test(process.env.CF_PAGES_COMMIT_SHA || "")
  ? process.env.CF_PAGES_COMMIT_SHA : Date.now().toString(36);
const bridgePath = new URL("./dist/src/developer-bridge.js", import.meta.url);
const bridgeSource = await readFile(bridgePath, "utf8");
if(!bridgeSource.includes("__PRISMA_RUNTIME_BUILD_ID__"))
  throw new Error("Prisma Developer bridge lost its build version token.");
await writeFile(bridgePath, bridgeSource.replace("__PRISMA_RUNTIME_BUILD_ID__", deploymentBuild));
await writeFile(new URL("./dist/prisma-build.json", import.meta.url),
  JSON.stringify({ build: deploymentBuild, engineGeneration: "core-precision-v3" }));
const sw = await readFile(new URL("./sw.js", import.meta.url), "utf8");
await writeFile(new URL("./dist/sw.js", import.meta.url), sw.replace("__BUILD_VERSION__", deploymentBuild));
await generateSeoPages(output);
await generateInternationalPages(output);
// Validate the generated static HTML as part of the Cloudflare deployment gate.
await import("./tests/seo-build.test.mjs");
await import("./tests/seo-international.test.mjs");
await import("./tests/seo-capabilities.test.mjs");
await import("./tests/performance-layout.test.mjs");
console.log("PRISMA build complete: dist/ contains the public application, generated SEO landings and PWA shell.");
