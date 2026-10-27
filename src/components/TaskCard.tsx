import type { Task, TaskCompletion } from '../domain/types';

export function TaskCard({ task, completion, onComplete, onReopen, onFocus }: { task: Task; completion?: TaskCompletion; onComplete(): void; onReopen(): void; onFocus(): void }) {
  const pending = completion?.status === 'pending_proof';
  return <article className={`task-card ${completion ? 'done' : ''}`} style={{ '--task-color': task.color } as React.CSSProperties}>
    <button className="complete-button" type="button" onClick={completion ? onReopen : onComplete} aria-label={completion ? `Reopen ${task.title}` : `Complete ${task.title}`}><span>{completion && !pending ? '✓' : pending ? '↥' : ''}</span></button>
    <div className="task-card-copy"><h3>{task.title}</h3><p>{task.scheduleTime ? task.scheduleTime : `${task.estimatedMinutes} min`} · {task.energy} energy</p>{pending && <small>Proof waiting to sync</small>}</div>
    {!completion && <button className="focus-button" onClick={onFocus} aria-label={`Focus on ${task.title}`}>Focus</button>}
  </article>;
}
