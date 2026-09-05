import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { suggestNatural } from "../../src/index.ts";
import { LanguagesLayer } from "./languages.ts";

describe("locale suggestions", () => {
  it.effect.each([
    ["en", "now next thursday", "from now to next Thursday"],
    ["de", "jetzt nächsten donnerstag", "von heute bis nächster Donnerstag"],
    ["fr", "maintenant jeudi prochain", "de maintenant à jeudi prochain"],
    ["cs", "od dneška příštího čtvrtka", "od dneška do příští čtvrtek"],
    ["pl", "od dziś następnego czwartku", "od dziś do następny czwartek"],
    ["es", "ahora el próximo jueves", "desde ahora hasta el próximo jueves"],
    ["nl", "nu tot en volgende donderdag", "vanaf nu tot en met volgende donderdag"],
    ["tr", "şimdi gelecek perşembe arası", "bugün ile gelecek perşembe arası"],
  ] as const)(
    "inserts a missing completion word in %s: %s",
    Effect.fn(function* ([locale, input, expected]) {
      const suggestions = yield* suggestNatural(input, { locale, limit: 1 });
      expect(suggestions.map((suggestion) => suggestion.text)).toEqual([expected]);
    }, Effect.provide(LanguagesLayer)),
  );
});
