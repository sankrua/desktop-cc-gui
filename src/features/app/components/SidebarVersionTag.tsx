import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { Badge } from "@/components/ui/badge";

type SidebarVersionTagProps = {
  t: (key: string) => string;
  onOpenReleaseNotes: () => void;
};

/**
 * SidebarVersionTag - 侧栏底部的外显版本号标签
 * 极简 tag 样式：浅色边框、无填充背景、2px 圆角，文字色/字号对齐分支胶囊（tertiary + 12px）。
 * 点击打开版本记录弹窗。版本号自取自 Tauri（与 AboutView 一致），不额外向上层透传。
 */
export function SidebarVersionTag({ t, onOpenReleaseNotes }: SidebarVersionTagProps) {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getVersion()
      .then((value) => {
        if (active) {
          setVersion(value);
        }
      })
      .catch(() => {
        if (active) {
          setVersion(null);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  if (!version) {
    return null;
  }

  const label = t("sidebar.releaseNotes");

  return (
    <Badge
      asChild
      variant="outline"
      // outline 提供浅色边框；覆盖掉所有填充背景（静态 / 深色 / button hover），只保留边框+文字；圆角 2px
      className="ml-auto rounded-[2px] border-border bg-transparent px-2 text-xs font-normal text-muted-foreground hover:text-foreground dark:bg-transparent [button&,a&]:hover:bg-transparent dark:[button&,a&]:hover:bg-transparent"
    >
      <button type="button" onClick={onOpenReleaseNotes} title={label} aria-label={label}>
        v{version}
      </button>
    </Badge>
  );
}

export default SidebarVersionTag;
