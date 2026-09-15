import { ScalarType, clone, create, type DescEnum, type DescField, type DescMessage } from "@bufbuild/protobuf";

import { SitePlanSchema, type SitePlan } from "../gen/capplanner/v1/engine_pb";
import type { FieldValue, PatchOp } from "./types";

/**
 * Protojson dotted paths into SitePlan, e.g. `compute.kw_per_rack` or `phasing.phases[0].it_load_mw`.
 * Every path is resolved against the generated schema before anything is written, so a typo or a
 * type mismatch is a precise error at the boundary instead of a silent no-op or a NaN downstream.
 */

/** Thrown by `applyPatch` for an invalid path or value; the reducer turns it into a visible error. */
export class PathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PathError";
  }
}

interface Segment {
  readonly name: string;
  readonly index: number | null;
}

const segmentRe = /^([A-Za-z_][A-Za-z0-9_]*)(?:\[(\d+)\])?$/;

function parsePath(path: string): Segment[] {
  if (path === "") throw new PathError("path is empty");
  return path.split(".").map((raw) => {
    const m = segmentRe.exec(raw);
    if (m === null) throw new PathError(`"${path}": bad segment "${raw}"`);
    return { name: m[1] as string, index: m[2] === undefined ? null : Number(m[2]) };
  });
}

function findField(desc: DescMessage, seg: Segment, path: string): DescField {
  const field = desc.fields.find((f) => f.name === seg.name || f.jsonName === seg.name);
  if (field === undefined) throw new PathError(`"${path}": ${desc.name} has no field "${seg.name}"`);
  if (field.fieldKind === "map") throw new PathError(`"${path}": map field "${seg.name}" is not addressable`);
  if (field.fieldKind === "list" && seg.index === null) {
    throw new PathError(`"${path}": "${seg.name}" is repeated; use ${seg.name}[i]`);
  }
  if (field.fieldKind !== "list" && seg.index !== null) {
    throw new PathError(`"${path}": "${seg.name}" is not repeated`);
  }
  return field;
}

/** The leaf type a path may hold — the schema-level part of validation, independent of any plan. */
type Leaf = { kind: "scalar"; scalar: ScalarType } | { kind: "enum"; enum: DescEnum };

function leafOf(field: DescField, path: string): Leaf {
  switch (field.fieldKind) {
    case "scalar":
      return { kind: "scalar", scalar: field.scalar };
    case "enum":
      return { kind: "enum", enum: field.enum };
    case "list":
      if (field.listKind === "scalar") return { kind: "scalar", scalar: field.scalar };
      if (field.listKind === "enum") return { kind: "enum", enum: field.enum };
  }
  throw new PathError(`"${path}": ends at message "${field.name}"; paths must end at a scalar or enum`);
}

function messageOf(field: DescField, path: string): DescMessage {
  if (field.fieldKind === "message") return field.message;
  if (field.fieldKind === "list" && field.listKind === "message") return field.message;
  throw new PathError(`"${path}": "${field.name}" is not a message; cannot descend`);
}

const integerScalars = new Set<ScalarType>([
  ScalarType.INT32, ScalarType.SINT32, ScalarType.SFIXED32, ScalarType.UINT32, ScalarType.FIXED32,
  ScalarType.INT64, ScalarType.SINT64, ScalarType.SFIXED64, ScalarType.UINT64, ScalarType.FIXED64,
]);
const bigintScalars = new Set<ScalarType>([
  ScalarType.INT64, ScalarType.SINT64, ScalarType.SFIXED64, ScalarType.UINT64, ScalarType.FIXED64,
]);

/** Checks `value` against the leaf type and returns it in the representation the message stores. */
function coerceValue(leaf: Leaf, value: FieldValue, path: string): FieldValue | bigint {
  if (leaf.kind === "enum") {
    const found =
      typeof value === "string"
        ? leaf.enum.values.find((v) => v.name === value)
        : leaf.enum.values.find((v) => v.number === value);
    if (found === undefined) {
      const names = leaf.enum.values.map((v) => v.name).join(", ");
      throw new PathError(`"${path}": ${String(value)} is not a ${leaf.enum.name} (one of ${names})`);
    }
    return found.number;
  }
  const s = leaf.scalar;
  if (s === ScalarType.BOOL) return expectType(value, "boolean", path);
  if (s === ScalarType.STRING) return expectType(value, "string", path);
  if (s === ScalarType.BYTES) throw new PathError(`"${path}": bytes fields are not addressable`);
  const n = expectType(value, "number", path);
  if (!Number.isFinite(n)) throw new PathError(`"${path}": ${n} is not a finite number`);
  if (integerScalars.has(s) && !Number.isInteger(n)) throw new PathError(`"${path}": ${n} is not an integer`);
  return bigintScalars.has(s) ? BigInt(n) : n;
}

