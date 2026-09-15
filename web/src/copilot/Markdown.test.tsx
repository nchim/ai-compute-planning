// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import { Markdown } from "./Markdown";

afterEach(cleanup);

test("renders GitHub-flavoured tables, headings, lists and code; never raw HTML", () => {
  const { container } = render(
    <Markdown text={"## Compare\n\n| Metric | Baseline | Now |\n|---|---|---|\n| LCOC | 2.16 | **1.91** |\n\n- one\n- two\n\n`x` <img src=x onerror=alert(1)>"} />,
  );
  expect(container.querySelector("h2")?.textContent).toBe("Compare");
  expect(container.querySelectorAll("table td")).toHaveLength(3);
  expect(container.querySelector("table strong")?.textContent).toBe("1.91");
  expect(container.querySelectorAll("li")).toHaveLength(2);
  expect(container.querySelector("code")?.textContent).toBe("x");
  expect(container.querySelector("img")).toBeNull();
  expect(container.textContent).toContain("<img");
});

test("links open in a new tab", () => {
  const { container } = render(<Markdown text="see [docs](https://example.com)" />);
  const a = container.querySelector("a")!;
  expect(a.getAttribute("target")).toBe("_blank");
  expect(a.getAttribute("rel")).toContain("noopener");
});
