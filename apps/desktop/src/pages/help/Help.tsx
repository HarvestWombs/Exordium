import * as React from "react";
import type { ReactNode } from "react";
import { SettingsHead } from "../../components/settings-rows.tsx";
import { About } from "./About.tsx";
import { FAQ, type FaqEntry, type HelpSection, TOPICS } from "./content.ts";

type Page = string; // a topic id, "faq" or "about"

/** Words of the query, lowercased; a hit must contain every one. */
function words(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
}

const plain = (text: string) => text.replace(/\*\*/g, "");

/** `**bold**` as <strong>, and the query's words marked. */
function rich(text: string, marks: string[] = []): ReactNode[] {
  const out: ReactNode[] = [];
  text.split(/(\*\*[^*]+\*\*)/).forEach((part, i) => {
    const bold = part.startsWith("**") && part.endsWith("**");
    const pieces = mark(bold ? part.slice(2, -2) : part, marks, `${i}`);
    if (bold) out.push(<strong key={i}>{pieces}</strong>);
    else out.push(...pieces);
  });
  return out;
}

function mark(text: string, marks: string[], key: string): ReactNode[] {
  if (marks.length === 0) return [text];
  const escaped = marks.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const split = new RegExp(`(${escaped.join("|")})`, "gi");
  return text.split(split).map((piece, i) =>
    marks.includes(piece.toLowerCase()) ? <mark key={`${key}-${i}`}>{piece}</mark> : piece
  );
}

function sectionText(section: HelpSection): string[] {
  return [
    section.heading ?? "",
    ...(section.paragraphs ?? []),
    ...(section.list ?? []),
    ...(section.steps ?? []),
    ...(section.code ? [section.code] : []),
  ];
}

interface Hit {
  key: string;
  page: Page;
  where: string;
  title: string;
  snippet: string;
  faq?: number;
  section?: number;
}

/** Every section and FAQ entry holding all of the query's words, with the line that matched best. */
function search(query: string): Hit[] {
  const wanted = words(query);
  if (wanted.length === 0) return [];
  const matches = (text: string) => wanted.every((w) => text.toLowerCase().includes(w));
  const pick = (lines: string[]) =>
    plain(
      lines.find((line) => wanted.every((w) => line.toLowerCase().includes(w))) ??
        lines.find((line) => wanted.some((w) => line.toLowerCase().includes(w))) ?? lines[0] ?? "",
    );
  const hits: Hit[] = [];
  for (const topic of TOPICS) {
    topic.sections.forEach((section, i) => {
      const lines = sectionText(section);
      if (!matches(`${topic.title} ${lines.join(" ")}`)) return;
      hits.push({
        key: `${topic.id}-${i}`,
        page: topic.id,
        where: topic.group ? `${topic.group} · ${topic.label}` : topic.label,
        title: section.heading ?? topic.title,
        snippet: pick(lines.filter(Boolean)),
        section: i,
      });
    });
  }
  FAQ.forEach((entry, i) => {
    if (!matches(`${entry.q} ${entry.a.join(" ")}`)) return;
    hits.push({ key: `faq-${i}`, page: "faq", where: "FAQ", title: entry.q, snippet: pick(entry.a), faq: i });
  });
  return hits;
}

function Section({ section, id }: { section: HelpSection; id: string }) {
  return (
    <section id={id} className="help-section">
      {section.heading && <h2 className="eyebrow">{section.heading.toUpperCase()}</h2>}
      {section.paragraphs?.map((text, i) => <p key={i}>{rich(text)}</p>)}
      {section.list && (
        <ul>
          {section.list.map((text, i) => <li key={i}>{rich(text)}</li>)}
        </ul>
      )}
      {section.steps && (
        <ol>
          {section.steps.map((text, i) => <li key={i}>{rich(text)}</li>)}
        </ol>
      )}
      {section.code && <pre className="help-code">{section.code}</pre>}
    </section>
  );
}

