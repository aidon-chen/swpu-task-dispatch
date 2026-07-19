# 任务派发系统 - 系统架构设计文档

## 版本信息

| 字段 | 内容 |
|------|------|
| 文档版本 | v1.3 |
| 更新说明 | 架构审查修订：新增定时触发器(scheduleNotify)、密钥生成(generateKey)、环境分离方案、错误码规范；通知简化为小程序内通知；修正news_cache索引；补充缺失数据库索引；导出改为纯文本剪切板 |
| 技术栈 | 微信小程序原生框架 + 云开发（CloudBase） |
| 文件总数 | 80个 |
| 任务数量 | 5个（T01-T05） |

---

## Part A：系统设计

### 1. 实现方案与框架选型

#### 1.1 核心技术挑战分析

| 挑战 | 解决方案 |
|------|----------|
| 新闻网站爬虫 | 使用 axios + cheerio 解析HTML，jieba中文分词提取关键词 |
| 统计报表生成 | 使用 wx-charts 绘制图表，云函数聚合数据 |
| 权限控制 | 四级角色（主任/摄影主任/视频主任/成员），云函数中间件校验 |
| 定时提醒 | 云函数定时触发器，任务开始前2小时推送 |

#### 1.2 技术栈选型

**前端**:
- 微信小程序原生框架（WXML + WXSS + JS）
- wx-charts：小程序图表库
- WeUI for 小程序（可选）

**后端（云开发）**:
- 云函数：处理业务逻辑
- 云数据库：文档型数据库
- 云存储：图片文件存储
- 云调用：微信订阅消息推送

**爬虫（云函数内）**:
- axios：HTTP客户端
- cheerio：HTML解析库
- jieba：中文分词库

**工具库**:
- dayjs：日期处理

#### 1.3 架构模式

采用 **云函数 + 云数据库 + 小程序前端** 的三层架构：
- 无需搭建服务器
- 与微信小程序无缝集成
- 适合40人小规模应用
- 云开发自动扩容

#### 1.4 环境分离方案 [🆕 v1.3]

云开发本身支持多环境，本项目采用三环境策略：

| 环境 | 云环境ID示例 | 用途 | 数据库 | 访问控制 |
|------|-------------|------|--------|----------|
| **dev** | `task-dev-xxxxx` | 开发者本地调试 | 开发数据，可随意重置 | 仅开发者 |
| **test** | `task-test-xxxxx` | 团队内部测试 | 模拟真实数据 | 项目成员（约40人） |
| **prod** | `task-prod-xxxxx` | 正式上线 | 生产数据 | 全媒体中心全体 |

**环境切换机制**：

在 `miniprogram/config/` 下创建环境配置文件：

```
miniprogram/config/
└── env.js          # 环境配置（单一入口）
```

```javascript
// miniprogram/config/env.js
const ENV_CONFIG = {
  dev: {
    cloudEnvId: 'task-dev-xxxxx',
    baseUrl: '',
    debug: true,
    logLevel: 'verbose'
  },
  test: {
    cloudEnvId: 'task-test-xxxxx',
    baseUrl: '',
    debug: true,
    logLevel: 'info'
  },
  prod: {
    cloudEnvId: 'task-prod-xxxxx',
    baseUrl: '',
    debug: false,
    logLevel: 'error'
  }
}

// 通过 project.config.json 的 compileType 和环境变量判断当前环境
// 开发工具内默认 dev，真机调试默认 test，正式版自动 prod
const getEnv = () => {
  const accountInfo = wx.getAccountInfoSync ? wx.getAccountInfoSync() : {}
  const envVersion = accountInfo.miniProgram?.envVersion || 'develop'
  // develop → dev, trial → test, release → prod
  const envMap = { develop: 'dev', trial: 'test', release: 'prod' }
  return ENV_CONFIG[envMap[envVersion] || 'dev']
}

module.exports = { getEnv, ENV_CONFIG }
```

**app.js 中使用**：
```javascript
const { getEnv } = require('./config/env')
const env = getEnv()

App({
  onLaunch() {
    wx.cloud.init({ env: env.cloudEnvId, traceUser: true })
  }
})
```

