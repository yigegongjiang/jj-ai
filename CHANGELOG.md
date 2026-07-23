```When Editing
本文档作用: 面向使用者的发版记录; 只写用户感受得到的变化, MUST NOT 写技术细节 (→ CHANGELOG.dev.md)
遵循 AGENTS.md 文档编写规范
- 写: 新功能 / 行为修复 / 体验 / 安全 / 命令迁移
- MUST NOT 写: 文件路径 / 函数名 / 组件名 / 依赖包名 / 重构细节
- 单条 ≤ 2 行, 单版本 ≤ 5 条; 段落: Added / Changed / Fixed / Removed / Security
- 无用户可感知变化 → 占位: `跟随版本同步发布`
```

# Changelog

[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) + [SemVer](https://semver.org/).

## [0.2.0] - 2026-07-24

### Added

- 大模型库页 (`/llms`): 全量检索 (命中高亮 + `-term` 排除) + 多维过滤 (输入/输出模态·能力·价格档·上架时间·厂商多选) + 多列排序 + 详情抽屉 (定价/基准/推理/参数)
- Sync 按钮: 一键拉取最新全量数据并即时刷新 (数据源 OpenRouter, 仅存最新一份)
- 首页: 入口卡片 → 模型库, 显示当前版本

### Changed

- 首页由占位文案升级为现代化暗色界面

## [0.1.0] - 2026-07-24

### Added

- 工程初始化 + Cloudflare Workers `jj-ai` 上线, 首页 `Hello, jj-ai!` + 显示当前版本 + `/llms` 入口
- `/llms` 子页 (占位: `hello llms`)
- GitHub Actions: 推送 `v*` tag 自动构建 + 部署

[0.1.0]: https://github.com/yigegongjiang/jj-ai/releases/tag/v0.1.0