function Faq({ open, onOpen }: { open: number | null; onOpen: (i: number | null) => void }) {
  return (
    <>
      <SettingsHead
        title="Frequently asked questions"
        text="Short answers; the topics on the left have the long ones."
      />
      <div className="faq">
        {FAQ.map((entry: FaqEntry, i) => (
          <details
            key={entry.q}
            id={`faq-${i}`}
            open={open === i}
            onToggle={(event) => {
              const isOpen = (event.currentTarget as HTMLDetailsElement).open;
              if (isOpen && open !== i) onOpen(i);
              if (!isOpen && open === i) onOpen(null);
            }}
          >
            <summary>{entry.q}</summary>
            {entry.a.map((text, j) => <p key={j}>{rich(text)}</p>)}
          </details>
        ))}
      </div>
    </>
  );
}

/** Help: how Exordium's library and mods work, the FAQ, and About, with a search over all of it. */
export function HelpPage({ version }: { version: string | null }) {
  const [page, setPage] = React.useState<Page>("start");
  const [query, setQuery] = React.useState("");
  const [openFaq, setOpenFaq] = React.useState<number | null>(null);
  // Where to scroll once a search hit's page has rendered.
  const [scrollTo, setScrollTo] = React.useState<string | null>(null);
  const hits = React.useMemo(() => search(query), [query]);
  const searching = words(query).length > 0;
  const topic = TOPICS.find((t) => t.id === page) ?? null;

  React.useEffect(() => {
    if (!scrollTo) return;
    document.getElementById(scrollTo)?.scrollIntoView({ block: "start" });
    setScrollTo(null);
  }, [scrollTo, page, openFaq]);

  function go(next: Page) {
    setQuery("");
    setPage(next);
  }

  function openHit(hit: Hit) {
    go(hit.page);
    if (hit.faq !== undefined) {
      setOpenFaq(hit.faq);
      setScrollTo(`faq-${hit.faq}`);
    } else if (hit.section !== undefined) setScrollTo(`${hit.page}-${hit.section}`);
  }

  const nav = (id: Page, label: string) => (
    <button
      key={id}
      type="button"
      className={!searching && page === id ? "on" : ""}
      onClick={() => go(id)}
    >
      {label}
    </button>
  );

  return (
    <div className="body settings-body">
      <aside className="settings-sidebar">
        <input
          className="help-search"
          type="search"
          value={query}
          placeholder="Search help"
          aria-label="Search help"
          onChange={(e) => setQuery(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && hits[0]) openHit(hits[0]);
            if (e.key === "Escape") setQuery("");
          }}
        />
        <span className="eyebrow">HELP</span>
        {TOPICS.filter((t) => !t.group).map((t) => nav(t.id, t.label))}
        {[...new Set(TOPICS.flatMap((t) => (t.group ? [t.group] : [])))].map((group) => (
          <React.Fragment key={group}>
            <span className="eyebrow">{group.toUpperCase()}</span>
            {TOPICS.filter((t) => t.group === group).map((t) => nav(t.id, t.label))}
          </React.Fragment>
        ))}
        <span className="eyebrow">MORE</span>
        {nav("faq", "FAQ")}
        {nav("about", "About")}
      </aside>
      <div className="settings-page help-page">
        {searching
          ? (
            <>
              <SettingsHead
                title={`Results for “${query.trim()}”`}
                text={hits.length
                  ? `${hits.length} place${hits.length === 1 ? "" : "s"} in Help. Enter opens the first.`
                  : "Nothing in Help mentions that. Try fewer or different words."}
              />
              <div className="help-results">
                {hits.map((hit) => (
                  <button
                    key={hit.key}
                    type="button"
                    className="help-result"
                    onClick={() => openHit(hit)}
                  >
                    <span className="help-result-where">{hit.where}</span>
                    <strong>{mark(hit.title, words(query), hit.key)}</strong>
                    <span className="help-result-snippet">{mark(hit.snippet, words(query), `${hit.key}-s`)}</span>
                  </button>
                ))}
              </div>
            </>
          )
          : page === "faq"
          ? <Faq open={openFaq} onOpen={setOpenFaq} />
          : page === "about"
          ? <About version={version} />
          : topic && (
            <>
              <SettingsHead title={topic.title} text={topic.intro} />
              {topic.sections.map((section, i) => <Section key={i} section={section} id={`${topic.id}-${i}`} />)}
            </>
          )}
      </div>
    </div>
  );
}
