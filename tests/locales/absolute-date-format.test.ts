import { expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { formatNatural, parseNatural } from "../../src/index.ts";
import { LanguagesLayer } from "./languages.ts";

it.effect.each([
  ["en", "12/1/2025"],
  ["de", "1.12.2025"],
  ["es", "1/12/2025"],
  ["fr", "01/12/2025"],
  ["nl", "1-12-2025"],
  ["tr", "01.12.2025"],
  ["cs", "1. 12. 2025"],
  ["pl", "1.12.2025"],
] as const)(
  "formats an absolute date with Intl for locale %s",
  Effect.fn(function* (testCase) {
    const [locale, expected] = testCase;
    const parsed = yield* parseNatural("2025-12-01", { locale });
    expect(yield* formatNatural(parsed.range, { locale })).toBe(expected);
  }, Effect.provide(LanguagesLayer)),
);
