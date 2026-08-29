import {
  EnglishLanguage,
  formatFilter,
  formatNatural,
  languagePluginsLayer,
  parseNatural,
  suggestNatural,
} from "chronolizer";
import { CzechLanguage } from "chronolizer/locales/cs";
import { GermanLanguage } from "chronolizer/locales/de";
import { SpanishLanguage } from "chronolizer/locales/es";
import { FrenchLanguage } from "chronolizer/locales/fr";
import { DutchLanguage } from "chronolizer/locales/nl";
import { PolishLanguage } from "chronolizer/locales/pl";
import { TurkishLanguage } from "chronolizer/locales/tr";
import { Effect, Fiber, ManagedRuntime } from "effect";

import "./styles.css";

const languages = [
  EnglishLanguage,
  GermanLanguage,
  SpanishLanguage,
  FrenchLanguage,
  DutchLanguage,
  TurkishLanguage,
  CzechLanguage,
  PolishLanguage,
];

const examples = {
  en: "year to date",
  de: "seit Jahresbeginn",
  es: "año hasta la fecha",
  fr: "année à ce jour",
  nl: "jaar tot nu toe",
  tr: "yılbaşından bugüne",
  cs: "rok dosud",
  pl: "rok do dziś",
};

const runtime = ManagedRuntime.make(languagePluginsLayer(languages));

const element = (selector) => {
  const found = document.querySelector(selector);
  if (found === null) throw new Error(`Missing playground element: ${selector}`);
  return found;
};

const expression = element("#expression");
const locale = element("#locale");
const tolerant = element("#tolerant");
const future = element("#future");
const suggestions = element("#suggestions");
const result = element("#result");
const error = element("#error");
const canonical = element("#canonical");
const quality = element("#quality");
const filterOutput = element("#filter-output");
const corrections = element("#corrections");
const alternatives = element("#alternatives");
const errorMessage = element("#error-message");

const options = () => ({
  locale: locale.value,
  typoMode: tolerant.checked ? "tolerant" : "strict",
  allowFuture: future.checked,
});

const parseExpression = Effect.fn(function* (input, parseOptions) {
  const parsed = yield* parseNatural(input, parseOptions);
  const natural = yield* formatNatural(parsed.range, { locale: parseOptions.locale });
  return { parsed, natural, filter: formatFilter(parsed.range) };
});

const describeError = (cause) =>
  cause.message ?? "The expression is not supported in this language.";

const joinOrNone = (entries, render) => {
  if (entries.length === 0) return "None";
  return entries.map(render).join(", ");
};

const renderResult = ({ parsed, natural, filter }) => {
  canonical.textContent = natural;
  quality.textContent = parsed.quality;
  quality.dataset.quality = parsed.quality;
  filterOutput.textContent = JSON.stringify(filter, null, 2);
  corrections.textContent = joinOrNone(
    parsed.corrections,
    (entry) => `${entry.original} → ${entry.replacement}`,
  );
  alternatives.textContent = joinOrNone(parsed.alternatives, (entry) => entry.canonical);
  error.hidden = true;
  result.hidden = false;
};

const renderError = (cause) => {
  errorMessage.textContent = describeError(cause);
  result.hidden = true;
  error.hidden = false;
};

const parseAndRender = Effect.fn((input, parseOptions) =>
  parseExpression(input, parseOptions).pipe(
    Effect.matchEffect({
      onFailure: (cause) => Effect.sync(() => renderError(cause)),
      onSuccess: (parsed) => Effect.sync(() => renderResult(parsed)),
    }),
  ),
);

const hideSuggestions = () => {
  suggestions.replaceChildren();
  suggestions.hidden = true;
  expression.setAttribute("aria-expanded", "false");
};

const renderSuggestions = (entries) => {
  hideSuggestions();
  for (const entry of entries) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.role = "option";
    button.textContent = entry.text;
    button.addEventListener("click", () => {
      runLatest(
        Effect.sync(() => {
          expression.value = entry.text;
          hideSuggestions();
          expression.focus();
        }).pipe(Effect.andThen(updatePlayground())),
      );
    });
    item.append(button);
    suggestions.append(item);
  }
  if (entries.length === 0) return;
  suggestions.hidden = false;
  expression.setAttribute("aria-expanded", "true");
};

const refreshSuggestions = Effect.fn((input, suggestOptions) => {
  if (input.trim().length === 0) return Effect.sync(hideSuggestions);
  return suggestNatural(input, { ...suggestOptions, limit: 6 }).pipe(
    Effect.catch(() => Effect.succeed([])),
    Effect.tap((entries) => Effect.sync(() => renderSuggestions(entries))),
  );
});

const updatePlayground = Effect.fn(function* () {
  const input = expression.value;
  const selectedOptions = options();
  yield* parseAndRender(input, selectedOptions);
  yield* refreshSuggestions(input, selectedOptions);
});

let updateFiber;

const runLatest = (program) => {
  let next = program;
  if (updateFiber !== undefined) {
    next = Fiber.interrupt(updateFiber).pipe(Effect.andThen(program));
  }
  updateFiber = runtime.runFork(next);
};

const updateAfterDelay = () =>
  runLatest(Effect.sleep(100).pipe(Effect.andThen(updatePlayground())));

expression.addEventListener("input", updateAfterDelay);
expression.addEventListener("keydown", (event) => {
  if (event.key === "Escape") runtime.runFork(Effect.sync(hideSuggestions));
});

locale.addEventListener("change", () => {
  runLatest(
    Effect.sync(() => {
      expression.value = examples[locale.value] ?? "";
      hideSuggestions();
    }).pipe(Effect.andThen(updatePlayground())),
  );
});

tolerant.addEventListener("change", () => runLatest(updatePlayground()));
future.addEventListener("change", () => runLatest(updatePlayground()));
document.addEventListener("click", (event) => {
  if (!(event.target instanceof Element) || !event.target.closest(".combobox")) {
    runtime.runFork(Effect.sync(hideSuggestions));
  }
});
window.addEventListener("pagehide", () => Effect.runFork(runtime.disposeEffect));

runLatest(updatePlayground());
