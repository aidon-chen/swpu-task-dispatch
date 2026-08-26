/**
 * 测试密钥云函数单元测试（Phase 3）
 * 运行方式：node tests/testKeyCloudFunctions.test.js
 */

const assert = require('assert');
const Module = require('module');

// 模拟数据库
let mockDb = {};
let mockCollections = {};

function resetMockDb() {
  mockDb = {};
  mockCollections = {};
}

function getMockCollection(name) {
  if (!mockCollections[name]) {
    mockCollections[name] = {
      docs: {},
      where: function(query) {
        const matched = Object.values(this.docs).filter(doc => {
          for (const key of Object.keys(query)) {
            if (doc[key] !== query[key]) return false;
          }
          return true;
        });
        return {
          get: async () => ({ data: matched }),
          count: async () => ({ total: matched.length })
        };
      },
      doc: function(id) {
        return {
          update: async ({ data }) => {
            if (!this.docs[id]) this.docs[id] = { _id: id };
            for (const key of Object.keys(data)) {
              if (typeof data[key] === 'function') {
                // 简化处理：函数视为 Date
                this.docs[id][key] = new Date();
              } else {
                this.docs[id][key] = data[key];
              }
            }
          },
          get: async () => ({ data: this.docs[id] })
        };
      },
      add: async ({ data }) => {
        const id = 'k' + Math.random().toString(36).slice(2);
        data._id = id;
        mockCollections[name].docs[id] = data;
        return { _id: id };
      }
    };
  }
  return mockCollections[name];
}

const mockSdk = {
  init: () => {},
  DYNAMIC_CURRENT_ENV: 'DYNAMIC_CURRENT_ENV',
  getWXContext: () => ({ OPENID: 'o123' }),
  database: () => ({
    collection: getMockCollection,
    command: {}
  })
};

// Mock require for wx-server-sdk
const originalRequire = Module.prototype.require;
Module.prototype.require = function(id) {
  if (id === 'wx-server-sdk') {
    return mockSdk;
  }
  return originalRequire.apply(this, arguments);
};

async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
  } catch (err) {
    console.error(`❌ ${name}: ${err.message}`);
    process.exitCode = 1;
  }
}

// 设置测试模式开关：先关闭，测试需要时再开启
function setVerifyKeyTestMode(enabled) {
  const cfg = require('../cloudfunctions/verifyKey/testConfig.js');
  cfg.enabled = enabled;
}

function setGenerateTestKeyTestMode(enabled) {
  const cfg = require('../cloudfunctions/generateTestKey/testConfig.js');
  cfg.enabled = enabled;
}

function loadVerifyKey() {
  const p = require.resolve('../cloudfunctions/verifyKey/index.js');
  delete require.cache[p];
  return require(p);
}

function loadGenerateTestKey() {
  const p = require.resolve('../cloudfunctions/generateTestKey/index.js');
  delete require.cache[p];
  return require(p);
}

// 预加载 config（确保缓存存在）
require('../cloudfunctions/verifyKey/testConfig.js');
require('../cloudfunctions/generateTestKey/testConfig.js');

