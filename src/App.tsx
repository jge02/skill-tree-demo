import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import rawTree from './data/skillTree.json';
import { SkillNodeCard, type SkillFlowNode, type SkillNodeData } from './components/SkillNodeCard';
import { DetailPanel } from './components/DetailPanel';
import { buildGraph, computeLayout, isUnlocked, NODE_HEIGHT, NODE_WIDTH } from './layout';
import { computeVisibleIds, enterDelayFor } from './reveal';
import { normalizeTree, type NodeStatus } from './schema';

const STORAGE_KEY = 'skill-tree-demo:v1';
const nodeTypes = { skill: SkillNodeCard };

interface SavedState {
  done: string[];
  currentId: string | null;
  showAll: boolean;
}

const snapshot = normalizeTree(rawTree);
const graph = buildGraph(snapshot.nodes, snapshot.edges);
const layout = computeLayout(snapshot.nodes, snapshot.edges);

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function readSaved(): SavedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedState>;
    return {
      done: Array.isArray(parsed.done) ? parsed.done.filter((id): id is string => typeof id === 'string') : [],
      currentId: typeof parsed.currentId === 'string' ? parsed.currentId : null,
      showAll: parsed.showAll === true,
    };
  } catch {
    return null;
  }
}

function initialState(): SavedState {
  const known = new Set(snapshot.nodes.map((node) => node.id));
  const params = new URLSearchParams(window.location.search);

  // ?done=n1,n2&current=n3&all=1 —— 演示与截图用的种子参数，不写回 localStorage 之外的任何地方。
  const seed = params.get('done');
  if (seed !== null) {
    const seeded = seed
      .split(',')
      .map((id) => id.trim())
      .filter((id) => known.has(id));
    const seededDone = new Set(seeded);
    const playable = snapshot.nodes.find(
      (node) => !seededDone.has(node.id) && isUnlocked(node.id, graph, seededDone),
    );
    const requestedCurrent = params.get('current');
    return {
      done: seeded,
      currentId:
        requestedCurrent && known.has(requestedCurrent) && !seededDone.has(requestedCurrent)
          ? requestedCurrent
          : playable?.id ?? snapshot.current_node_id,
      showAll: params.get('all') === '1',
    };
  }

  const saved = readSaved();
  if (saved) {
    return { done: saved.done.filter((id) => known.has(id)), currentId: saved.currentId, showAll: saved.showAll };
  }

  return {
    done: snapshot.progress.filter((item) => item.status === 'done').map((item) => item.node_id),
    currentId: snapshot.current_node_id,
    showAll: false,
  };
}

