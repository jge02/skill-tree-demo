/**
 * MapFlow 兼容的技能树数据模型。
 *
 * 字段名与 MapFlow 的 src/types/learning.ts 保持一致（snake_case），
 * 这样同一份 SKILL_TREE.json 既能喂给这个 demo，也能喂给 MapFlow 的 MCP
 * （mapflow.create_tree）或任何遵守同一契约的实现。
 *
 * 唯一需要适配的坑：在 MapFlow 的线上契约里，
 * learning_objectives / key_concepts / observable_evidence 三个字段的类型是
 * string，内容是「被 JSON.stringify 过的数组」，例如 "[\"能画出链路\"]"。
 * 本文件同时接受 string 与 string[] 两种形态，避免上游写法不同就崩。
 */

export type Depth = 'Recognize' | 'Understand' | 'Use' | 'Master';
export type NodeStatus = 'not_started' | 'current' | 'done';
export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced';

export interface SkillTree {
  id: string;
  topic: string;
  title: string;
  description: string | null;
  difficulty_level: DifficultyLevel;
  total_nodes: number;
}

export interface SkillNode {
  id: string;
  tree_id: string;
  title: string;
  description: string | null;
  icon: string;
  category: string;
  difficulty: number;
  estimated_minutes: number;
  depth_level: number;
  position_x: number;
  position_y: number;
  order_in_level: number;
  learning_objectives: string[];
  key_concepts: string[];
  recommended_depth: Depth;
  depth_rationale: string;
  observable_evidence: string[];
}

export interface SkillEdge {
  id: string;
  source_node_id: string;
  target_node_id: string;
}

export interface NodeProgress {
  node_id: string;
  status: NodeStatus;
  evidence: string;
}

export interface LearningTreeSnapshot {
  tree: SkillTree;
  nodes: SkillNode[];
  edges: SkillEdge[];
  current_node_id: string | null;
  progress: NodeProgress[];
}

/** 线上契约里可能是 JSON 字符串，也可能是真数组。 */
type ListField = string | string[] | null;

interface RawNode extends Omit<SkillNode, 'learning_objectives' | 'key_concepts' | 'observable_evidence'> {
  learning_objectives: ListField;
  key_concepts: ListField;
  observable_evidence: ListField;
}

interface RawSnapshot extends Omit<LearningTreeSnapshot, 'nodes'> {
  nodes: RawNode[];
}

function toList(value: ListField, field: string, nodeId: string): string[] {
  if (Array.isArray(value)) return value;
  if (value === null || value === '') return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) {
      return parsed;
    }
  } catch {
    /* 落到下面的警告 */
  }
  console.warn(`[skill-tree] 节点 ${nodeId} 的 ${field} 不是字符串数组，已按单项处理`);
  return [String(value)];
}

/** 把任意来源的快照（含线上转义字符串形态）规整成强类型结构。 */
export function normalizeTree(raw: unknown): LearningTreeSnapshot {
  const snapshot = raw as RawSnapshot;
  const nodes = snapshot.nodes.map((node) => ({
    ...node,
    learning_objectives: toList(node.learning_objectives, 'learning_objectives', node.id),
    key_concepts: toList(node.key_concepts, 'key_concepts', node.id),
    observable_evidence: toList(node.observable_evidence, 'observable_evidence', node.id),
  }));

  const ids = new Set(nodes.map((node) => node.id));
  const edges = snapshot.edges.filter((edge) => {
    const ok = ids.has(edge.source_node_id) && ids.has(edge.target_node_id);
    if (!ok) console.warn(`[skill-tree] 丢弃悬空边 ${edge.id}`);
    return ok;
  });

  return {
    tree: snapshot.tree,
    nodes,
    // 自环一定会让布局和「可开始」判断都出错，直接丢。
    edges: edges.filter((edge) => edge.source_node_id !== edge.target_node_id),
    current_node_id: snapshot.current_node_id,
    progress: snapshot.progress,
  };
}

export const DEPTH_LABEL: Record<Depth, string> = {
  Recognize: '认识',
  Understand: '理解',
  Use: '应用',
  Master: '掌握',
};

/** 深度越高，色相越暖；用同一套色板驱动节点标签与侧栏。 */
export const DEPTH_COLOR: Record<Depth, string> = {
  Recognize: '#94a3b8',
  Understand: '#60a5fa',
  Use: '#a78bfa',
  Master: '#fbbf24',
};
