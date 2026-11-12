import type { SkillEdge, SkillNode } from './schema';

export const NODE_WIDTH = 212;
export const NODE_HEIGHT = 104;
const GAP_X = 78;
const GAP_Y = 20;

export interface GraphIndex {
  parents: Map<string, string[]>;
  children: Map<string, string[]>;
  /** 拓扑序；若有环，环内节点不会出现在这里。 */
  order: string[];
  hasCycle: boolean;
}

export function buildGraph(nodes: SkillNode[], edges: SkillEdge[]): GraphIndex {
  const parents = new Map<string, string[]>();
  const children = new Map<string, string[]>();
  const indegree = new Map<string, number>();

  for (const node of nodes) {
    parents.set(node.id, []);
    children.set(node.id, []);
    indegree.set(node.id, 0);
  }
  for (const edge of edges) {
    children.get(edge.source_node_id)?.push(edge.target_node_id);
    parents.get(edge.target_node_id)?.push(edge.source_node_id);
    indegree.set(edge.target_node_id, (indegree.get(edge.target_node_id) ?? 0) + 1);
  }

  // Kahn 拓扑排序：同时起到「环检测」的作用。
  const queue = nodes.filter((node) => (indegree.get(node.id) ?? 0) === 0).map((node) => node.id);
  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift() as string;
    order.push(id);
    for (const child of children.get(id) ?? []) {
      const next = (indegree.get(child) ?? 0) - 1;
      indegree.set(child, next);
      if (next === 0) queue.push(child);
    }
  }

  return { parents, children, order, hasCycle: order.length !== nodes.length };
}

export interface Placement {
  x: number;
  y: number;
  level: number;
  row: number;
}

export interface LayoutResult {
  placements: Map<string, Placement>;
  levelCount: number;
  hasCycle: boolean;
  warnings: string[];
}

/**
 * 分层布局（对应 MapFlow 的「关系布局」）：
 * 1. 按最长前置链给节点分配层（prerequisite 一定在左）；
 * 2. 用父节点平均位置做重心排序，减少连线交叉；
 * 3. 每层垂直居中，避免整棵树偏上。
 */
export function computeLayout(nodes: SkillNode[], edges: SkillEdge[]): LayoutResult {
  const graph = buildGraph(nodes, edges);
  const warnings: string[] = [];
  const level = new Map<string, number>();

  for (const id of graph.order) {
    const parentLevels = (graph.parents.get(id) ?? []).map((parent) => level.get(parent) ?? 0);
    level.set(id, parentLevels.length === 0 ? 0 : Math.max(...parentLevels) + 1);
  }

  // 环里的节点拿不到拓扑序，退化成「所有已知前置 +1」，至少不会叠在第 0 层。
  if (graph.hasCycle) {
    const maxKnown = Math.max(0, ...level.values());
    for (const node of nodes) {
      if (level.has(node.id)) continue;
      const parentLevels = (graph.parents.get(node.id) ?? []).map((parent) => level.get(parent) ?? 0);
      level.set(node.id, parentLevels.length === 0 ? 0 : Math.min(maxKnown, Math.max(...parentLevels) + 1));
    }
    warnings.push('依赖里存在环，已按最长已知前置降级布局；环本身需要在数据里修掉。');
  }

  const levelCount = Math.max(0, ...level.values()) + 1;
  const lanes: string[][] = Array.from({ length: levelCount }, () => []);
  for (const node of nodes) lanes[level.get(node.id) ?? 0].push(node.id);

  // 初始顺序沿用数据里的顺序，再按父节点重心做 3 轮上行扫描。
  for (let round = 0; round < 3; round += 1) {
    for (let index = 1; index < lanes.length; index += 1) {
      const previous = new Map(lanes[index - 1].map((id, position) => [id, position]));
      const scored = lanes[index].map((id, position) => {
        const parentPositions = (graph.parents.get(id) ?? [])
          .map((parent) => previous.get(parent))
          .filter((value): value is number => value !== undefined);
        const barycenter = parentPositions.length
          ? parentPositions.reduce((sum, value) => sum + value, 0) / parentPositions.length
          : position + lanes[index].length;
        return { id, key: barycenter, position };
      });
      scored.sort((a, b) => a.key - b.key || a.position - b.position);
      lanes[index] = scored.map((item) => item.id);
    }
  }

  const placements = new Map<string, Placement>();
  lanes.forEach((ids, lane) => {
    const height = ids.length * NODE_HEIGHT + Math.max(0, ids.length - 1) * GAP_Y;
    const top = -height / 2;
    ids.forEach((id, row) => {
      placements.set(id, {
        x: lane * (NODE_WIDTH + GAP_X),
        y: top + row * (NODE_HEIGHT + GAP_Y),
        level: lane + 1,
        row,
      });
    });
  });

  return { placements, levelCount, hasCycle: graph.hasCycle, warnings };
}

/**
 * 「可开始」= 直接前置全部完成、自己还没完成。
 * 注意：这和 MapFlow 的口径一致——只认直接前置，不认孙子节点。
 */
export function isUnlocked(nodeId: string, graph: GraphIndex, done: ReadonlySet<string>): boolean {
  if (done.has(nodeId)) return false;
  return (graph.parents.get(nodeId) ?? []).every((parent) => done.has(parent));
}
