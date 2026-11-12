import type { GraphIndex } from './layout';
import type { SkillNode } from './schema';

export interface RevealInput {
  graph: GraphIndex;
  nodes: SkillNode[];
  done: ReadonlySet<string>;
  currentId: string | null;
  selectedId: string | null;
  showAll: boolean;
}

/** 某个节点的全部祖先（不含自己），用于深链时保证边有端点。 */
export function ancestorsOf(id: string, graph: GraphIndex): string[] {
  const seen = new Set<string>();
  const stack = [...(graph.parents.get(id) ?? [])];
  while (stack.length > 0) {
    const next = stack.pop() as string;
    if (seen.has(next)) continue;
    seen.add(next);
    stack.push(...(graph.parents.get(next) ?? []));
  }
  return [...seen];
}

/**
 * 「长出来」的可见集合：
 *   已完成 ∪ 当前 ∪ 可开始 ∪ 这些节点的直接后继
 * 深链（?node=）额外把选中节点及其祖先拉进来，否则边会缺端点。
 *
 * 只比「当前 + 可开始」多走一跳，是为了让你看见下一步却看不到更远，
 * 完成一个节点时整条下一层才会浮现。
 */
export function computeVisibleIds(input: RevealInput): Set<string> {
  const { graph, nodes, done, currentId, selectedId, showAll } = input;
  if (showAll) return new Set(nodes.map((node) => node.id));

  const unlocked = nodes
    .filter((node) => !done.has(node.id) && (graph.parents.get(node.id) ?? []).every((parent) => done.has(parent)))
    .map((node) => node.id);

  const seeds = new Set<string>([...done, ...unlocked]);
  if (currentId) seeds.add(currentId);

  const visible = new Set<string>(seeds);
  for (const id of seeds) {
    for (const child of graph.children.get(id) ?? []) visible.add(child);
  }

  if (selectedId) {
    visible.add(selectedId);
    for (const ancestor of ancestorsOf(selectedId, graph)) visible.add(ancestor);
  }

  return visible;
}

/** 入场动画的阶梯延迟：越靠右、越靠下，出现得越晚一点。 */
export function enterDelayFor(level: number, row: number): number {
  return Math.min(420, Math.max(0, level - 1) * 70) + Math.min(row, 6) * 40;
}
