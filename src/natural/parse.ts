import { Array as EffectArray, Effect, Order, Result } from "effect";

import { rangeKey } from "../filter/codec.ts";
import { NaturalLanguageParseError } from "../language/errors.ts";
import { LanguageRegistry } from "../language/registry.ts";
import { NaturalAlternative, NaturalParseResult } from "../language/model.ts";
import type { Correction, NaturalCandidate } from "../language/model.ts";
import { applyFuturePolicy } from "./policy.ts";

export interface ParseNaturalOptions {
  readonly locale: string;
  readonly typoMode?: "strict" | "tolerant";
  readonly allowFuture?: boolean;
}

const distinctCandidates = (candidates: EffectArray.NonEmptyReadonlyArray<NaturalCandidate>) =>
  EffectArray.dedupeWith(
    candidates,
    (left, right) => rangeKey(left.range) === rangeKey(right.range),
  );

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
      message: "The complete input must contain a date range",
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
        ? "This date range is in the future, but future ranges are disabled"
        : "The complete input is not a supported date range";
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
      message: "No supported date range was found after spelling correction",
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
