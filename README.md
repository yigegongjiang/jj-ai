```When Editing
本文档作用: 工程总览 (价值主张 / 使用 / 架构 / 结构); MUST NOT 写发布流程 (→ workflow.md) / LLM 约束 (→ AGENTS.md)
遵循 AGENTS.md 文档编写规范
- 章节按需增删, 只留项目真有的; 首行一行价值主张, MUST NOT 带 LLM 提示
- 短并列项用表格; 可执行步骤 fenced + `#` 注释同行
- NEVER 写「开发」段 (VibeCoding 不向人类解释 dev 命令)
```

# jj-ai

AI 数据/知识展示站 (Cloudflare Workers) → 聚合消费开源 API。

## 使用

访问已部署的 Cloudflare Workers 站点 (Worker name: `jj-ai`); 无认证 / 无后端。

首页为聚合入口: 各二级子页面入口 (如 OpenRouter 模型数据, 后续可扩展其他开源 API) + 不便归入子页面的补充内容。

## 架构

Cloudflare Workers (SSR) + React Router 7 + Cloudflare KV 存全量快照 (Sync 时拉上游写入, 页面 SSR 读 KV) + 客户端全量内存检索/过滤/排序。上游数据源匿名 GET, 无 API Key / 无后端。

## 结构

- `app/` React Router 路由 + 视图
  - `routes/home.tsx` 首页 (入口卡片 + 版本)
  - `routes/llms.tsx` 大模型库 (loader 读 KV / action Sync 写 KV / 客户端过滤; 数据源 OpenRouter)
  - `routes/modelfit.tsx` 本地部署模型 (RAM 反查; 数据源 ModelFit; 复用 `MODELS_KV` 键 `modelfit`)
  - `app.css` 手写暗色设计系统 (经 `root.tsx` 全局注入)
- `workers/app.ts` Worker 入口, 转发到 React Router
- `wrangler.jsonc` Worker 配置 (`name: jj-ai`, KV 绑定 `MODELS_KV` 存两数据集 (键 `snapshot`/`modelfit`), `vars.HELLO_NAME`)
- `.github/workflows/deploy.yml` tag `v*` 推送 → GHA 构建 + 部署