**环境初始化清单**（每个环境首次搭建时执行）：
1. 在微信云开发控制台创建对应环境
2. 创建 7 个数据库集合并建立索引
3. 在 test/prod 环境手动插入初始数据（主任账号、预生成密钥等）
4. 在小程序后台配置 request 合法域名（云开发免配）
5. 上传并部署全部云函数

---

### 2. 文件列表

#### 2.1 目录结构

```
miniprogram/
├── app.js                          # 小程序入口
├── app.json                        # 小程序配置
├── app.wxss                        # 全局样式
├── project.config.json             # 项目配置
├── sitemap.json                    # 站点地图
│
├── pages/
│   ├── index/                      # 首页（任务概览）
│   │   ├── index.js
│   │   ├── index.wxml
│   │   ├── index.wxss
│   │   └── index.json
│   │
│   ├── login/                      # 登录与角色选择
│   │   ├── login.js
│   │   ├── login.wxml
│   │   ├── login.wxss
│   │   └── login.json
│   │
│   ├── create-task/                # 创建/编辑任务
│   │   ├── create-task.js
│   │   ├── create-task.wxml
│   │   ├── create-task.wxss
│   │   └── create-task.json
│   │
│   ├── task-detail/                # 任务详情
│   │   ├── task-detail.js
│   │   ├── task-detail.wxml
│   │   ├── task-detail.wxss
│   │   └── task-detail.json
│   │
│   ├── duty-schedule/              # 值班表
│   │   ├── duty-schedule.js
│   │   ├── duty-schedule.wxml
│   │   ├── duty-schedule.wxss
│   │   └── duty-schedule.json
│   │
│   ├── locations/                  # 机位管理
│   │   ├── locations.js
│   │   ├── locations.wxml
│   │   ├── locations.wxss
│   │   └── locations.json
│   │
│   ├── location-detail/            # 机位详情
│   │   ├── location-detail.js
│   │   ├── location-detail.wxml
│   │   ├── location-detail.wxss
│   │   └── location-detail.json
│   │
│   ├── profile/                    # 个人中心
│   │   ├── profile.js
│   │   ├── profile.wxml
│   │   ├── profile.wxss
│   │   └── profile.json
│   │
│   ├── status-report/              # 状态上报
│   │   ├── status-report.js
│   │   ├── status-report.wxml
│   │   ├── status-report.wxss
│   │   └── status-report.json
│   │
│   ├── statistics/                 # 统计报表 [🆕]
│   │   ├── statistics.js
│   │   ├── statistics.wxml
│   │   ├── statistics.wxss
│   │   └── statistics.json
│   │
│   ├── news-match/                 # 新闻匹配 [🆕]
│   │   ├── news-match.js
│   │   ├── news-match.wxml
│   │   ├── news-match.wxss
│   │   └── news-match.json
│   │
│   └── key-verify/                 # 权限密钥验证
│       ├── key-verify.js
│       ├── key-verify.wxml
│       ├── key-verify.wxss
│       └── key-verify.json
│
│   └── key-generate/               # 密钥生成（主任专属）[🆕 v1.3]
│       ├── key-generate.js
│       ├── key-generate.wxml
│       ├── key-generate.wxss
│       └── key-generate.json
│
├── components/
│   ├── task-card/                  # 任务卡片组件
│   │   ├── task-card.js
│   │   ├── task-card.wxml
│   │   ├── task-card.wxss
│   │   └── task-card.json
│   │
│   ├── member-picker/              # 成员选择器（含随机选人） 🆕
│   │   ├── member-picker.js          # 含randomSelect方法
│   │   ├── member-picker.wxml
│   │   ├── member-picker.wxss
│   │   └── member-picker.json
│   │
│   ├── status-badge/               # 状态标签
│   │   ├── status-badge.js
│   │   ├── status-badge.wxml
│   │   ├── status-badge.wxss
│   │   └── status-badge.json
│   │
│   └── chart/                      # 图表组件 [🆕]
│       ├── chart.js
│       ├── chart.wxml
│       ├── chart.wxss
│       └── chart.json
│
├── utils/
│   ├── api.js                      # API封装
│   ├── auth.js                     # 权限校验工具
│   ├── date.js                     # 日期工具
│   ├── storage.js                  # 本地存储
│   ├── notification.js             # 通知工具
│   └── crawler.js                  # 爬虫工具函数 [🆕]
│
├── config/                         # 环境配置 [🆕 v1.3]
│   └── env.js                      # 多环境配置（dev/test/prod）
│
└── cloudfunctions/
    ├── login/                      # 微信登录
    │   ├── index.js
    │   └── package.json
    ├── verifyKey/                  # 验证密钥
    │   ├── index.js
    │   └── package.json
    ├── createTask/                 # 创建任务
    │   ├── index.js
    │   └── package.json
    ├── updateTask/                 # 更新任务
    │   ├── index.js
    │   └── package.json
    ├── getTasks/                   # 获取任务列表
    │   ├── index.js
    │   └── package.json
    ├── updateUserStatus/           # 更新用户状态
    │   ├── index.js
    │   └── package.json
    ├── getDutySchedule/            # 获取值班表
    │   ├── index.js
    │   └── package.json
    ├── createLocation/             # 创建机位
    │   ├── index.js
    │   └── package.json
    ├── getLocations/               # 获取机位列表
    │   ├── index.js
    │   └── package.json
    ├── sendNotification/           # 发送通知（小程序内）[✏️ v1.3]
    │   ├── index.js
    │   └── package.json
    │
    ├── generateKey/                # 生成权限密钥 [🆕 v1.3]
    │   ├── index.js
    │   └── package.json
    │
    ├── scheduleNotify/             # 定时任务扫描与自动完结 [🆕 v1.3]
    │   ├── index.js
    │   ├── package.json
    │   └── config.json             # 定时触发器（每30分钟）
    │
    ├── getReport/                  # 统计报表 [🆕]
    │   ├── index.js
    │   └── package.json
    ├── crawlNews/                  # 新闻爬虫 [🆕]
    │   ├── index.js
    │   └── package.json
    ├── getNewsCache/               # 新闻缓存 [🆕]
    │   ├── index.js
    │   └── package.json
    └── exportReport/               # 导出报表 [🆕]
        ├── index.js
        └── package.json
```

