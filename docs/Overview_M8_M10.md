# M8 任务模板 + M10 三环境分离 · 实现概览

> 日期：2026-07-19 ｜ 模块：PRD M8（任务模板）、M10（三环境物理隔离落地）

## 一、M8 任务模板

### 目标
让主任可以把常用任务「存为模板」，并在新建任务时「从模板一键套用」，省去重复填写。

### 实现要点
- **数据模型**：`tasks` 集合新增 `isTemplate`（布尔）、`templateName`（模板名）、`ownerDepartment`（模板归属部门，用于按部门可见）。
- **存为模板**：`createTask` 支持 `isTemplate:true` —— 仅校验 title/type，时间与人选留空、不推送通知。
- **从模板实例化**：`createTask` 支持 `fromTemplateId` —— 后端 `loadTemplate()` 读取模板字段，事件传入字段优先覆盖（时间/人员每次实例独立填写）。
- **列表隔离**：`getTasks` 默认查询加 `isTemplate: _.neq(true)`，模板不污染普通任务列表与统计。
- **取模板**：新增 `getTemplates` 云函数，主任及以上可看本部门 + 跨部门模板，中心主任看全部（含调试角色信任，与 createTask 一致）。
- **前端**：`create-task` 页面新增「存为模板」开关 + 模板名输入、「从模板创建」底部弹层（选择即预填表单，仅时间/人员留空）。

### 文件变更
| 文件 | 说明 |
| --- | --- |
| `cloudfunctions/createTask/index.js` | 存为模板 + 从模板实例化 + `loadTemplate()` |
| `cloudfunctions/getTasks/index.js` | 默认排除模板 |
| `cloudfunctions/getTemplates/index.js`（新） | 模板列表查询 |
| `utils/api.js` | 新增 `api.getTemplates` |
| `pages/create-task/create-task.{js,wxml,wxss}` | 模板开关 / 名称 / 选择弹层 UI |

---

## 二、M10 三环境分离

### 目标
dev / test / prod 三套云环境彼此隔离，一条命令只部署到目标环境，且初始化有清单可核对。

### 实现要点
- **M10-1 环境实装**：环境 ID 收敛到单一可编辑文件 `config/env.ids.js`；`config/env.js` 的 `getEnv()` 按微信 `envVersion`（develop→dev / trial→test / release→prod）自动切换，并支持开发期本地 storage 覆盖键 `td_envOverride`。`app.js` 已使用 `getEnv()`，无需改动。
- **M10-2 部署脚本**：`scripts/deploy-functions.js` —— `node scripts/deploy-functions.js --env test`，支持 `--name` 单函数、`--dry-run` 仅打印；默认用 CloudBase CLI（`tcb fn deploy`），可用 `TD_DEPLOY_CMD` 覆盖。**一次只连一个环境，绝不跨环境。**
- **M10-3 初始化清单**：`docs/环境初始化清单.md` —— 各环境集合创建（initDatabase 幂等、可重跑）、推荐索引、初始主任落地方式、发布前测试开关（`enabled=false`）归位核对表。

### 文件变更
| 文件 | 说明 |
| --- | --- |
| `config/env.ids.js`（新） | 唯一需手填的环境 ID 入口 |
| `config/env.js` | 改读 env.ids.js + 本地覆盖 |
| `scripts/deploy-functions.js`（新） | 单环境批量部署 |
| `docs/环境初始化清单.md`（新） | 各环境初始化核对 |

---

## 三、验证结果
- 所有改动 JS `node --check` 通过（8 个文件）。
- **前端模拟器 E2E（M8）**：以 `photo_director` 进入 create-task 页，`isTemplate` 开关、模板名输入、模板选择弹层均正常；`getTemplates` 未部署时优雅失败进空态，**全程 `No recent errors`**。
- `env.js` 重构经 app.js 加载无报错（隐含验证 require 链 `env.js → env.ids.js`）。

## 四、待你手动处理（部署类）
1. **M8 部署**：右键「上传并部署」`getTemplates`（新）、`createTask`/`getTasks`（已改）；重启模拟器后可跑后端 E2E：存模板 → `getTemplates` 列表 → 从模板创建实例。
2. **M10 填 ID**：在 `config/env.ids.js` 把 `test` / `prod` 改为云控制台各自的真实环境 ID（当前三者暂共用开发环境 ID）。
3. **M10 部署**：`npm i -g @cloudbase/cli && tcb login`，再 `node scripts/deploy-functions.js --env test`。
4. **发布前**：确认所有 `testConfig.js` + `config/test.js` 的 `enabled=false`（当前本地仍为 true，供调试）。
