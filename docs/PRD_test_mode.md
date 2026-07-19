# PRD：测试模式与生产模式隔离

> **文档版本**: v1.0  
> **更新日期**: 2026-07-18  
> **关联文档**: docs/PRD_v1.1.md、docs/system_design_v1.1.md、overview.md  
> **适用范围**: 任务派发系统微信小程序（原生 + 云开发）

---

## 1. 背景与目标

### 1.1 背景

当前系统登录后默认赋予用户 `role: 'member'`（普通成员），主任/管理角色（摄影部主任、视频部主任、视觉中心主任）必须通过微信小程序内一次性密钥升级获得。现有问题：

- **测试困难**：开发/测试阶段无法便捷地切换为高权限角色，导致管理功能（任务创建、人员审批、报表查看）难以验证。
- **密钥体系不完善**：密钥生成逻辑缺失，测试密钥与正式密钥无区分，密钥长期有效且无有效期，存在误操作与泄露风险。
- **测试/生产未隔离**：临时调试入口若未受控，可能在正式版被用户看到或误触发。

### 1.2 目标

1. **实现测试模式与生产模式隔离**：测试相关功能仅在明确开启测试模式后可用，且默认关闭。
2. **调试角色管理**：在测试模式下提供「调试角色登录」入口，允许开发者快速切换为不同管理角色。
3. **测试密钥管理**：在测试模式下支持生成、验证可复用的测试密钥，且不影响正式密钥的一次性使用规则。
4. **开发时支持开关切换**：通过配置文件、环境变量、运行时参数三种方式启用/禁用测试模式，便于多人协作与 CI/CD。

---

## 2. 术语定义

| 术语 | 定义 |
|---|---|
| **测试模式（Test Mode）** | 一套受控开关，开启后启用调试角色登录、测试密钥复用等开发/测试功能。 |
| **生产模式（Production Mode）** | 测试模式关闭时的默认运行状态，仅暴露正常业务功能。 |
| **Feature Flag** | 通过配置动态控制功能是否生效的机制，无需重新部署代码。 |
| **调试角色（Debug Role）** | 在测试模式下临时切换的 `role`（`photo_director` / `video_director` / `center_director`），仅存在于本地存储，不持久化到数据库。 |
| **正式密钥（Prod Key）** | 用于生产环境角色升级的一次性密钥，使用后标记 `isUsed: true`。 |
| **测试密钥（Test Key）** | 仅在测试模式下生成与使用的密钥，带有 `testKey: true` 标记，可复用、不消耗。 |
| **角色等级（Role Level）** | `member=1` / `photo_director=2` / `video_director=2` / `center_director=3`。 |

---

## 3. 范围

### 3.1 包含范围

- 全局测试模式开关（主开关 + 子功能开关）
- 调试角色登录入口（C 功能）
- 测试密钥生成与验证（A 功能）
- 测试模式状态可观测与日志记录
- 生产环境自动禁用测试模式的安全兜底

### 3.2 不包含范围

- 修改现有正式密钥的一次性使用规则
- 修改 `login` 云函数默认返回 `member` 的逻辑
- 修改 `verifyKey` 对正式密钥的角色层级校验逻辑
- 线上生产环境的持续 A/B 测试或灰度发布（本次仅用于开发/测试）

---

## 4. 功能需求（FR）

### 4.1 全局测试模式开关

#### FR-01 默认关闭
测试模式主开关 `TEST_MODE` 默认值为 `false`，所有子功能默认关闭。仅在显式开启时激活。

#### FR-02 配置文件支持
通过 `miniprogram/config/test.js` 配置开关：

```js
module.exports = {
  enabled: false,
  features: {
    debugLogin: false,      // 调试角色登录
    testKeyMultiUse: false  // 测试密钥复用
  },
  allowRuntimeOverride: true
};
```

#### FR-03 运行时参数支持
支持通过启动参数启用：

- 开发者工具「自定义编译模式」添加启动参数 `?debug=1`；
- 登录页连续点击版本号 5 次，作为手势开关（仅在开发版/体验版有效）。

