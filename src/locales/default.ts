import { GermanLanguage } from "./de.ts";
import { EnglishLanguage } from "./en.ts";
import { languagePluginsLayer } from "../language/registry.ts";

export const DefaultLanguageLayer = languagePluginsLayer([EnglishLanguage, GermanLanguage]);
