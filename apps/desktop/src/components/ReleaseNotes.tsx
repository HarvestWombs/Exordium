import type * as React from "react";

/** `**bold**` and `code` inside a line of release notes; everything else is plain text. */
function inline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : part.startsWith("`") && part.endsWith("`") && part.length > 2
      ? <code key={i}>{part.slice(1, -1)}</code>
      : part
  );
}

/**
 * A release's notes as written in release-notes/<version>.md: `##` headings, `-` lists and
 * paragraphs. Only that much markdown: the notes are Exordium's own, and nothing in them is HTML.
 */
export function ReleaseNotesText({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (list.length) {
      blocks.push(<ul key={blocks.length}>{list.map((item, i) => <li key={i}>{inline(item)}</li>)}</ul>);
      list = [];
    }
    if (paragraph.length) {
      blocks.push(<p key={blocks.length}>{inline(paragraph.join(" "))}</p>);
      paragraph = [];
    }
  };
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    const item = /^[-*]\s+(.*)$/.exec(line);
    if (!line) flush();
    else if (heading) {
      flush();
      blocks.push(<h4 key={blocks.length}>{inline(heading[1]!)}</h4>);
    } else if (item) {
      if (paragraph.length) flush();
      list.push(item[1]!);
    } else if (list.length && raw.startsWith(" ")) list[list.length - 1] += ` ${line}`;
    else {
      if (list.length) flush();
      paragraph.push(line);
    }
  }
  flush();
  return <div className="release-notes-text">{blocks}</div>;
}
