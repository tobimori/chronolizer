import { describe, expect, it } from "@effect/vitest";
import { Effect, Option, Schema } from "effect";

import { now, shift, startOf } from "../src/ast/constructors.ts";
import { completePeriod } from "../src/filter/codec.ts";
import { EnglishContribution, EnglishLanguage } from "../src/locales/en.ts";
import { candidate } from "../src/locales/shared.ts";
import {
  BaseLanguageContribution,
  Correction,
  LanguageExtensionContribution,
  Locale,
  NaturalCorrectionCandidate,
} from "../src/language/model.ts";
import type { LanguagePlugin } from "../src/language/model.ts";
import {
  LanguageRegistry,
  LanguageRegistryLayer,
  languagePluginsLayer,
} from "../src/language/registry.ts";
import { parseNatural, suggestNatural } from "../src/natural/api.ts";
import { correctWhitespaceSeparatedText } from "../src/natural/correction.ts";
import { normalizeNaturalText } from "../src/natural/text.ts";

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
  correct: correctWhitespaceSeparatedText,
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
    suggest: (input) => ("special".startsWith(input) ? ["special"] : []),
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

const scriptLanguage = new BaseLanguageContribution({
  locale: "zh-Hant",
  vocabulary: [],
  parseExact: () => Option.none(),
  render: () => Option.none(),
});

const scriptPlugin = {
  id: "example/script-locale",
  effect: (context) => Effect.asVoid(context.register("example/script-locale", scriptLanguage)),
} satisfies LanguagePlugin;

const compactLanguage = new BaseLanguageContribution({
  locale: "zxx",
  vocabulary: [],
  normalize: (input, locale) => normalizeNaturalText(input, locale).replaceAll(" ", ""),
  correct: (input) =>
    input === "lastmont"
      ? [
          NaturalCorrectionCandidate.make({
            text: "lastmonth",
            cost: 1,
            corrections: [
              Correction.make({
                original: "mont",
                replacement: "month",
                distance: 1,
                offset: 4,
              }),
            ],
          }),
        ]
      : [],
  parseExact: (input) => {
    if (input !== "lastmonth") return Option.none();
    const start = startOf(shift(now(), -1, "month"), "month");
    return Option.some(candidate(completePeriod(start, shift(start, 1, "month")), "lastmonth"));
  },
  render: () => Option.none(),
});

const compactPlugin = {
  id: "example/compact-text",
  effect: (context) => Effect.asVoid(context.register("example/compact-text", compactLanguage)),
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

  it("validates canonical BCP 47 language, script, and region tags", () => {
    const isLocale = Schema.is(Locale);
    expect(isLocale("ja")).toBe(true);
    expect(isLocale("ja-JP")).toBe(true);
    expect(isLocale("zh-Hant")).toBe(true);
    expect(isLocale("zh-Hant-TW")).toBe(true);
    expect(isLocale("zh-hant")).toBe(false);
  });

  it.effect(
    "preserves script subtags during canonical locale fallback",
    Effect.fn(
      function* () {
        const registry = yield* LanguageRegistry;
        const language = yield* registry.resolve("ZH-hant-tw");
        expect(language.locale).toBe("zh-Hant");
      },
      Effect.provide(languagePluginsLayer([scriptPlugin])),
    ),
  );

  it.effect(
    "delegates compact-text normalization to the language pack",
    Effect.fn(
      function* () {
        const result = yield* parseNatural("LAST MONTH", { locale: "zxx" });
        expect(result.quality).toBe("exact");
      },
      Effect.provide(languagePluginsLayer([compactPlugin])),
    ),
  );

  it.effect(
    "delegates compact-text correction to the language pack",
    Effect.fn(
      function* () {
        const result = yield* parseNatural("lastmont", {
          locale: "zxx",
          typoMode: "tolerant",
        });
        expect(result.quality).toBe("corrected");
        expect(result.corrections).toEqual([
          {
            original: "mont",
            replacement: "month",
            distance: 1,
            offset: 4,
          },
        ]);
      },
      Effect.provide(languagePluginsLayer([compactPlugin])),
    ),
  );

  it.effect(
    "rejects an invalid locale identifier as unsupported",
    Effect.fn(function* () {
      const registry = yield* LanguageRegistry;
      const error = yield* Effect.flip(registry.resolve("not a locale"));
      expect(error._tag).toBe("UnsupportedLocaleError");
      expect(error.locale).toBe("not a locale");
    }, Effect.provide(LanguageRegistryLayer)),
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
    "includes extension completions in deterministic plugin order",
    Effect.fn(
      function* () {
        const suggestions = yield* suggestNatural("spec", { locale: "en" });
        expect(suggestions.map((entry) => entry.text)).toEqual(["priority-a", "priority-z", "low"]);
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
      if (error._tag !== "LanguageRegistrationError") {
        return expect.fail(`Expected LanguageRegistrationError, received ${error._tag}`);
      }
      expect(error.pluginId).toBe("chronolizer/language-en");
    }),
  );

  it.effect(
    "rejects conflicting base languages",
    Effect.fn(function* () {
      const error = yield* Effect.flip(
        Effect.provide(Effect.void, languagePluginsLayer([EnglishLanguage, alternatePlugin])),
      );
      expect(error._tag).toBe("LanguageConflictError");
      expect(error).toMatchObject({
        locale: "en",
        firstPluginId: "chronolizer/language-en",
        secondPluginId: "example/alternate-en",
      });
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
      expect(error.locale).toBe("en");
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
