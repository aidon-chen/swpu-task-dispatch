/**
 * 环境配置
 * 根据微信小程序的 envVersion 自动切换 dev / test / prod 环境。
 *
 * 三个环境 ID 请统一在 ./env.ids.js 中维护（单一可编辑入口）。
 *
 * 使用方式:
 *   const { getEnv } = require('../../config/env')
 *   const env = getEnv()
 *   wx.cloud.init({ env: env.cloudEnvId })
 *
 * 本地开发期临时切换环境：
 *   在微信开发者工具的 Storage 面板写入键 td_envOverride，值为
 *   'dev' | 'test' | 'prod'，即可在 develop 工具里临时连到目标环境。
 *   该覆盖仅来自本地 storage，正式包会按 envVersion 自动走对应环境，不会生效。
 */

const ENV_IDS = require('./env.ids.js');

/** 各环境配置 */
const ENV_CONFIG = {
  dev: {
    name: '开发环境',
    cloudEnvId: ENV_IDS.dev,
    debug: true,
    logLevel: 'verbose'
  },
  test: {
    name: '测试环境',
    cloudEnvId: ENV_IDS.test,
    debug: true,
    logLevel: 'info'
  },
  prod: {
    name: '生产环境',
    cloudEnvId: ENV_IDS.prod,
    debug: false,
    logLevel: 'error'
  }
};

/** 微信 envVersion → 内部环境 key 映射 */
const ENV_MAP = {
  develop: 'dev',
  trial: 'test',
  release: 'prod'
};

/**
 * 获取当前环境配置
 *
 * 解析顺序：
 *   1) 微信 envVersion（develop / trial / release）→ 决定基础环境
 *   2) 本地 storage 键 td_envOverride（仅开发者工具本地调试用）→ 临时覆盖
 *
 * @returns {Object} { name, cloudEnvId, debug, logLevel }
 */
const getEnv = () => {
  let envKey = 'dev';

  try {
    const accountInfo = wx.getAccountInfoSync();
    envKey = ENV_MAP[accountInfo.miniProgram.envVersion] || 'dev';
  } catch (e) {
    // getAccountInfoSync 低版本基础库可能不支持，默认 dev
    console.warn('[env] getAccountInfoSync 失败，使用默认 dev 环境', e);
  }

  // 开发期手动覆盖（仅本地 storage，正式包无效）
  try {
    const override = wx.getStorageSync('td_envOverride');
    if (override && ENV_CONFIG[override]) {
      envKey = override;
      if (ENV_CONFIG[override].debug) {
        console.log(`[env] 检测到本地覆盖 td_envOverride=${override}，使用该环境`);
      }
    }
  } catch (e) {
    // ignore
  }

  const config = ENV_CONFIG[envKey];
  if (config.debug) {
    console.log(`[env] 当前环境: ${config.name}`);
  }

  return config;
};

module.exports = { getEnv, ENV_CONFIG, ENV_IDS };
