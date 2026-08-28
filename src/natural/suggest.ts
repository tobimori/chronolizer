import { Array as EffectArray, Effect } from "effect";

import { rangeKey } from "../filter/codec.ts";
import { LanguageRegistry } from "../language/registry.ts";
import { NaturalSuggestion } from "../language/model.ts";
import { applyFuturePolicy } from "./policy.ts";

export interface SuggestNaturalOptions {
  readonly locale: string;
  readonly limit?: number;
  readonly allowFuture?: boolean;
}

const suggestionLimit = (limit: number | undefined) => {
  if (limit === undefined) return 10;
  if (!Number.isSafeInteger(limit) || limit <= 0) return 0;
  return Math.min(limit, 100);
};

export const suggestNatural = Effect.fn("chronolizer.suggestNatural")(function* (
  input: string,
  options: SuggestNaturalOptions,
) {
  const registry = yield* LanguageRegistry;
  const language = yield* registry.resolve(options.locale);
  const normalized = language.normalize(input, language.locale);
  const limit = suggestionLimit(options.limit);
  if (limit === 0) return [];
  const suggestions = EffectArray.flatMap(
    EffectArray.dedupe(language.suggest(normalized, limit * 2)),
    (text) =>
      applyFuturePolicy(
        language.parseExact(language.normalize(text, language.locale)),
        options.allowFuture,
      ).map((candidate) =>
        NaturalSuggestion.make({ text: candidate.canonical, range: candidate.range }),
      ),
  );
  return EffectArray.take(
    EffectArray.dedupeWith(
      suggestions,
      (left, right) => rangeKey(left.range) === rangeKey(right.range),
    ),
    limit,
  );
});
