import type { ReactNode } from "react";

import { explain } from "./glossary";

/**
 * Hover/focus explainer: concept · formula · benchmark · research source, from the glossary.
 * Wraps `children` (or a "?" badge) and shows the popover on hover or keyboard focus.
 */
export function Explainer(props: { term: string; children?: ReactNode }) {
  const entry = explain(props.term);
  return (
    <span className="explainer" tabIndex={0} data-term={props.term}>
      {props.children ?? <span className="q" aria-hidden="true">?</span>}
      <span role="tooltip" className="pop">
        <b>{entry.concept}</b>
        <span className="pop-row">Formula: {entry.formula}</span>
        <span className="pop-row">Benchmark: {entry.benchmark}</span>
        <span className="pop-row pop-src">Src: {entry.source}</span>
      </span>
    </span>
  );
}
