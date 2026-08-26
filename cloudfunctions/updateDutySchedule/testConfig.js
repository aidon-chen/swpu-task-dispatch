/**
 * updateDutySchedule 云函数测试模式配置
 * 默认关闭，测试时临时开启，部署到生产前务必恢复 false
 * 开启后允许前端在 debugMode=true 时传入 debugRole 用于鉴权（与 createTask/createLocation 一致）
 */

module.exports = {
  /** 是否信任前端传入的调试角色（开发测试期临时开启，发布前复位 false） */
  enabled: true
};
