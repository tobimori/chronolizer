import { describe, expect, it } from "@effect/vitest";
import { Effect, Option } from "effect";

import { now, shift, startOf } from "../src/ast/constructors.ts";
import { completePeriod } from "../src/filter/codec.ts";
import { EnglishContribution, EnglishLanguage } from "../src/locales/en.ts";
import { candidate } from "../src/locales/shared.ts";
import { BaseLanguageContribution, LanguageExtensionContribution } from "../src/language/model.ts";
import type { LanguagePlugin } from "../src/language/model.ts";
import {
  LanguageRegistry,
  LanguageRegistryLayer,
  languagePluginsLayer,
} from "../src/language/registry.ts";
import { parseNatural } from "../src/natural/api.ts";

const alternateEnglish = new BaseLanguageContribution({
  locale: "en",
  vocabulary: ["now"],
  parseExact: () => Option.none(),
  render: () => Option.none(),
});

const alternatePlugin = {
  id: "example/alternate-en",
  effect: (context) => Effect.asVoid(context.register("example/alternate-en", alternateEnglish)),
} satisfies LanguagePlugin;

const ambiguousLanguage = new BaseLanguageContribution({
  locale: "xx",
  vocabulary: ["bake", "bike"],
  parseExact: (input) => {
    if (input !== "bake" && input !== "bike") return Option.none();
    const offset = input === "bake" ? 0 : 1;
    const start = startOf(shift(now(), offset, "day"), "day");
    return Option.some(candidate(completePeriod(start, shift(start, 1, "day")), input));
  },
  render: () => Option.none(),
});

const ambiguousPlugin = {
  id: "example/ambiguous",
  effect: (context) => Effect.asVoid(context.register("example/ambiguous", ambiguousLanguage)),
} satisfies LanguagePlugin;

const extensionPlugin = (id: string, priority: number, canonical: string, offset: number) => {
  const contribution = new LanguageExtensionContribution({
    locale: "en",
    priority,
    vocabulary: ["special"],
    parseExact: (input) => {
      if (input !== "special") return Option.none();
      const start = startOf(shift(now(), offset, "day"), "day");
      return Option.some(candidate(completePeriod(start, shift(start, 1, "day")), canonical));
    },
  });
  return {
    id,
    effect: (context) => Effect.asVoid(context.register(id, contribution)),
  } satisfies LanguagePlugin;
};

const regionalEnglish = new BaseLanguageContribution({
  locale: "en-US",
  vocabulary: ["regional"],
  parseExact: () => Option.none(),
  render: () => Option.none(),
});

const regionalPlugin = {
  id: "example/en-us",
  effect: (context) => Effect.asVoid(context.register("example/en-us", regionalEnglish)),
} satisfies LanguagePlugin;

describe("language registry", () => {
  it.effect(
    "uses BCP 47 language fallback for a regional locale",
    Effect.fn(
      function* () {
        const registry = yield* LanguageRegistry;
        const language = yield* registry.resolve("en-US");
        expect(language.locale).toBe("en");
      },
      Effect.provide(languagePluginsLayer([EnglishLanguage])),
    ),
  );

  it.effect(
    "prefers an exact regional base over language fallback",
    Effect.fn(
      function* () {
        const registry = yield* LanguageRegistry;
        const language = yield* registry.resolve("en-US");
        expect(language.locale).toBe("en-US");
      },
      Effect.provide(languagePluginsLayer([EnglishLanguage, regionalPlugin])),
    ),
  );

  it.effect(
    "orders extensions by priority and then plugin identifier",
    Effect.fn(
      function* () {
        const registry = yield* LanguageRegistry;
        const language = yield* registry.resolve("en-US");
        expect(language.parseExact("special").map((entry) => entry.canonical)).toEqual([
          "priority-a",
          "priority-z",
          "low",
        ]);
      },
      Effect.provide(
        languagePluginsLayer([
          extensionPlugin("example/low", 0, "low", 1),
          extensionPlugin("example/z", 10, "priority-z", 2),
          EnglishLanguage,
          extensionPlugin("example/a", 10, "priority-a", 3),
        ]),
      ),
    ),
  );

  it.effect(
    "rejects duplicate plugin identifiers before registration",
    Effect.fn(function* () {
      const error = yield* Effect.flip(
        Effect.provide(Effect.void, languagePluginsLayer([EnglishLanguage, EnglishLanguage])),
      );
      expect(error._tag).toBe("LanguageRegistrationError");
    }),
  );

  it.effect(
    "rejects conflicting base languages",
    Effect.fn(function* () {
      const error = yield* Effect.flip(
        Effect.provide(Effect.void, languagePluginsLayer([EnglishLanguage, alternatePlugin])),
      );
      expect(error._tag).toBe("LanguageConflictError");
    }),
  );

  it.effect(
    "atomically accepts one of two concurrent base registrations",
    Effect.fn(function* () {
      const registry = yield* LanguageRegistry;
      const results = yield* Effect.scoped(
        Effect.all(
          [
            Effect.result(registry.register("example/first", EnglishContribution)),
            Effect.result(registry.register("example/second", alternateEnglish)),
          ],
          { concurrency: "unbounded" },
        ),
      );
      expect(results.filter((result) => result._tag === "Success")).toHaveLength(1);
      expect(results.filter((result) => result._tag === "Failure")).toHaveLength(1);
    }, Effect.provide(LanguageRegistryLayer)),
  );

  it.effect(
    "removes a registration when its Scope closes",
    Effect.fn(function* () {
      const registry = yield* LanguageRegistry;
      yield* Effect.scoped(registry.register("chronolizer/language-en", EnglishContribution));
      const error = yield* Effect.flip(registry.resolve("en"));
      expect(error._tag).toBe("UnsupportedLocaleError");
    }, Effect.provide(LanguageRegistryLayer)),
  );

  it.effect(
    "reports an equal-cost typo tie as ambiguous",
    Effect.fn(
      function* () {
        const result = yield* parseNatural("boke", {
          locale: "xx",
          typoMode: "tolerant",
        });
        expect(result.quality).toBe("ambiguous");
        expect(result.alternatives).toHaveLength(1);
      },
      Effect.provide(languagePluginsLayer([ambiguousPlugin])),
    ),
  );

  it.effect(
    "keeps a compiled snapshot usable after registration cleanup",
    Effect.fn(function* () {
      const registry = yield* LanguageRegistry;
      const snapshot = yield* registry
        .register("chronolizer/language-en", EnglishContribution)
        .pipe(Effect.andThen(registry.resolve("en")), Effect.scoped);
      const candidates = snapshot.parseExact("year to date");
      expect(candidates).toHaveLength(1);
      expect(snapshot.render(completePeriod(now(), now()))).toEqual(Option.none());
    }, Effect.provide(LanguageRegistryLayer)),
  );
});
