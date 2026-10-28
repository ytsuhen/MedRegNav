// The frame around the work: the disclaimer banner (always visible), the masthead (a dark band with the river's
// hexagon waves) with the video guide and the market, language, date, proposals, view, theme and waves controls, the
// placeholder for a market that is not modelled yet, and the footer with the sources' editions and licences.
import { useEffect, useId, useMemo, useState } from "react";
import { useSnapshot } from "../data.tsx";
import { formatDate, fromDays, keyDates, sliderRange, toDays } from "../lib/dates.ts";
import type { View } from "../lib/route.ts";
import { useTheme, useWaves } from "../lib/theme.ts";
import { useApp } from "../state.tsx";
import { ExternalLink, Segmented } from "./ui.tsx";
import { VideoGuide } from "./VideoGuide.tsx";
import { HexWaves } from "./Waves.tsx";

const REPOSITORY = "https://github.com/ytsuhen/MedRegNav";

export function Banner() {
  const { t } = useApp();
  return (
    <p className="banner" role="note" data-testid="banner">
      <strong>{t("banner.lead")}</strong> {t("banner.rest")}
    </p>
  );
}

/** A narrow screen (the checklist is then the default view). */
export function useNarrow(query = "(max-width: 760px)"): boolean {
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const media = window.matchMedia?.(query);
    if (!media) return;
    const on = () => setNarrow(media.matches);
    media.addEventListener("change", on);
    return () => media.removeEventListener("change", on);
  }, [query]);
  return narrow;
}

export function AsOfSlider() {
  const snapshot = useSnapshot();
  const { state, asOf, today, t, dispatch } = useApp();
  const id = useId();
  const dates = useMemo(() => keyDates(snapshot.model), [snapshot]);
  const range = sliderRange(dates, today);
  const [min, max] = [toDays(range.min), toDays(range.max)];
  const value = toDays(asOf);
  const keys = dates.map((d) => toDays(d.date));
  const set = (days: number) => {
    const iso = fromDays(days);
    dispatch({ type: "asOf", asOf: iso === today ? null : iso });
  };
  const snap = (days: number) => keys.find((k) => Math.abs(k - days) <= 6) ?? days;
  const pct = (days: number) => `${((days - min) / (max - min)) * 100}%`;
  const prev = [...keys].reverse().find((k) => k < value);
  const next = keys.find((k) => k > value);
  return (
    <div className="asof" data-testid="asof">
      <label htmlFor={id} className="asof-label">
        {t("asOf.label")} <output htmlFor={id}>{formatDate(asOf, state.lang)}</output>
      </label>
      <div className="asof-row">
        <button
          type="button"
          className="asof-step"
          aria-label={t("asOf.prev")}
          disabled={prev === undefined}
          onClick={() => prev !== undefined && set(prev)}
        >
          <svg viewBox="0 0 10 10" aria-hidden="true">
            <path d="M6.5 1.5 3 5l3.5 3.5" />
          </svg>
        </button>
        <div className="asof-track">
          <input
            id={id}
            type="range"
            min={min}
            max={max}
            step={1}
            value={value}
            aria-valuetext={formatDate(asOf, state.lang)}
            onChange={(e) => set(snap(Number(e.target.value)))}
          />
          <span className="asof-marks" aria-hidden="true">
            {dates.map((d) => (
              <span
                key={d.date}
                className="asof-mark"
                style={{ left: pct(toDays(d.date)) }}
                title={t("asOf.tick", { date: formatDate(d.date, state.lang), n: d.starts.length })}
              />
            ))}
            <span className="asof-today" style={{ left: pct(toDays(today)) }} />
          </span>
        </div>
        <button
          type="button"
          className="asof-step"
          aria-label={t("asOf.next")}
          disabled={next === undefined}
          onClick={() => next !== undefined && set(next)}
        >
          <svg viewBox="0 0 10 10" aria-hidden="true">
            <path d="M3.5 1.5 7 5 3.5 8.5" />
          </svg>
        </button>
      </div>
      <span className="asof-ends" aria-hidden="true">
        <span>{range.min.slice(0, 4)}</span>
        {state.asOf && state.asOf !== today ? (
          <button type="button" className="text-button" onClick={() => dispatch({ type: "asOf", asOf: null })}>
            {t("asOf.today")}
          </button>
        ) : (
          <span>{t("asOf.todayMark", { date: formatDate(today, state.lang) })}</span>
        )}
        <span>{range.max.slice(0, 4)}</span>
      </span>
    </div>
  );
}

