// The map: the device in the centre with its class ladder, the six branches around it, and the leaves of the one
// expanded branch. Positions come from lib/layout.ts (d3-hierarchy) with the heights React Flow measures, so the
// layout needs no coordinates by hand; React Flow draws the nodes and edges and lets the map be dragged or pinched.
// Ink is settled, pencil (dashed) waits for an answer, dotted applies from a later date, the highlighter links causes
// and effects on hover.
import type { AttributeValue, DecisiveUnknown } from "@mrn/core";
import {
  applyNodeChanges,
  type Edge,
  type EdgeProps,
  getBezierPath,
  Handle,
  type Node,
  type NodeChange,
  type NodeProps,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { type Screen, useSnapshot } from "../data.tsx";
import { formatDate } from "../lib/dates.ts";
import { type Layout, layoutMap } from "../lib/layout.ts";
import type { BranchView, DeviceView, LeafState, LeafView } from "../lib/view.ts";
import { type Hover, useApp } from "../state.tsx";
import { proposalWords } from "./Proposal.tsx";
import { useAsk } from "./Questions.tsx";
import { deviceName, tx } from "./ui.tsx";

const SIZE = {
  device: { width: 284, height: 190 },
  branchWidth: 196,
  leafWidth: 252,
  gapX: [54, 36] as [number, number],
  gapY: [22, 8] as [number, number],
  pad: 28,
  minZoom: 0.45,
};
const DEVICE_ID = "device";

type DeviceNodeT = Node<{ device: DeviceView; name: string }, "device">;
type BranchNodeT = Node<{ branch: BranchView; expanded: boolean }, "branch">;
type LeafNodeT = Node<{ leaf: LeafView; side: "left" | "right" }, "leaf">;
type MapNode = DeviceNodeT | BranchNodeT | LeafNodeT;
type EdgeState = LeafState | "none";
type InkEdgeT = Edge<{ state: EdgeState; target: string; support: readonly string[]; proposal: boolean }, "ink">;

const branchKey = (id: string) => `b.${id}`;

/** Is the node with this key and support marked by the current hover? */
function isMarked(hover: Hover | null, key: string, support: readonly string[]): boolean {
  if (!hover) return false;
  return hover.kind === "attr" ? support.includes(hover.id) : hover.key === key;
}

function useHoverProps(key: string, support: readonly string[]) {
  const { hover } = useApp();
  return {
    onMouseEnter: () => hover({ kind: "node", key, support }),
    onMouseLeave: () => hover(null),
    onFocus: () => hover({ kind: "node", key, support }),
    onBlur: () => hover(null),
  };
}

function DeviceNode({ data }: NodeProps<DeviceNodeT>) {
  const { t, state, select } = useApp();
  const { device, name } = data;
  const { ladder, qualification } = device;
  const status = ladder.result.status;
  const possible = ladder.steps.filter((s) => s.state !== "excluded").map((s) => s.id);
  const value = ladder.result.value;
  const hoverProps = useHoverProps(DEVICE_ID, device.support);
  const qual =
    qualification.result.status === "determined"
      ? tx(qualification.labels[0] ?? qualification.rule.title, state.lang)
      : qualification.labels.length <= 2
        ? t("qual.oneOf", { list: qualification.labels.map((l) => tx(l, state.lang)).join(", ") })
        : t("qual.open");
  const first = device.questions[0];
  const proposal = ladder.steps.some((s) => s.proposal !== null && s.proposal !== s.state)
    ? ladder.steps.filter((s) => s.proposal === "value" || s.proposal === "possible").map((s) => s.id)
    : null;
  return (
    <div
      className="node-device"
      data-status={status}
      data-marked={isMarked(state.hover, DEVICE_ID, device.support) || undefined}
      data-testid="device-node"
    >
      <Handle type="source" position={Position.Left} id="left" isConnectable={false} />
      <Handle type="source" position={Position.Right} id="right" isConnectable={false} />
      <p className="device-node-name">{name}</p>
      <p className="device-node-qual" data-status={qualification.result.status}>
        {qual}
      </p>
      <button
        type="button"
        className="ladder nopan"
        data-testid="ladder"
        data-proposal={proposal ? "changed" : undefined}
        aria-label={
          status === "not-applicable"
            ? t("ladder.aria.none")
            : status === "determined"
              ? t("ladder.aria.value", { value: value ?? "" })
              : t("ladder.aria.possible", { list: possible.join(", ") })
        }
        onClick={() => select({ kind: "rule", id: ladder.rule.id })}
        {...hoverProps}
      >
        <span className="ladder-steps" aria-hidden="true">
          {ladder.steps.map((s) => (
            <span key={s.id} className="ladder-step" data-state={s.state} data-proposal={s.proposal ?? undefined}>
              {s.id}
            </span>
          ))}
        </span>
        <span className="ladder-note">
          {status === "not-applicable"
            ? t("ladder.none")
            : status === "determined"
              ? t("ladder.why", { value: value ?? "" })
              : [t("device.openCount", { n: device.questions.length }), ladder.maybeNone ? t("ladder.maybeNone") : ""]
                  .filter(Boolean)
                  .join(". ")}
        </span>
      </button>
      {proposal ? (
        <p className="ladder-proposal" data-testid="ladder-proposal">
          {t("ladder.proposal", { list: proposal.join(", ") || "—" })}
        </p>
      ) : null}
      {first ? <InlineQuestion question={first} more={device.questions.length - 1} /> : null}
      {!first && device.proposalQuestions[0] ? (
        <InlineQuestion question={device.proposalQuestions[0]} more={device.proposalQuestions.length - 1} proposal />
      ) : null}
    </div>
  );
}

function InlineQuestion({
  question,
  more,
  proposal = false,
}: {
  question: DecisiveUnknown;
  more: number;
  proposal?: boolean;
}) {
  const snapshot = useSnapshot();
  const { t, state, answer } = useApp();
  const ask = useAsk();
  const a = snapshot.model.registry.attributes.find((x) => x.id === question.attr);
  if (!a) return null;
  const quick = (value: AttributeValue, label: string) => (
    <button type="button" className="quick nopan" onClick={() => answer(a.id, value)}>
      {label}
    </button>
  );
  return (
    <div className="branch-question" data-testid="branch-question" data-proposal={proposal || undefined}>
      <p>
        <span className="branch-decides">{t(proposal ? "proposal.decides" : "branch.decides")}</span>{" "}
        {tx(a.question, state.lang)}
      </p>
      <div className="quick-answers">
        {a.type === "boolean" ? (
          <>
            {quick(true, t("answer.yes"))}
            {quick(false, t("answer.no"))}
          </>
        ) : (
          <button type="button" className="quick nopan" onClick={() => ask(a.id)}>
            {t("branch.answer")}
          </button>
        )}
        {more > 0 ? <span className="branch-more">{t("branch.more", { n: more })}</span> : null}
      </div>
    </div>
  );
}

function BranchNode({ data }: NodeProps<BranchNodeT>) {
  const { t, state, dispatch } = useApp();
  const { branch, expanded } = data;
  const hoverProps = useHoverProps(branchKey(branch.id), branch.support);
  const date = branch.from ? formatDate(branch.from, state.lang) : "";
  const status =
    branch.state === "none"
      ? t("branch.none")
      : [
          branch.counts.applies > 0 ? t("branch.count", { n: branch.counts.applies }) : "",
          branch.counts.open > 0 ? t("branch.open", { n: branch.counts.open }) : "",
          branch.state === "upcoming" ? t("branch.from", { date }) : "",
        ]
          .filter(Boolean)
          .join(", ");
  const first = branch.questions[0];
  const changes = branch.proposalChanges > 0 ? t("proposal.branch", { n: branch.proposalChanges }) : null;
  return (
    <div
      className="node-branch"
      data-side={branch.side}
      data-state={branch.state}
      data-expanded={expanded || undefined}
      data-marked={isMarked(state.hover, branchKey(branch.id), branch.support) || undefined}
      data-testid={`branch-${branch.id}`}
    >
      <div className="branch-head">
        <Handle
          type="target"
          position={branch.side === "left" ? Position.Right : Position.Left}
          id="in"
          isConnectable={false}
        />
        <Handle
          type="source"
          position={branch.side === "left" ? Position.Left : Position.Right}
          id="out"
          isConnectable={false}
        />
        <button
          type="button"
          className="branch-toggle nopan"
          aria-expanded={expanded}
          onClick={() => dispatch({ type: "branch", branch: expanded ? null : branch.id })}
          {...hoverProps}
        >
          <span className="branch-name">
            <span className="branch-sign" aria-hidden="true">
              {expanded ? "−" : "+"}
            </span>
            <span className="branch-label">{t(`branch.${branch.id}`)}</span>
          </span>
          <span className="branch-status">{status}</span>
          {changes ? <span className="branch-proposal">{changes}</span> : null}
        </button>
      </div>
      {branch.state === "open" && first ? <InlineQuestion question={first} more={branch.questions.length - 1} /> : null}
    </div>
  );
}

function leafMeta(leaf: LeafView, t: ReturnType<typeof useApp>["t"], lang: "uk" | "en"): string | null {
  if (leaf.kind === "rule") {
    if (leaf.optional && leaf.state === "open") return t("leaf.optional");
    if (leaf.state === "open")
      return leaf.outcomes.length === 2
        ? t("leaf.either", { a: tx(leaf.outcomes[0] ?? leaf.title, lang), b: tx(leaf.outcomes[1] ?? leaf.title, lang) })
        : t("leaf.open");
    const words = leaf.outcomes.map((o) => tx(o, lang)).join(", ");
    return leaf.state === "upcoming" && leaf.from
      ? `${words}, ${t("leaf.from", { date: formatDate(leaf.from, lang) })}`
      : words;
  }
  if (leaf.state === "open") return t("leaf.open");
  if (leaf.state === "upcoming" && leaf.from) return t("leaf.from", { date: formatDate(leaf.from, lang) });
  if (leaf.state === "expired" && leaf.until) return t("leaf.until", { date: formatDate(leaf.until, lang) });
  return null;
}

function LeafNode({ data }: NodeProps<LeafNodeT>) {
  const { t, state, select } = useApp();
  const { leaf, side } = data;
  const hoverProps = useHoverProps(leaf.key, leaf.support);
  const selected =
    state.selection !== null &&
    state.selection.kind !== "device" &&
    state.selection.kind === leaf.kind &&
    state.selection.id === leaf.id;
  const meta = leaf.state === "none" ? null : leafMeta(leaf, t, state.lang);
  const proposal = proposalWords(leaf, t, state.lang);
  return (
    <div
      className="node-leaf"
      data-proposal={proposal ? "changed" : undefined}
      data-side={side}
      data-state={leaf.state}
      data-kind={leaf.kind}
      data-optional={leaf.optional || undefined}
      data-selected={selected || undefined}
      data-marked={isMarked(state.hover, leaf.key, leaf.support) || undefined}
      data-testid={`leaf-${leaf.key}`}
    >
      <Handle type="target" position={side === "left" ? Position.Right : Position.Left} id="in" isConnectable={false} />
      <button
        type="button"
        className="leaf-button nopan"
        aria-pressed={selected}
        onClick={() =>
          select(leaf.kind === "rule" ? { kind: "rule", id: leaf.id } : { kind: "obligation", id: leaf.id })
        }
        {...hoverProps}
      >
        <span className="leaf-mark" aria-hidden="true" />
        <span className="leaf-text">
          <span className="leaf-title">{tx(leaf.title, state.lang)}</span>
          {meta ? <span className="leaf-meta">{meta}</span> : null}
          {proposal ? <span className="leaf-proposal">{proposal}</span> : null}
        </span>
      </button>
    </div>
  );
}

function InkEdge({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }: EdgeProps<InkEdgeT>) {
  const { state } = useApp();
  const [path] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, curvature: 0.4 });
  const marked = data ? isMarked(state.hover, data.target, data.support) : false;
  return (
    <g
      className="ink-edge"
      data-state={data?.state}
      data-marked={marked || undefined}
      data-proposal={data?.proposal || undefined}
    >
      {marked ? <path d={path} className="ink-edge-marker" /> : null}
      <path d={path} className="ink-edge-line" />
    </g>
  );
}

