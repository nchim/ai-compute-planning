import type { JsonValue } from "@bufbuild/protobuf";

/** Collapsible read-only tree for protojson values (the raw-Result inspector). */
export function JsonTree(props: { value: JsonValue; label?: string; open?: boolean }) {
  return (
    <div className="tree">
      <Node label={props.label ?? "root"} value={props.value} open={props.open ?? true} />
    </div>
  );
}

function Node(props: { label: string; value: JsonValue; open: boolean }) {
  const { label, value, open } = props;
  if (value !== null && typeof value === "object") {
    const entries = Array.isArray(value) ? value.map((v, i) => [String(i), v] as const) : Object.entries(value);
    const shape = Array.isArray(value) ? `[${entries.length}]` : `{${entries.length}}`;
    return (
      <details open={open}>
        <summary>
          <span className="k">{label}</span> {shape}
        </summary>
        {entries.map(([k, v]) => (
          <Node key={k} label={k} value={v} open={false} />
        ))}
      </details>
    );
  }
  const kind = value === null ? "null" : typeof value;
  return (
    <div className="leaf">
      <span className="k">{label}</span>: <span className={`v-${kind}`}>{JSON.stringify(value)}</span>
    </div>
  );
}
