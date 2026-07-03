import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Extract the body of a single CSS rule by its exact selector text.
 * Returns the text between the selector's `{` and its matching `}`.
 */
function ruleBody(css: string, selector: string): string {
  const start = css.indexOf(selector);
  if (start === -1) {
    throw new Error(`selector not found: ${selector}`);
  }
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
}

describe("Sidebar styles", () => {
  // Regression guard for the P0 where clicking "更多" (expand) hid every
  // session: the virtualized thread list uses only `max-height` for its scroll
  // viewport, so `size` containment (via `contain: strict`) collapsed it to 0px
  // and the virtualizer rendered nothing. Must stay `contain: content`.
  it("does not size-contain the virtualized thread list into a 0px viewport", () => {
    const css = readFileSync(
      resolve(process.cwd(), "src/styles/sidebar.css"),
      "utf8",
    );
    const body = ruleBody(css, '.thread-list[data-virtualized="true"]');

    // `strict` == `size layout paint`; the `size` part is what collapses a
    // max-height-only scroll container. `content` == `layout paint`, safe.
    expect(body).not.toMatch(/contain:\s*strict/);
    expect(body).not.toMatch(/contain:[^;]*\bsize\b/);
    expect(body).toMatch(/contain:\s*content/);
    // The scroll viewport still relies on max-height + overflow to work.
    expect(body).toMatch(/max-height:\s*360px/);
    expect(body).toMatch(/overflow-y:\s*auto/);
  });
});
