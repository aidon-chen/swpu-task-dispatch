/**
 * 测试模式开关模块单元测试（Phase 1）
 * 运行方式：node tests/testMode.test.js
 */

const assert = require('assert');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '../config/test.js');

// Mock wx global
function setupWx(envVersion = 'develop') {
  global.wx = {
    getAccountInfoSync: () => ({ miniProgram: { envVersion } })
  };
}

// Mock getApp global
function setupApp(query = {}) {
  global.getApp = () => ({
    globalData: { launchOptions: { query } }
  });
}

// Simple async test runner
async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
  } catch (err) {
    console.error(`❌ ${name}: ${err.message}`);
    process.exitCode = 1;
  }
}

// Reset modules and load fresh testMode each test
function loadTestMode() {
  const testModePath = path.join(__dirname, '../utils/testMode.js');
  delete require.cache[require.resolve(testModePath)];
  // 不删除 config 缓存，保证测试中对 config 的内存修改能被 testMode 读取
  return require(testModePath);
}

function setConfig(enabled, features = {}) {
  const config = require(CONFIG_PATH);
  config.enabled = enabled;
  if (features.debugLogin !== undefined) config.features.debugLogin = features.debugLogin;
  if (features.testKeyMultiUse !== undefined) config.features.testKeyMultiUse = features.testKeyMultiUse;
}

function resetConfig() {
  setConfig(false, { debugLogin: false, testKeyMultiUse: false });
}

function cleanup() {
  resetConfig();
  setupWx('develop');
  setupApp();
}

setupWx('develop');
setupApp();

async function runTests() {
  // TC-01: 默认状态测试模式关闭
  await test('TC-01: 默认状态测试模式关闭', () => {
    resetConfig();
    const testMode = loadTestMode();
    const status = testMode.getStatus();
    assert.strictEqual(status.enabled, false, '主开关应关闭');
    assert.strictEqual(status.features.debugLogin, false, 'debugLogin 应关闭');
    assert.strictEqual(status.features.testKeyMultiUse, false, 'testKeyMultiUse 应关闭');
  });

  // TC-02: 运行时参数 debug=1 开启测试模式
  await test('TC-02: 运行时参数 debug=1 开启测试模式', () => {
    resetConfig();
    setupApp({ debug: '1' });
    const testMode = loadTestMode();
    const status = testMode.getStatus();
    assert.strictEqual(status.enabled, true, '主开关应开启');
    assert.strictEqual(status.runtimeOverride, true, 'runtimeOverride 应为 true');
  });

  // TC-03: 正式版强制关闭测试模式
  await test('TC-03: 正式版强制关闭测试模式', () => {
    resetConfig();
    setupWx('release');
    setupApp({ debug: '1' });
    const testMode = loadTestMode();
    const status = testMode.getStatus();
    assert.strictEqual(status.enabled, false, '正式版主开关应强制关闭');
    assert.strictEqual(status.reason, 'release_env_forced_off', '应返回强制关闭原因');
  });

  // TC-04: 子功能开关受主开关控制
  await test('TC-04: 子功能开关受主开关控制', () => {
    resetConfig();
    setupWx('develop');
    setupApp();
    setConfig(true, { debugLogin: true, testKeyMultiUse: false });
    const testMode = loadTestMode();
    assert.strictEqual(testMode.isFeatureOn('debugLogin'), true, 'debugLogin 应开启');
    assert.strictEqual(testMode.isFeatureOn('testKeyMultiUse'), false, 'testKeyMultiUse 应关闭');
  });

  // TC-05: 主开关关闭时子功能强制关闭
  await test('TC-05: 主开关关闭时子功能强制关闭', () => {
    resetConfig();
    setupWx('develop');
    setupApp();
    setConfig(false, { debugLogin: true, testKeyMultiUse: true });
    const testMode = loadTestMode();
    assert.strictEqual(testMode.isFeatureOn('debugLogin'), false, '主开关关闭时 debugLogin 应关闭');
    assert.strictEqual(testMode.isFeatureOn('testKeyMultiUse'), false, '主开关关闭时 testKeyMultiUse 应关闭');
  });
}

runTests().then(() => {
  cleanup();
  console.log('\nPhase 1 测试模式开关模块测试完成');
}).catch(err => {
  console.error('测试运行失败:', err);
  cleanup();
  process.exit(1);
});
