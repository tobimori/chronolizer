import { Array as EffectArray, Effect } from "effect";

import { rangeKey } from "../filter/codec.ts";
import { LanguageRegistry } from "../language/registry.ts";
import { NaturalSuggestion } from "../language/model.ts";
import { applyFuturePolicy } from "./policy.ts";
import { naturalWords } from "./text.ts";

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

const singleWordCompletions = (input: string, vocabulary: ReadonlyArray<string>) => {
  const words = naturalWords(input);
  if (words.length === 0 || words.length > 12) return [];
  const positions = Array.from({ length: words.length + 1 }, (_, index) => index);
  const insertions = EffectArray.flatMap(positions, (index) =>
    EffectArray.flatMap(vocabulary, (word) =>
      word.length === 0 || word.includes(" ")
        ? []
        : [[...words.slice(0, index), word, ...words.slice(index)].join(" ")],
    ),
  );
  return EffectArray.dedupe(insertions);
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
  const suggestionsFrom = (texts: ReadonlyArray<string>) =>
    EffectArray.flatMap(EffectArray.dedupe(texts), (text) =>
      applyFuturePolicy(
        language.parseExact(language.normalize(text, language.locale)),
        options.allowFuture,
      ).map((candidate) =>
        NaturalSuggestion.make({ text: candidate.canonical, range: candidate.range }),
      ),
    );
  const distinct = (suggestions: ReadonlyArray<NaturalSuggestion>) => {
    const keys = new Set<string>();
    return suggestions.filter((suggestion) => {
      const key = rangeKey(suggestion.range);
      if (keys.has(key)) return false;
      keys.add(key);
      return true;
    });
  };

  const suggested = distinct(
    suggestionsFrom([...language.suggest(normalized, limit * 2), normalized]),
  );
  if (suggested.length > 0) return EffectArray.take(suggested, limit);

  const completionVocabulary = EffectArray.dedupe([
    ...EffectArray.flatMap(language.suggest("", 100), naturalWords),
    ...language.vocabulary,
  ]);
  return EffectArray.take(
    distinct(suggestionsFrom(singleWordCompletions(normalized, completionVocabulary))),
    limit,
  );
});
