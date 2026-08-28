import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

import { build } from "vite";

const root = resolve(import.meta.dirname, "..");
const mainEntry = pathToFileURL(resolve(root, "dist/index.mjs")).href;
const temporary = await mkdtemp(join(tmpdir(), "chronolizer-tree-shaking-"));
const cases = [
  {
    name: "filter-only",
    imported: "formatFilter",
    forbidden: ["chronolizer.parseNatural", "chronolizer.formatNatural", "january", "styczeń"],
  },
  {
    name: "parse-only",
    imported: "parseNatural",
    forbidden: ["chronolizer.formatNatural", "january", "styczeń"],
  },
];

let failed = false;
try {
  for (const testCase of cases) {
    const entry = join(temporary, `${testCase.name}.mjs`);
    const output = join(temporary, testCase.name);
    await writeFile(
      entry,
      `import { ${testCase.imported} } from ${JSON.stringify(mainEntry)};\nconsole.log(${testCase.imported});\n`,
    );
    await build({
      configFile: false,
      logLevel: "silent",
      build: {
        emptyOutDir: true,
        lib: { entry, formats: ["es"], fileName: testCase.name },
        minify: true,
        outDir: output,
      },
    });
    const files = await readdir(output);
    const javascript = files.filter((file) => file.endsWith(".js"));
    const sources = await Promise.all(
      javascript.map((file) => readFile(join(output, file), "utf8")),
    );
    const source = sources.join("\n");
    const retained = testCase.forbidden.filter((marker) => source.includes(marker));
    console.log(`${testCase.name}: ${gzipSync(source).byteLength} gzip bytes`);
    if (retained.length > 0) {
      console.error(`${testCase.name} retains unused code: ${retained.join(", ")}`);
      failed = true;
    }
  }
} finally {
  await rm(temporary, { force: true, recursive: true });
}

if (failed) process.exitCode = 1;
