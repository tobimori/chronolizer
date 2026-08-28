import { describe, expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";

import { normalizeInstant } from "../src/ast/normalize.ts";
import { parseFilter, formatFilter } from "../src/filter/codec.ts";
import { formatInstantExpression, parseInstantExpression } from "../src/filter/expression.ts";
import { DateFilter } from "../src/filter/schema.ts";

const runParse = (input: string) => Effect.runSync(parseInstantExpression(input));

describe("filter expressions", () => {
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

  it.each([
    ["2025-01-01+1M", 10, '"||" before date operations'],
    ["now+0d", 4, "a positive integer without a leading zero"],
    ["now+01d", 4, "a positive integer without a leading zero"],
    ["now/m", 4, "a date unit: d, w, M, q, or y"],
    ["2025-02-29", 0, '"now" or an ISO date (YYYY-MM-DD)'],
    ["now ", 3, 'an operation beginning with "+", "-", or "/"'],
  ])("rejects non-canonical expression %s", (input, offset, expected) => {
    const error = Effect.runSync(Effect.flip(parseInstantExpression(input)));
    expect(error).toMatchObject({ offset, expected });
  });
});

describe("date filters", () => {
  it.effect("round-trips a relative bounded range", () =>
    Effect.gen(function* () {
      const filter = { gte: "now-1y/y", lt: "now-1y/y+1M" };
      const range = yield* parseFilter(filter);
      expect(formatFilter(range)).toEqual(filter);
    }),
  );

  it.effect("preserves an open lower range", () =>
    Effect.gen(function* () {
      const range = yield* parseFilter({ gte: "2025-01-01" });
      expect(formatFilter(range)).toEqual({ gte: "2025-01-01" });
    }),
  );

  it("rejects conflicting or empty filters at the Schema boundary", () => {
    const isDateFilter = Schema.is(DateFilter);
    expect(isDateFilter({ gt: "now", gte: "now/y" })).toBe(false);
    expect(isDateFilter({})).toBe(false);
    expect(isDateFilter({ lt: "now" })).toBe(true);
  });
});
