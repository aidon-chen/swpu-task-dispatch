# 任务派发系统 · 待实现功能细分 PRD（草稿 v1.5）

> 文档状态：草稿（待评审）
> 编制日期：2026-07-19
> 依据：
> - `docs/PRD_v1.1(v1.4).md`（产品需求）
> - `docs/system_design_v1.3.md`（系统架构设计）
> - `开发进度分析.md`（2026-07-19 代码实查结论）
> - 实际代码：`miniprogram/` 下 15 页面 / 12 云函数 / `utils/api.js` / `components/`

---

## 0. 范围说明

本 PRD **只覆盖「尚未实现 / 仅空桩 / 实现方向存在分歧」** 的功能模块，已完成模块不再展开。
经实查，待建设模块共 10 项（M1–M10），按当前代码与设计文档的偏差整理如下：

| 编号 | 模块 | 当前代码状态 | 设计期望 | 建议优先级 |
|------|------|--------------|----------|-----------|
| M1 | 小程序内通知系统 | `sendNotification` 走微信订阅消息且 3 个模板 ID 全占位（实际发 0 条）；`messages` 页为空桩；首页无红点 | 写 `notifications` 集合 + TabBar 红点 + 消息中心，用户主动查看 | **P0** |
| M2 | 定时提醒与自动完结 | 代码中无任何 `scheduleNotify` 触发器文件 | 每 30 分钟扫描：任务前 2h 提醒 + 过期自动标记完成 | **P0** |
| M3 | 值班表可用性矩阵 | `getDutySchedule` 返回的 `availability` 恒为 `{}`，无任何写入路径 | 日历每日状态可填可查（手动录入 + Excel 导入） | **P0** |
| M4 | 生产密钥生成 | 仅有 `generateTestKey`（测试）；`key-generate` 页为空桩；无 `generateKey` 云函数 | 主任生成一次性正式密钥并分发 | **P1** |
| M5 | 任务统计报表 + 导出 | `api.getReport/exportReport` 均 `return 功能开发中`；`statistics` 页为桩 | 月/学期聚合 + wx-charts 图表 + 剪切板纯文本导出 | **P1** |
| M6 | 新闻匹配爬虫 | `api.crawlNews/getNewsCache` 均 `return 功能开发中`；`news-match` 页为桩 | jieba 分词 + 加权评分 + 罗列 + WebView 打开 | **P1** |
| M7 | 任务评价与反馈 | 无 | 成员/主任对任务打分与文字反馈 | **P2** |
| M8 | 任务模板 | 无 | 存为模板 / 从模板快速创建 | **P2** |
| M9 | 高级搜索 / 组合筛选 | 仅有基础关键词搜索 + 状态筛选 | 部门 / 时间段 / 类型 / 跨部等多维组合 | **P2** |
| M10 | 三环境分离落地 | `config/env.js` 仅为占位，当前共用单环境 | dev/test/prod 三环境切换 + 部署脚本 | **P2（基础设施）** |

---

## 1. 总体功能概述与目标

### 1.1 概述
当前系统已完成「登录认证 → 任务 CRUD → 机位管理 → 人员状态」的核心闭环，但**通知触达、定时提醒、值班可用性、统计报表、新闻匹配、正式密钥分发**等规划模块尚未收口，且通知模块存在代码与设计的**方向性分歧**（订阅消息 vs 小程序内通知）。本 PRD 将这 10 项缺口细化为可开发、可验收的需求。

### 1.2 目标
- **补齐核心闭环的「触达与提醒」**：让用户在不依赖微信订阅消息授权的情况下，可靠收到任务指派、取消、提醒、完结通知（M1 + M2）。
- **让数据真正可用**：值班表日历有状态、主任能生成正式密钥、成员能查自己的工作量统计、任务能关联新闻（M3/M4/M5/M6）。
- **提升长期运营效率**：评价反馈、任务模板、高级筛选降低重复操作（M7/M8/M9）。
- **保障多环境安全**：dev/test/prod 隔离，避免测试数据污染生产（M10）。

