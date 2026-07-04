import { describe, expect, it } from "vitest";
import {
  splitToolbarItems,
  type ResponsiveIconToolbarItem,
} from "./responsive-icon-toolbar";

function makeItem(
  id: string,
  over: Partial<ResponsiveIconToolbarItem> = {},
): ResponsiveIconToolbarItem {
  return { id, label: id, icon: null, onSelect: () => {}, ...over };
}

describe("splitToolbarItems · collapseInactiveItems 宽度裁剪", () => {
  // files/search 勾选常驻，git 为激活项，activity 仅收纳在菜单
  const items = [
    makeItem("files", { keepVisible: true, priority: 0 }),
    makeItem("search", { keepVisible: true, priority: 1 }),
    makeItem("git", { keepVisible: true, priority: 2, ariaCurrent: "page" }),
    makeItem("activity", { keepVisible: false, priority: 3 }),
  ];

  it("宽度充足时外显全部勾选/激活项，维持既有行为", () => {
    const { visibleItems, overflowItems } = splitToolbarItems(items, 99, null, true);
    expect(visibleItems.map((i) => i.id)).toEqual(["files", "search", "git"]);
    expect(overflowItems.map((i) => i.id)).toEqual(["activity"]);
  });

  it("宽度不足时把超出的常驻项挪进「更多」菜单，避免重叠", () => {
    // 只能放下 2 个：激活项 git 必留，另一个按优先级取 files，search 收进菜单
    const { visibleItems, overflowItems } = splitToolbarItems(items, 2, null, true);
    expect(visibleItems).toHaveLength(2);
    expect(visibleItems.map((i) => i.id)).toContain("git");
    expect(overflowItems.map((i) => i.id)).toEqual(
      expect.arrayContaining(["search", "activity"]),
    );
  });

  it("最窄宽度下仍保留激活面板的图标", () => {
    const { visibleItems } = splitToolbarItems(items, 1, null, true);
    expect(visibleItems.map((i) => i.id)).toEqual(["git"]);
  });
});
