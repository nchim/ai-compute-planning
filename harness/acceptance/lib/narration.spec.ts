import { expect, test } from "@playwright/test";

import { missingDimensions, numbersIn, untraceable } from "./narration";

test("numbersIn reads money/percent/scale tokens and every dash as a sign, skipping identifiers and years", () => {
  expect(numbersIn("NPV ‑$383M (was −$232M), capex $6.52B, capture 82.1%, 1,909 bps, P10/Q3-28/GB300 in 2029")).toEqual([
    -383e6, -232e6, 6.52e9, 82.1, 1909,
  ]);
});

test("untraceable accepts two-significant-figure matches under the usual scalings and small counts", () => {
  const facts = [-382776296.8, 2.3412, 82.09, 6524000000];
  expect(untraceable("NPV ‑$383M, LCOC $2.34, capture 82%, capex $6.5B, 3 phases", facts)).toEqual([]);
  expect(untraceable("LCOC $2.50", facts)).toEqual([2.5]);
});

test("missingDimensions names what a summary left out", () => {
  expect(missingDimensions("Space and time are covered; capital too.")).toEqual(["risk"]);
});
