import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

describe("composer input responsiveness guard", () => {
  it("keeps ChatInputBoxAdapter text propagation out of React transitions", () => {
    const source = readSource(
      "src/features/composer/components/ChatInputBox/ChatInputBoxAdapter.tsx",
    );
    const handleInputBlock = source.match(
      /const handleInput = useCallback\([\s\S]*?\n {4}\}, \[onTextChange\]\);/,
    )?.[0];

    expect(handleInputBlock).toBeTruthy();
    expect(handleInputBlock).toContain("onTextChange(content, null)");
    expect(handleInputBlock).not.toContain("startTransition");
  });

  it("keeps active thread draft updates out of React transitions", () => {
    const source = readSource("src/features/app/hooks/useComposerController.ts");
    const handleDraftChangeBlock = source.match(
      /const handleDraftChange = useCallback\([\s\S]*?\n {4}\[activeThreadId\],\n {2}\);/,
    )?.[0];

    expect(handleDraftChangeBlock).toBeTruthy();
    expect(handleDraftChangeBlock).toContain("setComposerDraftsByThread");
    expect(handleDraftChangeBlock).not.toContain("startTransition");
  });
});
