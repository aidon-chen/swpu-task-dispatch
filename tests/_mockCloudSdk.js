/**
 * 云函数单元测试公共 Mock：用内存库替代 wx-server-sdk
 * ----------------------------------------------------------------------------
 * 让云函数可在本地 Node 环境直接 require 并测试，无需真实云环境。
 * 用法（在每个云函数测试文件顶部）：
 *   const { installMock, getMockDb, seed, getCallLog, clearCallLog } = require('./_mockCloudSdk.js');
 *   installMock();
 *   const createTask = require('../cloudfunctions/createTask/index.js').main;
 *
 * 支持：collection 的 where(含 _.neq/_.gte/_.lte/_.lt/_.in/_.eq、链式 .and()、$or)/
 *       orderBy/limit/skip/field/count/get/add/doc().get/update/remove，
 *       db.RegExp 关键词匹配，
 *       cloud.getWXContext()、cloud.callFunction()（记录调用日志，可断言跨函数调用）。
 */

const Module = require('module');
const path = require('path');

let installed = false;
const callLog = [];

/** 可覆盖的微信上下文（默认带 OPENID，便于测试「缺失身份」分支） */
let wxContext = { OPENID: 'test-openid', APPID: 'appid', ENV: 'test-env' };
function setWXContext(ctx) {
  wxContext = ctx || { OPENID: 'test-openid', APPID: 'appid', ENV: 'test-env' };
}

/**
 * 假 HTTP 响应注册表（供 crawlNews 等依赖 axios 的函数做离线单测）
 * key 为完整 URL，value 为返回的 HTML 字符串；若 value 为 Error 实例则 axios.get 抛错。
 */
let fakeHttp = {};
function setFakeHttp(map) {
  fakeHttp = map || {};
}

/** 单条命令求值（__op 形式） */
function matchCmd(val, cmd) {
  // 日期型命令：将待比较值归一化为时间戳（模拟云库 Date 比较语义）
  let v = val;
  if (cmd.value instanceof Date) {
    v = (val instanceof Date) ? val.getTime() : new Date(val).getTime();
  }
  switch (cmd.__op) {
    case 'neq': return val !== cmd.value;
    case 'gte': return v >= cmd.value.getTime();
    case 'lte': return v <= cmd.value.getTime();
    case 'lt': return v < cmd.value.getTime();
    case 'in': return Array.isArray(cmd.value) && cmd.value.includes(val);
    case 'eq': return val === cmd.value;
    default: return false;
  }
}

/** 过滤器求值，支持 $or 与命令对象/正则 */
function matchDoc(doc, filter) {
  for (const [k, v] of Object.entries(filter)) {
    if (k === '$or') {
      if (!v.some((sub) => matchDoc(doc, sub))) return false;
      continue;
    }
    if (v && typeof v === 'object') {
      if (v.__and) {
        if (!v.__and.every((sub) => matchCmd(doc[k], sub))) return false;
        continue;
      }
      if (v.__op) {
        if (!matchCmd(doc[k], v)) return false;
        continue;
      }
      if (v.__regexp) {
        const re = new RegExp(v.__regexp, v.__options || '');
        if (!re.test(String(doc[k]))) return false;
        continue;
      }
      // 普通嵌套对象：退化为深比较
      if (JSON.stringify(doc[k]) !== JSON.stringify(v)) return false;
      continue;
    }
    if (doc[k] !== v) return false;
  }
  return true;
}

/** 投影（inclusion 模式，field({a:true,b:true})） */
function project(doc, fields) {
  const out = { _id: doc._id };
  for (const key of Object.keys(fields)) {
    if (fields[key] === true) out[key] = doc[key];
  }
  return out;
}

