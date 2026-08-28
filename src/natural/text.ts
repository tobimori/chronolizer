export const normalizeNaturalText = (input: string, locale: string) =>
  input.normalize("NFKC").toLocaleLowerCase(locale).trim().replace(/\s+/gu, " ");

export const naturalWords = (input: string) => (input.length === 0 ? [] : input.split(" "));
