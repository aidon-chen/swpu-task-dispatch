# 任务派发系统（task_dispatch_miniprogram）

西南石油大学视觉中心（摄影部 + 视频部，约 40 人）的微信小程序任务派发系统。

- **前端**：微信小程序原生框架 + TDesign 小程序组件库
- **后端**：微信云开发（CloudBase）——云函数 + 云数据库 + 云存储
- **AppID**：`wx8fdb0c0acb28ee1a`
- **云环境 ID**：`cloud1-d8gdddel1d4b1cea1`（dev/test/prod 当前共用此环境）

## 这是什么

一个把"任务派发 → 人员确认 → 成果交付"流程数字化的内部工具：主任建任务、指派成员；成员上报可用状态、查看值班表；系统沉淀机位知识与统计报表，辅助稿分填写。

## 快速开始

👉 **[📖 完整快速上手文档](./docs/01-快速上手/getting-started.md)** —— 从安装微信开发者工具到编译运行，< 15 分钟。

## 文档

所有技术文档在 [`docs/`](./docs/README.md) 下，包含：

- [文档中心 / 导航](./docs/README.md)
- [快速上手](./docs/01-快速上手/getting-started.md)
- [API 参考](./docs/03-参考文档/api-reference.md)
- 设计态归档：PRD、架构设计、时序图、类图（见 `docs/`）

> ⚠️ 设计与实现存在偏差（如通知方案、错误码），文档以**代码真实状态**为准，缺失功能均标注「规划中」。

## 当前落地状态（摘要）

| 模块 | 状态 |
|------|------|
| 登录 / 角色密钥升级 | ✅ 已实现 |
| 任务创建 / 编辑 / 列表 | ✅ 已实现 |
| 人员状态 / 值班表 | ✅ 已实现（值班矩阵未完整） |
| 机位管理 | ✅ 已实现 |
| 通知（sendNotification） | 🟡 部分实现（用订阅消息，模板 ID 待填；小程序内通知未接数据） |
| 统计报表 / 新闻匹配 / 密钥生成 / 定时提醒 | ⚠️ 规划中（前端有桩，后端未实现） |

详见 [API 参考](./docs/03-参考文档/api-reference.md)。

## 团队协作与工作流

本仓库采用 **Trunk-based** 协作流程，`main` 为唯一长期分支且**禁止直接 push，必须通过 Pull Request 评审合入**。

- 📘 [团队 Git 工作流规范](./docs/GIT_WORKFLOW.md)（分支命名、Conventional Commits、PR 流程、命令速查）
- 🔀 所有改动走 `feat/*`、`fix/*` 等短生命周期特性分支 → PR → 评审 → 合入 `main`
- ✅ CI 自动校验 PR 标题是否符合 Conventional Commits
- 🔒 仓库为私有仓库；分支保护（强制 PR 必审 / 禁止强推）需在 GitHub Pro / 团队版下开启，详见工作流文档

> 提交前请确认所有 `testConfig.js` 与 `miniprogram/config/test.js` 的 `enabled` 已恢复 `false`，避免调试逻辑进入生产。
