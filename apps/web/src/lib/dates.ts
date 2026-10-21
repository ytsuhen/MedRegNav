// Calendar dates as ISO strings (YYYY-MM-DD), day-precise and time-zone free: the as-of slider moves over day
// numbers, and every date the slider marks comes from the data (when obligations and rules start or stop to apply).
import type { NavigatorModel } from "@mrn/core";
import type { Lang } from "../i18n/dict.ts";

const DAY = 86_400_000;

/** The viewer's local calendar date. */
export function todayIso(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export const isIsoDate = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && fromDays(toDays(value)) === value;

/** Days since 1970-01-01. */
export function toDays(iso: string): number {
  const [y = 1970, m = 1, d = 1] = iso.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY);
}

export function fromDays(days: number): string {
  return new Date(days * DAY).toISOString().slice(0, 10);
}

const formats = new Map<Lang, Intl.DateTimeFormat>();

/** 02.08.2028 in Ukrainian, 2 Aug 2028 in English. */
export function formatDate(iso: string, lang: Lang): string {
  let format = formats.get(lang);
  if (!format) {
    format =
      lang === "uk"
        ? new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" })
        : new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    formats.set(lang, format);
  }
  return format.format(new Date(toDays(iso) * DAY));
}

export interface KeyDate {
  date: string;
  /** Obligations that start to apply on this date. */
  starts: string[];
  /** Obligations that stop applying on this date. */
  ends: string[];
  /** Rules (not hypothetical) that start or stop to apply on this date. */
  rules: string[];
}

/** Every date on which an obligation or a rule starts or stops to apply, in order. */
export function keyDates(model: Pick<NavigatorModel, "obligations" | "rules">): KeyDate[] {
  const byDate = new Map<string, KeyDate>();
  const at = (date: string) => {
    let k = byDate.get(date);
    if (!k) {
      k = { date, starts: [], ends: [], rules: [] };
      byDate.set(date, k);
    }
    return k;
  };
  for (const o of model.obligations) {
    at(o.effective.from).starts.push(o.id);
    if (o.effective.until) at(o.effective.until).ends.push(o.id);
  }
  for (const r of model.rules) {
    if (r.role === "hypothetical" || !r.effective) continue;
    at(r.effective.from).rules.push(r.id);
    if (r.effective.until) at(r.effective.until).rules.push(r.id);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** The slider's range: from the first key date to the end of the year after the last key date (or after today). */
export function sliderRange(dates: readonly KeyDate[], today: string): { min: string; max: string } {
  const first = dates[0]?.date ?? today;
  const last = dates.at(-1)?.date ?? today;
  const year = Math.max(Number(last.slice(0, 4)), Number(today.slice(0, 4))) + 1;
  return { min: first < today ? first : today, max: `${year}-12-31` };
}
