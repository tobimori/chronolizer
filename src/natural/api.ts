import { Array as EffectArray, Effect, Option, Order, Result } from "effect";

import { containsPositiveShift } from "../ast/fold.ts";
import type { DateRangeExpr } from "../ast/schemas.ts";
import { rangeKey } from "../filter/codec.ts";
import { NaturalLanguageParseError, NaturalLanguageRenderError } from "../language/errors.ts";
import { LanguageRegistry } from "../language/registry.ts";
import { NaturalAlternative, NaturalParseResult, NaturalSuggestion } from "../language/model.ts";
import type { Correction, NaturalCandidate } from "../language/model.ts";

export interface ParseNaturalOptions {
  readonly locale: string;
  readonly typoMode?: "strict" | "tolerant";
  readonly allowFuture?: boolean;
}

export interface FormatNaturalOptions {
  readonly locale: string;
}

export interface SuggestNaturalOptions {
  readonly locale: string;
  readonly limit?: number;
  readonly allowFuture?: boolean;
}

const distinctCandidates = (candidates: EffectArray.NonEmptyReadonlyArray<NaturalCandidate>) =>
  EffectArray.dedupeWith(
    candidates,
    (left, right) => rangeKey(left.range) === rangeKey(right.range),
  );

const applyFuturePolicy = (
  candidates: ReadonlyArray<NaturalCandidate>,
  allowFuture: boolean | undefined,
) =>
  allowFuture === false
    ? EffectArray.filter(candidates, (candidate) => !containsPositiveShift(candidate.range))
    : candidates;

const parseQuality = (hasAlternatives: boolean, hasCorrections: boolean) => {
  if (hasAlternatives) return "ambiguous";
  if (hasCorrections) return "corrected";
  return "exact";
};

const resultFromCandidates = (
  candidates: EffectArray.NonEmptyReadonlyArray<NaturalCandidate>,
  corrections: ReadonlyArray<Correction>,
) => {
  const distinct = distinctCandidates(candidates);
  const selected = EffectArray.headNonEmpty(distinct);
  const alternatives = EffectArray.tailNonEmpty(distinct).map((candidate) =>
    NaturalAlternative.make({
      canonical: candidate.canonical,
      range: candidate.range,
    }),
  );
  return NaturalParseResult.make({
    range: selected.range,
    quality: parseQuality(alternatives.length > 0, corrections.length > 0),
    corrections,
    alternatives,
  });
};

export const parseNatural = Effect.fn("chronolizer.parseNatural")(function* (
  input: string,
  options: ParseNaturalOptions,
) {
  const registry = yield* LanguageRegistry;
  const language = yield* registry.resolve(options.locale);
  const normalized = language.normalize(input, language.locale);
  if (normalized.length === 0) {
    return yield* new NaturalLanguageParseError({
      input,
      locale: options.locale,
      message: "The complete input must contain a date-range expression",
    });
  }

  const exact = language.parseExact(normalized);
  const allowedExact = applyFuturePolicy(exact, options.allowFuture);
  if (EffectArray.isReadonlyArrayNonEmpty(allowedExact)) {
    return resultFromCandidates(allowedExact, []);
  }
  if (options.typoMode !== "tolerant") {
    const message =
      exact.length > 0 && options.allowFuture === false
        ? "The expression contains a positive relative shift, but future ranges are disabled"
        : "The complete input is not a supported date-range expression";
    return yield* new NaturalLanguageParseError({ input, locale: options.locale, message });
  }

  const corrected = language.correct?.(normalized, language.vocabulary) ?? [];
  const parsedCorrections = EffectArray.filterMap(corrected, (correction) => {
    const candidates = applyFuturePolicy(language.parseExact(correction.text), options.allowFuture);
    return EffectArray.isReadonlyArrayNonEmpty(candidates)
      ? Result.succeed({ correction, candidates })
      : Result.failVoid;
  });
  const successful = EffectArray.sortWith(
    parsedCorrections,
    (entry) => entry.correction.cost,
    Order.Number,
  );
  if (!EffectArray.isReadonlyArrayNonEmpty(successful)) {
    return yield* new NaturalLanguageParseError({
      input,
      locale: options.locale,
      message: "No conservative typo correction produced a complete expression",
    });
  }
  const first = EffectArray.headNonEmpty(successful);
  const best = EffectArray.prepend(
    EffectArray.takeWhile(
      EffectArray.tailNonEmpty(successful),
      (entry) => entry.correction.cost === first.correction.cost,
    ),
    first,
  );
  return resultFromCandidates(
    EffectArray.flatMap(best, (entry) => entry.candidates),
    first.correction.corrections,
  );
});

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
  const candidateLimit = limit * 2;
  const suggestions = EffectArray.flatMap(
    EffectArray.dedupe(language.suggest(normalized, candidateLimit)),
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

export const formatNatural = Effect.fn("chronolizer.formatNatural")(function* (
  range: DateRangeExpr,
  options: FormatNaturalOptions,
) {
  const registry = yield* LanguageRegistry;
  const language = yield* registry.resolve(options.locale);
  const rendered = language.render(range);
  if (Option.isSome(rendered)) return rendered.value;
  return yield* new NaturalLanguageRenderError({
    locale: options.locale,
    message: "The range has no canonical natural-language form in this locale",
  });
});