---

## 2. 目标用户群体及使用场景

| 角色 | 说明 | 在待实现模块中的主要诉求 |
|------|------|--------------------------|
| 视觉中心主任（Level3） | 最高权限，生成密钥、全局统计 | M4 生成密钥；M5 全中心统计；M7 查看评价 |
| 摄影/视频部主任（Level2） | 本部门管理，创建/派发任务、审批 | M1 收到指派回执；M2 提醒成员；M3 维护本部门值班；M5 本部门统计 |
| 普通成员（Level1） | 接任务、报状态、查自己的排期 | M1 消息中心看通知；M2 提前收到任务提醒；M3 看自己哪天有空/值班；M5 查个人统计；M6 看任务相关新闻 |
| 新成员 | 持密钥首次激活角色 | M4 被分发的密钥可正常激活 |

**典型场景示例**
- 场景 A（提醒）：成员小陈被指派「校运会拍摄」，任务当天 8:00 开始；6:00 系统自动推送「任务即将开始」提醒，他提前准备设备。→ M2
- 场景 B（通知）：主任老王创建任务后，小陈在「消息中心」看到「你收到新任务：校运会拍摄」，首页 TabBar 出现红点。→ M1
- 场景 C（值班）：视频部本周谁有空？老王在值班表页勾选成员×课节，日历立即显示每日在岗/空闲状态。→ M3
- 场景 D（密钥）：学期初，主任生成 10 个「摄影部主任」密钥，截图发群里，成员输入即升级角色。→ M4
- 场景 E（统计）：期末，主任一键生成「摄影部 2026 春季学期任务汇总」纯文本，复制到 WPS 写总结。→ M5
- 场景 F（新闻）：成员点「匹配新闻」，系统列出校官网与本次任务相关的新闻，点开即读。→ M6

---

## 3. 详细功能点拆分（含验收标准）

> 每个功能点标注 **[核心] / [辅助]**，并给出 **验收标准（AC）**。

### M1 · 小程序内通知系统

| 功能点 | 类型 | 说明 | 验收标准（AC） |
|--------|------|------|----------------|
| M1-1 通知写入集合 | 核心 | `sendNotification` 改为向 `notifications` 集合写入记录（不再调订阅消息，删除占位模板 ID） | AC1：调用后 `notifications` 集合新增对应 `userId/type/content/isRead=false` 记录；AC2：不再产生「模板 ID 无效」类错误日志 |
| M1-2 消息中心页（messages） | 核心 | 实现 `pages/messages`：列表展示当前用户通知，按时间倒序，未读高亮 | AC1：进入页可见本人全部通知；AC2：未读项有视觉区分；AC3：空态有友好提示 |
| M1-3 未读红点 | 核心 | `index` 页 `onShow` 拉取未读数；用 `wx.setTabBarBadge` 显示（超过 99 显示 99+） | AC1：有未读时 TabBar「首页/消息」角标显示数量；AC2：全部已读后角标消失 |
| M1-4 标记已读 | 核心 | 点击单条→跳任务详情并标记已读；消息中心「全部已读」按钮批量标记 | AC1：点击后该条 `isRead=true` 且红点 -1；AC2：「全部已读」后红点与未读数归零 |
| M1-5 通知类型模板 | 辅助 | 覆盖 `task_assigned / task_cancelled / reminder / task_completed` 四类文案 | AC1：四类通知文案与设计 §8.6 一致；AC2：取消类仅对被指派成员发 |
| M1-6 跳转关联 | 辅助 | 点击通知跳转到对应 `task-detail?id=xxx` | AC1：带 `taskId` 的通知点击可正确跳转；AC2：无 `taskId` 的通知不报错 |

**交互流程**
```
createTask/updateTask/scheduleNotify 云函数
   └─> sendNotification（写 notifications 集合）
          └─> 前端 index.onShow 拉未读数 → setTabBarBadge
          └─> 用户点 TabBar「消息」→ messages 页列表
                 └─> 点单条 → task-detail（标记已读，红点-1）
                 └─> 「全部已读」→ 批量 isRead=true（红点清零）
```

