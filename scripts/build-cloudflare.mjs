import { cp, mkdir, rm } from "node:fs/promises";

const outputDir = new URL("../dist/", import.meta.url);
const rootDir = new URL("../", import.meta.url);

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

for (const entry of ["index.html", "app.js", "styles.css"]) {
  await cp(new URL(entry, rootDir), new URL(entry, outputDir));
}

await cp(new URL("assets/", rootDir), new URL("assets/", outputDir), { recursive: true });