function makeCollection(name, db) {
  const c = {
    name,
    _filter: null,
    _orderBy: null,
    _limit: null,
    _skip: null,
    _field: null,
    where(f) { c._filter = f; return c; },
    orderBy(f, dir) { c._orderBy = { field: f, dir }; return c; },
    limit(n) { c._limit = n; return c; },
    skip(n) { c._skip = n; return c; },
    field(f) { c._field = f; return c; },
    async count() {
      let docs = (db._collections[name] || []).slice();
      if (c._filter) docs = docs.filter((d) => matchDoc(d, c._filter));
      c._filter = null;
      return { total: docs.length };
    },
    async get() {
      let docs = (db._collections[name] || []).slice();
      if (c._filter) docs = docs.filter((d) => matchDoc(d, c._filter));
      c._filter = null;
      if (c._orderBy) {
        const { field, dir } = c._orderBy;
        docs.sort((a, b) => (dir === 'desc'
          ? (a[field] < b[field] ? 1 : a[field] > b[field] ? -1 : 0)
          : (a[field] > b[field] ? 1 : a[field] < b[field] ? -1 : 0)));
        c._orderBy = null;
      }
      if (c._skip != null) { docs = docs.slice(c._skip); c._skip = null; }
      if (c._limit != null) { docs = docs.slice(0, c._limit); c._limit = null; }
      if (c._field) { docs = docs.map((d) => project(d, c._field)); c._field = null; }
      return { data: docs.map((d) => structuredClone(d)) };
    },
    async add({ data }) {
      // 支持批量插入（真实 CloudBase 传数组一次可插多条），单条也兼容
      const list = Array.isArray(data) ? data : [data];
      const ids = list.map((d) => {
        const doc = { ...d, _id: 'id_' + Math.random().toString(36).slice(2, 9) };
        db._collections[name] = db._collections[name] || [];
        db._collections[name].push(doc);
        return doc._id;
      });
      return { _id: ids[0], ids };
    },
    async update({ data }) {
      let docs = (db._collections[name] || []).slice();
      if (c._filter) docs = docs.filter((d) => matchDoc(d, c._filter));
      c._filter = null;
      let updated = 0;
      for (const d of docs) { Object.assign(d, data); updated++; }
      return { stats: { updated } };
    },
    doc(id) {
      return {
        async get() {
          const d = (db._collections[name] || []).find((x) => x._id === id);
          return { data: d ? structuredClone(d) : null };
        },
        async update({ data }) {
          const d = (db._collections[name] || []).find((x) => x._id === id);
          if (d) Object.assign(d, data);
          return { stats: { updated: d ? 1 : 0 } };
        },
        async remove() {
          db._collections[name] = (db._collections[name] || []).filter((x) => x._id !== id);
          return { stats: { removed: 1 } };
        }
      };
    }
  };
  return c;
}

function makeCmd(op, value) {
  const cmd = { __op: op, value };
  cmd.and = (other) => {
    const combined = { __and: [cmd, other] };
    combined.and = (c) => { combined.__and.push(c); return combined; };
    return combined;
  };
  return cmd;
}

function makeMockDb() {
  const db = { _collections: {} };
  db.collection = (name) => makeCollection(name, db);
  db.command = {
    neq: (v) => makeCmd('neq', v),
    gte: (v) => makeCmd('gte', v),
    lte: (v) => makeCmd('lte', v),
    lt: (v) => makeCmd('lt', v),
    in: (v) => makeCmd('in', v),
    eq: (v) => makeCmd('eq', v)
  };
  db.RegExp = (opts) => ({ __regexp: opts.regexp, __options: opts.options });
  db.serverDate = () => new Date();
  db.listCollections = () => ({ collections: Object.keys(db._collections).map((name) => ({ name })) });
  db.createCollection = (name) => { if (!db._collections[name]) db._collections[name] = []; return {}; };
  return db;
}

const db = makeMockDb();

const mockCloud = {
  init() {},
  DYNAMIC_CURRENT_ENV: 'test-env',
  database: () => db,
  getWXContext: () => wxContext,
  serverDate: () => new Date(),
  callFunction: async (opts) => {
    callLog.push(opts);
    if (opts.name === 'sendNotification') {
      const ids = (opts.data && opts.data.userIds) || [];
      return { result: { code: 0, data: { written: Array.isArray(ids) ? ids.length : 1 } } };
    }
    if (opts.name === 'login') {
      return { result: { code: 0, data: { user: { _id: 'u-test', openid: 'test-openid', name: 't', role: 'member', department: '' } } } };
    }
    if (opts.name === 'getReport') {
      // 复用真实 getReport 云函数逻辑，保证 exportReport 测试拿到真实统计结果
      try {
        const getReport = require(path.join(__dirname, '../cloudfunctions/getReport/index.js')).main;
        const res = await getReport(opts.data || {}, {});
        return { result: res };
      } catch (e) {
        return { result: { code: -1, data: null, message: e.message } };
      }
    }
    return { result: { code: 0, data: {} } };
  }
};

function installMock() {
  if (installed) return;
  const orig = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'wx-server-sdk') return mockCloud;
    if (request === 'axios') {
      return {
        get: async (url) => {
          const v = fakeHttp[url];
          if (v instanceof Error) throw v;
          return { data: v !== undefined ? v : '' };
        }
      };
    }
    return orig.apply(this, arguments);
  };
  installed = true;
}

function seed(collections) {
  db._collections = collections || {};
}

function getMockDb() {
  return db;
}

function getCallLog() {
  return callLog;
}

function clearCallLog() {
  callLog.length = 0;
}

module.exports = { installMock, seed, getMockDb, getCallLog, clearCallLog, matchCmd, setFakeHttp, setWXContext };
