// The device's description as attribute chips above the map: answered ones in ink, unanswered ones that would change
// something in pencil (dashed, "don't know"), the rest folded away. A chip opens its editor (the question, how to
// answer it, the concept's source); hovering a chip marks the branches it causes on the map.
import type { AttributeValue } from "@mrn/core";
import { useSnapshot } from "../data.tsx";
import type { ChipView, ScreenView } from "../lib/view.ts";
import { useApp } from "../state.tsx";
import { deviceName } from "./Card.tsx";
import { Quote } from "./Quote.tsx";
import { AnswerControl, tx, valueLabel } from "./ui.tsx";

function Chip({ chip }: { chip: ChipView }) {
  const { state, t, dispatch, hover } = useApp();
  const a = chip.attribute;
  const value = valueLabel(a, chip.value, state.lang, t);
  const marked =
    state.hover?.kind === "attr" ? state.hover.id === a.id : state.hover ? state.hover.support.includes(a.id) : false;
  const open = state.editing === a.id;
  return (
    <button
      type="button"
      className="chip"
      data-known={chip.value !== null || undefined}
      data-for-check={chip.forCheck || undefined}
      data-marked={marked || undefined}
      data-testid={`chip-${a.id}`}
      aria-expanded={open}
      aria-controls={open ? "attribute-editor" : undefined}
      aria-label={t("chip.aria", { label: tx(a.label, state.lang), value })}
      onClick={() => dispatch({ type: "edit", attr: open ? null : a.id })}
      onMouseEnter={() => hover({ kind: "attr", id: a.id })}
      onMouseLeave={() => hover(null)}
      onFocus={() => hover({ kind: "attr", id: a.id })}
      onBlur={() => hover(null)}
    >
      <span className="chip-label">{tx(a.label, state.lang)}</span>
      <span className="chip-value">{value}</span>
    </button>
  );
}

function AttributeEditor({ id }: { id: string }) {
  const snapshot = useSnapshot();
  const { state, t, dispatch, answer } = useApp();
  const a = snapshot.model.registry.attributes.find((x) => x.id === id);
  if (!a) return null;
  const v = state.profile[a.id];
  const value: AttributeValue | null = v === undefined ? null : v;
  return (
    <section
      id="attribute-editor"
      className="editor"
      aria-labelledby="attribute-question"
      data-testid="attribute-editor"
    >
      <div className="editor-main">
        <h3 id="attribute-question" className="editor-question">
          {tx(a.question, state.lang)}
        </h3>
        <p className="editor-help">{tx(a.help, state.lang)}</p>
        <AnswerControl attribute={a} value={value} onChange={(next) => answer(a.id, next)} />
        <button type="button" className="button" onClick={() => dispatch({ type: "edit", attr: null })}>
          {t("editor.close")}
        </button>
      </div>
      <div className="editor-source">
        <p className="editor-source-title">{t("editor.concept")}</p>
        {a.citations.slice(0, 1).map((c) => (
          <Quote key={`${c.source}/${c.section}/${c.start}`} citation={c} context={140} />
        ))}
      </div>
    </section>
  );
}

export function DeviceChips({ view }: { view: ScreenView }) {
  const snapshot = useSnapshot();
  const { state, t, dispatch } = useApp();
  const presets = snapshot.examples.filter((e) => e.preset);
  const example = snapshot.examples.find((e) => e.id === state.example);
  return (
    <section className="device" aria-labelledby="device-heading" data-testid="device-chips">
      <div className="device-bar">
        <h2 id="device-heading" className="device-heading">
          {deviceName(example, state.profile, t, state.lang)}
        </h2>
        <label className="preset">
          <span>{t("preset.label")}</span>
          <select
            value={state.example ?? ""}
            data-testid="preset"
            onChange={(e) =>
              dispatch({ type: "example", example: snapshot.examples.find((x) => x.id === e.target.value) ?? null })
            }
          >
            <option value="">{t("preset.none")}</option>
            {presets.map((e) => (
              <option key={e.id} value={e.id}>
                {tx(e.title, state.lang)}
              </option>
            ))}
            {example && !example.preset ? <option value={example.id}>{tx(example.title, state.lang)}</option> : null}
          </select>
        </label>
        <button type="button" className="text-button" onClick={() => dispatch({ type: "clear" })}>
          {t("device.clear")}
        </button>
      </div>
      <div className="chip-groups">
        {view.chips.groups.map((g) => (
          <div key={g.group} className="chip-group">
            <span className="chip-group-name" id={`chips-${g.group}`}>
              {t(`group.${g.group}`)}
            </span>
            <ul className="chip-list" aria-labelledby={`chips-${g.group}`}>
              {g.chips.map((c) => (
                <li key={c.attribute.id}>
                  <Chip chip={c} />
                </li>
              ))}
            </ul>
          </div>
        ))}
        {view.chips.rest.length > 0 ? (
          <div className="chip-group chip-rest">
            <span className="chip-group-name" aria-hidden="true" />
            <ul className="chip-list" aria-label={t("chips.rest.hint")}>
              <li>
                <button
                  type="button"
                  className="text-button"
                  aria-expanded={state.showRest}
                  title={t("chips.rest.hint")}
                  onClick={() => dispatch({ type: "showRest", on: !state.showRest })}
                >
                  {state.showRest ? t("chips.rest.hide") : t("chips.rest.show", { n: view.chips.rest.length })}
                </button>
              </li>
              {state.showRest
                ? view.chips.rest.map((c) => (
                    <li key={c.attribute.id}>
                      <Chip chip={c} />
                    </li>
                  ))
                : null}
            </ul>
          </div>
        ) : null}
      </div>
      {state.editing ? <AttributeEditor id={state.editing} /> : null}
    </section>
  );
}
