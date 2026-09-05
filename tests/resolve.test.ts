import { describe, expect, it } from "@effect/vitest";
import { DateTime, Effect, Schema } from "effect";
import { TestClock } from "effect/testing";

import { formatFilter, parseFilter } from "../src/filter/codec.ts";
import type { DateFilter } from "../src/filter/schema.ts";
import { EnglishLanguageLayer } from "../src/locales/en.ts";
import { parseNatural } from "../src/natural/parse.ts";
import { resolve } from "../src/resolve/resolve.ts";
import {
  ResolutionError,
  ResolvedGreaterThan,
  ResolvedLessThan,
  ResolvedLessThanOrEqual,
} from "../src/resolve/schema.ts";
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
    ["2025-05-31T10:00:00.000Z", "2025-04-01", "2025-07-01"],
    ["2025-08-31T10:00:00.000Z", "2025-07-01", "2025-10-01"],
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

  it.effect.each([
    ["2025-01-31||+1M+1M", "2025-03-28"],
    ["2025-01-31||+1M-1M", "2025-01-28"],
    ["2025-01-31||+1q-1q", "2025-01-30"],
    ["2024-02-29||+1y-1y", "2024-02-28"],
  ] as const)(
    "resolves calendar shifts from left to right in %s",
    Effect.fn(function* ([expression, expected]) {
      const range = yield* resolveFilter({ gte: expression }, "UTC");
      expect(formatEndpoint(range.lower?.value)).toBe(`${expected}T00:00:00.000+00:00[UTC]`);
    }),
  );

  it.effect.each([
    ["2025-03-29T01:30:00.000Z", "now+1d-1d", "2025-03-29T03:30:00.000+01:00[Europe/Berlin]"],
    ["2025-03-23T01:30:00.000Z", "now+1w-1w", "2025-03-23T03:30:00.000+01:00[Europe/Berlin]"],
  ] as const)(
    "preserves intermediate daylight-saving gaps for %s",
    Effect.fn(function* ([reference, expression, expected]) {
      yield* setNow(reference);
      const range = yield* resolveFilter({ gte: expression }, "Europe/Berlin");
      expect(formatEndpoint(range.lower?.value)).toBe(expected);
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

  it.effect.each([
    [
      "November 4",
      "2018-11-04T12:00:00.000Z",
      "America/Sao_Paulo",
      "2018-11-04T01:00:00.000-02:00[America/Sao_Paulo]",
      "2018-11-05T00:00:00.000-02:00[America/Sao_Paulo]",
    ],
    [
      "June",
      "2008-06-15T12:00:00.000Z",
      "Africa/Casablanca",
      "2008-06-01T01:00:00.000+01:00[Africa/Casablanca]",
      "2008-07-01T00:00:00.000+01:00[Africa/Casablanca]",
    ],
  ] as const)(
    "uses independent calendar boundaries for %s across a midnight gap",
    Effect.fn(function* ([input, reference, zone, lower, upper]) {
      yield* setNow(reference);
      const parsed = yield* parseNatural(input, { locale: "en" }).pipe(
        Effect.provide(EnglishLanguageLayer),
      );
      const direct = yield* resolve(parsed.range).pipe(DateTime.withCurrentZoneNamed(zone));
      const encoded = yield* resolveFilter(formatFilter(parsed.range), zone);
      expect(formatEndpoint(direct.lower?.value)).toBe(lower);
      expect(formatEndpoint(direct.upper?.value)).toBe(upper);
      expect(formatEndpoint(encoded.lower?.value)).toBe(lower);
      expect(formatEndpoint(encoded.upper?.value)).toBe(upper);
    }),
  );

  it.effect(
    "preserves inclusive and exclusive bound relations",
    Effect.fn(function* () {
      const range = yield* resolveFilter({ gt: "2025-01-01", lte: "2025-01-02" }, "UTC");
      expect(Schema.is(ResolvedGreaterThan)(range.lower)).toBe(true);
      expect(Schema.is(ResolvedLessThanOrEqual)(range.upper)).toBe(true);
      expect(formatEndpoint(range.lower?.value)).toBe("2025-01-01T00:00:00.000+00:00[UTC]");
      expect(formatEndpoint(range.upper?.value)).toBe("2025-01-02T00:00:00.000+00:00[UTC]");
    }),
  );

  it.effect(
    "preserves an absent open-range endpoint",
    Effect.fn(function* () {
      const range = yield* resolveFilter({ lt: "2025-01-01" }, "UTC");
      expect(range.lower).toBeUndefined();
      expect(Schema.is(ResolvedLessThan)(range.upper)).toBe(true);
    }),
  );

  it.effect(
    "rejects a reversed resolved interval",
    Effect.fn(function* () {
      const error = yield* Effect.flip(
        resolveFilter({ gte: "2025-02-01", lt: "2025-01-01" }, "UTC"),
      );
      expect(error).toBeInstanceOf(ResolutionError);
      expect(error.message).toBe("The range start must be before the range end");
    }),
  );
});
