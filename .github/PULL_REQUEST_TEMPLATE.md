<!-- PR 标题请遵循 Conventional Commits：<type>(<scope>): <subject>
类型：feat / fix / chore / docs / refactor / test / build / ci / perf / style / revert
示例：feat(login): 支持调试登录；fix(task): 修复创建任务权限问题 -->

## 变更说明
<!-- 这个 PR 做了什么、为什么做 -->

## 关联
- 关联 Issue / 需求：#

## 类型
- [ ] feat（新功能）
- [ ] fix（缺陷修复）
- [ ] docs（文档）
- [ ] refactor（重构）
- [ ] test（测试）
- [ ] chore（杂务 / 构建）

## 自查清单
- [ ] 遵循 Conventional Commits 提交信息规范
- [ ] 本地 `node tests/runAll.js` 通过（涉及测试模式时使用测试密钥）
- [ ] 未将 `miniprogram_npm/`、`node_modules/`、`backups/`、压缩包、值班表 xlsx 提交进仓库
- [ ] 测试模式改动：合入前已确认所有 `testConfig.js` 与 `miniprogram/config/test.js` 的 `enabled` 恢复为 `false`
- [ ] 已发起 PR 而非直接 push 到 `main`

## 测试模式提示
本仓库启用测试 / 生产隔离。合入 `main` 前请确认所有 `testConfig.js` 与 `miniprogram/config/test.js` 的
`enabled` 已恢复为 `false`，否则会把调试逻辑带进生产环境。
