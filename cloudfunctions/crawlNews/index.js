/**
 * 新闻匹配爬虫云函数
 * 爬取学校新闻网列表页 + 详情页，使用关键词加权评分（标题 60% + 正文 40%）
 * 过滤 7 天内发布、与任务相关的报道，结果写入 news_cache（24h 有效）
 *
 * 依赖：axios、cheerio（在云函数目录 npm install 后部署）
 * 注意：目标站点需在微信公众平台「服务器域名」中放行，且云函数需具备外网访问能力
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const axios = require('axios');
const cheerio = require('cheerio');
const { extractKeywords, scoreArticle, toAbsolute, extractContent, parseDate } = require('./parser');

const Response = {
  ok: (data, message = '成功') => ({ code: 0, data, message }),
  paramError: (message = '参数错误') => ({ code: 1, data: null, message }),
  notFound: (message = '数据不存在') => ({ code: 3, data: null, message })
};

/** 默认新闻源（可在调用时通过 sourceUrl 覆盖） */
const DEFAULT_SOURCE = 'https://news.swpu.edu.cn/';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

/**
 * 抓取并匹配
 */
async function doCrawl(sourceUrl, keywords, refTime) {
  const listHtml = await axios.get(sourceUrl, {
    timeout: 8000,
    headers: { 'User-Agent': UA }
  });
  const $ = cheerio.load(listHtml.data);

  // 收集列表中的文章链接
  const candidates = [];
  const seen = new Set();
  $('a').each((i, el) => {
    const $el = $(el);
    const href = $el.attr('href');
    const title = $el.text().trim();
    if (!href || title.length < 6 || title.length > 40) return;
    if (/登录|注册|更多|more|首页|后台|管理/i.test(title)) return;
    const abs = toAbsolute(sourceUrl, href);
    if (seen.has(abs)) return;
    seen.add(abs);
    candidates.push({ title, url: abs });
  });

  // 逐篇抓取详情并评分（控制数量，避免过慢）
  const results = [];
  const top = candidates.slice(0, 20);
  for (const c of top) {
    try {
      const detail = await axios.get(c.url, { timeout: 6000, headers: { 'User-Agent': UA } });
      const $d = cheerio.load(detail.data);
      const content = extractContent($d, $d('body'));
      const score = scoreArticle(keywords, c.title, content);

      // 日期过滤（7 天）
      const pub = parseDate(content) || parseDate(c.title);
      if (pub) {
        const days = (refTime - pub.getTime()) / (1000 * 60 * 60 * 24);
        if (days > 7 || days < -1) continue; // 超过 7 天或未来，跳过
      }

      if (score > 0) {
        results.push({
          title: c.title,
          url: c.url,
          matchScore: Math.round(score * 100) / 100,
          publishDate: pub ? pub.toISOString().slice(0, 10) : '',
          summary: content.slice(0, 80)
        });
      }
    } catch (e) {
      // 单篇失败不影响整体
      console.warn('[crawlNews] 详情抓取失败:', c.url, e.message);
    }
  }

  results.sort((a, b) => b.matchScore - a.matchScore);
  return results.slice(0, 20);
}

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return Response.paramError('未获取到用户身份');

  const keyword = event.keyword || event.taskTitle || (Array.isArray(event.keywords) ? event.keywords.join(' ') : '');
  const taskId = event.taskId || 'manual';
  const sourceUrl = event.sourceUrl || DEFAULT_SOURCE;
  const refTime = event.time ? new Date(event.time).getTime() : Date.now();

  if (!keyword) {
    return Response.paramError('缺少匹配关键词');
  }

  const keywords = extractKeywords(keyword);

  try {
    let newsList = [];
    let crawled = false;
    try {
      newsList = await doCrawl(sourceUrl, keywords, refTime);
      crawled = true;
    } catch (e) {
      console.error('[crawlNews] 抓取失败:', e.message);
      // 抓取异常时尝试返回已有缓存，保证前端不空白崩溃
      const { data: cached } = await db.collection('news_cache')
        .where({ taskId })
        .limit(1)
        .get();
      if (cached.length > 0) {
        return Response.ok({ newsList: cached[0].newsList, fromCache: true, degraded: true },
          '抓取失败，已返回缓存');
      }
      return Response.paramError('新闻抓取失败：目标站点不可达或网络受限');
    }

    // 写入缓存（24h）
    const expireAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const { data: existing } = await db.collection('news_cache')
      .where({ taskId })
      .limit(1)
      .get();
    if (existing.length > 0) {
      await db.collection('news_cache').doc(existing[0]._id).update({
        data: { newsList, keyword, cachedAt: new Date(), expireAt }
      });
    } else {
      await db.collection('news_cache').add({
        data: { taskId, keyword, newsList, cachedAt: new Date(), expireAt }
      });
    }

    return Response.ok({ newsList, fromCache: false, crawled }, `匹配到 ${newsList.length} 条新闻`);
  } catch (err) {
    console.error('[crawlNews] 错误:', err);
    return Response.paramError(err.message || '新闻匹配失败');
  }
};
