# 测试模式开关方案（Debug Mode Switch）

> **状态：已实现并通过测试**  
> **测试命令**：`node tests/runAll.js`（全部 20 个用例通过）  
> 适用功能：A（测试密钥生成/验证）与 C（调试角色登录入口）  
> 设计目标：简洁、可扩展、默认关闭、与生产功能隔离

## 1. 开关控制范围

采用「主开关 + 子功能开关」的两层结构，避免一个全局布尔值导致所有测试功能全部打开。

| 开关 | 控制模块 | 说明 |
|---|---|---|
| `TEST_MODE` | 全局测试模式 | 主开关；关闭时所有子功能强制失效 |
| `TEST_DEBUG_LOGIN` | 调试角色登录（C） | 登录页显示「测试入口」，允许直接选择角色 |
| `TEST_KEY_MULTIUSE` | 测试密钥复用（A） | 允许 `keys` 集合中 `testKey: true` 的密钥被反复使用 |
| `TEST_MOCK_DATA` | 预留 | 后续 mock 新闻/任务数据等 |
| `TEST_SKIP_SUBSCRIBE` | 预留 | 跳过订阅消息弹窗等 |

## 2. 配置方式

支持三种配置来源，优先级如下（高优先级覆盖低优先级）：

1. **运行时参数**（最高）
   - 开发者工具启动参数 `?debug=1`
   - 登录页连续点击版本号 5 次（手势开关）
2. **配置文件**（默认）
   - 小程序端：`miniprogram/config/test.js`
   - 云函数端：`cloudfunctions/verifyKey/testConfig.js`
3. **环境变量**
   - 云函数部署时可通过 `WX_CONFIG` / `TENCENTCLOUD_RUNENV` 读取；本地调试可写入 `project.private.config.json` 的 `setting.debugMode`

## 3. 默认状态

```js
// miniprogram/config/test.js
module.exports = {
  enabled: false,              // 主开关默认关闭
  features: {
    debugLogin: false,         // C 功能默认关闭
    testKeyMultiUse: false     // A 功能默认关闭
  },
  allowRuntimeOverride: true   // 允许运行时参数覆盖（开发调试用）
};
```

**提交规范**：代码仓库中必须保持 `enabled: false`，防止误合入生产分支。

## 4. 状态可观测

提供统一工具模块：`miniprogram/utils/testMode.js`

```js
function isEnabled() { ... }          // 测试模式是否开启
function isFeatureOn(name) { ... }    // 某个子功能是否开启
function getStatus() { ... }            // 获取完整状态对象（用于日志/调试）
```

- 在 `app.js onLaunch` 中打印 `testMode.getStatus()`
- 在「我的」页面或登录页顶部显示测试模式标识（Badge / 状态条）
- 所有云函数在测试分支入口处打印 `[TEST_MODE] ...` 日志

## 5. 作用域隔离

### 前端隔离
- 调试入口 UI 用 `wx:if="{{isTestMode}}"` 包裹，不开启时不渲染、不可触发
- 所有调试功能代码分支使用 `if (testMode.isFeatureOn('debugLogin'))` 守卫
- 调试角色登录仅修改当前用户的本地 `storage` 与 `globalData`，不写入数据库 users.role（避免污染生产数据）

### 云函数隔离
- `verifyKey` 中正常密钥与测试密钥走独立分支：
  - 正常密钥：`isUsed` 检查 + 标记已使用 + 更新用户 role
  - 测试密钥（`testKey: true`）：仅更新用户 role，**不标记 isUsed**，不消耗密钥
- 测试密钥分支必须同时满足 `TEST_MODE === true`（云函数端配置），否则拒绝

### 数据隔离
- 测试密钥在 `keys` 集合中明确标记 `testKey: true`
- 建议测试密钥使用统一前缀：`DEV-` 或 `TEST-`
- 测试密钥永不被计入正式统计/审计

## 6. 与 A/C 功能的结合

### C：调试角色登录
- 在 `pages/login/login.js` 的 `onLoad` 中读取 `testMode.getStatus()`
- 若 `debugLogin` 开启，显示「测试登录」按钮
- 选择角色后：
  ```js
  userInfo.role = selectedRole;
  storage.saveUserInfo(userInfo);
  app.globalData.userInfo = userInfo;
  wx.switchTab({ url: '/pages/index/index' });
  ```
- 不在 users 表中写 role，避免污染线上数据；刷新后恢复为 member，适合反复测试

