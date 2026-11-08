import { cp, copyFile, mkdir, rm } from "node:fs/promises";

const output = new URL("./dist/", import.meta.url);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const file of ["index.html", "styles.css", "_headers"]) {
  await copyFile(new URL("./" + file, import.meta.url), new URL("./dist/" + file, import.meta.url));
}

for (const dir of ["src", "assets"]) {
  await cp(new URL("./" + dir, import.meta.url), new URL("./dist/" + dir, import.meta.url), { recursive: true });
}

console.log("PRISMA build complete: dist/ contains the public application.");
