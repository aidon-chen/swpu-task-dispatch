/**
 * 环境配置
 * 根据微信小程序的 envVersion 自动切换 dev / test / prod 环境
 *
 * 使用方式:
 *   const { getEnv } = require('../../config/env')
 *   const env = getEnv()
 *   wx.cloud.init({ env: env.cloudEnvId })
 *
 * ⚠️ 修复说明：
 * 原代码三套 cloudEnvId 都是占位符（task-dev-xxxxx 等），导致 wx.cloud.init
 * 传入了不存在的环境，报 Env Not Exists (-501000)。
 * 现统一替换为真实环境 ID：cloud1-d8gdddel1d4b1cea1
 * （后续若新建 test/prod 环境，再把对应值改成各自的环境 ID。）
 */

/** 各环境配置 */
const ENV_CONFIG = {
  dev: {
    name: '开发环境',
    cloudEnvId: 'cloud1-d8gdddel1d4b1cea1',   // ← 真实环境 ID（原 task-dev-xxxxx）
    debug: true,
    logLevel: 'verbose'
  },
  test: {
    name: '测试环境',
    cloudEnvId: 'cloud1-d8gdddel1d4b1cea1',   // ← 真实环境 ID（原 task-test-xxxxx）
    debug: true,
    logLevel: 'info'
  },
  prod: {
    name: '生产环境',
    cloudEnvId: 'cloud1-d8gdddel1d4b1cea1',   // ← 真实环境 ID（原 task-prod-xxxxx）
    debug: false,
    logLevel: 'error'
  }
}

/**
 * 获取当前环境配置
 * 微信 envVersion 对应关系:
 *   develop → 开发版（微信开发者工具）→ dev
 *   trial   → 体验版               → test
 *   release → 正式版               → prod
 *
 * @returns {Object} 当前环境的配置对象
 */
const getEnv = () => {
  let envVersion = 'develop'

  try {
    const accountInfo = wx.getAccountInfoSync()
    envVersion = accountInfo.miniProgram.envVersion
  } catch (e) {
    // getAccountInfoSync 低版本基础库可能不支持，默认 dev
    console.warn('[env] getAccountInfoSync 失败，使用默认 dev 环境', e)
  }

  const envMap = {
    develop: 'dev',
    trial: 'test',
    release: 'prod'
  }

  const envKey = envMap[envVersion] || 'dev'
  const config = ENV_CONFIG[envKey]

  if (config.debug) {
    console.log(`[env] 当前环境: ${config.name} (${envVersion})`)
  }

  return config
}

module.exports = { getEnv, ENV_CONFIG }