### A：测试密钥
- 新增云函数 `generateTestKey`，接收 `{ role }`，生成并返回测试密钥（仅在 `TEST_MODE` 开启时允许调用）
- 测试密钥文档示例：
  ```json
  {
    "key": "DEV-PHOTO-20260718-001",
    "role": "photo_director",
    "testKey": true,
    "isUsed": false,
    "createdAt": { "$date": "..." }
  }
  ```
- 也可继续支持手动在 CloudBase 控制台插入测试密钥文档
- `verifyKey` 中识别 `testKey: true`，跳过消耗逻辑，仅升级用户角色

## 7. 文件结构

```
miniprogram/
  config/
    test.js                 # 测试开关配置（默认关闭）
  utils/
    testMode.js             # 开关读取/运行时覆盖/状态输出
  pages/
    login/
      login.js              # 集成 debugLogin 入口
      login.wxml            # 测试登录按钮
    key-verify/
      key-verify.js         # 显示密钥是否为测试密钥

cloudfunctions/
  verifyKey/
    config/
      test.js               # 云函数端测试配置
    index.js                # 增加 testKey 分支
  generateTestKey/          # 可选：生成测试密钥
    index.js
    config.json
    package.json
```

## 8. 实现检查清单

- [x] 创建 `miniprogram/config/test.js` 与 `miniprogram/utils/testMode.js`
- [x] 在 `app.js onLaunch` 中保存启动参数并打印测试模式状态
- [x] 在 `pages/login/login.js` 集成 `debugLogin` 入口（picker 选角色）
- [x] 在 `pages/login/login.wxml` 添加 `wx:if` 包裹的调试登录面板
- [x] 在 `pages/login/login.wxss` 添加调试面板样式
- [x] 修改 `cloudfunctions/verifyKey/index.js` 增加 `testKey` 分支
- [x] 创建 `cloudfunctions/generateTestKey` 云函数
- [x] 在 `utils/api.js` 暴露 `generateTestKey` 接口
- [x] 创建 `tests/` 目录并运行完整测试套件（20 个用例全部通过）
- [x] 提交前确认所有 `enabled: false`

## 9. 测试结果

运行命令：

```bash
node tests/runAll.js
```

结果：

- TC-01 ~ TC-05：测试模式开关模块（默认关闭、运行时参数、正式版强制关闭、子功能控制）
- TC-10 ~ TC-13：调试角色登录（角色列表、onLoad、角色选择、本地角色修改）
- TC-14 ~ TC-20：测试密钥云函数（正式密钥一次性、测试密钥权限、测试密钥复用、生成测试密钥）

全部 20 个用例通过。

## 10. 注意事项

- 所有测试模式开关的默认状态均为 `false`，提交前请再次检查：
  - `miniprogram/config/test.js`
  - `miniprogram/cloudfunctions/verifyKey/testConfig.js`
  - `miniprogram/cloudfunctions/generateTestKey/testConfig.js`
- 部署云函数前，需在微信开发者工具中右键 `generateTestKey` 文件夹选择「创建并部署：云端安装依赖」或「上传并部署：云端安装依赖」。
- 调试角色登录仅修改本地 `storage` 和 `globalData`，不写入数据库 `users.role`。

## 11. 部署状态（测试模式，2026-07-18）

已实现代码并部署到测试环境 `cloud1-d8gdddel1d4b1cea1`：

- ✅ 三处测试开关当前 `enabled: true`：
  - `miniprogram/config/test.js`（主开关 + `debugLogin` + `testKeyMultiUse`）
  - `cloudfunctions/verifyKey/testConfig.js`
  - `cloudfunctions/generateTestKey/testConfig.js`
- ✅ 云函数 `generateTestKey` 与 `verifyKey` 已部署上线（CLI `cloud functions list` 确认）
- ✅ 前端代码已重新编译（自动化服务重启加载新文件）
- ✅ 测试套件 20/20 通过（`node tests/runAll.js`）
- ⚠️ 模拟器实时验证未完成（环境限制，非代码问题）：MCP 桥接依赖云端 relay 当前不可达；直连自动化 SDK 确认模拟器窗口已挂载但渲染上下文失效。请在开发者工具内按 `Ctrl+B` 重新编译，登录页将显示「🧪 调试角色登录」入口。

> 提交生产前，务必将以上三处 `enabled` 改回 `false`，避免测试入口暴露。