async function runTests() {
  // TC-14: 正式密钥已使用时报错
  await test('TC-14: 正式密钥已使用时报错', async () => {
    resetMockDb();
    setVerifyKeyTestMode(false);
    const verifyKey = loadVerifyKey();

    const keyId = 'usedkey';
    getMockCollection('keys').docs[keyId] = { _id: keyId, key: 'USED-KEY', role: 'photo_director', isUsed: true };
    getMockCollection('users').docs['u1'] = { _id: 'u1', openid: 'o123', role: 'member' };

    const res = await verifyKey.main({ key: 'USED-KEY' }, {});
    assert.strictEqual(res.code, 1, '应返回参数错误');
    assert.ok(res.message.includes('已被使用'), '错误信息应包含已被使用');
  });

  // TC-15: 正式密钥验证成功并标记已使用
  await test('TC-15: 正式密钥验证成功并标记已使用', async () => {
    resetMockDb();
    setVerifyKeyTestMode(false);
    const verifyKey = loadVerifyKey();

    const keyId = 'prodkey';
    getMockCollection('keys').docs[keyId] = { _id: keyId, key: 'PROD-KEY', role: 'photo_director', isUsed: false };
    getMockCollection('users').docs['u1'] = { _id: 'u1', openid: 'o123', role: 'member' };

    const res = await verifyKey.main({ key: 'PROD-KEY' }, {});
    assert.strictEqual(res.code, 0, '应成功');
    assert.strictEqual(res.data.role, 'photo_director', '角色应升级');
    assert.strictEqual(res.data.isTestKey, false, '不是测试密钥');
    assert.strictEqual(getMockCollection('keys').docs[keyId].isUsed, true, '正式密钥应标记为已使用');
    assert.strictEqual(getMockCollection('users').docs['u1'].role, 'photo_director', '用户角色应更新');
  });

  // TC-16: 测试密钥在后端测试模式关闭时拒绝
  await test('TC-16: 测试密钥在后端测试模式关闭时拒绝', async () => {
    resetMockDb();
    setVerifyKeyTestMode(false);
    const verifyKey = loadVerifyKey();

    getMockCollection('keys').docs['tk1'] = { _id: 'tk1', key: 'DEV-KEY', role: 'center_director', testKey: true, isUsed: false };
    getMockCollection('users').docs['u1'] = { _id: 'u1', openid: 'o123', role: 'member' };

    const res = await verifyKey.main({ key: 'DEV-KEY' }, {});
    assert.strictEqual(res.code, 2, '应返回权限不足');
    assert.ok(res.message.includes('测试模式'), '错误信息应包含测试模式');
  });

  // TC-17: 测试密钥验证成功但不标记已使用
  await test('TC-17: 测试密钥验证成功且不标记已使用', async () => {
    resetMockDb();
    setVerifyKeyTestMode(true);
    const verifyKey = loadVerifyKey();

    getMockCollection('keys').docs['tk1'] = { _id: 'tk1', key: 'DEV-KEY', role: 'center_director', testKey: true, isUsed: false };
    getMockCollection('users').docs['u1'] = { _id: 'u1', openid: 'o123', role: 'member' };

    const res = await verifyKey.main({ key: 'DEV-KEY' }, {});
    assert.strictEqual(res.code, 0, '应成功');
    assert.strictEqual(res.data.isTestKey, true, '应标记为测试密钥');
    assert.strictEqual(getMockCollection('keys').docs['tk1'].isUsed, false, '测试密钥不应标记为已使用');
    assert.strictEqual(getMockCollection('users').docs['u1'].role, 'center_director', '用户角色应更新');
  });

  // TC-18: 测试密钥可复用（同一用户降级后再次使用）
  await test('TC-18: 测试密钥可复用', async () => {
    resetMockDb();
    setVerifyKeyTestMode(true);
    const verifyKey = loadVerifyKey();

    getMockCollection('keys').docs['tk1'] = { _id: 'tk1', key: 'DEV-KEY', role: 'photo_director', testKey: true, isUsed: false };
    getMockCollection('users').docs['u1'] = { _id: 'u1', openid: 'o123', role: 'member' };

    const res1 = await verifyKey.main({ key: 'DEV-KEY' }, {});
    assert.strictEqual(res1.code, 0, '第一次验证应成功');
    assert.strictEqual(getMockCollection('keys').docs['tk1'].isUsed, false, 'isUsed 应保持 false');

    // 模拟用户被降级后再次使用同一测试密钥
    getMockCollection('users').docs['u1'].role = 'member';
    const res2 = await verifyKey.main({ key: 'DEV-KEY' }, {});
    assert.strictEqual(res2.code, 0, '第二次验证应成功');
    assert.strictEqual(getMockCollection('keys').docs['tk1'].isUsed, false, 'isUsed 仍应保持 false');
  });

  // TC-19: 生成测试密钥在关闭时拒绝
  await test('TC-19: 生成测试密钥在关闭时拒绝', async () => {
    resetMockDb();
    setGenerateTestKeyTestMode(false);
    const generateTestKey = loadGenerateTestKey();

    getMockCollection('users').docs['u1'] = { _id: 'u1', openid: 'o123', role: 'member' };

    const res = await generateTestKey.main({ role: 'photo_director' }, {});
    assert.strictEqual(res.code, 2, '应返回权限不足');
  });

  // TC-20: 生成测试密钥成功
  await test('TC-20: 生成测试密钥成功', async () => {
    resetMockDb();
    setGenerateTestKeyTestMode(true);
    const generateTestKey = loadGenerateTestKey();

    getMockCollection('users').docs['u1'] = { _id: 'u1', openid: 'o123', role: 'member' };

    const res = await generateTestKey.main({ role: 'photo_director', department: 'photography' }, {});
    assert.strictEqual(res.code, 0, '应成功');
    assert.ok(res.data.key.startsWith('DEV-photo_director-'), '密钥应以 DEV-photo_director- 开头');
    assert.strictEqual(res.data.role, 'photo_director', '角色正确');
    assert.strictEqual(res.data.department, 'photography', '部门正确');

    const keys = Object.values(getMockCollection('keys').docs);
    assert.strictEqual(keys.length, 1, '应写入一条密钥');
    assert.strictEqual(keys[0].testKey, true, '应标记为测试密钥');
    assert.strictEqual(keys[0].isUsed, false, 'isUsed 应为 false');
  });
}

runTests().then(() => {
  // 恢复 require
  Module.prototype.require = originalRequire;
  console.log('\nPhase 3 测试密钥云函数测试完成');
}).catch(err => {
  console.error('测试运行失败:', err);
  Module.prototype.require = originalRequire;
  process.exit(1);
});
