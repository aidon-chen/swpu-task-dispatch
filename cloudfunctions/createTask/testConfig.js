/**
 * 云函数侧测试模式配置（createTask）
 *
 * 作用：允许调试角色登录（仅改本地角色、不写数据库 users.role）的用户，
 *       在测试模式下调用创建任务时，云端信任其传入的 debugRole，
 *       从而绕开“数据库真实角色是 member”导致的权限不足。
 *
 * 安全边界：
 *   - 仅当本文件 enabled = true 时，云端才接受前端携带的 debugMode/debugRole。
 *   - 正式版部署前必须把 enabled 改回 false（正式版本就强制关闭前端测试模式，
 *     即使前端误传 debugMode，云端也会忽略，回退到数据库真实角色）。
 */
module.exports = {
  enabled: true,
  allowDebugRoleOverride: true
};
