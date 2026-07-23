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

Cloudflare Workers (SSR) + React Router 7 + 直连上游开源 API (匿名 GET) + 本地 JSON 快照兜底。

## 结构

- `app/` React Router 路由 (`routes/home.tsx` = 首页)
- `workers/app.ts` Worker 入口, 转发到 React Router
- `wrangler.jsonc` Worker 配置 (`name: jj-ai`, `vars.HELLO_NAME`)
- `.github/workflows/deploy.yml` tag `v*` 推送 → GHA 构建 + `wrangler deploy`