#### FR-04 环境变量支持
云函数侧通过 `project.private.config.json` 或部署环境变量 `ENV = 'develop' | 'trial' | 'release'` 控制测试模式。云函数中测试模式相关分支必须校验环境变量，正式版（`release`）强制关闭。

#### FR-05 状态可观测
提供统一工具函数：

```js
const testMode = require('utils/testMode.js');
testMode.isEnabled();          // 是否开启测试模式
testMode.isFeatureOn('debugLogin'); // 子功能是否开启
testMode.getStatus();          // 完整状态对象
```

- `app.js` 启动时打印当前测试模式状态；
- 登录页/「我的」页面顶部显示测试模式标识（Badge）。

#### FR-06 生产环境自动禁用
基于 `wx.getAccountInfoSync().miniProgram.envVersion` 判断：

- `release`（正式版）：无论配置如何，测试模式强制关闭；
- `develop` / `trial`：按配置与运行时参数判断是否开启。

### 4.2 调试角色登录（C 功能）

#### FR-07 入口可见性控制
「调试角色登录」按钮/入口仅在 `testMode.isFeatureOn('debugLogin')` 为 `true` 时渲染。使用 `wx:if` 条件渲染，不开启时 UI 上不可见、不可触发。

#### FR-08 角色选择
入口提供角色选择器（Picker），可选角色：

- `photo_director`：摄影部主任
- `video_director`：视频部主任
- `center_director`：视觉中心主任

#### FR-09 本地状态切换
选择角色后，仅更新本地状态：

```js
userInfo.role = selectedRole;
storage.saveUserInfo(userInfo);      // 写入本地 storage
getApp().globalData.userInfo = userInfo;
wx.switchTab({ url: '/pages/index/index' });
```

不调用云函数，不写入数据库，避免污染生产数据。

#### FR-10 重启后失效
调试角色只影响当前会话的本地状态。用户清除缓存、重新登录或小程序重启后，角色恢复为 `member`。

### 4.3 测试密钥管理（A 功能）

#### FR-11 测试密钥生成
新增云函数 `generateTestKey`，接收参数 `{ role, department }`：

- 仅在 `TEST_MODE` 开启时允许调用；
- 生成格式：`DEV-{role}-{timestamp}-{random}`，例如 `DEV-photo_director-20260718-8a3f`；
- 在 `keys` 集合插入文档：

```json
{
  "key": "DEV-photo_director-20260718-8a3f",
  "role": "photo_director",
  "department": "photography",
  "testKey": true,
  "isUsed": false,
  "createdAt": "2026-07-18T..."
}
```

#### FR-12 测试密钥复用
测试密钥验证时，**不更新 `isUsed` 字段**，可无限次使用。测试结束后由管理员手动清理或设置定时清理。

#### FR-13 测试密钥标记
所有测试密钥必须包含 `testKey: true` 标记。`verifyKey` 云函数根据该标记区分测试密钥与正式密钥。

#### FR-14 正式密钥规则不变
正式密钥（`testKey !== true`）仍保持一次性使用：`isUsed` 检查、标记已使用、更新用户 role 到数据库。

#### FR-15 角色层级校验不变
无论测试密钥还是正式密钥，角色层级校验保持统一：当前用户等级必须小于密钥目标等级，禁止降级或平级使用。

### 4.4 安全与隔离

#### FR-16 后端保护
所有测试模式相关云函数（如 `generateTestKey`、`verifyKey` 的测试分支）必须后端校验 `TEST_MODE` 状态，不能仅依赖前端开关。前端开关仅用于 UI 显隐，后端开关才是权限控制。

#### FR-17 正式版禁用兜底
即使前端配置误开启，只要运行环境为 `release`，测试模式相关代码分支必须强制返回失败。

#### FR-18 调试日志
测试模式开启时，所有测试操作（角色切换、测试密钥生成/验证）打印日志，便于排查：

