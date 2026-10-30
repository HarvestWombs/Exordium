import { plural, tr } from "../../lib/i18n.ts";
import * as React from "react";
import { Lightbox } from "../../components/Lightbox.tsx";
import { Stat } from "../../components/Stat.tsx";
import { GearIcon, HeartIcon, PlayIcon, TitleIcon } from "../../components/icons.tsx";
import { useTranslation } from "../../hooks/useTranslation.tsx";
import { artUrl, screenshotUrl } from "../../lib/art.ts";
import { openLink, playTime, relative, RENDERERS } from "../../lib/util.ts";
import type { Character, Playtime, Screenshot, Tab, Title } from "../../types.ts";
import { Backups } from "./Backups.tsx";
import { Logs } from "./Logs.tsx";
import { ActivityFeed, DocPanel, ScreenshotStrip, WhatsNew } from "./Overview.tsx";

export function TitlePage(
  {
    t,
    root,
    art,
    tab,
    onTab,
    playedAt,
    playtime,
    running,
    favorite,
    starting,
    onPlay,
    onFavorite,
    onProperties,
    onBack,
    missingCore,
    coreJob,
    onInstallCore,
  }: {
    t: Title;
    root: string;
    art: number;
    tab: Tab;
    onTab: (tab: Tab) => void;
    playedAt: string | null;
    playtime: Playtime | null;
    /** How many copies of this title are running; Play starts another. */
    running: number;
    favorite: boolean;
    starting: boolean;
    onPlay: () => void;
    onFavorite: () => void;
    onProperties: () => void;
    /** Back to the library grid. */
    onBack: () => void;
    /** The mod's core when the library does not have it: Play becomes Install core. */
    missingCore: string | null;
    coreJob: { core: string; received: number; total: number } | null;
    onInstallCore: (core: string) => void;
  },
) {
  const errors = t.problems.filter((p) => p.level === "error");
  const translation = useTranslation(t.description ?? "");
  const [characters, setCharacters] = React.useState<Character[] | null>(null);
  const [screenshots, setScreenshots] = React.useState<Screenshot[] | null>(null);
  React.useEffect(() => {
    setCharacters(null);
    void (async () => {
      const response = await fetch(`/api/characters?root=${encodeURIComponent(root)}&key=${encodeURIComponent(t.key)}`);
      if (response.ok) setCharacters((await response.json()).characters);
    })();
  }, [root, t.key]);
  React.useEffect(() => {
    setScreenshots(null);
    if (tab !== "screenshots") return;
    void (async () => {
      const response = await fetch(
        `/api/screenshots?root=${encodeURIComponent(root)}&key=${encodeURIComponent(t.key)}`,
      );
      if (response.ok) setScreenshots((await response.json()).screenshots);
    })();
  }, [root, t.key, tab]);

  // The action bar sticks to the top of the page; once the header has scrolled past, it slims down and
  // names the title beside Play, as Steam's does. The marker sits just above the bar, so the bar's own
  // change of height never moves the point where it changes.
  const marker = React.useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = React.useState(false);
  React.useEffect(() => {
    const node = marker.current;
    const scroller = node?.closest(".main");
    if (!node || !scroller) return;
    const observer = new IntersectionObserver(([entry]) => setStuck(!entry!.isIntersecting), { root: scroller });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const [gallery, setGallery] = React.useState<number | null>(null);

  return (
    <>
      <section className={t.art.banner === "png" ? "hero art" : "hero"}>
        <button type="button" className="page-back" onClick={onBack}>
          {tr("‹ Library")}
        </button>
        {t.art.banner === "png" && <img className="hero-art" src={artUrl(root, t.key, "banner", art)} alt="" />}
        {t.art.banner === "d2se" && (
          <div className="plate">
            <img src={artUrl(root, t.key, "banner", art)} alt={`${t.title} banner`} />
          </div>
        )}
        <div className="hero-text">
          <div className={t.author ? "eyebrow accent" : "eyebrow accent unknown"}>
            {t.author ? tr("BY {author}", { author: t.author.toUpperCase() }) : tr("AUTHOR UNKNOWN")}
          </div>
          <h1>{t.title}</h1>
          <div className="hero-sub">
            {t.kind === "core"
              ? tr("VANILLA · CORE {core}", { core: t.core })
              : tr("MOD · CORE {core}", { core: t.core ?? "?" })}
            {t.version ? ` · V${t.version}` : ""}
          </div>
        </div>
      </section>

      <div ref={marker} className="actionbar-marker" />
      <div className={stuck ? "actionbar stuck" : "actionbar"}>
        {missingCore
          ? (
            <button
              type="button"
              className="play"
              disabled={coreJob !== null}
              title={tr("This mod runs on core {missingCore}, which is not in your library yet.", { missingCore })}
              onClick={() => onInstallCore(missingCore)}
            >
              {coreJob
                ? tr("INSTALLING {core}{progress}", {
                  core: coreJob.core,
                  progress: coreJob.total > 0
                    ? ` · ${Math.min(100, Math.round((coreJob.received / coreJob.total) * 100))}%`
                    : "…",
                })
                : tr("INSTALL CORE {missingCore}", { missingCore })}
            </button>
          )
          : (
            <button
              type="button"
              className="play"
              disabled={starting || errors.length > 0}
              title={running > 0 ? tr("{running} running — start another copy", { running }) : undefined}
              onClick={onPlay}
            >
              {starting ? tr("STARTING…") : (
                <>
                  <PlayIcon /> {tr("PLAY")}
                  {running > 0 && <span className="play-count" aria-label={`${running} running`}>{running}</span>}
                </>
              )}
            </button>
          )}
        <div className="actionbar-title">
          <TitleIcon t={t} root={root} art={art} size={28} />
          <span>{t.title}</span>
        </div>
        <Stat label={tr("LAST PLAYED")} value={playedAt ? relative(playedAt) : "Never"} />
        <Stat label={tr("PLAY TIME")} value={playtime ? playTime(playtime.seconds) : "—"} />
        <Stat
          label={tr("RENDERER")}
          value={t.settings
            ? `${RENDERERS[t.settings.renderer] ?? t.settings.renderer}${t.settings.windowed ? tr(" · windowed") : ""}`
            : "—"}
        />
        <Stat label={tr("CHARACTERS")} value={characters === null ? "…" : String(characters.length)} />
        {running > 0 && <Stat label={tr("RUNNING")} value={plural(running, "{count} copy", "{count} copies")} />}
        <div className="grow" />
        <button
          type="button"
          className={favorite ? "square favorite on" : "square favorite"}
          aria-label={favorite ? tr("Remove from favorites") : tr("Add to favorites")}
          aria-pressed={favorite}
          title={favorite ? tr("Remove from favorites") : tr("Add to favorites")}
          onClick={onFavorite}
        >
          <HeartIcon filled={favorite} />
        </button>
        <button type="button" className="square" aria-label={tr("Properties")} onClick={onProperties}>
          <GearIcon />
        </button>
      </div>

      <nav className="tabs" role="tablist">
        {(["overview", "documentation", "changelogs", "screenshots", "backups", "logs"] as const).map((name) => (
          <button
            type="button"
            role="tab"
            aria-selected={tab === name}
            key={name}
            className={tab === name ? "tab on" : "tab"}
            onClick={() => onTab(name)}
          >
            {{
              overview: tr("Overview"),
              documentation: tr("Documentation"),
              changelogs: tr("Changelogs"),
              screenshots: tr("Screenshots"),
              backups: tr("Backups"),
              logs: tr("Logs"),
            }[name]}
            {name === "screenshots" && t.screenshots > 0 ? ` · ${t.screenshots}` : ""}
            {name === "documentation" && t.docs.length > 0 ? ` · ${t.docs.length}` : ""}
            {name === "changelogs" && t.changelogs.length > 0 ? ` · ${t.changelogs.length}` : ""}
          </button>
        ))}
      </nav>

      <div className="page">
        {tab === "overview" && (
          <div className="overview">
            <div className="overview-main">
              <section className="characters">
                <div className="section-head">
                  <h2 className="eyebrow">{tr("CHARACTERS")}</h2>
                  <span className="muted small">
                    {t.kind === "core" ? tr("from the core's own save folder") : tr("from the mod's own save folder")}
                  </span>
                </div>
                {characters === null && <p className="muted">{tr("Reading saves…")}</p>}
                {characters?.length === 0 && <p className="muted">{tr("No characters yet.")}</p>}
                <div className="char-grid">
                  {characters?.map((c) => (
                    <div className="char" key={c.name}>
                      <span className="char-name">{c.name}</span>
                      <span className="char-meta">
                        {tr("Level {level} {className}", { level: c.level, className: c.className })}
                      </span>
                      <span className="char-tags">
                        {c.expansion
                          ? <span className="good-text">{tr("Expansion")}</span>
                          : <span className="muted">{tr("Classic")}</span>}
                        {c.hardcore && (
                          <span className={c.dead ? "bad-text" : "warn-text"}>
                            {c.dead ? tr("Hardcore · dead") : tr("Hardcore")}
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
              {t.description && (
                <section className="about-mod">
                  <h2 className="eyebrow">{tr("ABOUT THIS MOD")}</h2>
                  <p>{translation.text}</p>
                  <div className="mod-under">{translation.button}</div>
                </section>
              )}
              <ScreenshotStrip root={root} t={t} />
              <WhatsNew t={t} onOpen={() => onTab("changelogs")} />
              <ActivityFeed root={root} t={t} running={running} />
            </div>
            <aside className="side">
              <section className="card">
                <h2 className="eyebrow">{tr("DETAILS")}</h2>
                <dl className="kv">
                  <dt>{tr("Version")}</dt>
                  <dd>{t.version ?? "—"}</dd>
                  <dt>{tr("Core")}</dt>
                  <dd>{t.core ?? "—"}</dd>
                  <dt>{tr("Author")}</dt>
                  <dd>{t.author ?? tr("Unknown")}</dd>
                  <dt>{tr("Sessions")}</dt>
                  <dd>{playtime?.runs ?? 0}</dd>
                </dl>
              </section>
              <section className="card">
                <h2 className="eyebrow">{tr("LINKS")}</h2>
                {t.links.length === 0
                  ? <p className="muted small">{tr("None yet. Add a website or Discord in Properties.")}</p>
                  : (
                    <ul className="links">
                      {t.links.map((link) => (
                        <li key={link.url}>
                          <a
                            href={link.url}
                            className="link-text"
                            title={link.url}
                            onClick={(e) => {
                              e.preventDefault();
                              void openLink(link.url);
                            }}
                          >
                            {link.label}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
              </section>
              <section className="card">
                <h2 className="eyebrow">{tr("HOW IT LAUNCHES")}</h2>
                {t.settings
                  ? (
                    <dl className="kv">
                      <dt>{tr("Renderer")}</dt>
                      <dd>{RENDERERS[t.settings.renderer] ?? t.settings.renderer}</dd>
                      <dt>{tr("Window")}</dt>
                      <dd>{t.settings.windowed ? tr("Windowed") : tr("Fullscreen")}</dd>
                      <dt>{tr("Data")}</dt>
                      <dd>
                        {[t.settings.direct && "-direct", t.settings.txt && "-txt"].filter(Boolean).join(" ") ||
                          tr("MPQs only")}
                      </dd>
                      <dt>{tr("Options")}</dt>
                      <dd>
                        {[
                          t.settings.noSound && "-ns",
                          t.settings.skipToBNet && "-skiptobnet",
                          t.settings.startAct && `-act${t.settings.startAct}`,
                          t.settings.seed && `-seed ${t.settings.seed}`,
                        ].filter(Boolean).join(" ") || tr("Default")}
                      </dd>
                      <dt>{tr("Language")}</dt>
                      <dd>{t.settings.language ?? tr("MOD")}</dd>
                    </dl>
                  )
                  : <p className="muted">{tr("No D2SE_SETUP.ini.")}</p>}
              </section>
              <section className="card">
                <h2 className="eyebrow">{tr("PLUGINS")}</h2>
                {t.plugins.length === 0 ? <p className="muted">{tr("None.")}</p> : (
                  <div className="pills">
                    {t.plugins.map((p) => <span className="pill" key={p.path}>{p.path.replace(/\.dll$/i, "")}</span>)}
                  </div>
                )}
              </section>
              <section className="card readiness">
                {t.problems.length === 0
                  ? (
                    <p>
                      <span className="dot good" /> {tr("Ready to play. No problems found.")}
                    </p>
                  )
                  : (
                    <ul className="problems">
                      {t.problems.map((p, i) => <li key={i} className={p.level}>{p.message}</li>)}
                    </ul>
                  )}
              </section>
            </aside>
          </div>
        )}

        {tab === "documentation" && (
          <DocPanel
            titleKey={t.key}
            entries={t.docs}
            empty={tr("This mod ships no documentation: no readme, and no HTML pages in its folder.")}
          />
        )}

        {tab === "changelogs" && (
          <DocPanel titleKey={t.key} entries={t.changelogs} empty={tr("No changelog found in the mod's folder.")} />
        )}

        {tab === "screenshots" && (
          <section className="screenshots">
            <div className="section-head">
              <h2 className="eyebrow">{tr("SCREENSHOTS")}</h2>
              <span className="muted small">
                {t.kind === "core" ? tr("from the core's Screenshots folder") : tr("from the mod's Screenshots folder")}
              </span>
            </div>
            {screenshots === null && <p className="muted">{tr("Reading screenshots…")}</p>}
            {screenshots?.length === 0 && <p className="muted">{tr("No screenshots found.")}</p>}
            <div className="screenshot-grid">
              {screenshots?.map((shot, i) => (
                <button
                  type="button"
                  className="screenshot"
                  key={shot.name}
                  title={shot.name}
                  onClick={() => setGallery(i)}
                >
                  <img src={screenshotUrl(root, t.key, shot.name)} alt={shot.name} loading="lazy" />
                  <span>{shot.name}</span>
                </button>
              ))}
            </div>
            {gallery !== null && screenshots && (
              <Lightbox
                images={screenshots.map((shot) => ({
                  src: screenshotUrl(root, t.key, shot.name),
                  caption: shot.name,
                }))}
                start={gallery}
                onClose={() => setGallery(null)}
              />
            )}
          </section>
        )}

        {tab === "backups" && <Backups root={root} titleKey={t.key} running={running} />}
        {tab === "logs" && <Logs root={root} titleKey={t.key} />}
      </div>
    </>
  );
}
