import type { CSSProperties } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { DEPTH_COLOR, DEPTH_LABEL, type NodeStatus, type SkillNode } from '../schema';

export interface SkillNodeData extends Record<string, unknown> {
  node: SkillNode;
  status: NodeStatus;
  unlocked: boolean;
  isSelected: boolean;
  level: number;
  /** 入场动画的阶梯延迟（毫秒），由层级和行号决定。 */
  enterDelay: number;
  /** 刚被标记完成：播放一次脉冲。 */
  justDone: boolean;
}

export type SkillFlowNode = Node<SkillNodeData, 'skill'>;

export function SkillNodeCard({ data }: NodeProps<SkillFlowNode>) {
  const { node, status, unlocked, isSelected, enterDelay, justDone } = data;
  const depthColor = DEPTH_COLOR[node.recommended_depth];

  return (
    <article
      className={[
        'skill-node',
        `is-${status}`,
        unlocked && status === 'not_started' ? 'is-unlocked' : '',
        isSelected ? 'is-selected' : '',
        justDone ? 'is-just-done' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ '--enter-delay': `${enterDelay}ms` } as CSSProperties}
      aria-label={`${node.title}，${DEPTH_LABEL[node.recommended_depth]}，${
        status === 'done' ? '已完成' : status === 'current' ? '当前学习' : '未学习'
      }`}
    >
      <Handle type="target" position={Position.Left} className="skill-handle" />
      <div className="skill-node__inner">
        <header className="skill-node__head">
          <span className="skill-node__category">{node.category}</span>
          <span className="skill-node__depth" style={{ color: depthColor, borderColor: `${depthColor}55` }}>
            {DEPTH_LABEL[node.recommended_depth]}
          </span>
        </header>
        <h3 className="skill-node__title">{node.title}</h3>
        <footer className="skill-node__foot">
          <span className="skill-node__minutes">{node.estimated_minutes} 分钟</span>
          {status === 'done' && <span className="skill-node__badge is-done">✓ 完成</span>}
          {status === 'current' && <span className="skill-node__badge is-current">当前</span>}
          {status === 'not_started' && !unlocked && <span className="skill-node__badge is-locked">待前置</span>}
          {status === 'not_started' && unlocked && <span className="skill-node__badge is-open">可开始</span>}
        </footer>
      </div>
      <Handle type="source" position={Position.Right} className="skill-handle" />
    </article>
  );
}
