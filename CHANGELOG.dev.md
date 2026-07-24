```When Editing
本文档作用: 面向开发者的发版记录; CHANGELOG.md 的超集, 1:1 镜像 + 技术变更子项
遵循 AGENTS.md 文档编写规范
- 每条主项 = CHANGELOG.md 对应条目 (原文), 下方缩进子项承载技术变更
- 子项 MAY 写路径 / 函数 / 机制; ≤ 1 行
```

# Changelog (developer, follow [CHANGELOG.md](./CHANGELOG.md))

## [0.4.0] - 2026-07-24

### Added

- 首页 Bookmarks 区块: 自定义快捷 URL 书签, 增 / 改 / 删 + 6 色标记
  - `app/routes/home.tsx`: loader 读 KV `bookmarks` 键 (复用 `MODELS_KV`, 无需改 `wrangler.jsonc`); action 按 `_action` (add/edit/delete) 整表覆盖写回; 组件以自动 revalidation 的 `loaderData` 为单一数据源
  - `<Form method=post>` 提交 + SSR (无 localStorage / 无水合门控); `useNavigation` 检测提交完成后自动收起表单; `required` 保证不提交空值
  - URL 规范化: 非 http(s) scheme 一律剥离改 https, 防 `javascript:` href 注入; 颜色仅接受固定 6 色板 (`pickColor`)
  - 三种排序 (客户端派生): 高频 `clicks` (默认) / 最近 `createdAt` / 手动 (KV 数组序, HTML5 DnD 拖拽手柄 -> `reorder` action 写回); 仅 manual 且未筛选标签时可拖, 成员集不变时保留本地序防 KV 最终一致性回弹
  - 点击计数: `<a onClick>` 经 `useFetcher` 后台提交 `click` action +1 (target=_blank 不阻塞跳转); `normalize` 兼容旧数据补 createdAt/clicks
  - 标签: title 内 `#xx` 解析为标签 (`parseTags`), 顶部过滤条筛选 + 卡片内标签胶囊高亮; monogram 用去标签名 (`stripTags`)
  - `app/app.css` `.bm-*` 局部样式 + `.bm-sort/.bm-tools/.dragging`; 首页为 1280px Bookmarks 主面板 + 应用侧栏, 900px 下单列, 名称完整换行, 无新增依赖

## [0.3.0] - 2026-07-24

### Added

- 本地部署模型页 (`/modelfit`): RAM 反查 + 多维过滤 + 排序 + 详情抽屉 (可复制 Ollama 命令)
  - `app/routes/modelfit.tsx`: loader 读 KV; action fetch `https://modelfit.io/api/dataset/` (返回 `{models, updated, counts}`, 与 OpenRouter 异构) → 仅在有效非空数组时覆盖快照; 复用 `MODELS_KV` 新键 `modelfit` (无需改 `wrangler.jsonc`)
  - 稳定行 id `model+"|"+quantization` (feature.md 警示同模型多量化会重复, 现快照虽唯一仍前置防御); React key + 选中态均用之
  - 云端行 `minRamGb/estimatedLoadGb=0`、`params=null` 一律渲染 `—`/`Cloud`/`API`, 排序时 0/null 恒排末尾 (不显示误导性 "0 GB")
  - `bestFor` 42 原始标签 → 12 规范用途类目 (`CAT_MAP` 全映射, 含多类目/兜底, 无模型从 facet 丢失); 类目 facet 按固定顺序展示
  - RAM 预算过滤 = `runsLocally && minRamGb<=budget` (云端无本地占用故排除); 参数档 null 不入档
  - 客户端全量内存派生/过滤/排序; `useDeferredValue` 平滑; 107 行无需虚拟化
- Sync 按钮: 一键拉取最新数据集并即时刷新 (数据源 ModelFit, 仅存最新一份)
  - RR7 `<Form method=post>` → action; 快照 = `{syncedAt, updated, counts, data[]}`
- 首页新增入口卡片 → 本地部署模型页
  - `app/routes/home.tsx` 第二卡片 + `routes.ts` 显式路由 `route("modelfit", ...)`; `app/app.css` 追加 modelfit 局部样式 (RAM 输入/部署徽章/用途标签/Ollama 命令块), 无新增依赖

## [0.2.0] - 2026-07-24

### Added

- 大模型库页 (`/llms`): 全量检索 (命中高亮 + `-term` 排除) + 多维过滤 + 多列排序 + 详情抽屉
  - `app/routes/llms.tsx`: loader 读 KV; action fetch `?output_modalities=all` → 仅在有效非空数组时覆盖快照 → 回传新数据; 组件 `actionData ?? loaderData` 渲染 (规避 KV 最终一致性)
  - 客户端全量内存计算: `useMemo` 派生行 + 过滤/排序/高亮; `useDeferredValue` 平滑输入; 441 行无需虚拟化
  - 过滤: 输入/输出模态·能力(tools/reasoning/structured)·价格档(inP 分档)·上架时间(客户端 `Date.now`, 默认 all 免水合不一致)·厂商多选(热门置顶 `POPULAR_PROVIDERS`, 其余按数量); 排序: 价格列单表头 4 态循环 (in↑/↓ out↑/↓), Auto(负哨兵)/缺失值恒排末尾
- Sync 按钮: 一键拉取最新全量数据并即时刷新 (数据源 OpenRouter, 仅存最新一份)
  - RR7 `<Form method=post>` → action; Cloudflare KV `MODELS_KV` 单键 `snapshot` = `{syncedAt, data[]}`; `wrangler.jsonc` kv 绑定
- 首页: 入口卡片 → 模型库, 显示当前版本
  - `app/routes/home.tsx` 改版; `app/app.css` 手写暗色设计系统经 `app/root.tsx` links 全局注入 (无 CSS 框架 / 无新增依赖)

### Fixed

- workflow.md 预部署: `npx wrangler deploy` → `bun run deploy` (前者不重新构建, 会部署 `build/` 陈旧产物)

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
