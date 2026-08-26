/**
 * 云函数侧测试模式配置（createLocation）
 *
 * 作用：允许调试角色登录（仅改本地角色、不写数据库 users.role）的用户，
 *       在测试模式下调用创建/编辑/删除机位时，云端信任其传入的 debugRole。
 *
 * 安全边界：
 *   - 仅当本文件 enabled = true 时，云端才接受前端携带的 debugMode/debugRole。
 *   - 正式版部署前必须把 enabled 改回 false。
 */
module.exports = {
  enabled: false,
  allowDebugRoleOverride: true
};
