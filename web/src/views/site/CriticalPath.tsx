import { useStore } from "../../bus";
import { Gantt, type Task } from "./charts/Gantt";
import { NotComputed, Region } from "./chrome";
import { chartById } from "./resultAccess";

/**
 * Engine encoding of `charts[critical_path]` (engine/core/render.go): one series "tasks", one point
 * per task with x = start month, y = end month, label = task name ("energize p1" is zero-width).
 * The energize marker is `summary.time_to_energize_months`; the grid marker is the plan's
 * `power.interconnection.grid_energize_month`.
 */
export function CriticalPath() {
  const { state } = useStore();
  const chart = chartById(state.result, "critical_path");
  const tasks: Task[] = (chart?.series ?? []).flatMap((s) => s.points.map((p) => ({ name: p.label, start: p.x, end: p.y, label: p.label })));
  const energize = state.result?.summary?.timeToEnergizeMonths;
  const grid = state.plan?.power?.interconnection?.gridEnergizeMonth;
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
