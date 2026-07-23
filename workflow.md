```When Editing
本文档作用: 工程工作流程 (可用工具 / 调试 / 发布); MUST NOT 写工程说明 (→ README.md) / LLM 约束 (→ AGENTS.md)
遵循 AGENTS.md 文档编写规范
- 所有段落均为条件段, 根据工程实际决定保留或删除; 存在即为明确流程, MUST NOT 附加强度标记
- 发布内按顺序编号步骤; 顶部 TL;DR ≤ 5 行; 删除子段后重编号保持连续
- 风险点 / 不可逆操作用 `>` 引用块; 高危操作 MUST 标禁用条件
```

# 可用工具

- `gh` 已登录
- `npx wrangler` 已登录
- `bunx` / `npx` 可用

# 发布

代码变更完成后立即执行（= 需求交付的最后环节）。触发方式：`npx wrangler` 本机部署 + `git push` branch + annotated tag。

## TL;DR

依序执行：

1. 预部署：`npx wrangler deploy`
2. 写版本：`CHANGELOG.md` + `CHANGELOG.dev.md` 同步编辑 (与 tag 一致)
3. 发布：commit + annotated tag (`-a -m`) + push branch + tag
4. 修上版 bug：amend + 删远程 tag + 重打 + force push

## 1. 预部署

`npx wrangler deploy` 本机推送到 Cloudflare。

## 2. 写版本

- 版本号: 默认递增 PATCH (第三位); 新功能 → MINOR; 不兼容改动 → MAJOR
- `CHANGELOG.md` + `CHANGELOG.dev.md` 同步编辑 (与 tag 一致)

## 3. 发布

```bash
git add -A
git commit -m "release: vX.Y.Z"
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin master
git push origin vX.Y.Z
```

## 4. 修上版 bug

上版存在明显 bug 时，amend 修复后重新发布。

> `git push --force-with-lease` 仅允许作用于当前发布的 tag 提交；MUST NOT 覆盖历史其他 commit。

```bash
git commit --amend --no-edit
git tag -d vX.Y.Z
git push origin :refs/tags/vX.Y.Z
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin master --force-with-lease
git push origin vX.Y.Z
```
