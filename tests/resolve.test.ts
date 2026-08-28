import { describe, expect, it } from "@effect/vitest";
import { DateTime, Effect } from "effect";
import { TestClock } from "effect/testing";

import { parseFilter } from "../src/filter/codec.ts";
import type { DateFilter } from "../src/filter/schema.ts";
import { resolve } from "../src/resolve/resolve.ts";
import type { ResolvedDateRange } from "../src/resolve/schema.ts";

const setNow = (iso: string) => TestClock.setTime(DateTime.toEpochMillis(DateTime.makeUnsafe(iso)));

const resolveFilter = Effect.fn(function* (filter: DateFilter, zone: string) {
  const range = yield* parseFilter(filter);
  return yield* resolve(range).pipe(DateTime.withCurrentZoneNamed(zone));
});

const formatEndpoint = (value: DateTime.Zoned | undefined) =>
  value === undefined ? undefined : DateTime.formatIsoZoned(value);

const rangeDuration = (range: ResolvedDateRange) =>
  range.lower === undefined || range.upper === undefined
    ? undefined
    : DateTime.toEpochMillis(range.upper.value) - DateTime.toEpochMillis(range.lower.value);

describe("date-range resolution", () => {
  it.effect(
    "resolves year to date from one controlled clock reading",
    Effect.fn(function* () {
      yield* setNow("2025-06-15T12:00:00.000Z");
      const range = yield* resolveFilter({ gte: "now/y", lte: "now" }, "Europe/Berlin");
      expect(formatEndpoint(range.lower?.value)).toBe(
        "2025-01-01T00:00:00.000+01:00[Europe/Berlin]",
      );
      expect(formatEndpoint(range.upper?.value)).toBe(
        "2025-06-15T14:00:00.000+02:00[Europe/Berlin]",
      );
    }),
  );

  it.effect(
    "constructs fixed dates at civil midnight in the supplied zone",
    Effect.fn(function* () {
      const range = yield* resolveFilter(
        { gte: "2025-01-01", lt: "2025-02-01" },
        "America/New_York",
      );
      expect(formatEndpoint(range.lower?.value)).toBe(
        "2025-01-01T00:00:00.000-05:00[America/New_York]",
      );
      expect(formatEndpoint(range.upper?.value)).toBe(
        "2025-02-01T00:00:00.000-05:00[America/New_York]",
      );
    }),
  );

  it.effect(
    "always starts weeks on Monday",
    Effect.fn(function* () {
      yield* setNow("2025-04-16T10:00:00.000Z");
      const range = yield* resolveFilter({ gte: "now/w", lt: "now/w+1w" }, "UTC");
      expect(formatEndpoint(range.lower?.value)).toBe("2025-04-14T00:00:00.000+00:00[UTC]");
    }),
  );

  it.effect.each([
    ["2025-02-20T10:00:00.000Z", "2025-01-01", "2025-04-01"],
    ["2025-05-20T10:00:00.000Z", "2025-04-01", "2025-07-01"],
    ["2025-09-20T10:00:00.000Z", "2025-07-01", "2025-10-01"],
    ["2025-12-20T10:00:00.000Z", "2025-10-01", "2026-01-01"],
  ] as const)(
    "maps quarter containing %s from %s through %s",
    Effect.fn(function* (testCase) {
      const [now, lower, upper] = testCase;
      yield* setNow(now);
      const range = yield* resolveFilter({ gte: "now/q", lt: "now/q+1q" }, "UTC");
      expect(formatEndpoint(range.lower?.value)).toBe(`${lower}T00:00:00.000+00:00[UTC]`);
      expect(formatEndpoint(range.upper?.value)).toBe(`${upper}T00:00:00.000+00:00[UTC]`);
    }),
  );

  it.effect(
    "uses calendar days across a daylight-saving transition",
    Effect.fn(function* () {
      yield* setNow("2025-03-30T12:00:00.000Z");
      const range = yield* resolveFilter({ gte: "now/d", lt: "now/d+1d" }, "Europe/Berlin");
      expect(rangeDuration(range)).toBe(23 * 60 * 60 * 1_000);
    }),
  );

  it.effect(
    "uses the supplied zone to select the current calendar day",
    Effect.fn(function* () {
      yield* setNow("2025-01-01T00:30:00.000Z");
      const newYork = yield* resolveFilter({ gte: "now/d", lt: "now/d+1d" }, "America/New_York");
      const tokyo = yield* resolveFilter({ gte: "now/d", lt: "now/d+1d" }, "Asia/Tokyo");
      expect(formatEndpoint(newYork.lower?.value)).toBe(
        "2024-12-31T00:00:00.000-05:00[America/New_York]",
      );
      expect(formatEndpoint(tokyo.lower?.value)).toBe("2025-01-01T00:00:00.000+09:00[Asia/Tokyo]");
    }),
  );

  it.effect(
    "uses 25 calendar hours across the autumn daylight-saving transition",
    Effect.fn(function* () {
      yield* setNow("2025-10-26T12:00:00.000Z");
      const range = yield* resolveFilter({ gte: "now/d", lt: "now/d+1d" }, "Europe/Berlin");
      expect(rangeDuration(range)).toBe(25 * 60 * 60 * 1_000);
    }),
  );

  it.effect(
    "uses compatible disambiguation for a civil-midnight gap",
    Effect.fn(function* () {
      const range = yield* resolveFilter(
        { gte: "2018-11-04", lt: "2018-11-05" },
        "America/Sao_Paulo",
      );
      expect(formatEndpoint(range.lower?.value)).toBe(
        "2018-11-04T01:00:00.000-02:00[America/Sao_Paulo]",
      );
      expect(formatEndpoint(range.upper?.value)).toBe(
        "2018-11-05T00:00:00.000-02:00[America/Sao_Paulo]",
      );
    }),
  );

  it.effect(
    "preserves inclusive and exclusive bound relations",
    Effect.fn(function* () {
      const range = yield* resolveFilter({ gt: "2025-01-01", lte: "2025-01-02" }, "UTC");
      expect(range.lower?._tag).toBe("GreaterThan");
      expect(range.upper?._tag).toBe("LessThanOrEqual");
      expect(formatEndpoint(range.lower?.value)).toBe("2025-01-01T00:00:00.000+00:00[UTC]");
      expect(formatEndpoint(range.upper?.value)).toBe("2025-01-02T00:00:00.000+00:00[UTC]");
    }),
  );

  it.effect(
    "preserves an absent open-range endpoint",
    Effect.fn(function* () {
      const range = yield* resolveFilter({ lt: "2025-01-01" }, "UTC");
      expect(range.lower).toBeUndefined();
      expect(range.upper?._tag).toBe("LessThan");
    }),
  );

  it.effect(
    "rejects a reversed resolved interval",
    Effect.fn(function* () {
      const error = yield* Effect.flip(
        resolveFilter({ gte: "2025-02-01", lt: "2025-01-01" }, "UTC"),
      );
      expect(error._tag).toBe("ResolutionError");
      expect(error.message).toBe("The lower range endpoint must be before the upper endpoint");
    }),
  );
});
