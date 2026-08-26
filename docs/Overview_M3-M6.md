# 任务派发系统 · M3–M6 实现总览（2026-07-19）

> 基于已部署云函数架构，继续实现剩余功能模块并端到端验证。

## 交付内容

### M3 值班矩阵 ✅
- `cloudfunctions/updateDutySchedule/`（新增）— 批量 upsert `duty_schedule`，权限：本人 / 本部门主任 / 中心主任
- `cloudfunctions/initDatabase/` — 新增 `duty_schedule` 集合
- `cloudfunctions/getDutySchedule/` — 读取 `duty_schedule` 填充 `availability`（前序已改）
- `pages/duty-schedule/*` — 预计算 `matrixRows`，单元格按状态着色（绿/橙/红），主任点击单元格弹 actionSheet 设状态（乐观更新 + 调云函数）

### M4 正式密钥生成 ✅
- `cloudfunctions/generateKey/`（新增）— 仅中心主任，8 位一次性密钥（不含易混淆字符），`testKey:false`
- `pages/key-generate/*`（重写）— 选角色/部门/数量 → 生成 → 点击复制
- `utils/api.js` — `generateKey` 接通

### M5 统计报表 ✅
- `cloudfunctions/getReport/`（新增）— 按指派成员聚合 任务量/完成率/工时；范围=本人/本部门/全员
- `cloudfunctions/exportReport/`（新增）— 复用 `getReport` 再格式化为纯文本，前端复制到剪贴板（单一数据源）
- `pages/statistics/*`（重写）— 移除缺失的 `chart` 组件依赖，改原生条形图 + 明细列表
- `utils/api.js` — `getReport`/`exportReport` 接通

### M6 新闻匹配 ✅
- `cloudfunctions/crawlNews/`（新增）— axios+cheerio 爬取，关键词加权评分（标题60%+正文40%），7 天过滤，写 `news_cache`
- `cloudfunctions/getNewsCache/`（新增）— 读缓存，24h 过期
- `cloudfunctions/initDatabase/` — 新增 `news_cache` 集合
- `pages/web-view/*`（新增）— 承载新闻详情，已注册 `app.json`
- `utils/api.js` — `crawlNews`/`getNewsCache` 接通（原占位 `-2` 已移除）

## 验证结果
- 12 个新建/修改 JS 文件 `node --check` 全绿
- MCP 模拟器连通，所有页面 `recentConsoleErrors: No recent errors`
- 真机/模拟器实测：duty-schedule（矩阵构建）、key-generate（数据+权限）、statistics（渲染）、web-view、news-match 均正常加载

## 你需要手动做的（部署类，MCP 无法部署云函数）
1. 右键部署并云端装依赖 6 个新云函数：`updateDutySchedule`、`generateKey`、`getReport`、`exportReport`、`crawlNews`（需 axios+cheerio）、`getNewsCache`
2. 运行 `initDatabase` 建 `duty_schedule` / `news_cache` 集合
3. 部署前确认 `config/test.js` 与各 `testConfig.js` 的 `enabled=false`（新函数默认已为 false）
4. 爬虫：`crawlNews` 的 `DEFAULT_SOURCE` 改为真实新闻网地址，并在 mp 后台放行「服务器域名」；`web-view` 的 src 域名需配「业务域名」

## 待续（P2）
M7 评价反馈、M8 任务模板、M9 高级搜索、M10 三环境物理隔离（详见架构评审路线）。
