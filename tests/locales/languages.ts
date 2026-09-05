import { languagePluginsLayer } from "../../src/language/registry.ts";
import { CzechLanguage } from "../../src/locales/cs.ts";
import { GermanLanguage } from "../../src/locales/de.ts";
import { EnglishLanguage } from "../../src/locales/en.ts";
import { SpanishLanguage } from "../../src/locales/es.ts";
import { FrenchLanguage } from "../../src/locales/fr.ts";
import { DutchLanguage } from "../../src/locales/nl.ts";
import { PolishLanguage } from "../../src/locales/pl.ts";
import { TurkishLanguage } from "../../src/locales/tr.ts";

export const LanguagesLayer = languagePluginsLayer([
  CzechLanguage,
  GermanLanguage,
  EnglishLanguage,
  SpanishLanguage,
  FrenchLanguage,
  DutchLanguage,
  PolishLanguage,
  TurkishLanguage,
]);