const nodeTypes = { device: DeviceNode, branch: BranchNode, leaf: LeafNode };
const edgeTypes = { ink: InkEdge };

/** A first guess at a node's height (replaced by the measured height once React Flow has rendered it). */
function estimate(kind: "branch" | "leaf", text: string, extra = 0): number {
  if (kind === "branch") return 64 + extra;
  const lines = Math.min(3, Math.ceil(text.length / 34));
  return 18 + lines * 19 + extra;
}

interface Spec {
  node: MapNode;
  height: number;
}

function specs(screen: Screen, expanded: string | null, name: string, lang: "uk" | "en"): Spec[] {
  const out: Spec[] = [
    {
      node: {
        id: DEVICE_ID,
        type: "device",
        position: { x: 0, y: 0 },
        data: { device: screen.view.device, name },
      },
      height: SIZE.device.height,
    },
  ];
  for (const b of screen.view.branches) {
    const open = b.state === "open" && b.questions.length > 0;
    out.push({
      node: {
        id: branchKey(b.id),
        type: "branch",
        position: { x: 0, y: 0 },
        data: { branch: b, expanded: expanded === b.id },
      },
      height: estimate("branch", "", open ? 96 : 0),
    });
    if (expanded !== b.id) continue;
    for (const l of b.leaves) {
      out.push({
        node: { id: l.key, type: "leaf", position: { x: 0, y: 0 }, data: { leaf: l, side: b.side } },
        height: estimate("leaf", l.title[lang], l.outcomes.length > 0 || l.state !== "in-force" ? 17 : 0),
      });
    }
  }
  return out;
}

