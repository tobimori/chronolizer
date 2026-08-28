import { describe, expect, it } from "@effect/vitest";
import { Effect, Option } from "effect";

import { now } from "../src/ast/constructors.ts";
import { completePeriod } from "../src/filter/codec.ts";
import { EnglishContribution, EnglishLanguage } from "../src/locales/en.ts";
import { BaseLanguageContribution } from "../src/language/model.ts";
import type { LanguagePlugin } from "../src/language/model.ts";
import {
  LanguageRegistry,
  LanguageRegistryLayer,
  languagePluginsLayer,
} from "../src/language/registry.ts";

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
