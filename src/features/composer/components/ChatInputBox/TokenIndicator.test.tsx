// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { TokenIndicator } from "./TokenIndicator";

describe("TokenIndicator", () => {
  afterEach(() => {
    cleanup();
  });

  it("keeps the entry visible before any usage data arrives", async () => {
    const user = userEvent.setup();
    const { container } = render(<TokenIndicator percentage={null} />);

    const trigger = container.querySelector('[data-slot="hover-card-trigger"]');
    expect(trigger).toBeTruthy();
    // 数据未知时不显示误导性的 0%
    expect(screen.queryByText("0%")).toBeNull();

    await user.hover(trigger as Element);
    expect(await screen.findByText("chat.claudeContextUnavailable")).toBeTruthy();
  });

  it("renders percentage and window occupancy once usage is known", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <TokenIndicator percentage={31.3} usedTokens={40_000} maxTokens={128_000} />,
    );

    expect(screen.getByText("31.3%")).toBeTruthy();

    await user.hover(
      container.querySelector('[data-slot="hover-card-trigger"]') as Element,
    );
    expect(await screen.findByText("40K / 128K")).toBeTruthy();
  });
});
