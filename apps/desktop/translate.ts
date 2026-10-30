/**
 * Translating a mod's description. Google's free endpoint needs no key and detects the language,
 * but it is undocumented and may refuse or change, so a failure is shown beside the description
 * and nothing else depends on it. Only the description is sent.
 */

const ENDPOINT = "https://translate.googleapis.com/translate_a/single";

/** Google refuses much longer bodies; a description past this is cut on its paragraphs. */
const MAX_CHUNK = 4_500;

export interface Translation {
  text: string;
  /** The detected language, as a BCP 47 tag ("de", "zh-CN"). */
  from: string;
}

/** Cut on blank lines, then lines, then spaces, so a chunk never ends inside a word. */
export function chunksOf(text: string, max = MAX_CHUNK): string[] {
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > max) {
    const window = rest.slice(0, max);
    const separator = ["\n\n", "\n", " "].find((candidate) => window.lastIndexOf(candidate) > 0);
    const end = separator ? window.lastIndexOf(separator) + separator.length : max;
    chunks.push(rest.slice(0, end));
    rest = rest.slice(end);
  }
  if (rest) chunks.push(rest);
  return chunks;
}

/** The answer is an array: its first entry holds [translated, original, ...] segments, its third the language. */
export function parseTranslation(body: unknown): Translation {
  const answer: unknown[] = Array.isArray(body) ? body : [];
  const segments = answer[0];
  if (!Array.isArray(segments)) throw new Error("The translation service sent an answer Exordium can't read.");
  const text = segments.map((segment) => Array.isArray(segment) ? segment[0] ?? "" : "").join("");
  if (!text) throw new Error("The translation service sent nothing back.");
  return { text, from: typeof answer[2] === "string" ? answer[2] : "" };
}

export async function translate(text: string, to: string): Promise<Translation> {
  const parts: Translation[] = [];
  for (const chunk of chunksOf(text)) {
    const query = new URLSearchParams({ client: "gtx", sl: "auto", tl: to, dt: "t" });
    const response = await fetch(`${ENDPOINT}?${query}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: new URLSearchParams({ q: chunk }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`The translation service answered ${response.status}.`);
    parts.push(parseTranslation(await response.json()));
  }
  return { text: parts.map((part) => part.text).join(""), from: parts[0]?.from ?? "" };
}
