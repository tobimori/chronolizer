import { describe, expect, it } from "@effect/vitest";
import { Effect, Option } from "effect";

import { now, shift, startOf } from "../src/ast/constructors.ts";
import { completePeriod } from "../src/filter/codec.ts";
import { EnglishContribution, EnglishLanguage } from "../src/locales/en.ts";
import { candidate } from "../src/locales/shared.ts";
import { BaseLanguageContribution } from "../src/language/model.ts";
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

describe("language registry", () => {
  it.effect("uses BCP 47 language fallback for a regional locale", () =>
    Effect.gen(function* () {
      const registry = yield* LanguageRegistry;
      const language = yield* registry.resolve("en-US");
      expect(language.locale).toBe("en");
    }).pipe(Effect.provide(languagePluginsLayer([EnglishLanguage]))),
  );

  it.effect("rejects conflicting base languages", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        Effect.provide(Effect.void, languagePluginsLayer([EnglishLanguage, alternatePlugin])),
      );
      expect(error._tag).toBe("LanguageConflictError");
    }),
  );

  it.effect("removes a registration when its Scope closes", () =>
    Effect.gen(function* () {
      const registry = yield* LanguageRegistry;
      yield* Effect.scoped(registry.register("chronolizer/language-en", EnglishContribution));
      const error = yield* Effect.flip(registry.resolve("en"));
      expect(error._tag).toBe("UnsupportedLocaleError");
    }).pipe(Effect.provide(LanguageRegistryLayer)),
  );

  it.effect("reports an equal-cost typo tie as ambiguous", () =>
    Effect.gen(function* () {
      const result = yield* parseNatural("boke", {
        locale: "xx",
        typoMode: "tolerant",
      });
      expect(result.quality).toBe("ambiguous");
      expect(result.alternatives).toHaveLength(1);
    }).pipe(Effect.provide(languagePluginsLayer([ambiguousPlugin]))),
  );

  it.effect("keeps a compiled snapshot usable after registration cleanup", () =>
    Effect.gen(function* () {
      const registry = yield* LanguageRegistry;
      const snapshot = yield* Effect.scoped(
        Effect.gen(function* () {
          yield* registry.register("chronolizer/language-en", EnglishContribution);
          return yield* registry.resolve("en");
        }),
      );
      const candidates = snapshot.parseExact("year to date");
      expect(candidates).toHaveLength(1);
      expect(snapshot.render(completePeriod(now(), now()))).toEqual(Option.none());
    }).pipe(Effect.provide(LanguageRegistryLayer)),
  );
});
