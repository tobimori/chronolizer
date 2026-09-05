import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { formatFilter } from "../../src/filter/codec.ts";
import { formatNatural, parseNatural } from "../../src/index.ts";
import { LanguagesLayer } from "./languages.ts";

describe("locale round trips", () => {
  it.effect.each([
    ["en", "from January 4 2025 to January 22 2025"],
    ["de", "von 4. Januar 2025 bis 22. Januar 2025"],
    ["es", "desde 4 de enero de 2025 hasta 22 de enero de 2025"],
    ["fr", "du 4 janvier 2025 au 22 janvier 2025"],
    ["nl", "van 4 januari 2025 tot en met 22 januari 2025"],
    ["cs", "od 4. ledna 2025 do 22. ledna 2025"],
    ["pl", "od 4 stycznia 2025 do 22 stycznia 2025"],
    ["tr", "4 ocak 2025 ile 22 ocak 2025 arası"],
    ["en", "yesterday two weeks ago"],
    ["de", "gestern vor zwei wochen"],
    ["es", "ayer hace dos semanas"],
    ["fr", "hier il y a deux semaines"],
    ["nl", "gisteren twee weken geleden"],
    ["cs", "včera před dvěma týdny"],
    ["pl", "wczoraj dwa tygodnie temu"],
    ["tr", "iki hafta önce dün"],
  ] as const)(
    "preserves the meaning of the standard phrase for %s: %s",
    Effect.fn(function* ([locale, input]) {
      const parsed = yield* parseNatural(input, { locale });
      const rendered = yield* formatNatural(parsed.range, { locale });
      const reparsed = yield* parseNatural(rendered, { locale });
      expect(formatFilter(reparsed.range)).toEqual(formatFilter(parsed.range));
    }, Effect.provide(LanguagesLayer)),
  );
});