export default function App() {
  const [state, setState] = useState<SavedState>(initialState);
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    // 支持 ?node=n5 直接打开某个节点，方便分享和截图核对。
    const fromUrl = new URLSearchParams(window.location.search).get('node');
    return fromUrl && snapshot.nodes.some((node) => node.id === fromUrl) ? fromUrl : null;
  });
  const [flow, setFlow] = useState<ReactFlowInstance<SkillFlowNode, Edge> | null>(null);
  const [justDoneId, setJustDoneId] = useState<string | null>(null);

  const done = useMemo(() => new Set(state.done), [state.done]);

  const visibleIds = useMemo(
    () =>
      computeVisibleIds({
        graph,
        nodes: snapshot.nodes,
        done,
        currentId: state.currentId,
        selectedId,
        showAll: state.showAll,
      }),
    [done, state.currentId, selectedId, state.showAll],
  );

  // 相机回调里读最新可见集合，避免把 visibleIds 放进 effect 依赖导致选中节点时也重新取景。
  const visibleRef = useRef(visibleIds);
  visibleRef.current = visibleIds;

  const doneTimer = useRef<number | null>(null);
  const cameraTimer = useRef<number | null>(null);
  const cameraRanRef = useRef(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* 隐私模式下写不进去就算了，不阻塞交互 */
    }
  }, [state]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 选中的节点被重置/收回时，收起详情面板。
  useEffect(() => {
    if (selectedId && !visibleIds.has(selectedId)) setSelectedId(null);
  }, [selectedId, visibleIds]);

  useEffect(
    () => () => {
      if (doneTimer.current) window.clearTimeout(doneTimer.current);
      if (cameraTimer.current) window.clearTimeout(cameraTimer.current);
    },
    [],
  );

  const statusOf = useCallback(
    (id: string): NodeStatus => (done.has(id) ? 'done' : state.currentId === id ? 'current' : 'not_started'),
    [done, state.currentId],
  );

  const flowNodes = useMemo<Node<SkillNodeData, 'skill'>[]>(
    () =>
      snapshot.nodes
        .filter((node) => visibleIds.has(node.id))
        .map((node) => {
          const placement = layout.placements.get(node.id);
          return {
            id: node.id,
            type: 'skill' as const,
            position: { x: placement?.x ?? 0, y: placement?.y ?? 0 },
            width: NODE_WIDTH,
            height: NODE_HEIGHT,
            draggable: false,
            data: {
              node,
              status: statusOf(node.id),
              unlocked: isUnlocked(node.id, graph, done),
              isSelected: selectedId === node.id,
              level: placement?.level ?? 0,
              enterDelay: enterDelayFor(placement?.level ?? 1, placement?.row ?? 0),
              justDone: justDoneId === node.id,
            },
          };
        }),
    [visibleIds, done, selectedId, statusOf, justDoneId],
  );

  const flowEdges = useMemo<Edge[]>(
    () =>
      snapshot.edges
        // 任何一端不可见都必须丢掉，否则 React Flow 会渲染失败。
        .filter((edge) => visibleIds.has(edge.source_node_id) && visibleIds.has(edge.target_node_id))
        .map((edge) => {
          const sourceDone = done.has(edge.source_node_id);
          const sourceActive = state.currentId === edge.source_node_id;
          // 刚完成的节点：它连出去的边流动 900ms，表示「解锁」。
          const justOpened = justDoneId === edge.source_node_id;
          return {
            id: edge.id,
            source: edge.source_node_id,
            target: edge.target_node_id,
            type: 'smoothstep',
            animated: justOpened || (sourceActive && !sourceDone),
            style: {
              stroke: sourceDone
                ? 'rgba(52,211,153,0.45)'
                : sourceActive
                  ? 'rgba(56,189,248,0.45)'
                  : 'rgba(148,163,184,0.18)',
              strokeWidth: sourceDone ? 1.8 : 1.2,
            },
          };
        }),
    [visibleIds, done, state.currentId, justDoneId],
  );

  const selectedNode = selectedId ? snapshot.nodes.find((node) => node.id === selectedId) ?? null : null;

  const parents = useMemo(() => {
    if (!selectedNode) return [];
    return (graph.parents.get(selectedNode.id) ?? [])
      .map((id) => snapshot.nodes.find((node) => node.id === id))
      .filter((node): node is NonNullable<typeof node> => Boolean(node))
      .map((node) => ({ node, done: done.has(node.id) }));
  }, [selectedNode, done]);

  const children = useMemo(() => {
    if (!selectedNode) return [];
    return (graph.children.get(selectedNode.id) ?? [])
      .map((id) => snapshot.nodes.find((node) => node.id === id))
      .filter((node): node is NonNullable<typeof node> => Boolean(node));
  }, [selectedNode]);

  const doneCount = done.size;
  const total = snapshot.nodes.length;
  const unlockedCount = snapshot.nodes.filter((node) => isUnlocked(node.id, graph, done)).length;
  const percent = total === 0 ? 0 : Math.round((doneCount / total) * 100);
  const currentTitle = state.currentId
    ? snapshot.nodes.find((node) => node.id === state.currentId)?.title ?? '未设置'
    : '未设置';

  const fitVisible = useCallback((instance: ReactFlowInstance<SkillFlowNode, Edge>, duration: number) => {
    const ids = [...visibleRef.current].map((id) => ({ id }));
    if (ids.length === 0) return;
    void instance.fitView({ nodes: ids, padding: 0.14, duration, minZoom: 0.4, maxZoom: 1.05 });
  }, []);

  // 完成 / 切换当前 / 切换显示范围之后，平滑地把新一层带进视野。
  useEffect(() => {
    if (!flow) return;
    if (cameraTimer.current) window.clearTimeout(cameraTimer.current);
    const animate = cameraRanRef.current && !prefersReducedMotion();
    cameraRanRef.current = true;
    cameraTimer.current = window.setTimeout(() => fitVisible(flow, animate ? 480 : 0), 80);
    return () => {
      if (cameraTimer.current) window.clearTimeout(cameraTimer.current);
    };
  }, [flow, fitVisible, state.done, state.currentId, state.showAll]);

  const toggleDone = useCallback(() => {
    if (!selectedNode) return;
    const id = selectedNode.id;
    const wasDone = done.has(id);

    if (!wasDone) {
      setJustDoneId(id);
      if (doneTimer.current) window.clearTimeout(doneTimer.current);
      doneTimer.current = window.setTimeout(() => setJustDoneId(null), 900);
    }

    setState((previous) => {
      const isDone = previous.done.includes(id);
      const nextDone = isDone ? previous.done.filter((item) => item !== id) : [...previous.done, id];
      const nextSet = new Set(nextDone);
      // 完成当前节点后，把「当前」自动挪到第一个可开始的节点，省掉一次手动点击。
      let nextCurrent = previous.currentId;
      if (!isDone && nextCurrent === id) {
        const candidate = snapshot.nodes.find((node) => !nextSet.has(node.id) && isUnlocked(node.id, graph, nextSet));
        nextCurrent = candidate?.id ?? null;
      }
      return { ...previous, done: nextDone, currentId: nextCurrent };
    });
  }, [selectedNode, done]);

  const setCurrent = useCallback(() => {
    if (selectedNode) setState((previous) => ({ ...previous, currentId: selectedNode.id }));
  }, [selectedNode]);

  const reset = useCallback(() => {
    setState((previous) => ({ ...previous, done: [], currentId: snapshot.nodes[0]?.id ?? null }));
    setSelectedId(null);
  }, []);

  const toggleShowAll = useCallback(() => {
    setState((previous) => ({ ...previous, showAll: !previous.showAll }));
  }, []);

  const showWholeTree = useCallback(() => {
    if (flow) fitVisible(flow, prefersReducedMotion() ? 0 : 320);
  }, [flow, fitVisible]);

  // 把「当前节点 + 它的直接后继」框进视野：既看到现在在哪，也看到接下来能去哪。
  const focusCurrent = useCallback(() => {
    if (!flow || !state.currentId) return;
    const ids = [state.currentId, ...(graph.children.get(state.currentId) ?? [])]
      .filter((id) => visibleIds.has(id))
      .map((id) => ({ id }));
    if (ids.length === 0) return;
    void flow.fitView({
      nodes: ids,
      padding: 0.45,
      duration: prefersReducedMotion() ? 0 : 360,
      maxZoom: 1.05,
    });
  }, [flow, state.currentId, visibleIds]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__brand">
          <span className="topbar__mark" aria-hidden="true">
            ⌘
          </span>
          <div>
            <h1>{snapshot.tree.title}</h1>
            <p>
              {snapshot.tree.topic} · {total} 个节点 · 难度 {snapshot.tree.difficulty_level} · {layout.levelCount} 层
            </p>
          </div>
        </div>
        <div className="topbar__actions">
          {layout.hasCycle && <span className="warn-chip">⚠ 依赖成环，已降级布局</span>}
          <button
            type="button"
            className={`button ${state.showAll ? 'button--ghost' : 'button--primary-ghost'}`}
            onClick={toggleShowAll}
            aria-pressed={state.showAll}
          >
            {state.showAll ? '逐步解锁' : '显示全部'}
          </button>
          <button type="button" className="button button--ghost" onClick={showWholeTree}>
            全览
          </button>
          <button type="button" className="button button--ghost" onClick={focusCurrent}>
            回到当前
          </button>
          <button type="button" className="button button--ghost" onClick={reset}>
            重置进度
          </button>
        </div>
      </header>

      <main className="board">
        <div className="board__canvas">
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={nodeTypes}
            onNodeClick={(_, node) => setSelectedId(node.id)}
            onPaneClick={() => setSelectedId(null)}
            onInit={(instance) => {
              setFlow(instance);
              fitVisible(instance, 0);
            }}
            minZoom={0.3}
            maxZoom={1.8}
            nodesDraggable={false}
            nodesConnectable={false}
            edgesFocusable={false}
            proOptions={{ hideAttribution: false }}
          >
            <Background variant={BackgroundVariant.Dots} gap={26} size={1} color="rgba(148,163,184,0.16)" />
            <Controls showInteractive={false} position="bottom-left" />
            <MiniMap
              pannable
              zoomable
              position="top-right"
              className="minimap"
              maskColor="rgba(7,10,15,0.78)"
              nodeColor={(node) => {
                const data = node.data as SkillNodeData;
                if (data.status === 'done') return '#34d399';
                if (data.status === 'current') return '#38bdf8';
                return '#5b6b80';
              }}
            />
          </ReactFlow>

          {!state.showAll && (
            <p className="canvas-hint">完成一个节点，下一层会长出来</p>
          )}
        </div>

        <div className={`board__panel ${selectedNode ? 'is-open' : ''}`}>
          <DetailPanel
            node={selectedNode}
            level={selectedNode ? layout.placements.get(selectedNode.id)?.level ?? 0 : 0}
            status={selectedNode ? statusOf(selectedNode.id) : 'not_started'}
            unlocked={selectedNode ? isUnlocked(selectedNode.id, graph, done) : false}
            parents={parents}
            children={children}
            doneCount={doneCount}
            total={total}
            onToggleDone={toggleDone}
            onSetCurrent={setCurrent}
            onClose={() => setSelectedId(null)}
          />
        </div>
      </main>

      <footer className="statusbar">
        <div className="statusbar__progress">
          <div className="bar" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
            <div className="bar__fill" style={{ width: `${percent}%` }} />
          </div>
          <span className="statusbar__count">
            完成 {doneCount} / {total} · {percent}%
          </span>
        </div>
        <div className="statusbar__meta">
          <span>可开始 {unlockedCount}</span>
          <span className="statusbar__divider" />
          <span>
            已显示 {visibleIds.size} / {total}
          </span>
          <span className="statusbar__divider" />
          <span>
            当前：<strong>{currentTitle}</strong>
          </span>
        </div>
      </footer>
    </div>
  );
}
