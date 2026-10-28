// Small shared pieces: picking a data text in the current language, the device's name, the segmented radio group used
// for the market, view and language switches, and the answer control used by the attribute editor and the map's
// inline questions.
import { type Attribute, type AttributeValue, domain, type Example, type Profile, type Text } from "@mrn/core";
import { Fragment, type ReactNode, useId } from "react";
import type { Lang } from "../i18n/dict.ts";
import { useApp } from "../state.tsx";

export const tx = (text: Text, lang: Lang): string => text[lang];

/**
 * A message whose placeholders in `parts` become elements (a hash set in mono, say): the message is translated with
 * a marker in their place and split around the markers, so word order stays the dictionary's.
 */
export function rich(
  t: ReturnType<typeof useApp>["t"],
  key: Parameters<ReturnType<typeof useApp>["t"]>[0],
  parts: Record<string, ReactNode>,
  vars: Record<string, string | number> = {},
): ReactNode[] {
  const marked = Object.fromEntries(Object.keys(parts).map((name) => [name, `\u0000${name}\u0000`]));
  return t(key, { ...vars, ...marked })
    .split("\u0000")
    .map((piece, i) => (i % 2 === 1 && piece in parts ? <Fragment key={piece}>{parts[piece]}</Fragment> : piece));
}

/** The same known answers (unknown and missing alike). */
export function sameProfile(a: Profile, b: Profile): boolean {
  const known = (p: Profile) =>
    Object.entries(p)
      .filter(([, v]) => v !== null && v !== undefined)
      .sort(([x], [y]) => x.localeCompare(y));
  return JSON.stringify(known(a)) === JSON.stringify(known(b));
}

/** The example's title ("… (modified)" once the answers differ), or "your software". */
export function deviceName(
  example: Example | undefined,
  profile: Profile,
  t: ReturnType<typeof useApp>["t"],
  lang: Lang,
): string {
  if (!example) return t("device.custom");
  const name = tx(example.title, lang);
  return sameProfile(example.profile, profile) ? name : t("device.modified", { name });
}

/** The words for an attribute's value ("так", an enum value's label, "не знаю"). */
export function valueLabel(
  attribute: Attribute,
  value: AttributeValue | null,
  lang: Lang,
  t: ReturnType<typeof useApp>["t"],
): string {
  if (value === null) return t("chip.unknown");
  if (attribute.type === "boolean") return t(value === true ? "chip.yes" : "chip.no");
  const v = attribute.values?.find((x) => x.id === value);
  return v ? tx(v.label, lang) : String(value);
}

export function Segmented<T extends string>({
  legend,
  value,
  options,
  onChange,
  testId,
}: {
  legend: string;
  value: T;
  options: { value: T; label: string; disabled?: boolean }[];
  onChange: (value: T) => void;
  testId?: string;
}) {
  const name = useId();
  return (
    <fieldset className="seg" data-testid={testId}>
      <legend className="sr-only">{legend}</legend>
      {options.map((o) => (
        <label key={o.value} className="seg-option" data-checked={o.value === value || undefined}>
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={o.value === value}
            disabled={o.disabled}
            onChange={() => onChange(o.value)}
          />
          <span>{o.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

/** Radio buttons for an attribute: its values (with their help) and "don't know". */
export function AnswerControl({
  attribute,
  value,
  onChange,
  compact = false,
}: {
  attribute: Attribute;
  value: AttributeValue | null;
  onChange: (value: AttributeValue | null) => void;
  compact?: boolean;
}) {
  const { t, state } = useApp();
  const name = useId();
  const options: { key: string; value: AttributeValue | null; label: string; help?: string }[] = [
    ...domain(attribute).map((v) => {
      const enumValue = attribute.values?.find((x) => x.id === v);
      return {
        key: String(v),
        value: v,
        label:
          attribute.type === "boolean"
            ? t(v === true ? "answer.yes" : "answer.no")
            : enumValue
              ? tx(enumValue.label, state.lang)
              : String(v),
        help: enumValue?.help ? tx(enumValue.help, state.lang) : undefined,
      };
    }),
    { key: "unknown", value: null, label: t("answer.unknown") },
  ];
  return (
    <fieldset className={compact ? "answers answers-compact" : "answers"}>
      <legend className="sr-only">{t("answer.legend")}</legend>
      {options.map((o) => (
        <label
          key={o.key}
          className="answer"
          data-checked={o.value === value || undefined}
          data-unknown={o.value === null || undefined}
        >
          <input type="radio" name={name} checked={o.value === value} onChange={() => onChange(o.value)} />
          <span className="answer-label">{o.label}</span>
          {o.help && !compact ? <span className="answer-help">{o.help}</span> : null}
        </label>
      ))}
    </fieldset>
  );
}

export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="link">
      {children}
    </a>
  );
}
