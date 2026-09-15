import { useStore } from "../../bus";
import { Gantt, type Task } from "./charts/Gantt";
import { NotComputed, Region } from "./chrome";
import { chartById } from "./resultAccess";

/** Gantt encoding of `charts[critical_path]`: one series per task, points[0] = {x: start, y: end}. */
function metaMonth(meta: Record<string, string>, key: string): number | undefined {
  const n = Number(meta[key]);
  return meta[key] !== undefined && Number.isFinite(n) ? n : undefined;
}

export function CriticalPath() {
  const { state } = useStore();
  const chart = chartById(state.result, "critical_path");
  const tasks: Task[] = (chart?.series ?? []).flatMap((s) => {
    const p = s.points[0];
    return p === undefined ? [] : [{ name: s.name, start: p.x, end: p.y, label: p.label }];
  });
  const energize = (chart && metaMonth(chart.meta, "energize_month")) ?? state.result?.summary?.timeToEnergizeMonths;
  const grid = chart && metaMonth(chart.meta, "grid_energize_month");
  return (
    <Region id="critical_path" title="Critical path — revenue starts at energization" dimensions={["time"]}>
      {chart === undefined ? (
        <NotComputed what="Critical path" />
      ) : (
        <Gantt tasks={tasks} {...(energize !== undefined ? { energizeMonth: energize } : {})} {...(grid !== undefined ? { gridMonth: grid } : {})} />
      )}
    </Region>
  );
}
