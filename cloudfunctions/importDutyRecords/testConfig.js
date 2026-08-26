/**
 * importDutyRecords 云函数测试模式配置
 * 控制 debugRole 调试角色信任。当前开发测试期 enabled=true（与 config/test.js 一致）；
 * 部署生产前务必恢复 false（发布红线）。
 */
module.exports = {
  enabled: false,
  allowDebugRoleOverride: true
};