**数据结构（复用设计 §3.1.6，不变）**
```json
{
  "_id":"string","userId":"string","taskId":"string",
  "type":"task_assigned|task_cancelled|reminder|task_completed",
  "content":"string","isRead":false,"createdAt":"timestamp"
}
```
索引：`userId`、`isRead`、`createdAt`。

**接口定义**
- 复用现有云函数 `sendNotification`（改实现，入参不变：`{ toUserIds:[], type, taskId, content }`）。
- 新增 `getNotifications`：`{ userId, page, pageSize }` → 列表 + 未读数；`markRead`：`{ ids:[], all:bool }`。

**异常与边界**
- 同一操作（如创建任务）重复调用不应重复写通知 → 用 `(taskId,type,userId)` 去重或幂等。
- 接收者已注销/不存在 → 写入失败需跳过该用户，不影响其他接收者。
- 批量标记已读时部分 id 已读 → 幂等，不报错。
- 未读数极大（>99）→ 角标显示 `99+`。

---

### M2 · 定时提醒与自动完结（scheduleNotify）

| 功能点 | 类型 | 说明 | 验收标准（AC） |
|--------|------|------|----------------|
| M2-1 定时触发器 | 核心 | 新建云函数 `scheduleNotify` + `config.json` 定时器（每 30 分钟） | AC1：云函数部署后控制台可见触发器并按 30 分钟节拍执行；AC2：手动触发一次可正常跑完 |
| M2-2 任务前 2h 提醒 | 核心 | 扫描 `startTime ∈ [now, now+2h]` 且 `status='confirmed'` 的任务，逐成员写 `reminder` 通知 | AC1：到点的任务成员收到提醒通知；AC2：同一任务同周期不重复提醒（防重字段 `notifiedAt`） |
| M2-3 过期自动完结 | 核心 | 扫描 `endTime < now` 且 `status='in_progress'` → 置 `completed` 并写 `task_completed` 通知 | AC1：过期进行中任务自动变完成；AC2：不覆盖成员/主任已手动改的结果；AC3：不处理 `cancelled` |
| M2-4 执行隔离与日志 | 辅助 | 单条任务失败不影响其他；关键步骤写云函数日志 | AC1：一个任务异常不阻断同批次其他任务；AC2：日志可回溯扫描结果 |

**交互流程**：纯后台，无前端交互；前端仅通过 M1 的消息中心感知结果。

**数据结构**
- `tasks` 新增字段：`notifiedAt`（timestamp，提醒防重）；自动完结不改原 `status` 枚举。
- `notifications` 复用 M1。

**接口定义**
- 仅云函数内部调用（HTTP 直连由触发器发起），无前端 API。
- `config.json`：`{ "triggers":[{"name":"taskScanner","type":"timer","config":"0 */30 * * * * *"}] }`

**异常与边界**
- 触发器环境需为**云端环境**（非本地调试）才按节拍运行；本地用 `wx.cloud.callFunction` 手动触发验证。
- 时钟漂移 / 云函数冷启动延迟 → 扫描窗口放宽到 `[now-5m, now+2h]` 避免漏提醒。
- 大批量任务（>100）→ 分批游标读取，避免超时。
- 重复执行（云开发重试）→ 依赖 `notifiedAt` 幂等。

---

### M3 · 值班表可用性矩阵

| 功能点 | 类型 | 说明 | 验收标准（AC） |
|--------|------|------|----------------|
| M3-1 手动录入 | 核心 | 值班表页支持「选成员 + 选课节 + 选周次」写入可用性/排班 | AC1：保存后 `duty_schedule` 集合生成/更新记录；AC2：同一成员同课节同周次不重复建 |
| M3-2 矩阵读取 | 核心 | `getDutySchedule` 真实填充 `availability`（成员×日期 → 状态） | AC1：返回的非空 `availability` 与写入一致；AC2：日历日状态正确上色 |
| M3-3 Excel 导入脚本 | 辅助 | 提供 Python 脚本读 `.xlsx`（成员×课节矩阵）批量写库（初始化用） | AC1：脚本跑通写入；AC2：与手动录入数据结构一致 |
| M3-4 视图切换 | 辅助 | 日历 / 列表两种视图，按部门筛选 | AC1：可切换；AC2：部门筛选生效 |

