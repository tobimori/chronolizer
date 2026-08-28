import { describe, expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import {
  boundedRange,
  greaterThanOrEqual,
  lessThan,
  now,
  shift,
  startOf,
} from "../src/ast/constructors.ts";
import { normalizeInstant, normalizeRange } from "../src/ast/normalize.ts";
import { DateRangeExpr, Unit } from "../src/ast/schemas.ts";
import { parseFilter, formatFilter } from "../src/filter/codec.ts";
import { formatInstantExpression, parseInstantExpression } from "../src/filter/expression.ts";
import { DateFilter } from "../src/filter/schema.ts";
import { DateRangeFromFilter, InstantExpressionFromString } from "../src/filter/transformation.ts";

const runParse = (input: string) => Effect.runSync(parseInstantExpression(input));

describe("filter expressions", () => {
  it.each([
    "now",
    "2025-01-01",
    "now+1d",
    "now-2w",
    "now+3M",
    "now-4q",
    "now+5y",
    "now/d/w/M/q/y",
    "2025-12-31||+1d/y",
    `now+${Number.MAX_SAFE_INTEGER}d`,
  ])("round-trips canonical expression %s", (input) => {
    expect(formatInstantExpression(runParse(input))).toBe(input);
  });

  it("preserves operation order through parse and print", () => {
    const input = "now-1y/y+1M-2d";
    expect(formatInstantExpression(runParse(input))).toBe(input);
  });

  it("uses the fixed-date operation delimiter", () => {
    const expression = runParse("2025-01-01||+1M/w");
    expect(formatInstantExpression(expression)).toBe("2025-01-01||+1M/w");
  });

  it("normalizes adjacent shifts of the same unit", () => {
    const expression = runParse("now+3M-1M");
    expect(formatInstantExpression(normalizeInstant(expression))).toBe("now+2M");
  });

  it.effect(
    "provides a bidirectional Effect Schema expression codec",
    Effect.fn(function* () {
      const expression = yield* Schema.decodeEffect(InstantExpressionFromString)("now-1y/y");
      const encoded = yield* Schema.encodeEffect(InstantExpressionFromString)(expression);
      expect(encoded).toBe("now-1y/y");
    }),
  );

  it("removes shifts that cancel during normalization", () => {
    const expression = runParse("now+3M-3M");
    expect(formatInstantExpression(normalizeInstant(expression))).toBe("now");
  });

  it.each([
    ["", 0, '"now" or an ISO date (YYYY-MM-DD)'],
    ["today", 0, '"now" or an ISO date (YYYY-MM-DD)'],
    ["2025-01-01+1M", 10, '"||" before date operations'],
    ["2025-01-01||", 12, 'an operation beginning with "+", "-", or "/"'],
    ["now+0d", 4, "a positive integer without a leading zero"],
    ["now+01d", 4, "a positive integer without a leading zero"],
    ["now+", 4, "a positive integer without a leading zero"],
    ["now+1", 5, "a date unit: d, w, M, q, or y"],
    ["now/m", 4, "a date unit: d, w, M, q, or y"],
    ["now+9007199254740992d", 4, "a safe positive integer"],
    ["2025-02-29", 0, '"now" or an ISO date (YYYY-MM-DD)'],
    ["now ", 3, 'an operation beginning with "+", "-", or "/"'],
    ["now||+1d", 3, 'an operation beginning with "+", "-", or "/"'],
  ])("rejects non-canonical expression %s", (input, offset, expected) => {
    const error = Effect.runSync(Effect.flip(parseInstantExpression(input)));
    expect(error).toMatchObject({ offset, expected });
  });
});

describe("date filters", () => {
  it.effect(
    "round-trips all bound relation combinations",
    Effect.fn(function* () {
      const filters = [
        { gt: "now-1d", lt: "now" },
        { gt: "now-1d", lte: "now" },
        { gte: "now-1d", lt: "now" },
        { gte: "now-1d", lte: "now" },
        { gt: "now" },
        { gte: "now" },
        { lt: "now" },
        { lte: "now" },
      ] as const;
      for (const filter of filters) {
        const range = yield* parseFilter(filter);
        expect(formatFilter(range)).toEqual(filter);
      }
    }),
  );

  it("round-trips the unit and relative-direction matrix", () => {
    for (const unit of Unit.literals) {
      for (const amount of [-2, -1, 1, 2]) {
        const start = startOf(shift(now(), amount, unit), unit);
        const range = boundedRange(greaterThanOrEqual(start), lessThan(shift(start, 1, unit)));
        const normalized = normalizeRange(range);
        const parsed = Effect.runSync(parseFilter(formatFilter(normalized)));
        expect(parsed).toEqual(normalized);
      }
    }
  });

  it.effect(
    "decodes an external filter through one Effect Schema codec",
    Effect.fn(function* () {
      const range = yield* Schema.decodeEffect(DateRangeFromFilter)({
        gte: "now/y",
        lte: "now",
      });
      const encoded = yield* Schema.encodeEffect(DateRangeFromFilter)(range);
      expect(encoded).toEqual({ gte: "now/y", lte: "now" });
    }),
  );

  it.effect(
    "round-trips a relative bounded range",
    Effect.fn(function* () {
      const filter = { gte: "now-1y/y", lt: "now-1y/y+1M" };
      const range = yield* parseFilter(filter);
      expect(formatFilter(range)).toEqual(filter);
    }),
  );

  it.effect(
    "preserves an open lower range",
    Effect.fn(function* () {
      const range = yield* parseFilter({ gte: "2025-01-01" });
      expect(formatFilter(range)).toEqual({ gte: "2025-01-01" });
    }),
  );

  it("rejects a semantic range without bounds at the Schema boundary", () => {
    const valid = boundedRange(greaterThanOrEqual(now()), lessThan(shift(now(), 1, "day")));
    expect(Schema.is(DateRangeExpr)({ ...valid, lower: undefined, upper: undefined })).toBe(false);
  });

  it("rejects conflicting or empty filters at the Schema boundary", () => {
    const isDateFilter = Schema.is(DateFilter);
    expect(isDateFilter({ gt: "now", gte: "now/y" })).toBe(false);
    expect(isDateFilter({ lt: "now", lte: "now/d" })).toBe(false);
    expect(isDateFilter({})).toBe(false);
    expect(isDateFilter({ lt: "now" })).toBe(true);
  });

  it.effect(
    "reports malformed external filters through the Schema codec",
    Effect.fn(function* () {
      const empty = yield* Effect.flip(Schema.decodeEffect(DateRangeFromFilter)({}));
      const malformed = yield* Effect.flip(
        Schema.decodeEffect(DateRangeFromFilter)({ gte: "now+0d" }),
      );
      expect(empty).toBeDefined();
      expect(malformed).toBeDefined();
    }),
  );
});
