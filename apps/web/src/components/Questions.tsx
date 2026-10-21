// The open questions and the attributes behind a result, shared by the card, the proposal section, the map and the
// checklist: a list of questions that opens the attribute's editor, and the support chips linked to the map's
// highlighting.
import type { DecisiveUnknown, Profile } from "@mrn/core";
import { useSnapshot } from "../data.tsx";
import { useApp } from "../state.tsx";
import { tx, valueLabel } from "./ui.tsx";

/** Opens the attribute's editor above the map and brings it into view. */
export function useAsk(): (attr: string) => void {
  const { dispatch } = useApp();
  return (attr) => {
    dispatch({ type: "edit", attr });
    requestAnimationFrame(() => {
      const editor = document.getElementById("attribute-editor");
      editor?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      editor?.querySelector<HTMLInputElement>("input:checked, input")?.focus({ preventScroll: true });
    });
  };
}

export function QuestionList({ questions }: { questions: readonly DecisiveUnknown[] }) {
  const snapshot = useSnapshot();
  const { state } = useApp();
  const ask = useAsk();
  if (questions.length === 0) return null;
  return (
    <ul className="question-list">
      {questions.map((q) => {
        const a = snapshot.model.registry.attributes.find((x) => x.id === q.attr);
        return a ? (
          <li key={q.attr}>
            <button type="button" className="question-button" onClick={() => ask(q.attr)}>
              {tx(a.question, state.lang)}
            </button>
          </li>
        ) : null;
      })}
    </ul>
  );
}

/** The attributes behind a result, as small chips linked to the map's highlighting. */
export function SupportList({ support, profile }: { support: readonly string[]; profile: Profile }) {
  const snapshot = useSnapshot();
  const { state, t, hover } = useApp();
  const ask = useAsk();
  const attributes = support.flatMap((id) => snapshot.model.registry.attributes.find((a) => a.id === id) ?? []);
  if (attributes.length === 0) return null;
  return (
    <ul className="support-list">
      {attributes.map((a) => {
        const v = profile[a.id] ?? null;
        const value = valueLabel(a, v, state.lang, t);
        return (
          <li key={a.id}>
            <button
              type="button"
              className="chip chip-small"
              data-known={v !== null || undefined}
              data-marked={(state.hover?.kind === "attr" && state.hover.id === a.id) || undefined}
              onMouseEnter={() => hover({ kind: "attr", id: a.id })}
              onMouseLeave={() => hover(null)}
              onFocus={() => hover({ kind: "attr", id: a.id })}
              onBlur={() => hover(null)}
              onClick={() => ask(a.id)}
            >
              {t("chip.text", { label: tx(a.label, state.lang), value })}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