function edgeState(
  screen: Screen,
  nodeId: string,
): { state: EdgeState; support: readonly string[]; proposal: boolean } {
  const b = screen.view.branches.find((x) => branchKey(x.id) === nodeId);
  if (b) return { state: b.state, support: b.support, proposal: false };
  const l = screen.view.leaves.get(nodeId);
  return l
    ? { state: l.state, support: l.support, proposal: l.proposal !== null }
    : { state: "none", support: [], proposal: false };
}

function MapCanvas({ screen }: { screen: Screen }) {
  const snapshot = useSnapshot();
  const { state, t } = useApp();
  const flow = useReactFlow();
  const box = useRef<HTMLDivElement>(null);
  const heights = useRef(new Map<string, number>());
  const [measured, setMeasured] = useState(0);
  const [width, setWidth] = useState(0);
  const [nodes, setNodes] = useState<MapNode[]>([]);
  const example = snapshot.examples.find((e) => e.id === state.example);
  const name = deviceName(example, state.profile, t, state.lang);

  const items = useMemo(() => specs(screen, state.branch, name, state.lang), [screen, state.branch, name, state.lang]);

  const layout: Layout = useMemo(() => {
    void measured;
    const h = (s: Spec) => heights.current.get(s.node.id) ?? s.height;
    const device = items[0];
    return layoutMap({
      device: { id: DEVICE_ID, width: SIZE.device.width, height: device ? h(device) : SIZE.device.height },
      branches: screen.view.branches.map((b) => ({
        id: branchKey(b.id),
        side: b.side,
        height: h(items.find((s) => s.node.id === branchKey(b.id)) as Spec),
        leaves:
          state.branch === b.id
            ? b.leaves.map((l) => ({ id: l.key, height: h(items.find((s) => s.node.id === l.key) as Spec) }))
            : [],
      })),
      branchWidth: SIZE.branchWidth,
      leafWidth: SIZE.leafWidth,
      gapX: SIZE.gapX,
      gapY: SIZE.gapY,
    });
  }, [items, screen.view.branches, state.branch, measured]);

  useEffect(() => {
    const byPlace = new Map(layout.nodes.map((p) => [p.id, p]));
    setNodes((previous) => {
      const before = new Map(previous.map((n) => [n.id, n]));
      return items.map(({ node }) => {
        const p = byPlace.get(node.id);
        const old = before.get(node.id);
        return {
          ...node,
          // React Flow lets pointer events through a node that is neither selectable nor draggable; ours hold buttons.
          style: { pointerEvents: "all" },
          className: "nopan",
          position: { x: p?.x ?? 0, y: p?.y ?? 0 },
          width: p?.width,
          ...(old?.measured ? { measured: old.measured } : {}),
        } as MapNode;
      });
    });
  }, [items, layout]);

  const edges = useMemo<InkEdgeT[]>(
    () =>
      layout.nodes.flatMap((p) => {
        if (!p.parent) return [];
        const { state: s, support, proposal } = edgeState(screen, p.id);
        return [
          {
            id: `${p.parent}->${p.id}`,
            source: p.parent,
            target: p.id,
            sourceHandle: p.parent === DEVICE_ID ? p.side : "out",
            targetHandle: "in",
            type: "ink",
            data: { state: s, target: p.id, support, proposal },
          } as InkEdgeT,
        ];
      }),
    [layout, screen],
  );

  const onNodesChange = useCallback((changes: NodeChange<MapNode>[]) => {
    let changed = false;
    for (const c of changes) {
      if (c.type !== "dimensions" || !c.dimensions) continue;
      const before = heights.current.get(c.id);
      if (before === undefined || Math.abs(before - c.dimensions.height) > 1) {
        heights.current.set(c.id, c.dimensions.height);
        changed = true;
      }
    }
    setNodes((ns) => applyNodeChanges(changes, ns));
    if (changed) setMeasured((m) => m + 1);
  }, []);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { bounds } = layout;
  const zoom = width > 0 ? Math.max(SIZE.minZoom, Math.min(1, (width - 2 * SIZE.pad) / bounds.width)) : 1;
  const height = Math.max(420, Math.ceil((bounds.height + 2 * SIZE.pad) * zoom));

  useEffect(() => {
    if (width === 0) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? true;
    void flow.setViewport(
      {
        x: (width - bounds.width * zoom) / 2 - bounds.x * zoom,
        y: SIZE.pad * zoom - bounds.y * zoom,
        zoom,
      },
      { duration: reduce ? 0 : 220 },
    );
  }, [flow, width, zoom, bounds.x, bounds.y, bounds.width]);

  return (
    <div ref={box} className="map-canvas" style={{ height }}>
      <ReactFlow<MapNode, InkEdgeT>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        nodesDraggable={false}
        nodesConnectable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        elementsSelectable={false}
        panOnDrag
        zoomOnScroll={false}
        zoomOnPinch
        zoomOnDoubleClick={false}
        panOnScroll={false}
        preventScrolling={false}
        minZoom={0.3}
        maxZoom={1.6}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
      />
    </div>
  );
}

export function MapView({ screen }: { screen: Screen }) {
  const { t } = useApp();
  return (
    <section className="map" aria-label={t("map.label")} data-testid="map">
      <ReactFlowProvider>
        <MapCanvas screen={screen} />
      </ReactFlowProvider>
    </section>
  );
}
