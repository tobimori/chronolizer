import { readFile, writeFile } from "node:fs/promises";

const [basePath, headPath, reportPath = "bundle-size.md"] = process.argv.slice(2);
if (basePath === undefined || headPath === undefined) {
  throw new Error("Usage: compare-bundle-size <base.json> <head.json> [report.md]");
}

const readReport = async (path) => JSON.parse(await readFile(path, "utf8"));
const base = await readReport(basePath);
const head = await readReport(headPath);
const rows = [
  "## Bundle size",
  "",
  "Transitive ESM graph size after gzip:",
  "",
  "| Entry | Base | Pull request | Change | Budget |",
  "| --- | ---: | ---: | ---: | --- |",
];
let failed = false;

for (const [entry, current] of Object.entries(head)) {
  const previous = base[entry];
  if (previous === undefined) {
    rows.push(`| \`${entry}\` | new | ${current.gzipBytes} B | new | ✅ |`);
    continue;
  }
  const change = current.gzipBytes - previous.gzipBytes;
  const percent = previous.gzipBytes === 0 ? 0 : (change / previous.gzipBytes) * 100;
  const allowed = Math.max(512, Math.ceil(previous.gzipBytes * 0.05));
  const withinGrowth = change <= allowed;
  const withinMaximum = current.gzipBytes <= current.maximum;
  const passed = withinGrowth && withinMaximum;
  if (!passed) failed = true;
  const sign = change > 0 ? "+" : "";
  rows.push(
    `| \`${entry}\` | ${previous.gzipBytes} B | ${current.gzipBytes} B | ${sign}${change} B (${sign}${percent.toFixed(1)}%) | ${passed ? "✅" : "❌"} |`,
  );
}

rows.push(
  "",
  "Each entry can grow by at most the larger of 512 gzip bytes or 5%. Absolute entry limits and capability-isolation checks also apply.",
);
if (failed) rows.push("", "❌ The bundle-size budget failed.");

await writeFile(reportPath, `${rows.join("\n")}\n`);
console.log(rows.join("\n"));
if (failed) process.exitCode = 1;