**文件统计**: 总计80个文件（原62个 + 新增18个：T01-T05新增 + v1.3新增10个）

---

### 3. 数据结构与接口设计

#### 3.1 数据库集合设计

#### 3.1.1 users 集合

```json
{
  "_id": "string",
  "openid": "string",
  "name": "string",
  "department": "photography | video",
  "role": "member | photo_director | video_director | center_director",
  "avatar": "string",
  "semester": "string",
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

索引: openid(唯一), department, role

#### 3.1.2 tasks 集合

```json
{
  "_id": "string",
  "title": "string",
  "type": "string",
  "startTime": "timestamp",
  "endTime": "timestamp",
  "location": "string",
  "contact": "string",
  "description": "string",
  "deliverables": "string",
  "assignedTo": ["userId"],
  "creatorId": "string",
  "status": "pending | confirmed | in_progress | completed | cancelled",
  "priority": "normal | urgent",
  "locationId": "string",
  "isCrossDepartment": "boolean",
  "semester": "string",
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

索引: assignedTo, creatorId, status, startTime, semester

#### 3.1.3 user_status 集合

```json
{
  "_id": "string",
  "userId": "string",
  "status": "available | busy | unavailable",
  "reason": "string",
  "images": ["string"],
  "startDate": "timestamp",
  "endDate": "timestamp",
  "createdAt": "timestamp"
}
```

索引: userId, status, startDate, endDate

#### 3.1.4 locations 集合

```json
{
  "_id": "string",
  "name": "string",
  "description": "string",
  "notes": "string",
  "images": ["string"],
  "tags": ["string"],
  "createdBy": "string",
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

#### 3.1.5 keys 集合

```json
{
  "_id": "string",
  "key": "string",
  "role": "string",
  "isUsed": "boolean",
  "usedBy": "string",
  "usedAt": "timestamp",
  "createdBy": "string",
  "createdAt": "timestamp"
}
```

索引: key(唯一), isUsed, createdBy

#### 3.1.6 notifications 集合

```json
{
  "_id": "string",
  "userId": "string",
  "taskId": "string",
  "type": "task_assigned | task_updated | task_cancelled | reminder",
  "content": "string",
  "isRead": "boolean",
  "createdAt": "timestamp"
}
```

#### 3.1.7 news_cache 集合 [🆕]

```json
{
  "_id": "string",
  "taskId": "string",
  "taskTitle": "string",
  "newsList": [
    {
      "title": "string",
      "url": "string",
      "publishDate": "timestamp",
      "matchScore": "number"
    }
  ],
  "cachedAt": "timestamp",
  "expireAt": "timestamp"
}
```

索引: taskId + url(联合唯一，同一任务不重复缓存同一URL), publishTime

---

#### 3.2 云函数 API 设计

#### 3.2.1 已有API（v1.0）
- `POST /login` - 微信登录
- `POST /verifyKey` - 验证密钥（一次性）
- `POST /generateKey` - 生成权限密钥 [🆕 v1.3]
- `POST /createTask` - 创建任务（支持跨部门）
- `POST /updateTask` - 更新任务
- `POST /getTasks` - 获取任务列表
- `POST /updateUserStatus` - 更新用户状态
- `POST /getDutySchedule` - 获取值班表
- `POST /createLocation` - 创建机位
- `POST /getLocations` - 获取机位列表
- `POST /sendNotification` - 发送小程序内通知 [✏️ v1.3]
- `POST /scheduleNotify` - 定时扫描（云函数定时触发器自动调用）[🆕 v1.3]

#### 3.2.2 统计报表 API [🆕]

**接口**: `POST /getReport`

```
输入:
{
  "userId": "string",        // 查询用户ID
  "startDate": "timestamp",  // 开始时间
  "endDate": "timestamp",    // 结束时间
  "type": "month | semester" // 统计类型
}

输出:
{
  "totalTasks": 12,
  "monthlyDistribution": [
    {"month": "2024-01", "count": 5},
    {"month": "2024-02", "count": 7}
  ],
  "semesterDistribution": [  // type=semester时返回
    {"semester": "2024-春季", "count": 20}
  ],
  "taskList": [
    {
      "taskId": "string",
      "title": "string",
      "date": "timestamp",
      "location": "string",
      "status": "string",
      "newsCacheId": "string"  // 关联的新闻缓存
    }
  ],
  "charts": {
    "lineChartData": {},
    "pieChartData": {}
  }
}

权限控制:
- 普通成员只能查询自己的统计报表
- 主任可以查询本部门所有成员
- 视觉中心主任可以查询所有成员
```

#### 3.2.3 新闻爬虫 API [🆕]

**接口**: `POST /crawlNews`

```
输入:
{
  "taskId": "string",
  "taskTitle": "string",
  "startTime": "timestamp",
  "endTime": "timestamp"       // startTime + 7天
}

输出:
{
  "matched": true,
  "newsList": [
    {
      "title": "校运会隆重开幕",
      "url": "https://www.swpu.edu.cn/news/xxx",
      "publishDate": "2024-01-06",
      "matchScore": 90
    }
  ]
}

匹配逻辑:
1. 检查news_cache缓存（同一任务24小时内不重复爬取）
2. jieba分词提取任务标题关键词
3. axios + cheerio爬取新闻网列表
4. 加权评分：标题匹配60% + 正文匹配40%
5. 超过阈值（30分）的新闻全部显示（罗列式）
6. 缓存结果30天

错误处理:
- 网络超时：返回友好提示"网络繁忙，请稍后重试"
- 页面结构变更：返回友好提示"暂无法匹配新闻，请手动搜索"
- 无匹配结果：返回matched=false
```

#### 3.2.4 导出报表 API [🆕]

**接口**: `POST /exportReport`

```
输入:
{
  "userId": "string",
  "startDate": "timestamp",
  "endDate": "timestamp",
  "type": "month | semester"
}

输出:
{
  "name": "张三",
  "department": "摄影部",
  "period": "2026年春季学期",
  "totalTasks": 12,
  "taskDetails": [
    {
      "title": "校运会拍摄",
      "date": "2026-01-05",
      "location": "田径场",
      "status": "已完成"
    }
  ],
  "plainText": "张三（摄影部）2026年春季学期任务汇总\n共参与 12 次任务\n\n1. 校运会拍摄 | 2026-01-05 | 田径场 | 已完成\n2. ..."
}

用途：在小程序内生成纯文本摘要，一键复制到系统剪切板，便于粘贴到 WPS 等其他工具中 [✏️ v1.3]
```

#### 3.2.5 密钥生成 API [🆕 v1.3]

**接口**: `POST /generateKey`

```
输入:
{
  "role": "photo_director | video_director",  // 目标角色
  "count": 3                                    // 生成数量（1-10）
}

输出:
{
  "code": 0,
  "data": {
    "keys": ["aB3xK9mQ", "xY7nP2wR", "mN5kL8jH"],
    "role": "photo_director",
    "createdAt": "2026-06-21T06:33:00Z"
  }
}

密钥规则:
- 格式: 8位随机字符串（大小写字母 + 数字，共62个字符池）
- 一次性使用: 使用后 isUsed = true
- 过期策略: 当前学期结束后自动失效（由学期切换脚本清理）
- 记录: keys 集合写入 createdBy（生成者userId）

权限控制:
- 仅 center_director（视觉中心主任）可生成
- 生成的密钥角色不能高于生成者自身
```

#### 3.2.6 定时触发器 API [🆕 v1.3]

**接口**: `POST /scheduleNotify`（由云函数定时触发器自动调用，非前端主动触发）

**触发器配置** (`config.json`):
```json
{
  "triggers": [{
    "name": "taskScanner",
    "type": "timer",
    "config": "0 */30 * * * * *"
  }]
}
```

**执行逻辑**（每30分钟执行一次）:

```
1. 任务提醒扫描
   ├── 查询: tasks.startTime 距离现在 2 小时内 && status = 'confirmed'
   ├── 动作: 对每个 assignedTo 成员
   │   └── 在 notifications 集合写入提醒记录 (type = 'reminder')
   └── 防重: 同一任务同一轮次只提醒一次（check notifiedAt 字段）

2. 任务自动完结
   ├── 查询: tasks.endTime 已过期 && status = 'in_progress'
   ├── 动作: 自动标记 status = 'completed'
   │   └── 在 notifications 集合写入完成通知 (type = 'task_completed')
   └── 备注: 此操作不覆盖成员/主任手动调整的结果
```

**错误处理**:
- 触发器执行失败时云开发自动重试 3 次
- 部分任务处理失败不影响其他任务
- 执行日志写入云函数日志（可在控制台查看）

---

### 4. 程序调用流程（时序图）

#### 4.1 用户登录与角色升级流程 [✏️ v1.3]
```
用户 → 小程序 → login云函数 → 云数据库(users)
                              ↓
                       返回用户信息和角色

密钥生成（主任专属）:
center_director → key-generate页 → generateKey云函数 → 云数据库(keys)
                                                      ↓
                                                 返回密钥列表
                                                      ↓
                                        主任截图/复制分发给成员

密钥使用（成员升级）:
普通成员 → key-verify页 → verifyKey云函数 → 云数据库(keys) → 验证 → 标记已用 → 更新角色
```

#### 4.2 任务创建与派发流程 [✏️ v1.3]
```
主任 → 创建任务页 → createTask云函数 → 云数据库(tasks)
                                       ↓
                              写入 notifications 集合(task_assigned)
                                       ↓
                              成员在小程序内"消息中心"查看
```

#### 4.3 任务确认与交付流程 [✏️ v1.3]
```
成员 → 查看任务 → 确认接受/申请调整 → updateTask云函数 → 云数据库

scheduleNotify定时触发器（每30分钟自动）:
  → 扫描即将开始的任务(startTime 2h内, status=confirmed)
  → 写入 notifications 提醒 (type=reminder)
  → 扫描过期任务(endTime已过, status=in_progress)
  → 自动标记 completed → 写入 notifications (type=task_completed)

成员申请调整 → 主任审批 → updateTask云函数
```

#### 4.4 人员状态设置流程
```
成员 → 设置状态 → updateUserStatus云函数 → 云数据库(user_status)
                                          ↓
                          如"不可用" → 必填原因(文字) + 选填图片
```

#### 4.5 统计报表查看流程 [🆕]
```
用户 → 统计报表页 → getReport云函数
   ↓                    ↓
权限验证 ← 云数据库(users)
   ↓
选择月份/学期 → 聚合统计(总次数、分布) → 返回报表数据
   ↓
wx-charts渲染图表 → 显示任务明细列表
   ↓
点击"匹配新闻" → crawlNews云函数 → 显示新闻列表
```

#### 4.6 新闻匹配流程 [🆕]
```
用户点击"匹配新闻" → crawlNews云函数
   ↓                    ↓
检查缓存(news_cache) → 有缓存？→ 直接返回
   ↓                    ↓ 无缓存
提取关键词(jieba分词) → 爬取新闻网(axios+cheerio)
   ↓                    ↓
加权评分(标题60%+正文40%) → 过滤(>30分) → 缓存结果
   ↓
返回新闻列表 → 罗列式显示 → 点击 → WebView打开
```

#### 4.7 定时触发器工作流程 [🆕 v1.3]
```
scheduleNotify（每30分钟自动触发）
   │
   ├── 扫描 tasks：startTime ∈ [now, now+2h] AND status='confirmed'
   │   └── 对每个 assignedTo 成员 → 写入 notifications(type=reminder)
   │       └── 防重：检查 notifiedAt 字段，同周期不重复通知
   │
   └── 扫描 tasks：endTime < now AND status='in_progress'
       └── 更新 status='completed' → 写入 notifications(type=task_completed)
```

#### 4.8 值班表导入流程 [🆕 v1.3]
```
方案A - 后端脚本导入（推荐初始化用）:
管理员 → 本地Python脚本 → 读取 Excel(.xlsx)
                              ↓
                        解析 成员×课节 矩阵
                              ↓
                        批量写入云数据库(duty_schedule集合)
                              ↓
                        小程序 getDutySchedule 读取

方案B - 小程序手动录入（日常维护）:
主任 → 值班表页 → 选择成员 + 选择课节 + 选择周次
                    ↓
              updateDutySchedule云函数 → 云数据库
                    ↓
              getDutySchedule 立即刷新视图
```

#### 4.9 消息通知流程 [🆕 v1.3]
```
各云函数(createTask/updateTask/scheduleNotify)
   │
   └── 写入 notifications 集合
         │
         ├── index 页 onShow: 查询未读数量 → TabBar 红点
         ├── profile 页: "消息中心"入口 + 未读数
         └── 消息中心页: 通知列表 → 点击跳转任务详情 → 标记已读
```

---

### 5. 待明确事项

| # | 问题 | 状态 |
|---|------|------|
| 1 | 权限密钥规则 | ✅ 确认：一次性使用，一个密钥对应一个用户 |
| 2 | 任务提醒时机 | ✅ 确认：任务开始前2小时推送 |
| 3 | "不可用"状态格式 | ✅ 确认：时间段+文字说明+图片(可选) |
| 4 | "成果交付"机制 | ✅ 确认：默认完成，成员/主任可调整 |
| 5 | 跨部门任务 | ✅ 确认：存在协作任务 |
| 6 | 学期定义 | ✅ 确认：需支持学期统计 |
| 7 | 新闻匹配算法 | ✅ 确认：jieba分词+加权评分 |
| 8 | 新闻显示方式 | ✅ 确认：罗列式+WebView内嵌打开 |
| 9 | 爬虫频率控制 | ⚠️ 先保证功能实现，后期调优 |
| 10 | 新闻网结构变更 | ⚠️ 添加报错机制即可 |

---

## Part B：任务分解

### 6. 依赖包列表

**前端依赖**:
- wx-charts：图表组件

**云函数依赖**:
```
云函数通用:
- wx-server-sdk

crawlNews云函数:
- axios (HTTP请求)
- cheerio (HTML解析)
- jieba (中文分词)

其他云函数:
- dayjs (日期处理)
```

---

### 7. 任务列表

| 任务ID | 任务名称 | 优先级 | 依赖 | 文件数 | 描述 |
|--------|----------|--------|------|--------|------|
| T01 | 项目基础设施搭建 | P0 | 无 | 15个 | 微信小程序项目初始化、全局配置、公共组件（图表组件、爬虫工具）、工具函数 |
| T02 | 用户认证与角色管理 | P0 | T01 | 10个 | 微信登录、用户注册（含部门选择）、权限密钥验证（一次性）、角色管理 |
| T03 | 任务管理核心功能 | P0 | T01,T02 | 26个 | 任务创建（含跨部门）、编辑、查看、列表筛选、成果交付（默认完成+调整机制） |
| T04 | 人员状态管理与值班表 | P0 | T01,T02 | 17个 | 状态上报（不可用+原因）、值班表设置与查看、成员可用性矩阵 |
| T05 | 机位管理、通知、统计报表、新闻匹配 | P1-P2 | T01,T02,T03 | 18个 | 机位CRUD、消息通知（定时提醒）、统计报表（月/学期）、新闻爬虫（jieba+加权评分+WebView） |

**任务依赖关系图**:
```
T01 (基础设施)
 ├── T02 (用户认证)
 │    ├── T03 (任务管理)
 │    │    └── T05 (统计+爬虫+机位+通知)
 │    └── T04 (值班表)
```

---

### 8. 共享知识（跨文件约定）

#### 8.1 代码规范
- 使用ES6+语法
- 云函数使用async/await
- 小程序页面使用Page({})定义
- 组件使用Component({})定义

#### 8.2 数据库约定
- 时间字段使用Date类型
- 状态字段使用英文枚举值
- 关联字段使用_id引用
- 学期格式："2024-春季" / "2024-秋季"

#### 8.3 权限校验规范
```javascript
// 云函数权限校验示例
function checkPermission(user, requiredRole) {
  const roleLevel = { member: 1, photo_director: 2, video_director: 2, center_director: 3 }
  return roleLevel[user.role] >= roleLevel[requiredRole]
}
```

#### 8.4 错误处理规范 [✏️ v1.3]

**统一返回格式**：
```json
{
  "code": 0,
  "data": {},
  "message": ""
}
```

**错误码枚举**（按模块分层，5位数字）：

##### 通用 (0xxx)
| 错误码 | 含义 | 触发场景 |
|--------|------|---------|
| `0` | 成功 | 正常返回 |
| `9999` | 未知错误 | 未捕获的异常 |

##### 参数错误 (1xxx)
| 错误码 | 含义 | 触发场景 |
|--------|------|---------|
| `1001` | 参数缺失 | 必填字段为空 |
| `1002` | 参数格式错误 | 类型不匹配、格式不符合要求 |
| `1003` | 参数值非法 | 枚举值不在允许范围内（如 status 值无效）|

##### 权限错误 (2xxx)
| 错误码 | 含义 | 触发场景 |
|--------|------|---------|
| `2001` | 未登录 | openid 缺失或无效 |
| `2002` | 权限不足 | 角色等级不够（如 member 尝试 createTask） |
| `2003` | 密钥无效 | 密钥不存在或已被使用 |
| `2004` | 密钥已过期 | 密钥超出学期有效期 |
| `2005` | 跨部门越权 | 摄影部主任操作视频部数据 |

##### 数据错误 (3xxx)
| 错误码 | 含义 | 触发场景 |
|--------|------|---------|
| `3001` | 数据不存在 | 查询的 task/user/location 等不存在 |
| `3002` | 数据冲突 | 重复创建（如同一任务重复指派） |
| `3003` | 状态不允许 | 当前状态不支持此操作（如已完成的任务不能再次确认） |

##### 系统错误 (4xxx)
| 错误码 | 含义 | 触发场景 |
|--------|------|---------|
| `4001` | 云函数执行异常 | 未预期的运行时错误 |
| `4002` | 数据库操作失败 | 读写超时、索引冲突等 |
| `4003` | 云存储操作失败 | 上传/下载失败 |

##### 爬虫错误 (5xxx)
| 错误码 | 含义 | 触发场景 |
|--------|------|---------|
| `5001` | 网络超时 | 新闻网不可达或响应超时（10s） |
| `5002` | 解析失败 | 新闻网 HTML 结构变更 |
| `5003` | 无匹配结果 | 所有新闻匹配分数均低于阈值 |

**前端错误处理代码示例**：
```javascript
// utils/api.js 中统一拦截
const handleError = (err) => {
  const errorMessages = {
    1001: '请填写必填项',
    1002: '输入格式不正确',
    2001: '请先登录',
    2002: '你没有权限执行此操作',
    2003: '密钥无效或已被使用',
    3001: '数据不存在或已被删除',
    4001: '系统繁忙，请稍后重试',
    5001: '网络繁忙，请稍后重试'
  }
  const msg = errorMessages[err.code] || err.message || '未知错误'
  wx.showToast({ title: msg, icon: 'none' })
}
```

#### 8.5 密钥管理规范
- 密钥格式：8位随机字符串（大小写字母+数字）
- 密钥一次性使用，使用后isUsed=true
- 密钥生成记录创建者和时间

#### 8.6 通知发送规范 [✏️ v1.3]

本项目采用**小程序内通知**方案，不依赖微信订阅消息。理由：
- 订阅消息是一次性的，授权成本高，内部工具不适合
- 小程序内通知无需用户额外授权，触达可靠
- 可与任务列表/个人中心集成，用户主动查看

**通知触发时机**：

| 触发操作 | 通知类型 | 通知对象 | 内容模板 |
|---------|---------|---------|---------|
| 创建任务 | `task_assigned` | 被指派成员 | "你收到新任务：{任务标题}" |
| 任务取消 | `task_cancelled` | 被指派成员 | "任务已取消：{任务标题}" |
| 定时扫描 | `reminder` | 状态为 confirmed 的任务成员 | "任务即将开始：{任务标题}" |
| 自动完结 | `task_completed` | 被指派成员 | "任务已自动完成：{任务标题}" |

**通知数据流**：
```
云函数(createTask/updateTask/scheduleNotify)
    │
    └── 写入 notifications 集合
         │
         ├── 前端 index 页 onShow 时拉取未读通知数
         ├── profile 页"消息中心"查看通知列表
         └── 点击通知跳转到任务详情页
```

**notifications 集合字段**（复用 3.1.6 设计）：
```json
{
  "_id": "string",
  "userId": "string",        // 接收者
  "taskId": "string",         // 关联任务（可选）
  "type": "task_assigned | task_cancelled | reminder | task_completed",
  "content": "string",        // 通知文本
  "isRead": false,
  "createdAt": "timestamp"
}
```

**前端未读红点方案**：
- `index` 页 TabBar 显示未读数量红点（`wx.setTabBarBadge`）
- `profile` 页"消息中心"入口显示未读数
- 进入消息中心后批量标记已读

#### 8.7 图片上传规范
- 使用云存储uploadFile
- 图片压缩后上传（限制2MB）
- 返回cloudID或fileID

#### 8.8 时间处理规范
- 使用dayjs统一处理
- 北京时间（UTC+8）
- 学期定义：春季(2月-6月)、秋季(9月-1月)

#### 8.9 爬虫开发规范 [🆕]
```javascript
// 爬虫频率控制
const CRAWL_LIMIT_HOURS = 24  // 同一任务24小时内最多爬取1次

// 文明爬取
await sleep(1000)  // 礼貌性延迟1秒

// 错误处理
try {
  const html = await axios.get(url, { timeout: 10000 })
} catch (err) {
  return { code: 3, message: '网络繁忙，请稍后重试' }
}
```

#### 8.10 统计报表开发规范 [🆕]
```javascript
// 统计维度
// 按assignedTo字段统计
// 月份聚合：按月分组统计任务数量
// 学期聚合：按学期分组统计任务数量

// wx-charts图表数据格式
lineChartData = {
  categories: ['1月', '2月', '3月'],
  series: [{ name: '参与次数', data: [5, 7, 3] }]
}
```

#### 8.11 新闻匹配算法规范 [🆕]
```javascript
// jieba分词提取关键词
const keywords = jieba.extract(taskTitle, 3)  // 提取前3个关键词

// 加权评分
const titleScore = matchInTitle * 0.6
const contentScore = matchInContent * 0.4
const totalScore = titleScore + contentScore

// 阈值过滤
if (totalScore > 30) { /* 显示 */ }
```

---

> 文档版本: v1.3 | 架构师: 高见远（Gao） | 状态: 架构审查修订完成，待开发