**交互流程**
```
主任 → 值班表页 → 选成员/课节/周次 → updateDutySchedule（新建）
                                    ↓
                            getDutySchedule 立即刷新日历（availability 有值）
```

**数据结构**
```json
// duty_schedule 集合（新增）
{
  "_id":"string","userId":"string","department":"photography|video",
  "week":"number","section":"string","date":"date",
  "status":"on_duty|available|unavailable","note":"string",
  "createdBy":"string","createdAt":"timestamp"
}
```
索引：`userId`、`date`、`department`。

**接口定义**
- 新增 `updateDutySchedule`：`{ records:[{userId,week,section,date,status,note}] }`（批量 upsert）。
- 改造 `getDutySchedule`：返回 `{ schedule:[], availability:{ "userId_date": status } }`。

**异常与边界**
- 成员已删除/不存在 → 导入时跳过并汇总报告。
- 课节/周次枚举越界 → 返回 `1003` 参数非法。
- Excel 表头不符合约定 → 脚本给出明确报错而非静默。
- 同一格多状态冲突 → 后以写入为准（upsert）。

---

### M4 · 生产密钥生成（generateKey）

| 功能点 | 类型 | 说明 | 验收标准（AC） |
|--------|------|------|----------------|
| M4-1 生成云函数 | 核心 | 新建 `generateKey`（与测试 `generateTestKey` 区分）：8 位随机串，写 `keys` 集合 | AC1：生成 N 个不重复密钥；AC2：`createdBy` 记录生成者；AC3：仅 `center_director` 可调用，否则 `2002` |
| M4-2 角色约束 | 核心 | 生成的目标角色不能高于生成者自身 | AC1：主任只能生成 photo/video_director；AC2：越权返回 `2005` |
| M4-3 密钥页 UI | 核心 | 实现 `pages/key-generate`：选角色 + 数量(1–10) + 展示/复制 | AC1：表单校验数量范围；AC2：生成后列表可一键复制 |
| M4-4 与测试密钥隔离 | 辅助 | 正式密钥无 `DEV-` 前缀；`verifyKey` 正常激活角色 | AC1：正式密钥激活后用户角色正确升级；AC2：与测试密钥互不干扰 |

**交互流程**
```
center_director → key-generate 页 → generateKey 云函数 → keys 集合
   → 返回密钥列表 → 主任复制/截图分发 → 成员 key-verify 激活
```

**数据结构（复用设计 §3.1.5 `keys`）**
```json
{ "_id":"string","key":"string(8位)","role":"photo_director|video_director",
  "isUsed":false,"usedBy":"","usedAt":"","createdBy":"userId","createdAt":"timestamp" }
```
索引：`key(唯一)`、`isUsed`、`createdBy`。

**接口定义**
- `POST /generateKey`：`{ role, count(1-10) }` → `{ keys:[], role, createdAt }`。
- 权限：`checkPermission(user,'center_director')` 且 `roleLevel[user.role] >= roleLevel[role]`。

**异常与边界**
- 数量非 1–10 → `1003`。
- 并发生成导致 `key` 碰撞 → 生成时查重或唯一索引兜底，碰撞重试。
- 密钥学期结束失效 → 由学期切换脚本清理（M10 或独立脚本），本模块不处理过期扫描。

---

### M5 · 任务统计报表 + 导出

