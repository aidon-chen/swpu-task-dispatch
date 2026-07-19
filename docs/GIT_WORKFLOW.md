# 团队 Git 工作流规范（Trunk-based）

本仓库采用 **Trunk-based（主干开发）** 协作模式：`main` 是唯一长期分支，始终保持可发布状态；
所有功能 / 修复都通过**短生命周期特性分支 + Pull Request 评审**合入。目标——干净的提交历史、
低冲突、可回溯、新人能快速上手。

> 适用团队：西南石油大学视觉中心（约 40 人，含摄影部 / 视频部）。仓库为 **私有仓库**。

---

## 1. 分支模型

```
main  ─────●────●────●────●────●───  (始终可发布 / 受保护，禁止直接 push)
            \  /      \  /
            ●         ●            (feat/*、fix/* 等短生命周期分支，合入即删)
```

- **不**使用 `develop` / `release` 等长生命周期分支（Git Flow 对当前团队偏重）。
- 特性分支存活时间越短越好（建议 ≤ 2–3 天），避免长期偏离 `main`。

## 2. 分支命名

| 前缀 | 用途 | 示例 |
|------|------|------|
| `feat/` | 新功能 | `feat/login-debug` |
| `fix/` | 缺陷修复 | `fix/create-task-permission` |
| `chore/` | 构建 / 杂务 | `chore/deps-update` |
| `docs/` | 文档 | `docs/workflow-guide` |
| `refactor/` | 重构 | `refactor/api-layer` |
| `test/` | 测试 | `test/key-cloud-functions` |

分支名用小写中划线，见名知意：**`feat/short-description`**。

## 3. 提交信息（Conventional Commits）

每条提交信息遵循：

```
<type>(<scope>): <subject>

<body 可选>
```

- type：`feat` `fix` `chore` `docs` `refactor` `test` `build` `ci` `perf` `style` `revert`
- subject：祈使句、简洁、**不写句号**
- 示例：
  - `feat(login): 支持调试角色登录`
  - `fix(task): 修复调试角色创建任务被拒`
  - `chore: 收紧 .gitignore 忽略构建产物`

**原子提交**：一个提交只做一件事，可独立 revert。CI 会自动校验 PR 标题是否符合此规范。

## 4. 日常流程

### 开始工作
```bash
git fetch origin
git checkout -b feat/my-feature origin/main
```

### 开发中（频繁小提交）
```bash
git add <具体文件>          # 不要 git add -A，避免误带构建产物
git commit -m "feat(x): 做了一件事"
```

### 合入前整理
```bash
git fetch origin
git rebase origin/main      # 把 main 的最新改动变基到本地，解决冲突
# 如需合并多个 fixup：git rebase -i origin/main
```

### 推送并发起 PR
```bash
git push -u origin feat/my-feature
# 到 GitHub 发起 Pull Request 到 main，填好模板，请求评审
```

### 评审通过后合入
- 优先 **Squash and merge**（把特性分支的多条提交压成一条干净提交进 `main`）；
  或 **Rebase and merge** 保留线性历史。
- 合入后删除特性分支：`git branch -d feat/my-feature && git push origin --delete feat/my-feature`

## 5. 关键规则（红线）

1. 🚫 **禁止直接 push `main`** —— 一切改动走 PR。
2. ✅ **原子提交**，每条可独立 revert。
3. 🔄 合入前 **rebase 到最新 `main`**，保持线性、无冗余 merge commit。
4. 💥 需要强推自己的特性分支时用 `git push --force-with-lease`（绝不对 `main` 强推）。
5. 📦 不提交 `node_modules/`、`miniprogram_npm/`、`backups/`、压缩包、值班表 xlsx。
6. 🧪 **测试模式改动后**，合入前务必把所有 `testConfig.js` 与 `miniprogram/config/test.js`
   的 `enabled` 恢复 `false`，否则调试逻辑会进入生产。

## 6. 测试模式隔离提醒

仓库已实现测试 / 生产隔离：前端 `config/test.js` + 各云函数 `testConfig.js` 控制调试逻辑。
- 提交前：`enabled` 必须为 `false`（生产态）。
- 本地调试：可临时置 `true`，用完恢复。
- 详见 `docs/PRD_test_mode.md`。

## 7. CI

`.github/workflows/ci.yml` 在每次 PR / push 到 `main` 时运行：
- 校验 PR 标题是否为 Conventional Commits；
- 对 `tests/` 下 JS 做语法检查。

> 注意：涉及云函数的测试（`tests/testKeyCloudFunctions.test.js`）需要云环境与测试密钥，
> 请在本地用 `node tests/runAll.js` 运行，CI 不自动跑云端测试。

## 8. 常用命令速查

```bash
git status                      # 看当前改动
git switch -c feat/x origin/main# 从 main 开新分支
git rebase origin/main          # 同步主干
git push --force-with-lease     # 安全强推自己的分支
git log --oneline -10           # 看最近提交
git reflog                      # 误操作后找回提交
```

---

## 分支保护说明（重要）

当前仓库为**私有仓库 + 个人免费 GitHub 账号**，GitHub 免费版对私有仓库**不开放**
强制分支保护（PR 必审 / 禁止强推）。因此：

- 上述「禁止直接 push main」「PR 必审」目前靠**团队纪律 + PR 模板 + CODEOWNERS + CI** 约束；
- 若要**硬强制**：将账号升级到 **GitHub Pro**（约 $4/月），或把仓库迁入 **GitHub 组织（Team 版）**，
  即可开启 `main` 的强制分支保护 / Ruleset。届时本仓库已就绪，一键开启即可。
