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

## [0.1.0] - 2026-07-24

### Added

- 工程初始化 + Cloudflare Workers `jj-ai` 上线, 首页 `Hello, jj-ai!` + 显示当前版本 + `/llms` 入口
- `/llms` 子页 (占位: `hello llms`)
- GitHub Actions: 推送 `v*` tag 自动构建 + 部署

[0.1.0]: https://github.com/yigegongjiang/jj-ai/releases/tag/v0.1.0
