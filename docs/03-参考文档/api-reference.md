# API 参考 · 任务派发系统云函数

> 本文档汇总所有云函数接口的**真实代码状态**（读取 `miniprogram/cloudfunctions/*/index.js` 编写，非设计稿）。每个接口标注落地状态，未实现的功能明确标记并附设计规格。

## 阅读前须知

- **调用方式**：所有接口都是微信云函数，前端通过 `wx.cloud.callFunction({ name, data })` 调用。统一封装见 [`utils/api.js`](#前端调用约定-util-api-js)。
- **鉴权**：云函数从 `cloud.getWXContext().OPENID` 获取调用者身份，**不需要前端传 token**。角色权限在云函数内基于 `users.role` 校验。
- **响应格式统一**：见 [统一响应格式](#统一响应格式)。
- **错误码真实只有 4 个** `0/1/2/3`，**不是**架构设计文档 8.4 写的 5 位码（1001/2001…）。设计未落地，以代码为准。
- **环境**：dev/test/prod 当前全部指向同一个真实环境 `cloud1-d8gdddel1d4b1cea1`（见 `config/env.js`）。

---

## 统一响应格式

所有云函数返回形如：

```json
{
  "code": 0,
  "data": { },
  "message": "成功"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `code` | `number` | `0` 成功；`1` 参数错误；`2` 权限不足；`3` 数据不存在 |
| `data` | `any` | 成功时的业务数据；失败时通常为 `null` |
| `message` | `string` | 人类可读提示，可直接展示给用户 |

### 错误码表

| code | 含义 | 常见触发场景 | 前端建议处理 |
|------|------|--------------|--------------|
| `0` | 成功 | — | 读取 `data` |
| `1` | 参数错误 | 必填字段缺失、值非法 | 提示 `message`，检查入参 |
| `2` | 权限不足 | 非主任调用写接口、角色不够 | 提示无权限，检查登录/角色 |
| `3` | 数据不存在 | 查不到用户/任务/密钥 | 提示数据不存在 |

> ⚠️ **前端额外码**（非云函数返回）：
> - `-1`：`utils/api.js` 在网络失败（云函数调用抛异常）时返回，message 为 `网络请求失败，请检查网络连接`。
> - `-2`：未实现的桩函数（getReport/crawlNews/getNewsCache/exportReport）直接返回，message 为「功能开发中」。

> 📌 **已知偏差**：`app.js` 里定义了一份 5 位错误码映射（1001/2001…），但云函数实际返回 `0/1/2/3`。前端这份映射目前**不会命中**，属设计-实现不一致，待后续统一。

### 角色等级（权限判断基准）

所有需要权限的接口都用同一张表：

| role 值 | 中文 | 等级 |
|---------|------|------|
| `member` | 普通成员 | 1 |
| `photo_director` | 摄影部主任 | 2 |
| `video_director` | 视频部主任 | 2 |
| `center_director` | 视觉中心主任 | 3 |

等级 ≥ 2 视为「主任」，可创建/编辑任务、管理机位。等级 ≥ 3（中心主任）可跨部门查看全部数据。

---

## 已实现云函数（10 个）

### 1. `login` ✅

处理微信授权登录与新用户注册，自动写入 `users` 集合。

**请求参数**（`event`）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `action` | `string` | 否 | 不传或任意非 `register` 值 → 登录；传 `register` → 注册（选部门） |
| `department` | `string` | 注册时必填 | 仅允许 `photography` 或 `video` |
| `userId` | `string` | 注册时必填 | 登录时返回的 `user._id` |
| `nickName` | `string` | 否 | 用户昵称，用于更新 |
| `avatarUrl` | `string` | 否 | 头像 URL，用于更新 |

**逻辑**：
- 登录：按 `OPENID` 查 `users`。存在则更新昵称/头像返回 `isNew:false`；不存在则创建默认用户（role=`member`，semester=当前学期）返回 `isNew:true`。
- 注册：补填 `department`，更新 `users` 文档。

**响应示例（新用户）**

```json
{
  "code": 0,
  "data": {
    "user": {
      "_id": "user_abc123",
      "openid": "oXXX...",
      "name": "新同学",
      "avatar": "",
      "department": "",
      "role": "member",
      "semester": "2026-spring",
      "createdAt": "2026-07-16 15:34:25",
      "updatedAt": "2026-07-16 15:34:25"
    },
    "isNew": true
  },
  "message": "成功"
}
```

**错误**：`1` 注册缺 `department`/`userId` 或部门非法。

---

### 2. `verifyKey` ✅

验证一次性权限密钥，升级当前用户角色。一密钥一用户，使用后标记 `isUsed`。

**请求参数**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `key` | `string` | 是 | 密钥字符串（去空格后匹配 `keys` 集合） |

**逻辑**：
1. 查 `keys` 集合，密钥不存在 → `3`；已使用 → `1`（该密钥已被使用）。
2. 查当前 `users`，不存在 → `3`（请先登录）。
3. 若当前角色等级 ≥ 密钥角色等级 → `1`（角色已大于或等于）。
4. 标记密钥 `isUsed/usedBy/usedAt`，更新用户 `role`。

**响应示例**

```json
{
  "code": 0,
  "data": { "role": "photo_director", "previousRole": "member" },
  "message": "角色升级成功"
}
```

**错误**：`1`（空密钥 / 已使用 / 角色冲突）、`3`（密钥或用户不存在）。

> 📌 生成密钥的云函数 `generateKey` 尚未实现（见 [未实现清单](#未实现云函数-6-个)），当前 `keys` 集合需手动写入或由 `generateKey` 落地后补。

---

### 3. `createTask` ✅

主任创建任务，创建后异步给指派成员发通知。

**请求参数**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `title` | `string` | 是 | 任务标题 |
| `type` | `string` | 是 | 任务类型 |
| `startTime` | `string` | 是 | 开始时间（可被 `new Date()` 解析的字符串） |
| `assignedTo` | `string[]` | 是 | 指派成员的用户 `_id` 数组，非空 |
| `endTime` | `string` | 否 | 结束时间 |
| `location` | `string` | 否 | 地点文本 |
| `contact` | `string` | 否 | 联系方式 |
| `description` | `string` | 否 | 描述 |
| `deliverables` | `string` | 否 | 交付要求 |
| `priority` | `string` | 否 | 优先级，默认 `normal` |
| `isCrossDepartment` | `boolean` | 否 | 是否跨部门，默认 `false` |
| `locationId` | `string` | 否 | 关联机位 `_id` |

**权限**：调用者等级 < 2 → `2`（仅主任及以上可创建任务）。

**写入字段**：`status` 默认 `pending`，`creatorId`=当前用户，`semester`=当前学期，自动加 `createdAt/updatedAt`。

**响应示例**

```json
{
  "code": 0,
  "data": {
    "taskId": "task_xyz789",
    "task": {
      "title": "迎新晚会拍摄",
      "type": "photography",
      "status": "pending",
      "assignedTo": ["user_abc123"],
      "semester": "2026-spring",
      "_id": "task_xyz789"
    }
  },
  "message": "任务创建成功"
}
```

**错误**：`1`（缺必填）、`2`（权限不足）。

---

### 4. `updateTask` ✅

更新任务。主任可改任意字段；成员仅可改 `status`（且须是被指派人）。

**请求参数**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `taskId` | `string` | 是 | 任务 `_id` |
| `updates` | `object` | 是 | 要更新的字段集合 |

**可更新字段白名单**：`title, type, startTime, endTime, location, contact, description, deliverables, assignedTo, priority, status, isCrossDepartment, locationId`。

**成员状态流转**（非主任只能走这些）：
- `pending` → `confirmed`（确认接受）
- `confirmed` → `in_progress`（开始任务）
- `in_progress` → `completed`（完成任务）
- `completed` → `pending`（申请调整）

**权限**：
- 主任 / 创建人 / 被指派人改状态 → 允许。
- 非主任传了非 `status` 字段 → `2`（仅主任可编辑任务详情）。
- 任务不存在 → `3`。

**响应示例**

```json
{
  "code": 0,
  "data": { "taskId": "task_xyz789", "updated": { "status": "confirmed", "updatedAt": "2026-07-16 15:40:00" } },
  "message": "任务更新成功"
}
```

**错误**：`1`（缺参数）、`2`（权限不足）、`3`（任务不存在）。

> 📌 状态置为 `cancelled` 时，会异步调用 `sendNotification` 通知被指派人（依赖订阅消息模板，见其说明）。

---

### 5. `getTasks` ✅

获取任务列表或单个详情。按角色自动收窄范围，支持筛选、分页、搜索。

**请求参数**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `taskId` | `string` | 否 | 传则走详情模式 |
| `status` | `string` | 否 | 状态筛选；不传默认排除 `cancelled` |
| `myTasks` | `boolean` | 否 | `true` 只看指派给自己的 |
| `keyword` | `string` | 否 | 标题模糊搜索（正则，`i` 忽略大小写） |
| `page` | `number` | 否 | 页码，默认 1 |
| `pageSize` | `number` | 否 | 每页数量，默认 20，最大 50 |
| `includeMembers` | `boolean` | 否 | 详情模式专用：附带成员信息与状态 |

**范围逻辑**：
- 普通成员 / `myTasks` → 只看 `assignedTo` 含自己的。
- 部门主任 → 看自己创建的 + 跨部门任务。
- 中心主任 → 全部。

**响应示例（列表）**

```json
{
  "code": 0,
  "data": {
    "tasks": [
      {
        "_id": "task_xyz789",
        "title": "迎新晚会拍摄",
        "status": "pending",
        "startTime": "2026-09-01 19:00",
        "endTime": "",
        "assignedTo": ["user_abc123"]
      }
    ],
    "total": 1,
    "stats": { "pending": 1, "confirmed": 0, "inProgress": 0, "completed": 0, "total": 1 },
    "page": 1,
    "pageSize": 20
  },
  "message": "成功"
}
```

**错误**：`2`（未登录）、`3`（详情模式下任务不存在）。

---

### 6. `updateUserStatus` ✅

成员设置自己的可用状态，或设置每周固定空闲时段。

**请求参数**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `status` | `string` | 否* | `available` / `busy` / `unavailable`；与 `weeklySchedule` 二选一 |
| `reason` | `string` | 否 | 状态原因 |
| `images` | `string[]` | 否 | 佐证图片 |
| `startDate` | `string` | 否 | 状态生效起 |
| `endDate` | `string` | 否 | 状态生效止 |
| `weeklySchedule` | `array` | 否* | 每周固定空闲时段；传入则只更新 `users.weeklySchedule` 并返回 |

> *`status` 与 `weeklySchedule` 至少传一个；传 `weeklySchedule` 时优先处理并提前返回。

**逻辑**：传 `weeklySchedule` → 直接写 `users.weeklySchedule` 字段返回「固定时间段已更新」。否则校验 `status` 合法 → 60 秒内同状态不重复写 → 写 `user_status` 集合。

**响应示例**

```json
{ "code": 0, "data": { "status": { "status": "available", "reason": "", "createdAt": "2026-07-16 15:45:00" } }, "message": "状态更新成功" }
```

**错误**：`3`（用户不存在）、`1`（缺状态 / 状态值非法 / 周时段非数组）。

> 📌 值班固定时段存在 `users.weeklySchedule` 字段，**不存在独立 `duty_schedule` 集合**（与设计文档不符）。

---

### 7. `getDutySchedule` ✅

返回部门成员及其最新状态；支持只看自己、按年月、只看可用。

**请求参数**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `selfOnly` | `boolean` | 否 | `true` → 只返回自己的状态历史 |
| `department` | `string` | 否 | 目标部门（主任强行指定无效，受角色限制） |
| `year` | `number` | 否 | 配合 `month` 筛选状态时间范围 |
| `month` | `number` | 否 | 月份（1-12） |
| `onlyAvailable` | `boolean` | 否 | `true` → 只返回 `available` 成员 |

**范围逻辑**：主任/中心主任可看本部门或全局；普通成员仅本部门。

**响应示例**

```json
{
  "code": 0,
  "data": {
    "members": [
      { "_id": "user_abc123", "name": "张三", "department": "photography", "role": "member", "weeklySchedule": [], "status": "available", "reason": "" }
    ],
    "availability": {},
    "summary": { "available": 1, "busy": 0, "unavailable": 0, "total": 1 }
  },
  "message": "成功"
}
```

**错误**：`3`（用户不存在）。

---

### 8. `createLocation` ✅

机位（拍摄点位）的增/改/删。主任专用。

**请求参数**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `action` | `string` | 否 | `delete` / `update` / 不传=创建 |
| `locationId` | `string` | 删/改必填 | 机位 `_id` |
| `name` | `string` | 创建必填 | 机位名称 |
| `description` | `string` | 否 | 描述 |
| `notes` | `string` | 否 | 备注 |
| `images` | `string[]` | 否 | 图片 |
| `tags` | `string[]` | 否 | 标签 |
| `updates` | `object` | 改时必填 | 更新字段集合 |

**权限**：`action` 为 `delete`/`update`/创建时，等级 < 2 → `2`。

**响应示例（创建）**

```json
{ "code": 0, "data": { "_id": "loc_001", "name": "图书馆机位", "tags": ["室内"] }, "message": "机位创建成功" }
```

**错误**：`1`（缺名称/ID）、`2`（权限不足）。

---

### 9. `getLocations` ✅

获取机位列表或详情。所有登录用户可调用。

**请求参数**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `locationId` | `string` | 否 | 传则返回单个详情 |
| `tag` | `string` | 否 | 按标签筛选 |

**响应示例**

```json
{ "code": 0, "data": { "locations": [ { "_id": "loc_001", "name": "图书馆机位", "tags": ["室内"] } ] }, "message": "成功" }
```

**错误**：`1`（查询异常）。单条不存在时返回 `{ locations: [] }`（非错误）。

---

### 10. `sendNotification` 🟡 部分实现

使用**微信订阅消息**推送任务相关通知。被 `createTask`/`updateTask` 内部异步调用，也可由前端直接调用。

**请求参数**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | `string` | 是 | `task_assigned` / `task_reminder` / `task_cancelled` |
| `taskId` | `string` | 是 | 关联任务 `_id`（用于跳转页） |
| `userIds` | `string[]` | 是 | 接收人 `_id` 数组，非空 |
| `taskInfo` | `object` | 否 | `{ title, startTime, location }` 用于拼消息 |

**逻辑**：查 `userIds` → openid 列表 → 逐个 `cloud.openapi.subscribeMessage.send`。

**响应示例**

```json
{ "code": 0, "data": { "sent": 3, "total": 3 }, "message": "已发送 3/3 条通知" }
```

**错误**：`1`（缺必填 / 未知类型）。

> ⚠️ **关键缺口（务必知晓）**：
> 1. **模板 ID 是占位符**：`TEMPLATE_IDS` 三个值均为 `your-template-id-*`（`TODO`），上线前必须在 [微信公众平台 → 订阅消息](https://mp.weixin.qq.com) 申请真实模板并替换，否则发送会失败（捕获异常、计为未发送）。
> 2. **不写入 `notifications` 集合**：本函数只发订阅消息，**没有**给应用内通知中心写数据。而 `app.js` 的红点逻辑依赖读 `notifications` 集合 —— 目前消息中心无数据来源，属设计（小程序内通知）与实现（仅订阅消息）的落差。
> 3. **订阅消息需用户先授权**：未授权用户收不到，代码已静默跳过。

---

## 未实现云函数（6 个）

以下在 `utils/api.js` 有桩（返回 `code:-2`「功能开发中」），但后端云函数**不存在**。设计规格来自 PRD v1.1 / 架构设计 v1.1。

| 函数名 | 设计用途 | 设计规格摘要 | 前端桩返回值 |
|--------|----------|--------------|--------------|
| `generateKey` | 主任生成一次性权限密钥 | 入参目标 `role`；写 `keys` 集合（`key`/`role`/`isUsed:false`），返回密钥串 | `统计密钥功能开发中` |
| `scheduleNotify` | 任务开始前 2 小时定时提醒 | 依赖定时触发器（云函数定时器）；调用 `sendNotification` 发 `task_reminder` | 无独立桩（由提醒流程触发） |
| `getReport` | 统计报表（稿分/任务量） | 按学期/部门聚合任务状态与交付，输出报表数据 | `统计报表功能开发中` |
| `crawlNews` | 爬取校内新闻网 | axios + cheerio 爬取，jieba 分词加权匹配任务关键词 | `新闻爬取功能开发中` |
| `getNewsCache` | 读取新闻缓存并匹配任务 | 按 `taskId` 返回已匹配新闻列表 | `新闻缓存功能开发中` |
| `exportReport` | 导出报表（Excel/CSV） | 生成下载文件存入云存储并返回 URL | `报表导出功能开发中` |

> 前端已在 `utils/api.js` 导出 `getReport / crawlNews / getNewsCache / exportReport`，但调用会直接返回开发中的占位，不会真正请求云函数。补完后取消注释对应 `callCloudFunction` 即可。

---

## 前端调用约定（`utils/api.js`）

所有页面统一 `require('../../utils/api.js')` 调用，不要直接 `wx.cloud.callFunction`。封装做了两件事：
1. 统一 `wx.cloud.callFunction({ name, data })` 调用。
2. 网络失败时返回 `{ code: -1, data: null, message: '网络请求失败，请检查网络连接' }`，避免上层崩溃。

**可用方法**

| 方法 | 对应云函数 | 说明 |
|------|------------|------|
| `login()` | `login` | 无参 |
| `verifyKey(key)` | `verifyKey` | 传密钥串 |
| `createTask(taskData)` | `createTask` | 传整个任务对象 |
| `updateTask(taskId, updates)` | `updateTask` | 拆成 `{ taskId, updates }` |
| `getTasks(params)` | `getTasks` | 传查询对象 |
| `updateUserStatus(statusData)` | `updateUserStatus` | 传状态对象 |
| `getDutySchedule(params)` | `getDutySchedule` | 传查询对象 |
| `createLocation(locationData)` | `createLocation` | 传机位对象 |
| `getLocations(params)` | `getLocations` | 传查询对象 |
| `sendNotification(notificationData)` | `sendNotification` | 传通知对象 |
| `getReport / crawlNews / getNewsCache / exportReport` | — | ⚠️ 桩，返回 `code:-2` |

**调用示例**

```javascript
const api = require('../../utils/api.js');

// 创建任务
const res = await api.createTask({
  title: '迎新晚会拍摄',
  type: 'photography',
  startTime: '2026-09-01 19:00',
  assignedTo: ['user_abc123']
});

if (res.code === 0) {
  console.log('创建成功', res.data.taskId);
} else {
  wx.showToast({ title: res.message, icon: 'none' });
}
```

---

## 涉及的数据库集合

| 集合 | 主要字段 | 写入方 |
|------|----------|--------|
| `users` | `openid, name, avatar, department, role, semester, weeklySchedule, createdAt, updatedAt` | `login`, `verifyKey`, `updateUserStatus` |
| `tasks` | `title, type, startTime, endTime, location, assignedTo[], creatorId, status, priority, locationId, isCrossDepartment, semester, createdAt, updatedAt` | `createTask`, `updateTask` |
| `user_status` | `userId, status, reason, images[], startDate, endDate, createdAt` | `updateUserStatus` |
| `locations` | `name, description, notes, images[], tags[], createdBy, createdAt, updatedAt` | `createLocation` |
| `keys` | `key, role, isUsed, usedBy, usedAt` | `generateKey`（⚠️ 未实现） |

> 📌 没有 `duty_schedule` 集合；值班固定时段在 `users.weeklySchedule` 字段。

---

*文档建立于 2026-07-16，基准为代码真实状态（混合标注设计目标）。如发现与代码不符，以代码为准并在 PR 中同步修正。*
