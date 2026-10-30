import de from "../locales/de.json" with { type: "json" };
import es from "../locales/es.json" with { type: "json" };
import fr from "../locales/fr.json" with { type: "json" };

/** The languages the interface speaks, each named in itself. English is the source: its text is the key. */
export const LANGUAGES = { en: "English", fr: "Français", es: "Español", de: "Deutsch" } as const;

export type Language = keyof typeof LANGUAGES;

const CATALOGS: Record<Language, Record<string, string>> = { en: {}, fr, es, de };

let language: Language = "en";
let translationTarget = "en";

function supported(tag: string): Language {
  const base = tag.split("-")[0]!.toLowerCase();
  return base in LANGUAGES ? base as Language : "en";
}

/**
 * Set once before the app's modules load, since some keep labels in constants; changing language
 * reloads the page. `choice` is a language or "system", which follows Windows and falls back to
 * English. Translated descriptions go to the system's language even when the interface can't.
 */
export function setLanguage(choice: string, system: string): void {
  language = supported(choice === "system" ? system : choice);
  translationTarget = choice === "system" ? system : choice;
  if (typeof document !== "undefined") document.documentElement.lang = language;
}

export function currentLanguage(): Language {
  return language;
}

export function descriptionLanguage(): string {
  return translationTarget;
}

type Values = Record<string, string | number | null | undefined>;

function fill(text: string, values?: Values): string {
  if (!values) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name) => name in values ? String(values[name] ?? "") : whole);
}

/** `text` in the interface's language, with its `{name}` placeholders filled in. */
export function tr(text: string, values?: Values): string {
  return fill(CATALOGS[language][text] ?? text, values);
}

/** A count's sentence. A catalog keeps both forms under "one|other", with `{count}` filled in. */
export function plural(count: number, one: string, other: string, values?: Values): string {
  const forms = CATALOGS[language][`${one}|${other}`]?.split("|") ?? [one, other];
  const form = new Intl.PluralRules(language).select(count) === "one" ? forms[0]! : forms[1] ?? forms[0]!;
  return fill(form, { count: formatNumber(count), ...values });
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat(language).format(value);
}

/** `1.5` with the language's own decimal mark. */
export function formatDecimal(value: number, digits = 1): string {
  return new Intl.NumberFormat(language, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(
    value,
  );
}

export function formatDate(value: string | number | Date, options?: Intl.DateTimeFormatOptions): string {
  return new Date(value).toLocaleDateString(language, options);
}

export function formatDateTime(value: string | number | Date): string {
  return new Date(value).toLocaleString(language);
}

export function formatTime(value: string | number | Date): string {
  return new Date(value).toLocaleTimeString(language);
}