| 功能点 | 类型 | 说明 | 验收标准（AC） |
|--------|------|------|----------------|
| M5-1 聚合云函数 | 核心 | 新建 `getReport`：按 `assignedTo` 统计总次数、月/学期分布 | AC1：返回 `totalTasks` + `monthlyDistribution`/`semesterDistribution`；AC2：权限隔离（成员只看自己，主任看本部门，中心主任看全部） |
| M5-2 图表渲染 | 核心 | `statistics` 页用 wx-charts 渲染折线/饼图 | AC1：图表正确呈现分布；AC2：切换月/学期刷新 |
| M5-3 任务明细 | 核心 | 列表展示参与任务（标题/日期/地点/状态） | AC1：明细与聚合数一致；AC2：点明细可跳 `task-detail` |
| M5-4 纯文本导出 | 辅助 | `exportReport` 生成纯文本摘要，复制到剪切板 | AC1：摘要含姓名/部门/周期/总数/逐条；AC2：`wx.setClipboardData` 成功提示 |
| M5-5 时间范围选择 | 辅助 | 支持自定义起止日期 | AC1：范围过滤生效；AC2：非法范围给提示 |

**交互流程**
```
用户 → statistics 页 → 选 月/学期/自定义 → getReport → wx-charts 渲染 + 明细列表
   → 点「导出」→ exportReport → 纯文本 → 复制到剪切板
```

**数据结构**
- 入参：`{ userId, startDate, endDate, type:'month'|'semester' }`。
- 出参：`{ totalTasks, monthlyDistribution:[{month,count}], semesterDistribution:[{semester,count}], taskList:[{taskId,title,date,location,status}], charts:{lineChartData,pieChartData} }`。

**接口定义**
- `POST /getReport`、`POST /exportReport`（后者返回 `plainText`）。
- 权限：复用 `checkPermission`，按 `role` 决定查询范围。

**异常与边界**
- 无任务数据 → 返回空分布 + 友好空态，不报错。
- 查询范围跨学期 → 按学期聚合时正确归属。
- 大数据量（某成员 200+ 任务）→ 明细分页或限制返回条数（如 200）并提示。

---

### M6 · 新闻匹配爬虫

| 功能点 | 类型 | 说明 | 验收标准（AC） |
|--------|------|------|----------------|
| M6-1 缓存云函数 | 核心 | 新建 `getNewsCache`：查 `news_cache` 集合，24h 内复用 | AC1：命中缓存直接返回；AC2：缓存键 `(taskId,url)` 唯一 |
| M6-2 爬虫云函数 | 核心 | 新建 `crawlNews`：jieba 分词 + axios/cheerio 爬校官网 + 加权评分(标题60%+正文40%) | AC1：超阈值(>30)新闻进入列表；AC2：结果写 `news_cache` 缓存 30 天 |
| M6-3 新闻页 UI | 核心 | `news-match` 页罗列结果，点开 WebView | AC1：列表展示标题/日期/分数；AC2：点开 `web-view` 加载 url |
| M6-4 频率与礼貌 | 辅助 | 同任务 24h 内最多 1 次；请求间 `sleep(1000)` | AC1：频繁调用命中缓存而非重爬；AC2：不触发目标站封禁 |

**交互流程**
```
用户点「匹配新闻」→ crawlNews（先查 getNewsCache）
   → 有缓存返回 / 无缓存爬取→评分→过滤→缓存→返回
   → news-match 罗列 → 点开 web-view
```

**数据结构（复用设计 §3.1.7 `news_cache`）**
```json
{ "_id":"string","taskId":"string","taskTitle":"string",
  "newsList":[{"title","url","publishDate","matchScore"}],
  "cachedAt":"timestamp","expireAt":"timestamp" }
```
索引：`taskId+url(联合唯一)`、`publishDate`。

**接口定义**
- `POST /crawlNews`：`{ taskId, taskTitle, startTime, endTime }` → `{ matched, newsList:[] }`。
- `POST /getNewsCache`：`{ taskId }` → 缓存或空。

**异常与边界**
- 网络超时(10s) → `5001` 友好提示「网络繁忙，请稍后重试」。
- 页面结构变更解析失败 → `5002` 提示「暂无法匹配，请手动搜索」。
- 无匹配 → `matched:false`，不写缓存。
- 目标站反爬/限流 → 退避重试，失败走友好提示。