```
[TEST_MODE] debugLogin enabled, role switched to photo_director
[TEST_MODE] testKey generated: DEV-xxx
[TEST_MODE] testKey verified: DEV-xxx for role photo_director
```

---

## 5. 非功能需求（NFR）

### NFR-01 安全性
- 测试模式默认关闭，正式版强制关闭；
- 测试密钥与正式密钥通过 `testKey` 字段严格区分；
- 测试密钥不应用于生产环境角色升级；
- 调试角色登录不写入数据库，避免污染生产数据。

### NFR-02 可观测性
- 启动时打印测试模式状态；
- 测试操作可追踪日志；
- 页面上显示测试模式标识，防止用户混淆。

### NFR-03 可维护性
- 采用 Feature Flag 模式，新增子功能只需在 `config/test.js` 增加开关；
- 代码分支清晰：`if (testMode.isFeatureOn('xxx'))` 便于后续清理；
- 测试模式相关代码统一使用 `TEST_` 前缀或 `testMode` 工具模块。

### NFR-04 性能
- 测试模式状态读取走本地配置/缓存，不增加启动时远程请求；
- 云函数测试分支增加一次数据库查询（`testKey` 判断），对正式密钥流程无影响。

---

## 6. 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                        小程序前端                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ config/test.js│  │ utils/testMode│  │ pages/login/login│  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│         │                  │                    │            │
│         └──────────────────┴────────────────────┘            │
│                              │                               │
│                              ▼                               │
│  wx.getAccountInfoSync()  envVersion  ===  'release' ? 关闭   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      微信云开发（CloudBase）                   │
│  ┌─────────────────────┐  ┌─────────────────────────────┐   │
│  │ cloudfunctions/login │  │ cloudfunctions/verifyKey      │   │
│  └─────────────────────┘  └─────────────────────────────┘   │
│                              │                              │
│                              ▼                              │
│  ┌─────────────────────┐  ┌─────────────────────────────┐   │
│  │ cloudfunctions/      │  │ 数据库                        │   │
│  │ generateTestKey     │  │  - keys (testKey 标记)        │   │
│  └─────────────────────┘  │  - users                      │   │
│                           └─────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. 数据模型

### 7.1 `keys` 集合（扩展）

| 字段 | 类型 | 正式密钥 | 测试密钥 | 说明 |
|---|---|---|---|---|
| `key` | string | 必填 | 必填 | 密钥字符串，测试密钥建议 `DEV-` 前缀 |
| `role` | string | 必填 | 必填 | 目标角色 |
| `department` | string | 可选 | 可选 | 目标部门 |
| `testKey` | boolean | false | **true** | 测试密钥标记 |
| `isUsed` | boolean | 使用后 true | 始终 false | 测试密钥不消耗 |
| `usedBy` | string | 使用后 | 空 | 测试密钥不使用 |
| `usedAt` | Date | 使用后 | 空 | 测试密钥不使用 |
| `createdAt` | Date | 可选 | 必填 | 生成时间 |
| `createdBy` | string | 可选 | 必填 | 生成者 openid |

### 7.2 `users` 集合（不变）

调试角色登录不修改 `users.role`，仅修改本地缓存。测试密钥/正式密钥验证仍按原规则修改 `users.role`。

### 7.3 配置（新增）

`miniprogram/config/test.js`：

```js
module.exports = {
  enabled: false,
  features: {
    debugLogin: false,
    testKeyMultiUse: false
  },
  allowRuntimeOverride: true
};
```

`cloudfunctions/verifyKey/config/test.js`：

```js
module.exports = {
  enabled: false, // 云函数侧独立开关，默认关闭
  allowTestKey: false
};
```

---

## 8. 接口设计

### 8.1 前端工具模块 `utils/testMode.js`

```js
function isEnabled() { ... }
function isFeatureOn(name) { ... }
function getStatus() { ... }
module.exports = { isEnabled, isFeatureOn, getStatus };
```

### 8.2 API 层 `utils/api.js`（新增）

