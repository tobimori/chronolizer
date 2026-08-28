import { readFile, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { dirname, relative, resolve } from "node:path";

const argument = (name) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
};

const dist = resolve(argument("--dist") ?? "dist");
const reportPath = argument("--json");
const allowMissing = process.argv.includes("--allow-missing");
const limits = new Map([
  ["ast.mjs", 8_000],
  ["parse.mjs", 14_000],
  ["format.mjs", 8_000],
  ["locales/en.mjs", 24_000],
  ["locales/de.mjs", 28_000],
  ["locales/es.mjs", 28_000],
  ["locales/fr.mjs", 28_000],
  ["locales/default.mjs", 24_000],
  ["index.mjs", 32_000],
]);

const importsOf = (source) =>
  [...source.matchAll(/(?:from\s+|import\s*)["'](\.\.?\/.+?\.mjs)["']/gu)].map(
    (match) => match[1] ?? "",
  );

const moduleGraph = async (entry, modules = new Map()) => {
  const path = resolve(dist, entry);
  if (modules.has(path)) return modules;
  const source = await readFile(path, "utf8");
  modules.set(path, source);
  for (const specifier of importsOf(source)) {
    await moduleGraph(relative(dist, resolve(dirname(path), specifier)), modules);
  }
  return modules;
};

const forbiddenPrefixes = new Map([
  ["ast.mjs", ["registry-", "suggest-", "suggestion-", "format-"]],
  ["parse.mjs", ["format-"]],
  ["format.mjs", ["suggest-", "suggestion-"]],
  ["locales/default.mjs", ["locales/de.mjs", "locales/es.mjs", "locales/fr.mjs"]],
  ["index.mjs", ["locales/de.mjs", "locales/es.mjs", "locales/fr.mjs"]],
]);

const report = {};
let failed = false;
for (const [entry, maximum] of limits) {
  let graph;
  try {
    graph = await moduleGraph(entry);
  } catch (error) {
    if (allowMissing && error?.code === "ENOENT") continue;
    throw error;
  }
  const modules = [...graph.keys()].map((path) => relative(dist, path));
  const gzipBytes = [...graph.values()].reduce(
    (total, source) => total + gzipSync(source).byteLength,
    0,
  );
  report[entry] = { gzipBytes, modules: modules.length, maximum };
  console.log(`${entry}: ${gzipBytes} gzip bytes across ${modules.length} modules`);
  if (gzipBytes > maximum) {
    console.error(`${entry} exceeds its ${maximum} gzip-byte limit`);
    failed = true;
  }
  for (const prefix of forbiddenPrefixes.get(entry) ?? []) {
    if (
      modules.some(
        (module) => module.startsWith(prefix) || module.split("/").at(-1)?.startsWith(prefix),
      )
    ) {
      console.error(`${entry} unexpectedly loads a ${prefix} module`);
      failed = true;
    }
  }
}

if (reportPath !== undefined) {
  await writeFile(reportPath, `${JSON.stringify(report, undefined, 2)}\n`);
}
if (failed) process.exitCode = 1;
