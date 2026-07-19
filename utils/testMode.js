/**
 * 测试模式开关工具
 * 提供统一的测试模式状态查询与权限判断
 */

const TEST_CONFIG = require('../config/test.js');

/** 角色等级映射 */
const ROLE_LEVEL = {
  member: 1,
  photo_director: 2,
  video_director: 2,
  center_director: 3
};

/**
 * 获取当前小程序环境版本
 * @returns {string} develop / trial / release / unknown
 */
function getEnvVersion() {
  try {
    const accountInfo = wx.getAccountInfoSync();
    return accountInfo.miniProgram.envVersion || 'unknown';
  } catch (err) {
    console.warn('[testMode] 获取环境版本失败:', err);
    return 'unknown';
  }
}

/**
 * 是否处于正式版环境
 * 正式版强制关闭测试模式
 * @returns {boolean}
 */
function isReleaseEnv() {
  return getEnvVersion() === 'release';
}

/**
 * 获取运行时启动参数
 * @returns {Object}
 */
function getLaunchQuery() {
  try {
    const app = getApp();
    if (app && app.globalData && app.globalData.launchOptions) {
      return app.globalData.launchOptions.query || {};
    }
  } catch (err) {
    // getApp 可能尚未初始化
  }
  return {};
}

/**
 * 判断运行时参数是否要求开启测试模式
 * @returns {boolean}
 */
function isRuntimeOverrideEnabled() {
  if (!TEST_CONFIG.allowRuntimeOverride) {
    return false;
  }
  const query = getLaunchQuery();
  return query.debug === '1' || query.debug === 'true' || query.debug === true;
}

/**
 * 获取完整测试模式状态
 * 优先级：正式版环境 > 运行时参数 > 配置文件
 * @returns {Object}
 */
function getStatus() {
  // 正式版强制关闭
  if (isReleaseEnv()) {
    return {
      enabled: false,
      envVersion: getEnvVersion(),
      features: { debugLogin: false, testKeyMultiUse: false },
      reason: 'release_env_forced_off'
    };
  }

  const runtimeEnabled = isRuntimeOverrideEnabled();
  const enabled = runtimeEnabled || TEST_CONFIG.enabled;

  const features = {};
  for (const key of Object.keys(TEST_CONFIG.features)) {
    features[key] = enabled && TEST_CONFIG.features[key];
  }

  return {
    enabled,
    envVersion: getEnvVersion(),
    features,
    runtimeOverride: runtimeEnabled,
    config: TEST_CONFIG
  };
}

/**
 * 测试模式是否开启
 * @returns {boolean}
 */
function isEnabled() {
  return getStatus().enabled;
}

/**
 * 指定子功能是否开启
 * @param {string} featureName - 功能名，如 debugLogin / testKeyMultiUse
 * @returns {boolean}
 */
function isFeatureOn(featureName) {
  const status = getStatus();
  return status.enabled && !!status.features[featureName];
}

/**
 * 获取角色等级
 * @param {string} role
 * @returns {number}
 */
function getRoleLevel(role) {
  return ROLE_LEVEL[role] || 0;
}

/**
 * 判断角色 A 是否有权限操作角色 B 的数据
 * 当前等级 >= 目标等级 时，认为权限足够（但 verifyKey 中需 < 目标等级）
 * @param {string} currentRole
 * @param {string} targetRole
 * @returns {boolean}
 */
function hasRolePermission(currentRole, targetRole) {
  return getRoleLevel(currentRole) >= getRoleLevel(targetRole);
}

module.exports = {
  getStatus,
  isEnabled,
  isFeatureOn,
  getRoleLevel,
  hasRolePermission,
  ROLE_LEVEL
};
