import { useId } from "react";

import { useStore, type FieldValue } from "../../bus";
import { Explainer } from "./Explainer";
import { InlineDiagnostics } from "./chrome";
import { readPlanValue } from "./resultAccess";

/**
 * Plan-bound controls. Each reads its value from `state.plan` at a protojson path and writes back with
 * one `setField` command on change (the store debounces re-analysis). Focus dispatches `select` so the
 * ViewContext knows which control the human is on.
 */
function useField(path: string) {
  const { state, store } = useStore();
  return {
    value: readPlanValue(state.plan, path),
    set: (value: FieldValue) => store.dispatch({ type: "setField", path, value }),
    focus: () => store.dispatch({ type: "select", selection: { ...state.selection, path } }),
  };
}

function Field(props: { path: string; label: string; id: string; children: React.ReactNode; display?: string }) {
  return (
    <div className="field" data-path={props.path}>
      <label htmlFor={props.id}>
        <Explainer term={props.path}>{props.label}</Explainer>
        {props.display !== undefined && <span className="field-value">{props.display}</span>}
      </label>
      {props.children}
      <InlineDiagnostics path={props.path} />
    </div>
  );
}

export function SliderField(props: {
  path: string;
  label: string;
  min: number;
  max: number;
  step: number;
  format?: (n: number) => string;
}) {
  const id = useId();
  const f = useField(props.path);
  const value = typeof f.value === "number" ? f.value : props.min;
  const display = (props.format ?? String)(value);
  return (
    <Field path={props.path} label={props.label} id={id} display={display}>
      <input
        id={id}
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={value}
        onChange={(e) => f.set(Number(e.target.value))}
        onFocus={f.focus}
      />
    </Field>
  );
}

export function NumberField(props: { path: string; label: string; step?: number; integer?: boolean }) {
  const id = useId();
  const f = useField(props.path);
  return (
    <Field path={props.path} label={props.label} id={id}>
      <input
        id={id}
        type="number"
        step={props.step ?? 1}
        value={typeof f.value === "number" ? f.value : ""}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) f.set(props.integer === true ? Math.round(n) : n);
        }}
        onFocus={f.focus}
      />
    </Field>
  );
}

export function TextField(props: { path: string; label: string }) {
  const id = useId();
  const f = useField(props.path);
  return (
    <Field path={props.path} label={props.label} id={id}>
      <input id={id} type="text" value={typeof f.value === "string" ? f.value : ""} onChange={(e) => f.set(e.target.value)} onFocus={f.focus} />
    </Field>
  );
}

export function Toggle(props: { path: string; label: string }) {
  const id = useId();
  const f = useField(props.path);
  return (
    <Field path={props.path} label={props.label} id={id}>
      <input id={id} type="checkbox" checked={f.value === true} onChange={(e) => f.set(e.target.checked)} onFocus={f.focus} />
    </Field>
  );
}

/** Structural view of a generated `GenEnum` so callers pass e.g. `CoolingModeSchema` directly. */
export interface EnumLike {
  readonly values: readonly { readonly name: string; readonly number: number }[];
}

/** Enum select; writes the enum *name* (the bus accepts names) and hides the `_UNSPECIFIED` zero value. */
export function SelectField(props: { path: string; label: string; enum: EnumLike; exclude?: readonly string[] }) {
  const id = useId();
  const f = useField(props.path);
  const excluded = new Set(props.exclude ?? []);
  const options = props.enum.values.filter((v) => v.number !== 0 && !excluded.has(v.name));
  const current = options.find((v) => v.number === f.value || v.name === f.value)?.name ?? "";
  return (
    <Field path={props.path} label={props.label} id={id}>
      <select id={id} value={current} onChange={(e) => f.set(e.target.value)} onFocus={f.focus}>
        <option value="" disabled>
          —
        </option>
        {options.map((v) => (
          <option key={v.name} value={v.name}>
            {v.name}
          </option>
        ))}
      </select>
    </Field>
  );
}
