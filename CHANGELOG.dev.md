```When Editing
本文档作用: 面向开发者的发版记录; CHANGELOG.md 的超集, 1:1 镜像 + 技术变更子项
遵循 AGENTS.md 文档编写规范
- 每条主项 = CHANGELOG.md 对应条目 (原文), 下方缩进子项承载技术变更
- 子项 MAY 写路径 / 函数 / 机制; ≤ 1 行
```

# Changelog (developer, follow [CHANGELOG.md](./CHANGELOG.md))

## [0.1.0] - 2026-07-24

### Added

- 工程初始化 + Cloudflare Workers `jj-ai` 上线, 首页 `Hello, jj-ai!` + 显示当前版本 + `/llms` 入口
  - AGENTS.md + CLAUDE.md(symlink) + README.md + workflow.md + CHANGELOG.md + CHANGELOG.dev.md 骨架
  - `plans/20260723-001/` 需求 + OpenRouter API 原始文档
  - React Router 7 SSR (`app/`) + Worker 入口 (`workers/app.ts`) + `wrangler.jsonc` (`name: jj-ai`, `HELLO_NAME` 变量)
  - `bun` + `vite` + `@cloudflare/vite-plugin` 工具链
  - `package.json.version` → home loader 单一信源, 前端展示
- `/llms` 子页 (占位: `hello llms`)
  - `app/routes/llms.tsx` + `routes.ts` 显式路由 (`route("llms", ...)`)
- GitHub Actions: 推送 `v*` tag 自动构建 + 部署
  - `.github/workflows/deploy.yml`: `bun install --frozen-lockfile` → `bun run typecheck` → `bun run deploy`; 依赖 `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` secrets

[0.1.0]: https://github.com/yigegongjiang/jj-ai/releases/tag/v0.1.0
