// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FileChangeRow, type FileChangeDiffPreview } from "./FileChangeRow";

afterEach(() => {
  cleanup();
});

describe("FileChangeRow", () => {
  it("shows file name and stats collapsed, and defers diff parsing until expanded", () => {
    const loadDiff = vi.fn(
      (): FileChangeDiffPreview => ({
        lines: [
          { kind: "del", text: "old" },
          { kind: "add", text: "new" },
        ],
      }),
    );
    const view = render(
      <FileChangeRow
        filePath="src/App.tsx"
        additions={1}
        deletions={1}
        status="completed"
        canExpand
        loadDiff={loadDiff}
      />,
    );

    expect(screen.getByText("App.tsx")).toBeTruthy();
    expect(screen.getByText("+1")).toBeTruthy();
    expect(screen.getByText("-1")).toBeTruthy();
    // 折叠态不解析 diff
    expect(loadDiff).not.toHaveBeenCalled();
    expect(view.container.querySelector(".tool-change-inline-diff")).toBeNull();

    fireEvent.click(screen.getByText("tools.editFile"));
    expect(loadDiff).toHaveBeenCalledTimes(1);
    expect(view.container.querySelector(".tool-change-inline-diff")).toBeTruthy();
    expect(screen.getByText("old")).toBeTruthy();
    expect(screen.getByText("new")).toBeTruthy();
  });

  it("renders fallback body when expanded without diff lines", () => {
    render(
      <FileChangeRow
        filePath="src/App.tsx"
        additions={0}
        deletions={0}
        status="completed"
        canExpand
        loadDiff={() => ({ lines: [] })}
        fallbackBody={<pre>raw output</pre>}
      />,
    );

    fireEvent.click(screen.getByText("tools.editFile"));
    expect(screen.getByText("raw output")).toBeTruthy();
  });

  it("routes to diff view via file link without toggling the row", () => {
    const onOpenDiffPath = vi.fn();
    const loadDiff = vi.fn((): FileChangeDiffPreview => ({ lines: [{ kind: "add", text: "x" }] }));
    const view = render(
      <FileChangeRow
        filePath="src/App.tsx"
        additions={1}
        deletions={0}
        status="completed"
        canExpand
        loadDiff={loadDiff}
        onOpenDiffPath={onOpenDiffPath}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "App.tsx" }));
    expect(onOpenDiffPath).toHaveBeenCalledWith("src/App.tsx");
    // 点击文件名不展开本行
    expect(loadDiff).not.toHaveBeenCalled();
    expect(view.container.querySelector(".tool-change-inline-diff")).toBeNull();
  });

  it("renders a non-expandable display row when canExpand is false", () => {
    const view = render(
      <FileChangeRow
        filePath="src/App.tsx"
        additions={2}
        deletions={0}
        status="completed"
      />,
    );

    expect(screen.getByText("App.tsx")).toBeTruthy();
    expect(screen.getByText("+2")).toBeTruthy();
    expect(screen.queryByText("-0")).toBeNull();
    // 不可展开：点击行头不产生展开体
    fireEvent.click(screen.getByText("tools.editFile"));
    expect(view.container.querySelector(".tool-change-inline-diff")).toBeNull();
  });
});
