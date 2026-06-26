# Git 提交规范

提交信息必须使用英文。

## 格式

```
<type>(<scope>): <subject>

<body>
```

- **type**（必填）：见下表
- **scope**（可选）：模块/子系统名
- **subject**（必填）：英文小写开头，不加句号，≤ 72 字符，祈使语气（`add`/`fix`/`update`，不用 `added`/`fixes`）
- **body**（可选）：当变更复杂、需要解释 WHY 时用列表罗列改动

## Type

| Type | 用途 |
|------|------|
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `refactor` | 重构（不改外部行为） |
| `perf` | 性能优化 |
| `docs` | 文档 |
| `test` | 测试 |
| `style` | 代码格式（不改语义） |
| `chore` | 杂务（版本号、依赖、构建脚本等） |
| `ci` | CI/CD 配置 |
| `build` | 构建系统/外部依赖 |

单个 commit 只跨一个 scope；跨多个时省略 scope 或拆分提交。

## 示例

```
fix(permissions): respect settings.json rules in plan mode
refactor: extract UserMessageSanitizer utility
chore(version): bump to v0.4.3-Alpha1
```

带 body：
```
refactor: improve file link tooltip implementation

- Extract tooltip logic into useMarkdownFileLinkTooltip hook
- Move tooltip styles from inline JS to CSS
- Add LRU cache (max 200 entries) to prevent unbounded memory growth
```

## 版本号

`v<major>.<minor>.<patch>[-<prerelease><N>]`，例如 `v0.1.5-Alpha1` → `v0.1.5-Beta1` → `v0.1.5`。

版本提交统一用 `chore(version): bump to vX.Y.Z`。

## 禁忌

提交信息中禁止：

- AI 生成署名（`Generated with Claude Code`、`Co-Authored-By: Claude` 等）
- Emoji 表情符号
- 调试用语句（`WIP`、`test commit`、`asdf`）
- 个人化语气（`finally fixed!`、`I think this works`）
- 硬编码密钥、token、内部 URL
