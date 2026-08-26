# PRD · 测试模式工具中心

> 版本：v1.0 ｜ 日期：2026-08-26 ｜ 状态：已实施（S1~S4 全部完成）
> 关联代码：`cloudfunctions/generateTestData/`、`pages/test-tools/`、`app.json` tabBar 第 5 项

## 1. 概述
测试模式（`config/test.js` enabled=true）下供开发者/调试登录用户使用的**数据准备与测试工具中心**，以 tabBar 第 5 个「测试」tab 承载，卡片式收纳测试工具，未来可扩展。
背景痛点：云端仅有 1 个真实任务，无法验证高级筛选/统计/详情联动；无测试用户可指派，任务分配需指定真实用户。

## 2. 目标与非目标
- 目标：① 菜单栏常驻入口（测试 tab）；② 一键生成测试用户（可指派）；③ 一键生成批量测试任务（字段覆盖筛选/统计/评价全链路）；④ 一键清理测试数据（只删带标记）；⑤ 非测试模式下不可用。
- 非目标：不做真实用户注册/登录改造；不做线上数据迁移；不做测试数据统计分析。

## 3. 功能点（验收标准 AC）
| ID | 功能点 | 类型 | 说明 | AC |
|----|--------|------|------|-----|
| P1 | 菜单栏测试入口 | 核心 | tabBar 第 5 项「测试」（纯文字无图标）→ 测试工具中心页 | AC1 tab 可见可点；AC2 非测试模式显示占位 |
| P2 | 快速新建测试用户 | 核心 | 一键生成 3/6/12 个 member 测试用户，摄影/视频各半 | AC1 生成成功；AC2 openid 为 seed-openid-N 不冲突；AC3 幂等 |
| P3 | 生成测试任务 | 核心 | 一键生成 5/12/20 个测试任务，自动确保测试用户存在并指派真实 _id，**调用者追加进 assignedTo** | AC1 生成成功；AC2 覆盖 5 状态/2 部门/2 优先级/5 类型/跨部门/±30 天；AC3 completed 带评价；AC4 详情页成员可见；AC5 当前账号在首页可见测试任务 |
| P4 | 一键清理测试数据 | 核心 | 删除 tasks+users 中全部 testSeed:true | AC1 只删标记；AC2 真实数据保留 |
| P5 | 状态展示与占位 | 辅助 | 页面顶部显示测试模式开关状态 | AC1 状态正确展示 |

## 4. 数据结构
- **users 测试用户**：`{ name:'测试成员N', avatar:'', openid:'seed-openid-N', department:'photography'|'video', role:'member', semester:'YYYY-spring|autumn', testSeed:true, createdAt, updatedAt }`
- **tasks 测试任务**：`{ title:'[测试] xxx-N', type, startTime, endTime(Date), location, contact, description, deliverables, assignedTo:[seed用户_id, 调用者_id], creatorId:[seed用户_id], status:5 值, priority, isCrossDepartment, locationId:'', isTemplate:false, templateName:'', ownerDepartment, semester, testSeed:true, createdAt, updatedAt, (completed 附 ratings/avgScore) }`
- 关键约定：openid 用 `seed-openid-N` 占位（与真实微信 openid 不同，login/verifyKey 按 openid 查询不误命中）；所有测试数据带 `testSeed:true`。

## 5. 接口
- 云函数 `generateTestData`：`{ action:'generate_users'|'generate'|'clean', count? }`
  - `generate_users`：建 count 个（默认 6，上限 20）测试用户，openid 已存在跳过 → `{inserted, ids}`
  - `generate`：确保测试用户存在 → 建 count 个（默认 12，上限 50）测试任务，指派真实测试用户 + 调用者 → `{inserted, ids, users}`
  - `clean`：删 tasks+users 中 testSeed:true → `{removedTasks, removedUsers}`
- 前端 `utils/api.js` 的 `generateTestData(params)`（调试角色附加与现有一致）。

## 6. 边界与安全
- **门禁**：`cloudfunctions/generateTestData/testConfig.js`，三动作统一受控；当前开发测试期 enabled=true（与 config/test.js 一致），**发布生产前必须 false**（红线）。
- **幂等**：generate_users 按 openid 查重跳过；generate 依赖 ensureTestUsers 不重复建人。
- **不污染**：clean 只删 testSeed:true；数量钳制（用户 ≤20、任务 ≤50）；直写库不触发任何通知。
- **占位 id**：seed 用户不可真机登录（无微信身份绑定），仅用于指派展示/聚合数据。
- **可见性**：generate 将调用者 _id 追加进 assignedTo，保证数据库角色为 member 的调试账号也能在首页/筛选看到测试任务（getTasks 按角色范围过滤）。

## 7. 分阶段实施（已完成）
| 阶段 | 内容 | 完成标志 |
|------|------|----------|
| S1 入口搭建 | app.json + pages/test-tools 骨架 | 模拟器「测试」tab 可见、页面零报错 |
| S2 人员生成 | 云函数 generate_users + 前端卡片 | TC-200/205/206 绿；云端生成 3 用户幂等 |
| S3 任务生成 | 云函数 generate + 前端卡片 | TC 绿；任务详情成员可显示 |
| S4 清理收尾 | clean + 前端卡片 + 部署 + 全量 147 例 | 端到端生成→筛选→清理通过 |

## 8. 发布前注意事项
- **tabBar 静态**：无法按测试模式动态隐藏「测试」tab。发布方案二选一：A（推荐）发布前从 app.json 移除 tab 与页面；B 保留但依赖 enabled=false 显示占位（正式版露出「测试」字样）。
- **开关复位红线**：`config/test.js`、`generateTestData/testConfig.js` 及既有各 testConfig 发布前全部 false。
- **部署全量**：`scripts/deploy-functions.js` 会带上 generateTestData 到各环境，靠 testConfig 门禁兜底（可选加 PROD_EXCLUDE）。
- **冷启动/权限**：任何用户可 callFunction('generateTestData')，安全完全依赖门禁，务必默认 false。
