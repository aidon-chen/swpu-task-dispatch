/**
 * 获取机位列表云函数
 * 所有用户可查看机位列表和详情
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const Response = {
  ok: (data, msg = '成功') => ({ code: 0, data, message: msg }),
  paramError: (msg = '参数错误') => ({ code: 1, data: null, message: msg })
};

exports.main = async (event, context) => {
  const { locationId, tag } = event;

  try {
    const collection = db.collection('locations');

    // 单个机位详情
    if (locationId) {
      try {
        const { data: locations } = await collection.doc(locationId).get();
        return Response.ok({ locations: locations.length ? [locations[0]] : [locations] });
      } catch (e) {
        return Response.ok({ locations: [] });
      }
    }

    // 列表查询
    const query = {};
    if (tag) {
      query.tags = tag;
    }

    const { data: locations } = await collection
      .where(query)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    return Response.ok({ locations });
  } catch (err) {
    console.error('[getLocations] 错误:', err);
    return Response.paramError(err.message || '获取机位失败');
  }
};
