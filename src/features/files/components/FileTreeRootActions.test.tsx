/** @vitest-environment jsdom */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileTreeRootActions } from "./FileTreeRootActions";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe("FileTreeRootActions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback: FrameRequestCallback) => {
      callback(performance.now());
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("replays spin animation when clicking the same action repeatedly", () => {
    const onOpenSpecHub = vi.fn();

    render(<FileTreeRootActions onOpenSpecHub={onOpenSpecHub} />);

    const button = screen.getByRole("button", { name: "sidebar.specHub" });

    fireEvent.click(button);
    act(() => {
      vi.advanceTimersByTime(16);
    });
    expect(button.className).toContain("is-spinning");
    expect(onOpenSpecHub).toHaveBeenCalledTimes(1);

    fireEvent.click(button);
    act(() => {
      vi.advanceTimersByTime(16);
    });
    expect(button.className).toContain("is-spinning");
    expect(onOpenSpecHub).toHaveBeenCalledTimes(2);

    act(() => {
      vi.advanceTimersByTime(420);
    });
    expect(button.className).not.toContain("is-spinning");
  });

  it("does not render new-file, new-folder, refresh, or delete actions", () => {
    render(<FileTreeRootActions onOpenSpecHub={() => undefined} />);

    expect(screen.queryByRole("button", { name: "files.newFile" })).toBeNull();
    expect(screen.queryByRole("button", { name: "files.newFolder" })).toBeNull();
    expect(screen.queryByRole("button", { name: "files.refreshFiles" })).toBeNull();
    expect(screen.queryByRole("button", { name: "files.deleteItem" })).toBeNull();
  });
});
