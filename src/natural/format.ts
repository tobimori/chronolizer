import { Effect, Option } from "effect";

import type { DateRangeExpr } from "../ast/schemas.ts";
import { NaturalLanguageRenderError } from "../language/errors.ts";
import { LanguageRegistry } from "../language/registry.ts";

export interface FormatNaturalOptions {
  readonly locale: string;
}

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
    message: "The range has no standard natural-language form for this language",
  });
});
