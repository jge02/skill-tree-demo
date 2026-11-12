import { DEPTH_COLOR, DEPTH_LABEL, type NodeStatus, type SkillNode } from '../schema';

interface DependencyInfo {
  node: SkillNode;
  done: boolean;
}

interface Props {
  node: SkillNode | null;
  level: number;
  status: NodeStatus;
  unlocked: boolean;
  parents: DependencyInfo[];
  children: SkillNode[];
  doneCount: number;
  total: number;
  onToggleDone: () => void;
  onSetCurrent: () => void;
  onClose: () => void;
}

export function DetailPanel(props: Props) {
  const { node, status } = props;

  return (
    <aside className="panel" aria-live="polite" aria-label="节点详情">
      {node === null ? (
        <div className="panel__empty">
          <p className="panel__eyebrow">LEARNING MAP</p>
          <h2>点一个节点，看它为什么值得学</h2>
          <p className="panel__hint">
            每个节点都带四件东西：推荐深度、深度理由、学习目标、可观察的验收证据。缺了任何一件，这张卡就不算合格。
          </p>
          <dl className="legend">
            {(Object.keys(DEPTH_LABEL) as Array<keyof typeof DEPTH_LABEL>).map((depth) => (
              <div className="legend__row" key={depth}>
                <span className="legend__dot" style={{ background: DEPTH_COLOR[depth] }} />
                <dt>{DEPTH_LABEL[depth]}</dt>
                <dd>
                  {depth === 'Recognize' && '能说出、能画出，不需要动手'}
                  {depth === 'Understand' && '能解释边界与代价，能做出选择'}
                  {depth === 'Use' && '能独立完成并验证一次'}
                  {depth === 'Master' && '能脱离指导重复并承担责任'}
                </dd>
              </div>
            ))}
          </dl>
          <p className="panel__meta">
            已完成 {props.doneCount} / {props.total}
          </p>
        </div>
      ) : (
        <>
          <div className="panel__scroll">
            <div className="panel__top">
              <span className="chip chip--ghost">{node.category}</span>
              <span
                className="chip"
                style={{ color: DEPTH_COLOR[node.recommended_depth], borderColor: `${DEPTH_COLOR[node.recommended_depth]}44` }}
              >
                目标深度 · {DEPTH_LABEL[node.recommended_depth]}
              </span>
              <button type="button" className="panel__close" onClick={props.onClose} aria-label="关闭详情">
                ✕
              </button>
            </div>

            <h2 className="panel__title">{node.title}</h2>
            {node.description && <p className="panel__desc">{node.description}</p>}

            <div className="panel__facts">
              <span>{node.estimated_minutes} 分钟</span>
              <span>第 {props.level} 层</span>
              <span>难度 {node.difficulty}/5</span>
            </div>

            <section className="panel__section">
              <h3>目标深度</h3>
              <p className="panel__rationale">{node.depth_rationale}</p>
            </section>

            <section className="panel__section">
              <h3>学习目标</h3>
              <ol className="panel__list">
                {node.learning_objectives.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ol>
            </section>

            <section className="panel__section">
              <h3>关键概念</h3>
              <div className="panel__chips">
                {node.key_concepts.map((item) => (
                  <span className="chip" key={item}>
                    {item}
                  </span>
                ))}
              </div>
            </section>

            <section className="panel__section">
              <h3>验收证据</h3>
              <ul className="panel__list panel__list--evidence">
                {node.observable_evidence.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>

            <section className="panel__section">
              <h3>前置依赖</h3>
              {props.parents.length === 0 ? (
                <p className="panel__muted">无，这是起点。</p>
              ) : (
                <ul className="deps">
                  {props.parents.map((parent) => (
                    <li key={parent.node.id} className={parent.done ? 'is-done' : ''}>
                      <span className="deps__dot" />
                      {parent.node.title}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {props.children.length > 0 && (
              <section className="panel__section">
                <h3>完成后解锁</h3>
                <ul className="deps">
                  {props.children.map((child) => (
                    <li key={child.id}>
                      <span className="deps__dot deps__dot--next" />
                      {child.title}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          <div className="panel__actions">
            <button
              type="button"
              className={`button ${status === 'done' ? 'button--ghost' : 'button--primary'}`}
              onClick={props.onToggleDone}
            >
              {status === 'done' ? '取消完成' : '标记完成'}
            </button>
            <button
              type="button"
              className="button button--ghost"
              onClick={props.onSetCurrent}
              disabled={status === 'done'}
            >
              设为当前学习
            </button>
            {!props.unlocked && status !== 'done' && (
              <p className="panel__warn">直接前置还没完成，但这里不阻止你——只提示。</p>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
