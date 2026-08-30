import { spawnSync } from "node:child_process";
import { PerformanceObserver } from "node:perf_hooks";

import { ManagedRuntime } from "effect";

import { correctWhitespaceSeparatedText, parseNatural, suggestNatural } from "../dist/index.mjs";
import { EnglishContribution, EnglishLanguageLayer } from "../dist/locales/en.mjs";

const inputs = {
  strict: [
    "today",
    "last month",
    "January 2025",
    "from January 2025 to March 2025",
    "year to date",
  ],
  tolerant: ["januray of last yaer", "last mnoth", "januray 2025"],
  suggest: ["last m", "jan", "from jan", "year to d", "january 202"],
};
const correctionVocabulary = [...new Set(EnglishContribution.vocabulary)];
const runtime = ManagedRuntime.make(EnglishLanguageLayer);
const cases = {
  correction: {
    iterations: 10_000,
    operation: () => {
      correctWhitespaceSeparatedText("januray of last yaer", correctionVocabulary);
    },
  },
  "strict parse": {
    iterations: 5_000,
    operation: (index) =>
      runtime.runPromise(
        parseNatural(inputs.strict[index % inputs.strict.length] ?? "today", { locale: "en" }),
      ),
  },
  "tolerant parse": {
    iterations: 2_000,
    operation: (index) =>
      runtime.runPromise(
        parseNatural(inputs.tolerant[index % inputs.tolerant.length] ?? "januray 2025", {
          locale: "en",
          typoMode: "tolerant",
        }),
      ),
  },
  suggestions: {
    iterations: 1_000,
    operation: (index) =>
      runtime.runPromise(
        suggestNatural(inputs.suggest[index % inputs.suggest.length] ?? "last m", {
          locale: "en",
          limit: 10,
        }),
      ),
  },
};

const mebibytes = (bytes) => bytes / 1024 / 1024;
const argument = (name) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
};

const runCase = async (name) => {
  const benchmark = cases[name];
  if (benchmark === undefined) throw new Error(`Unknown benchmark: ${name}`);

  const garbageCollections = [];
  const observer = new PerformanceObserver((list) => {
    garbageCollections.push(...list.getEntries());
  });
  observer.observe({ entryTypes: ["gc"] });
  const warmupIterations = Math.min(200, Math.ceil(benchmark.iterations / 10));
  for (let index = 0; index < warmupIterations; index += 1) {
    await benchmark.operation(index);
  }
  globalThis.gc?.();
  await new Promise((resolve) => setImmediate(resolve));
  garbageCollections.length = 0;
  const before = process.memoryUsage();
  const start = performance.now();
  for (let index = 0; index < benchmark.iterations; index += 1) {
    await benchmark.operation(index);
  }
  const duration = performance.now() - start;
  await new Promise((resolve) => setImmediate(resolve));
  observer.disconnect();
  const garbageCollectionDuration = garbageCollections.reduce(
    (total, entry) => total + entry.duration,
    0,
  );
  const peak = process.resourceUsage().maxRSS * 1024;
  globalThis.gc?.();
  const after = process.memoryUsage();
  await runtime.dispose();

  return {
    name,
    iterations: benchmark.iterations,
    opsPerSecond: Math.round((benchmark.iterations / duration) * 1000),
    microsecondsPerOperation: Number(((duration * 1000) / benchmark.iterations).toFixed(2)),
    retainedHeapKibibytes: Math.round((after.heapUsed - before.heapUsed) / 1024),
    garbageCollections: garbageCollections.length,
    garbageCollectionMilliseconds: Number(garbageCollectionDuration.toFixed(2)),
    peakRssMebibytes: Number(mebibytes(peak).toFixed(2)),
  };
};

const selectedCase = argument("--case");
if (selectedCase !== undefined) {
  console.log(JSON.stringify(await runCase(selectedCase)));
} else {
  const rows = Object.keys(cases).map((name) => {
    const result = spawnSync(
      process.execPath,
      ["--expose-gc", import.meta.filename, "--case", name],
      { encoding: "utf8" },
    );
    if (result.status !== 0) {
      process.stderr.write(result.stderr);
      throw new Error(`Benchmark failed: ${name}`);
    }
    return JSON.parse(result.stdout);
  });
  console.table(
    rows.map((row) => ({
      benchmark: row.name,
      iterations: row.iterations,
      "ops/s": row.opsPerSecond,
      "µs/op": row.microsecondsPerOperation,
      "retained heap KiB": row.retainedHeapKibibytes,
      "GC runs": row.garbageCollections,
      "GC ms": row.garbageCollectionMilliseconds,
      "peak RSS MiB": row.peakRssMebibytes,
    })),
  );
}
