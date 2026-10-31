import * as React from "react";
import { descriptionLanguage, tr } from "../lib/i18n.ts";
import { sameLanguage, writtenIn } from "../lib/language.ts";

interface Translated {
  text: string;
  from: string;
}

/** Answers kept for this run, so a card scrolled away and back does not ask again. */
const answers = new Map<string, Translated>();

const language = () => descriptionLanguage() || "en";

function languageName(tag: string): string {
  try {
    return new Intl.DisplayNames([language()], { type: "language" }).of(tag) ?? tag;
  } catch {
    return tag;
  }
}

/**
 * A description and its Translate button, into the player's own language. `text` is what to show;
 * `button` goes wherever the card keeps its links, and is null when there is nothing to translate:
 * no description, or one already in that language (writtenIn, which sends nothing to Google).
 */
export function useTranslation(original: string): { text: string; button: React.ReactNode } {
  const [state, setState] = React.useState<{ for: string; on: boolean; busy: boolean; error: string | null }>(
    { for: original, on: false, busy: false, error: null },
  );
  const current = state.for === original ? state : { for: original, on: false, busy: false, error: null };
  const answer = answers.get(`${language()}\n${original}`) ?? null;
  const inTheirLanguage = React.useMemo(() => writtenIn(original, language()), [original]);

  const run = async () => {
    if (answer) return setState({ ...current, on: !current.on });
    setState({ ...current, busy: true, error: null });
    const response = await fetch("/api/translate", {
      method: "POST",
      body: JSON.stringify({ text: original, to: language() }),
    }).catch(() => null);
    const body = await response?.json().catch(() => null);
    if (!response?.ok) {
      return setState({
        ...current,
        busy: false,
        error: body?.error ?? tr("Could not reach the translation service."),
      });
    }
    answers.set(`${language()}\n${original}`, body);
    setState({ ...current, on: true, busy: false, error: null });
  };

  if (!original || inTheirLanguage) return { text: original, button: null };
  const already = answer !== null && sameLanguage(answer.from, language());
  const showing = current.on && answer !== null && !already;
  return {
    text: showing ? answer.text : original,
    button: (
      <>
        <button type="button" className="small-button" disabled={current.busy || already} onClick={() => void run()}>
          {current.busy
            ? tr("Translating…")
            : already
            ? tr("Already in {language}", { language: languageName(answer.from) })
            : showing
            ? tr("Show original")
            : tr("Translate")}
        </button>
        {showing && answer.from && (
          <span className="muted small">
            {tr("From {language}, by Google", { language: languageName(answer.from) })}
          </span>
        )}
        {current.error && <span className="bad-text small">{current.error}</span>}
      </>
    ),
  };
}
