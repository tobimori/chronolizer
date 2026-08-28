import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { formatFilter } from "../src/filter/codec.ts";
import { GermanLanguageLayer } from "../src/locales/de.ts";
import { formatNatural, parseNatural } from "../src/natural/api.ts";

const parseGerman = (input: string, typoMode: "strict" | "tolerant" = "strict") =>
  parseNatural(input, { locale: "de", typoMode }).pipe(Effect.provide(GermanLanguageLayer));

describe("German date ranges", () => {
  it.effect("parses year to date with an inclusive current endpoint", () =>
    Effect.gen(function* () {
      const result = yield* parseGerman("Jahr bis heute");
      expect(formatFilter(result.range)).toEqual({ gte: "now/y", lte: "now" });
    }),
  );

  it.effect("parses a fixed month as a half-open calendar period", () =>
    Effect.gen(function* () {
      const result = yield* parseGerman("Januar 2025");
      expect(formatFilter(result.range)).toEqual({
        gte: "2025-01-01",
        lt: "2025-02-01",
      });
    }),
  );

  it.effect("parses a named month relative to last year", () =>
    Effect.gen(function* () {
      const result = yield* parseGerman("Januar letzten Jahres");
      expect(formatFilter(result.range)).toEqual({
        gte: "now-1y/y",
        lt: "now-1y/y+1M",
      });
    }),
  );

  it.effect("distinguishes the German open-boundary terms", () =>
    Effect.gen(function* () {
      const since = yield* parseGerman("seit Januar 2025");
      const before = yield* parseGerman("vor Januar 2025");
      const through = yield* parseGerman("bis einschließlich Januar 2025");
      const after = yield* parseGerman("nach Januar 2025");
      expect(formatFilter(since.range)).toEqual({ gte: "2025-01-01" });
      expect(formatFilter(before.range)).toEqual({ lt: "2025-01-01" });
      expect(formatFilter(through.range)).toEqual({ lt: "2025-02-01" });
      expect(formatFilter(after.range)).toEqual({ gte: "2025-02-01" });
    }),
  );

  it.effect("uses both full periods in a German from-to range", () =>
    Effect.gen(function* () {
      const result = yield* parseGerman("von Februar 2024 bis März 2024");
      expect(formatFilter(result.range)).toEqual({
        gte: "2024-02-01",
        lt: "2024-04-01",
      });
    }),
  );

  it.effect("renders canonical German phrases", () =>
    Effect.gen(function* () {
      const complete = yield* parseGerman("JANUAR   2025");
      const open = yield* parseGerman("seit Januar 2025");
      const renderedComplete = yield* formatNatural(complete.range, {
        locale: "de",
      }).pipe(Effect.provide(GermanLanguageLayer));
      const renderedOpen = yield* formatNatural(open.range, {
        locale: "de",
      }).pipe(Effect.provide(GermanLanguageLayer));
      expect(renderedComplete).toBe("Januar 2025");
      expect(renderedOpen).toBe("seit Januar 2025");
    }),
  );

  it.effect("corrects German typos only in tolerant mode", () =>
    Effect.gen(function* () {
      const result = yield* parseGerman("januar lezten jahres", "tolerant");
      expect(result.quality).toBe("corrected");
      expect(result.corrections).toMatchObject([
        { original: "lezten", replacement: "letzten", distance: 1 },
      ]);
      expect(formatFilter(result.range)).toEqual({
        gte: "now-1y/y",
        lt: "now-1y/y+1M",
      });
    }),
  );

  it.effect("does not correct short ambiguous German month words", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(parseGerman("mei 2025", "tolerant"));
      expect(error._tag).toBe("NaturalLanguageParseError");
    }),
  );
});
