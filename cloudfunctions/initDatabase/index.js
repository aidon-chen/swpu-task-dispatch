/**
 * 数据库初始化云函数
 * 创建项目所需的所有集合和索引
 * 仅在首次部署数据库时运行一次
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

/** 需要创建的集合列表 */
const REQUIRED_COLLECTIONS = [
  'users',        // 用户信息
  'keys',         // 权限密钥
  'tasks',        // 任务
  'user_status',  // 用户状态（出勤/请假等）
  'locations',    // 拍摄机位
  'notifications' // 通知记录
];

exports.main = async (event, context) => {
  const results = { created: [], skipped: [], errors: [] };

  // 先获取已有集合
  let existingCollections = [];
  try {
    const collections = await db.listCollections();
    existingCollections = collections.collections.map(c => c.name);
    console.log('[initDatabase] 已有集合:', existingCollections);
  } catch (err) {
    console.warn('[initDatabase] 无法获取已有集合列表:', err.message);
  }

  for (const name of REQUIRED_COLLECTIONS) {
    if (existingCollections.includes(name)) {
      results.skipped.push(name);
      console.log(`[initDatabase] 集合 "${name}" 已存在，跳过`);
      continue;
    }

    try {
      await db.createCollection(name);
      results.created.push(name);
      console.log(`[initDatabase] 集合 "${name}" 创建成功`);
    } catch (err) {
      // errCode -502005 = 集合已存在（Race condition）
      if (err.errCode === -502005 || err.message.includes('already exists')) {
        results.skipped.push(name);
        console.log(`[initDatabase] 集合 "${name}" 已存在（并发），跳过`);
      } else {
        results.errors.push({ name, message: err.message });
        console.error(`[initDatabase] 集合 "${name}" 创建失败:`, err);
      }
    }
  }

  return {
    code: 0,
    message: '数据库初始化完成',
    data: {
      created: results.created,
      skipped: results.skipped,
      errors: results.errors,
      total: REQUIRED_COLLECTIONS.length
    }
  };
};