---

### M7 · 任务评价与反馈（P2）

| 功能点 | 类型 | 说明 | 验收标准（AC） |
|--------|------|------|----------------|
| M7-1 评价写入 | 核心 | 任务完成后成员/主任可打分(1–5)+文字；`tasks` 加 `rating`/`feedback` | AC1：提交后记录；AC2：仅完成后可评 |
| M7-2 评价查看 | 辅助 | 主任在统计/任务详情查看平均评分 | AC1：平均分正确；AC2：敏感反馈仅主任可见 |

**数据结构**：`tasks` 加 `ratings:[{ userId, score, comment, createdAt }]`、`avgScore`。
**接口**：`POST /rateTask`：`{ taskId, score, comment }`。
**边界**：重复提交 → 覆盖本人旧评；评论走内容安全 `msgSecCheck` 校验。

---

### M8 · 任务模板（P2）

| 功能点 | 类型 | 说明 | 验收标准（AC） |
|--------|------|------|----------------|
| M8-1 存为模板 | 核心 | 创建任务时「存为模板」；`tasks` 加 `isTemplate`/`templateName` | AC1：模板入库；AC2：不进正式任务列表 |
| M8-2 从模板创建 | 核心 | 创建页可选模板预填字段 | AC1：选模板后表单预填；AC2：生成的是新任务非模板副本 |

**数据结构**：`tasks` 加 `isTemplate:bool`、`templateName`。
**接口**：复用 `createTask`，加 `fromTemplateId`；新增 `getTemplates`。
**边界**：模板字段缺省（如时间）→ 创建时必填校验仍生效。

---

### M9 · 高级搜索 / 组合筛选（P2）

| 功能点 | 类型 | 说明 | 验收标准（AC） |
|--------|------|------|----------------|
| M9-1 多维筛选 | 核心 | `index` 支持 部门/类型/时间区间/状态/跨部 组合 | AC1：组合条件生效；AC2：结果为空有提示 |
| M9-2 排序 | 辅助 | 按时间/优先级排序 | AC1：切换排序正确 |
| M9-3 筛选持久化 | 辅助 | 记住上次筛选（本地缓存） | AC1：重进页恢复筛选 |

**接口**：改造 `getTasks` 接受 `filters` 对象；前端筛选状态本地缓存。
**边界**：非法时间区间 → 提示且不发请求。

---

### M10 · 三环境分离落地（P2 · 基础设施）

| 功能点 | 类型 | 说明 | 验收标准（AC） |
|--------|------|------|----------------|
| M10-1 env.js 实装 | 核心 | `config/env.js` 真实按 `envVersion`(develop/trial/release) 切 `cloudEnvId` | AC1：开发/体验/正式三环境各连对应云环境；AC2：`app.js` 用 `getEnv()` 初始化 |
| M10-2 部署脚本 | 辅助 | 提供脚本批量部署云函数到指定环境 | AC1：一条命令部署到 test/prod；AC2：不串环境 |
| M10-3 数据初始化清单 | 辅助 | 每个环境首次搭建执行（集合/索引/初始主任/密钥） | AC1：按清单可重建环境 |

**边界**：正式环境严禁跑 `initDatabase` 覆盖；测试开关 `enabled` 必须随环境，发布前全 `false`（见 `GIT_WORKFLOW.md` 红线）。

---

## 4. 功能优先级排序（总览）

| 优先级 | 模块 | 理由 |
|--------|------|------|
| **P0** | M1 通知系统 | 当前通知完全失效，用户无任何触达，阻塞日常使用感知 |
| **P0** | M2 定时提醒/自动完结 | 属 Phase1 MVP，缺则任务无人提前知晓、状态不自动流转 |
| **P0** | M3 值班可用性矩阵 | 值班表页已有 UI 但无数据，功能名存实亡 |
| **P1** | M4 生产密钥生成 | 新成员无法获得正式密钥激活，影响扩员 |
| **P1** | M5 统计报表+导出 | 主任期末复盘刚需 |
| **P1** | M6 新闻匹配 | 提升任务价值，但非流程阻塞 |
| **P2** | M7 评价反馈 | 运营优化 |
| **P2** | M8 任务模板 | 提效 |
| **P2** | M9 高级搜索 | 体验优化 |
| **P2** | M10 三环境分离 | 基础设施，建议与 P1 并行起步 |

