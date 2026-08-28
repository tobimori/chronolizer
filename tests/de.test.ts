import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { formatFilter } from "../src/filter/codec.ts";
import { GermanLanguageLayer } from "../src/locales/de.ts";
import { formatNatural, parseNatural } from "../src/natural/api.ts";

const parseGerman = (input: string, typoMode: "strict" | "tolerant" = "strict") =>
  parseNatural(input, { locale: "de", typoMode }).pipe(Effect.provide(GermanLanguageLayer));

describe("German date ranges", () => {
  it.effect("covers every German relative calendar period", () =>
    Effect.gen(function* () {
      const cases = [
        ["heute", "now/d", "now/d+1d"],
        ["gestern", "now-1d/d", "now-1d/d+1d"],
        ["morgen", "now+1d/d", "now+1d/d+1d"],
        ["letzte Woche", "now-1w/w", "now-1w/w+1w"],
        ["diese Woche", "now/w", "now/w+1w"],
        ["nächste Woche", "now+1w/w", "now+1w/w+1w"],
        ["letzter Monat", "now-1M/M", "now-1M/M+1M"],
        ["dieser Monat", "now/M", "now/M+1M"],
        ["nächster Monat", "now+1M/M", "now+1M/M+1M"],
        ["letztes Quartal", "now-1q/q", "now-1q/q+1q"],
        ["dieses Quartal", "now/q", "now/q+1q"],
        ["nächstes Quartal", "now+1q/q", "now+1q/q+1q"],
        ["letztes Jahr", "now-1y/y", "now-1y/y+1y"],
        ["dieses Jahr", "now/y", "now/y+1y"],
        ["nächstes Jahr", "now+1y/y", "now+1y/y+1y"],
      ] as const;
      for (const [input, gte, lt] of cases) {
        const result = yield* parseGerman(input);
        expect(formatFilter(result.range), input).toEqual({ gte, lt });
      }
    }),
  );

  it.effect("covers every German period-to-date unit", () =>
    Effect.gen(function* () {
      const cases = [
        ["Tag bis heute", "now/d"],
        ["Woche bis heute", "now/w"],
        ["Monat bis heute", "now/M"],
        ["Quartal bis heute", "now/q"],
        ["Jahr bis heute", "now/y"],
      ] as const;
      for (const [input, gte] of cases) {
        const result = yield* parseGerman(input);
        expect(formatFilter(result.range), input).toEqual({ gte, lte: "now" });
      }
    }),
  );

  it.effect("maps every German month and the December year boundary", () =>
    Effect.gen(function* () {
      const months = [
        "Januar",
        "Februar",
        "März",
        "April",
        "Mai",
        "Juni",
        "Juli",
        "August",
        "September",
        "Oktober",
        "November",
        "Dezember",
      ] as const;
      for (const [index, month] of months.entries()) {
        const monthNumber = String(index + 1).padStart(2, "0");
        const nextMonth = index === 11 ? "01" : String(index + 2).padStart(2, "0");
        const nextYear = index === 11 ? "2026" : "2025";
        const result = yield* parseGerman(`${month} 2025`);
        expect(formatFilter(result.range), month).toEqual({
          gte: `2025-${monthNumber}-01`,
          lt: `${nextYear}-${nextMonth}-01`,
        });
      }
    }),
  );

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

  it.effect("keeps German named months relative to the selected year", () =>
    Effect.gen(function* () {
      const cases = [
        ["Januar letzten Jahres", "now-1y/y", "now-1y/y+1M"],
        ["Juni dieses Jahres", "now/y+5M", "now/y+6M"],
        ["Dezember nächsten Jahres", "now+1y/y+11M", "now+1y/y+12M"],
      ] as const;
      for (const [input, gte, lt] of cases) {
        const result = yield* parseGerman(input);
        expect(formatFilter(result.range), input).toEqual({ gte, lt });
      }
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

  it.effect("uses and renders both full periods in a German from-to range", () =>
    Effect.gen(function* () {
      const result = yield* parseGerman("von Februar 2024 bis März 2024");
      expect(formatFilter(result.range)).toEqual({
        gte: "2024-02-01",
        lt: "2024-04-01",
      });
      const rendered = yield* formatNatural(result.range, { locale: "de" }).pipe(
        Effect.provide(GermanLanguageLayer),
      );
      expect(rendered).toBe("von Februar 2024 bis März 2024");

      const relative = yield* parseGerman("von Mai bis Dezember");
      expect(formatFilter(relative.range)).toEqual({
        gte: "now/y+4M",
        lt: "now/y+12M",
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

  it.effect("does not correct short or over-budget German words", () =>
    Effect.gen(function* () {
      const shortWord = yield* Effect.flip(parseGerman("mei 2025", "tolerant"));
      const distantWord = yield* Effect.flip(parseGerman("xxxxxxxx 2025", "tolerant"));
      expect(shortWord._tag).toBe("NaturalLanguageParseError");
      expect(distantWord._tag).toBe("NaturalLanguageParseError");
    }),
  );

  it.effect("normalizes German Unicode width, case, and whitespace", () =>
    Effect.gen(function* () {
      const result = yield* parseGerman("  ＭÄＲＺ　２０２４  ");
      expect(formatFilter(result.range)).toEqual({
        gte: "2024-03-01",
        lt: "2024-04-01",
      });
    }),
  );

  it.effect("rejects impossible, incomplete, and out-of-scope German input", () =>
    Effect.gen(function* () {
      const inputs = [
        "",
        "2025-02-29",
        "1900-02-29",
        "9999-12-31",
        "Januar 2025 zusätzlich",
        "Jan 2025",
        "letzten Monat über",
        "zeige Ergebnisse seit Januar 2025",
      ];
      for (const input of inputs) {
        const error = yield* Effect.flip(parseGerman(input));
        expect(error._tag, input).toBe("NaturalLanguageParseError");
      }
    }),
  );

  it.effect("round-trips canonical German relative and fixed periods", () =>
    Effect.gen(function* () {
      const phrases = [
        "heute",
        "letzte Woche",
        "nächstes Quartal",
        "dieses Jahr",
        "März 2025",
        "Dezember nächsten Jahres",
        "2024-02-29",
        "2025",
        "bis einschließlich Januar 2025",
        "von 2024-02-29 bis 2024-03-01",
      ];
      for (const phrase of phrases) {
        const parsed = yield* parseGerman(phrase);
        const rendered = yield* formatNatural(parsed.range, { locale: "de" }).pipe(
          Effect.provide(GermanLanguageLayer),
        );
        const reparsed = yield* parseGerman(rendered);
        expect(formatFilter(reparsed.range), phrase).toEqual(formatFilter(parsed.range));
      }
    }),
  );
});
