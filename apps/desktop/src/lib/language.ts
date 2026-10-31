import { francAll } from "franc-min";

/**
 * How far ahead of the runner-up the best guess must be, on franc's 0 to 1 score. Measured on 696
 * Archive and ModDB descriptions: below this, Polish patch notes pass as English; at it, none do,
 * but 96 of the 561 called English are left out, being short and full of item names.
 */
const CLEAR_LEAD = 0.08;

/**
 * The lead for English with no letter outside ASCII, which Polish patch notes rarely manage. On the
 * same descriptions this takes in 83 more English ones, and one half-Polish line.
 */
const PLAIN_ENGLISH_LEAD = 0.02;

const NON_ASCII_LETTER = /(?![A-Za-z])\p{L}/u;

/** Shorter text gives franc too little to go on, and it answers "und". */
const MIN_LENGTH = 40;

export const sameLanguage = (a: string, b: string) => a.split("-")[0]!.toLowerCase() === b.split("-")[0]!.toLowerCase();

/**
 * Whether `text` is clearly in `language`, a BCP 47 tag, worked out here with nothing sent anywhere.
 * False means only "not sure": the player can still ask for a translation, and the service says.
 */
export function writtenIn(text: string, language: string): boolean {
  const [best, next] = francAll(text, { minLength: MIN_LENGTH });
  const plainEnglish = sameLanguage(language, "en") && !NON_ASCII_LETTER.test(text);
  if (!best || best[1] - (next?.[1] ?? 0) < (plainEnglish ? PLAIN_ENGLISH_LEAD : CLEAR_LEAD)) return false;
  // franc names languages in ISO 639-3 ("deu"); Intl gives the tag the player's language uses ("de").
  return sameLanguage(Intl.getCanonicalLocales(best[0])[0]!, language);
}