function expectType<T extends "string" | "number" | "boolean">(
  value: FieldValue,
  type: T,
  path: string,
): Extract<FieldValue, T extends "string" ? string : T extends "number" ? number : boolean> {
  if (typeof value !== type) {
    throw new PathError(`"${path}": expected ${type}, got ${typeof value} ${JSON.stringify(value)}`);
  }
  return value as never;
}

interface Resolved {
  readonly segments: readonly Segment[];
  readonly fields: readonly DescField[];
  readonly value: FieldValue | bigint;
}

/** Schema validation only (no plan needed): field chain exists and the value fits the leaf type. */
function resolve(op: PatchOp): Resolved {
  const segments = parsePath(op.path);
  const fields: DescField[] = [];
  let desc: DescMessage = SitePlanSchema;
  segments.forEach((seg, i) => {
    const field = findField(desc, seg, op.path);
    fields.push(field);
    if (i < segments.length - 1) desc = messageOf(field, op.path);
  });
  const leafField = fields[fields.length - 1] as DescField;
  return { segments, fields, value: coerceValue(leafOf(leafField, op.path), op.value, op.path) };
}

type Mutable = Record<string, unknown>;

/** Walks (creating missing sub-messages) and writes the leaf. Repeated indexes may append (i == length). */
function write(plan: SitePlan, r: Resolved, path: string): void {
  let node: Mutable = plan as unknown as Mutable;
  r.segments.forEach((seg, i) => {
    const field = r.fields[i] as DescField;
    const last = i === r.segments.length - 1;
    if (seg.index === null) {
      if (last) {
        node[field.localName] = r.value;
      } else {
        node[field.localName] ??= create(messageOf(field, path));
        node = node[field.localName] as Mutable;
      }
      return;
    }
    const list = node[field.localName] as unknown[];
    if (seg.index > list.length) {
      throw new PathError(`"${path}": index ${seg.index} out of range (length ${list.length})`);
    }
    if (last) {
      list[seg.index] = r.value;
    } else {
      list[seg.index] ??= create(messageOf(field, path));
      node = list[seg.index] as Mutable;
    }
  });
}

/**
 * Returns a new plan with every op applied, or throws `PathError` on the first invalid op — the
 * input plan is never mutated, so a rejected patch leaves state untouched.
 */
export function applyPatch(plan: SitePlan, patch: readonly PatchOp[]): SitePlan {
  const resolved = patch.map(resolve);
  const next = clone(SitePlanSchema, plan);
  resolved.forEach((r, i) => write(next, r, (patch[i] as PatchOp).path));
  return next;
}

/**
 * Returns a new plan with element `index` removed from the repeated field at `listPath`
 * (e.g. `phasing.phases`), or throws `PathError` when the path is not a repeated field or the index
 * is out of range. The input plan is never mutated.
 */
export function removeAt(plan: SitePlan, listPath: string, index: number): SitePlan {
  const segments = parsePath(listPath);
  const last = segments[segments.length - 1] as Segment;
  if (last.index !== null) throw new PathError(`"${listPath}": name the repeated field itself, without [i]`);
  if (!Number.isInteger(index) || index < 0) throw new PathError(`"${listPath}": index ${index} is not a non-negative integer`);
  let desc: DescMessage = SitePlanSchema;
  const fields: DescField[] = [];
  segments.forEach((seg, i) => {
    const isLast = i === segments.length - 1;
    const field = isLast ? desc.fields.find((f) => f.name === seg.name || f.jsonName === seg.name) : findField(desc, seg, listPath);
    if (field === undefined) throw new PathError(`"${listPath}": ${desc.name} has no field "${seg.name}"`);
    fields.push(field);
    if (!isLast) desc = messageOf(field, listPath);
  });
  const listField = fields[fields.length - 1] as DescField;
  if (listField.fieldKind !== "list") throw new PathError(`"${listPath}": "${listField.name}" is not a repeated field`);
  const next = clone(SitePlanSchema, plan);
  let node: Mutable = next as unknown as Mutable;
  segments.slice(0, -1).forEach((seg, i) => {
    const field = fields[i] as DescField;
    const child = seg.index === null ? node[field.localName] : (node[field.localName] as unknown[] | undefined)?.[seg.index];
    if (child === undefined || child === null) throw new PathError(`"${listPath}": "${seg.name}" is not set`);
    node = child as Mutable;
  });
  const list = node[listField.localName] as unknown[];
  if (index >= list.length) throw new PathError(`"${listPath}": index ${index} out of range (length ${list.length})`);
  list.splice(index, 1);
  return next;
}
