import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Google AdSense ads.txt is published at the site root", async () => {
  const content = await readFile(new URL("../dist/ads.txt", import.meta.url), "utf8");
  assert.equal(
    content.trim(),
    "google.com, pub-9115030938315202, DIRECT, f08c47fec0942fa0"
  );
});
