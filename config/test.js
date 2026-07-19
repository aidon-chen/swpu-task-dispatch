/**
 * 测试模式开关配置
 * 默认全部关闭，提交前务必保持 enabled: false
 */

module.exports = {
  /** 主开关 */
  enabled: true,

  /** 子功能开关 */
  features: {
    /** 调试角色登录入口（C 功能） */
    debugLogin: true,
    /** 测试密钥复用（A 功能） */
    testKeyMultiUse: true
  },

  /** 是否允许运行时参数覆盖配置文件 */
  allowRuntimeOverride: true
};