```js
// 生成测试密钥
async function generateTestKey(role, department) {
  return callCloudFunction('generateTestKey', { role, department });
}

// 验证密钥（保持现有）
async function verifyKey(key) { ... }
```

### 8.3 云函数 `generateTestKey`

**请求参数**：

```json
{
  "role": "photo_director",
  "department": "photography"
}
```

**响应**：

```json
{
  "code": 0,
  "data": { "key": "DEV-photo_director-20260718-8a3f" },
  "message": "测试密钥生成成功"
}
```

**权限校验**：

- 云函数端 `TEST_MODE` 必须为 `true`；
- 当前环境不能为 `release`；
- 调用者必须已登录（有云函数 openid）。

### 8.4 云函数 `verifyKey`（修改）

在现有逻辑中增加测试密钥分支：

```js
if (keyRecord.testKey) {
  // 测试模式云函数开关校验
  if (!TEST_MODE) return { code: -1, message: '测试密钥仅在测试模式下可用' };
  // 仅更新用户 role，不标记 isUsed
  await db.collection('users').doc(user._id).update({ data: { role: keyRecord.role } });
} else {
  // 正式密钥原逻辑：标记 isUsed + 更新 role
}
```

---

## 9. 流程图

### 9.1 调试角色登录流程（C 功能）

```
开始
  │
  ▼
登录页 onLoad
  │
  ▼
读取 testMode.isFeatureOn('debugLogin')
  │
  ├── false ──► 正常微信登录流程
  │
  └── true
        │
        ▼
  显示「测试登录」按钮
        │
        ▼
  用户选择角色（Picker）
        │
        ▼
  更新本地 storage.userInfo.role
        │
        ▼
  更新 app.globalData.userInfo
        │
        ▼
  switchTab 到 index
        │
        ▼
  结束（不写入数据库）
```

### 9.2 测试密钥验证流程（A 功能）

```
开始
  │
  ▼
用户输入密钥
  │
  ▼
调用 verifyKey 云函数
  │
  ▼
查询 keys 集合
  │
  ▼
key 是否存在？
  │
  ├── 否 ──► 返回「密钥不存在」
  │
  └── 是
        │
        ▼
  testKey === true ?
  │
  ├── 否 ──► 正式密钥流程：检查 isUsed → 标记已使用 → 更新 users.role
  │
  └── 是
        │
        ▼
  云函数侧 TEST_MODE 是否开启？
  │
  ├── 否 ──► 返回「测试密钥仅在测试模式下可用」
  │
  └── 是
        │
        ▼
  检查角色层级（currentLevel < keyLevel）
  │
  ├── 否 ──► 返回「权限不足」
  │
  └── 是
        │
        ▼
  更新 users.role（不标记 isUsed）
  │
  ▼
  结束（密钥可再次使用）
```

---

## 10. UI/UX 设计

### 10.1 登录页

- 测试模式开启时，在「微信登录」按钮下方或页面右上角显示「测试登录」入口；
- 使用 Picker 选择角色；
- 页面顶部显示红色/橙色测试模式标识条：「测试模式已开启 - 当前角色：member」。

### 10.2 我的页面

- 测试模式开启时，用户昵称旁显示「TEST」徽章；
- 点击徽章可查看当前测试模式状态（开关、子功能、envVersion）。

### 10.3 密钥验证页

- 测试密钥验证成功后，提示「测试密钥验证成功（可复用）」，区别于正式密钥的「角色升级成功」。

---

## 11. 测试计划

