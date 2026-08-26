/**
 * 调试角色登录单元测试（Phase 2）
 * 运行方式：node tests/debugLogin.test.js
 */

const assert = require('assert');

const saved = {};

// Mock wx global
global.wx = {
  getStorageSync: (key) => saved[key] || '',
  setStorageSync: (key, value) => { saved[key] = value; },
  removeStorageSync: (key) => { delete saved[key]; },
  getStorageInfoSync: () => ({ keys: Object.keys(saved) }),
  showToast: () => {},
  switchTab: () => {},
  getAccountInfoSync: () => ({ miniProgram: { envVersion: 'develop' } }),
  cloud: {
    callFunction: async () => ({
      result: {
        code: 0,
        data: { user: { _id: 'u1', openid: 'o1', name: '测试', role: 'member', department: '' } }
      }
    })
  }
};

// Mock getApp
global.getApp = () => ({
  globalData: { launchOptions: { query: {} }, userInfo: null, isLoggedIn: false, openid: '' }
});

// Mock Page to capture config
let pageConfig = null;
global.Page = (cfg) => { pageConfig = cfg; };

// Enable test mode before loading login page
const config = require('../config/test.js');
config.enabled = true;
config.features.debugLogin = true;
config.features.testKeyMultiUse = false;
config.allowRuntimeOverride = true;

require('../pages/login/login.js');

async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
  } catch (err) {
    console.error(`❌ ${name}: ${err.message}`);
    process.exitCode = 1;
  }
}

async function runTests() {
  // TC-10: 登录页数据包含调试角色列表
  await test('TC-10: 登录页数据包含调试角色列表', () => {
    assert.ok(pageConfig, 'Page 配置应被捕获');
    assert.strictEqual(pageConfig.data.debugRoles.length, 3, '应有 3 个调试角色');
    assert.strictEqual(pageConfig.data.debugRoles[0].value, 'photo_director', '第一个角色是摄影部主任');
    assert.strictEqual(pageConfig.data.debugRoles[1].value, 'video_director', '第二个角色是视频部主任');
    assert.strictEqual(pageConfig.data.debugRoles[2].value, 'center_director', '第三个角色是视觉中心主任');
  });

  // TC-11: onLoad 在测试模式下显示调试入口
  await test('TC-11: onLoad 在测试模式下显示调试入口', () => {
    const mockThis = {
      data: { ...pageConfig.data },
      setData: function(obj) { Object.assign(this.data, obj); }
    };
    pageConfig.onLoad.call(mockThis, {});
    assert.strictEqual(mockThis.data.isTestMode, true, 'isTestMode 应为 true');
    assert.strictEqual(mockThis.data.testModeStatus.enabled, true, 'testModeStatus.enabled 应为 true');
  });

  // TC-12: 选择调试角色更新索引
  await test('TC-12: 选择调试角色更新索引', () => {
    const mockThis = {
      data: { ...pageConfig.data },
      setData: function(obj) { Object.assign(this.data, obj); }
    };
    pageConfig.onSelectDebugRole.call(mockThis, { detail: { value: '2' } });
    assert.strictEqual(mockThis.data.selectedDebugRole, 2, '应选中索引 2（center_director）');
  });

  // TC-13: 调试登录仅修改本地角色，不调用正式密钥验证
  await test('TC-13: 调试登录本地修改角色', async () => {
    const mockThis = {
      data: { ...pageConfig.data, selectedDebugRole: 2 },
      setData: function(obj) { Object.assign(this.data, obj); }
    };
    await pageConfig.onDebugLogin.call(mockThis);

    // 读取本地 storage 中的用户信息
    const userInfo = JSON.parse(saved['td_userInfo'] || '{}');
    assert.strictEqual(userInfo.role, 'center_director', '本地用户角色应为 center_director');
    assert.strictEqual(userInfo._id, 'u1', '用户 _id 应保留');
  });
}

runTests().then(() => {
  console.log('\nPhase 2 调试角色登录测试完成');
}).catch(err => {
  console.error('测试运行失败:', err);
  process.exit(1);
});
