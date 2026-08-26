/**
 * generateTestData 云函数测试模式配置
 * generate_users / generate / clean 三动作统一受本开关控制。
 * 当前为开发测试期：enabled=true 便于工具中心实际使用；部署生产前务必恢复 false（发布红线）。
 */
module.exports = {
  enabled: true
};
