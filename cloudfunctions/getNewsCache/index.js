/**
 * 获取新闻匹配缓存云函数
 * 按 taskId 读取 news_cache 集合，过期（>24h）则返回空
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

const Response = {
  ok: (data, message = '成功') => ({ code: 0, data, message }),
  paramError: (message = '参数错误') => ({ code: 1, data: null, message })
};

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const taskId = event.taskId || 'manual';

  if (!OPENID) return Response.paramError('未获取到用户身份');

  try {
    const { data: cached } = await db.collection('news_cache')
      .where({ taskId })
      .limit(1)
      .get();

    if (cached.length === 0) {
      return Response.ok({ newsList: [], cachedAt: null }, '无缓存');
    }

    const record = cached[0];
    // 过期判断（24h）
    const cachedAt = record.cachedAt instanceof Date ? record.cachedAt : new Date(record.cachedAt);
    const hours = (Date.now() - cachedAt.getTime()) / (1000 * 60 * 60);
    if (hours > 24) {
      return Response.ok({ newsList: [], cachedAt: null, expired: true }, '缓存已过期');
    }

    return Response.ok({
      newsList: record.newsList || [],
      cachedAt: cachedAt.toISOString(),
      keyword: record.keyword || ''
    }, '读取缓存成功');
  } catch (err) {
    console.error('[getNewsCache] 错误:', err);
    return Response.paramError(err.message || '读取缓存失败');
  }
};