---

## 5. 各阶段实现里程碑规划

### 里程碑 M0（基础收口，建议 1 周）— P0 触达闭环
- [ ] M1-1~M1-6：重写 `sendNotification` + 实现 `messages` 页 + 首页红点 + 已读（含 `getNotifications`/`markRead`）
- [ ] M2-1~M2-4：新建 `scheduleNotify` + 定时器 + 2h 提醒 + 自动完结
- [ ] M3-1~M3-2：录入 + 矩阵读取（M3-3/M3-4 可后置）
- **验收门禁**：通知可在消息中心看到并标记已读；到点任务收到提醒；值班日历有状态。

### 里程碑 M1（扩员与统计，建议 1–1.5 周）— P1
- [x] M4-1~M4-4：`generateKey` 云函数 + `key-generate` 页（2026-07-19）
- [x] M5-1~M5-5：`getReport`/`exportReport` + `statistics` 图表与导出（2026-07-19）
- [x] M6-1~M6-4：`getNewsCache`/`crawlNews` + `news-match` 页（2026-07-19）
- [x] M10 启动：env.js 实装 + 部署脚本（与 M1 并行，2026-07-19）
- **验收门禁**：主任能生成正式密钥并分发激活；能导出学期统计；任务可匹配新闻。

### 里程碑 M2（体验增强，建议 1 周）— P2
- [x] M7 评价反馈（2026-08-26：`rateTask` 云函数 + task-detail 星级评价 UI + getReport 均分聚合 + 12+2 测试）
- [x] M8 任务模板（2026-07-19：createTask 存模板/从模板实例化 + getTemplates + create-task 页）
- [x] M9 高级搜索（2026-08-26：getTasks 组合筛选 + index 页高级筛选面板 + 筛选持久化 + 6 测试）
- [x] M10-3 数据初始化清单补全（2026-08-26：docs/环境初始化清单.md 完整版——8 集合/17 索引/初始主任/密钥策略/测试工具/14 项开关核对表/测试 tab 处理/发布红线 checklist）
- **验收门禁**：任务可评价、可存模板、列表可多维筛选；三环境可独立部署。

---

## 6. 跨模块依赖与风险

- **M1 依赖 M2**：`reminder`/`task_completed` 通知由 `scheduleNotify` 产生，建议同里程碑交付。
- **M5/M6 依赖集合与索引**：需先在云环境建 `news_cache` 等集合与索引（见设计 §3.1）。
- **通知方向分歧须先拍板**：本 PRD 默认采用「小程序内通知」（与设计一致）。若坚持微信订阅消息，需先申请模板 ID 并改 `sendNotification` 为 `requestSubscribeMessage` 前端授权流程——但内部工具订阅消息授权成本高，不推荐。
- **测试开关红线**：所有涉及 `testConfig.js`/`config/test.js` 的改动，发布前务必 `enabled=false`。
- **云函数定时器限制**：`scheduleNotify` 仅在部署到云端环境后按节拍运行；本地调试用手动 `callFunction` 验证。

---

## 7. 验收总表（速查）

| 模块 | 关键 AC 数量 | 阻断级 |
|------|--------------|--------|
| M1 | 6 | 是（无触达） |
| M2 | 4 | 是（无提醒/自动流转） |
| M3 | 4 | 是（值班无数据） |
| M4 | 4 | 否 |
| M5 | 5 | 否 |
| M6 | 4 | 否 |
| M7 | 2 | 否 |
| M8 | 2 | 否 |
| M9 | 3 | 否 |
| M10 | 3 | 否（但影响安全） |

> 说明：每个功能点的逐条验收标准见第 3 节对应表格，开发与测试可直接引用。