function ProposalsToggle() {
  const snapshot = useSnapshot();
  const { state, t, dispatch } = useApp();
  const available = snapshot.model.rules.some((r) => r.role === "hypothetical");
  return (
    <label className="switch" title={available ? t("proposals.on") : t("proposals.none")} data-testid="proposals">
      <input
        type="checkbox"
        role="switch"
        aria-checked={available && state.proposals}
        checked={available && state.proposals}
        disabled={!available}
        onChange={(e) => dispatch({ type: "proposals", on: e.target.checked })}
      />
      <span className="switch-track" aria-hidden="true" />
      <span>{t("proposals.label")}</span>
    </label>
  );
}

export function Masthead({ view }: { view: View }) {
  const { state, t, dispatch } = useApp();
  return (
    <header className="masthead sea-band">
      <HexWaves water="river" />
      <div className="masthead-title">
        <h1>{t("app.title")}</h1>
        <p className="lede">{t("app.lede")}</p>
        <VideoGuide />
      </div>
      <div className="masthead-controls">
        <Segmented
          legend={t("market.legend")}
          testId="market"
          value={state.market}
          options={[
            { value: "EU", label: t("market.EU") },
            { value: "US", label: t("market.US") },
          ]}
          onChange={(market) => dispatch({ type: "market", market })}
        />
        <Segmented
          legend={t("lang.legend")}
          testId="lang"
          value={state.lang}
          options={[
            { value: "uk", label: t("lang.uk") },
            { value: "en", label: t("lang.en") },
          ]}
          onChange={(lang) => dispatch({ type: "lang", lang })}
        />
        {state.market === "EU" ? <AsOfSlider /> : null}
        {state.market === "EU" ? <ProposalsToggle /> : null}
        {state.market === "EU" ? (
          <Segmented
            legend={t("view.legend")}
            testId="view"
            value={view}
            options={[
              { value: "map", label: t("view.map") },
              { value: "checklist", label: t("view.checklist") },
            ]}
            onChange={(v) => dispatch({ type: "view", view: v })}
          />
        ) : null}
        <ThemeSwitch />
        <WavesSwitch />
      </div>
    </header>
  );
}

/** The hexagon waves or the plain look, with either theme (lib/theme.ts). */
function WavesSwitch() {
  const { t } = useApp();
  const [on, setOn] = useWaves();
  return (
    <Segmented
      legend={t("waves.legend")}
      testId="waves"
      value={on ? "on" : "off"}
      options={[
        { value: "on", label: t("waves.on") },
        { value: "off", label: t("waves.off") },
      ]}
      onChange={(v) => setOn(v === "on")}
    />
  );
}

/** Light or dark: the system's scheme until the reader picks one (lib/theme.ts). */
function ThemeSwitch() {
  const { t } = useApp();
  const [theme, setTheme] = useTheme();
  return (
    <Segmented
      legend={t("theme.legend")}
      testId="theme"
      value={theme}
      options={[
        { value: "light", label: t("theme.light") },
        { value: "dark", label: t("theme.dark") },
      ]}
      onChange={setTheme}
    />
  );
}

export function NextStage() {
  const { t, dispatch } = useApp();
  return (
    <main className="next-stage" data-testid="next-stage">
      <h2>{t("us.heading")}</h2>
      <p>{t("us.body")}</p>
      <button type="button" className="button" onClick={() => dispatch({ type: "market", market: "EU" })}>
        {t("us.back")}
      </button>
    </main>
  );
}

export function Footer() {
  const snapshot = useSnapshot();
  const { t, state } = useApp();
  const sources = Object.values(snapshot.sources);
  return (
    <footer className="footer">
      <p>{t("footer.texts")}</p>
      <p>
        {t("footer.code")} <ExternalLink href={REPOSITORY}>{t("footer.repo")}</ExternalLink>
      </p>
      <details>
        <summary>{t("footer.sources", { n: sources.length })}</summary>
        <ul className="footer-sources">
          {sources.map((s) => (
            <li key={s.id}>
              <ExternalLink href={s.link}>{s.shortTitle}</ExternalLink> <span lang="en">{s.edition}</span>,{" "}
              {t("footer.retrieved", { date: formatDate(s.retrievedAt.slice(0, 10), state.lang) })}
            </li>
          ))}
        </ul>
      </details>
    </footer>
  );
}
