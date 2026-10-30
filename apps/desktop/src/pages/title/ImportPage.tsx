import { tr } from "../../lib/i18n.ts";
import type { Incoming } from "../../lib/incoming.ts";

function Skeleton({ className }: { className?: string }) {
  return <span className={className ? `skeleton ${className}` : "skeleton"} aria-hidden="true" />;
}

/**
 * A mod's page while it is on its way in: what is known already, its progress and Cancel where Play
 * will be, and placeholders for the rest. The app swaps in the real page as it lands.
 */
export function ImportPage(
  { item, onBack, onCancel }: { item: Incoming; onBack: () => void; onCancel: () => void },
) {
  const download = item.kind === "download";
  return (
    <>
      <section className="hero" aria-busy="true">
        <button type="button" className="page-back" onClick={onBack}>
          {tr("‹ Library")}
        </button>
        <Skeleton className="hero-art" />
        <div className="hero-text">
          <div className="eyebrow accent">{download ? tr("DOWNLOADING") : tr("IMPORTING")}</div>
          <h1>{item.title}</h1>
          <div className="hero-sub">{item.subtitle.toUpperCase()}</div>
        </div>
      </section>

      <div className="actionbar import-bar">
        <span className="spinner" aria-hidden="true" />
        <div className="import-progress setup-progress" role="status">
          {item.percent !== null && (
            <div className="update-progress">
              <span style={{ width: `${item.percent}%` }} />
            </div>
          )}
          <span className="muted small">{item.detail ? `${item.status} — ${item.detail}` : item.status}</span>
        </div>
        <button type="button" className="ghost danger" disabled={!item.cancellable} onClick={onCancel}>
          {download ? tr("Cancel download") : tr("Cancel import")}
        </button>
      </div>

      <div className="tabs import-tabs" aria-hidden="true">
        {["w-80", "w-100", "w-90", "w-100", "w-70", "w-50"].map((width, i) => (
          <Skeleton key={i} className={`skeleton-tab ${width}`} />
        ))}
      </div>

      <div className="page" aria-hidden="true">
        <div className="overview">
          <div className="overview-main">
            <section className="characters">
              <Skeleton className="skeleton-heading" />
              <div className="char-grid">
                {[0, 1, 2].map((i) => (
                  <div className="char" key={i}>
                    <Skeleton className="skeleton-line w-70" />
                    <Skeleton className="skeleton-line w-50" />
                  </div>
                ))}
              </div>
            </section>
            <section className="about-mod">
              <Skeleton className="skeleton-heading" />
              <Skeleton className="skeleton-line" />
              <Skeleton className="skeleton-line" />
              <Skeleton className="skeleton-line w-70" />
            </section>
          </div>
          <div className="side">
            {[0, 1].map((i) => (
              <section className="card" key={i}>
                <Skeleton className="skeleton-heading" />
                <Skeleton className="skeleton-line" />
                <Skeleton className="skeleton-line w-70" />
                <Skeleton className="skeleton-line w-50" />
              </section>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