| 用例 | 前置条件 | 操作 | 期望结果 |
|---|---|---|---|
| TC-01 | 配置 `enabled: false` | 打开登录页 | 不显示「测试登录」入口 |
| TC-02 | `envVersion === 'release'` | 配置 `enabled: true` | 测试模式仍关闭，不显示入口 |
| TC-03 | 开发版，`debugLogin: true` | 选择 photo_director 测试登录 | 本地 role 切换，跳转 index |
| TC-04 | 重启小程序 | 无 | 角色恢复为 member |
| TC-05 | `testKeyMultiUse: false` | 使用测试密钥 | 返回「测试功能未开启」 |
| TC-06 | `testKeyMultiUse: true` | 使用同一测试密钥两次 | 两次均成功，isUsed 仍为 false |
| TC-07 | 使用正式密钥 | 正常流程 | 一次性使用，isUsed 变为 true |
| TC-08 | 高角色使用低等级密钥 | 当前为 center_director | 返回「权限不足」 |
| TC-09 | 云函数 `TEST_MODE: false` | 前端调用 `generateTestKey` | 云函数返回拒绝 |

---

## 12. 风险与回滚

| 风险 | 影响 | 缓解措施 |
|---|---|---|
| 测试模式误开启并提交到仓库 | 正式版可能暴露调试入口 | 配置默认 `enabled: false`；CI 增加检查脚本；代码审查关注 `config/test.js` |
| 测试密钥泄露 | 未授权者可能升级角色 | 测试密钥仅测试模式可用；建议加 `expiresAt` 字段并定期清理；测试密钥使用 `DEV-` 前缀便于审计 |
| 调试角色污染数据库 | 管理操作被记录到生产数据 | 调试角色登录不写入数据库；仅本地模拟 |
| 测试分支影响正式密钥性能 | 每次 verifyKey 多一次 `testKey` 判断 | 查询时 `where({ key })` 已返回完整文档，不增加额外查询 |
| 多开发者共用一个测试密钥 | 角色切换互相覆盖 | 每个开发者生成自己的测试密钥，或调试角色登录直接切换 |

**回滚方案**：

- 立即将 `config/test.js` 的 `enabled` 设为 `false`；
- 在 CloudBase 控制台删除或禁用所有 `testKey: true` 的密钥；
- 重新上传/部署云函数，确保后端开关关闭。

---

## 13. 实施计划

| 阶段 | 任务 | 负责人 | 产出 |
|---|---|---|---|
| 1 | 创建 `config/test.js` 与 `utils/testMode.js` | 前端 | 开关模块 |
| 2 | 修改 `app.js` 打印状态，集成环境版本判断 | 前端 | 启动日志 |
| 3 | 修改 `pages/login/login` 增加调试角色入口 | 前端 | 登录页更新 |
| 4 | 修改 `cloudfunctions/verifyKey` 测试密钥分支 | 后端 | 云函数更新 |
| 5 | 创建 `cloudfunctions/generateTestKey` | 后端 | 新云函数 |
| 6 | 更新 `utils/api.js` 暴露生成接口 | 前端 | API 封装 |
| 7 | 编写测试用例 TC-01 ~ TC-09 | 测试 | 测试报告 |
| 8 | 文档与代码审查 | 团队 | PRD、MR |

---

## 14. 附录

### 14.1 主流做法参考

- **微信小程序环境识别**：使用 `wx.getAccountInfoSync().miniProgram.envVersion` 区分 `develop` / `trial` / `release`，正式版自动禁用测试配置。
- **Feature Flag 模式**：将功能部署与发布分离，通过配置动态控制功能开启；支持灰度、回滚、测试开关。
- **测试开关三要素**：默认关闭、后端保护、状态可观测。
- **密钥管理最佳实践**：正式密钥一次性使用；测试密钥明确标记、可复用、有生命周期管理；避免明文存储敏感信息，传输层使用 HTTPS。

### 14.2 命名规范

- 配置文件：`config/test.js`
- 工具模块：`utils/testMode.js`
- 测试密钥前缀：`DEV-{role}-{timestamp}-{random}`
- 日志前缀：`[TEST_MODE]`
- 子功能开关名：`debugLogin`、`testKeyMultiUse`

### 14.3 最小可运行配置（开发版）

```js
// miniprogram/config/test.js
module.exports = {
  enabled: true,
  features: {
    debugLogin: true,
    testKeyMultiUse: true
  },
  allowRuntimeOverride: true
};
```

> ⚠️ 提交前务必恢复为 `enabled: false`。
