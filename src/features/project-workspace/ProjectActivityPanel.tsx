import type { Project } from "../../types";
import { formatActivityEventSummary, formatActivityEventTimestamp } from "./projectActivity";

type ProjectActivityPanelProps = {
  project: Project;
};

export function ProjectActivityPanel({ project }: ProjectActivityPanelProps) {
  const activity = project.activity ?? [];

  if (activity.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-neutral-800 bg-neutral-950/60 p-4 text-sm text-neutral-400">
        В проекте пока нет событий активности.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950">
      <div className="border-b border-neutral-800 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Активность проекта</p>
      </div>
      <ul className="divide-y divide-neutral-800">
        {activity.map((event) => (
          <li key={event.id} className="px-4 py-3">
            <p className="text-sm text-neutral-100">{formatActivityEventSummary(event)}</p>
            <p className="mt-1 text-xs text-neutral-500">{formatActivityEventTimestamp(event.createdAt)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
