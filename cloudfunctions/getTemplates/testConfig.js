/**
 * 云函数侧测试模式配置（getTemplates）
 *
 * 与 createTask 保持一致：允许调试角色登录用户在测试模式下查看模板，
 * 便于端到端测试“从模板创建”流程。
 *
 * 安全边界：
 *   - 仅当本文件 enabled = true 时，云端才接受前端携带的 debugMode/debugRole。
 *   - 正式版部署前必须把 enabled 改回 false。
 */
module.exports = {
  enabled: false,
  allowDebugRoleOverride: true
};
