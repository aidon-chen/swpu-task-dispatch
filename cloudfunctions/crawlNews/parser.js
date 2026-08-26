/**
 * 新闻匹配爬虫 —— 纯解析逻辑（无网络、无 cheerio/axios 依赖）
 * ----------------------------------------------------------------------------
 * 从 index.js 抽离，便于在本地 Node 环境直接单测关键词提取、评分、日期解析、
 * URL 拼接与正文本提取，无需真实联网。
 * extractContent 接收由调用方传入的 cheerio `$` 实例，因此本模块保持零外部依赖。
 */

/**
 * 简单中文关键词提取：全词 + 二元词组（避免依赖原生分词模块）
 */
function extractKeywords(text) {
  const raw = text || '';
  const phrases = [];
  // 按常见分隔符切出完整词/短语
  raw.split(/[\s,，。、；;：:（）()【】\[\]""''《》<>|｜\n\r]+/)
    .map(s => s.trim())
    .filter(w => w.length >= 2)
    .forEach(w => phrases.push(w));
  // 中文二元组
  const clean = raw.replace(/[^\u4e00-\u9fa5]/g, '');
  for (let i = 0; i < clean.length - 1; i++) {
    phrases.push(clean.slice(i, i + 2));
  }
  return [...new Set(phrases)];
}

/**
 * 计算单篇文章与关键词的匹配评分（0~1）
 */
function scoreArticle(keywords, title, content) {
  if (!keywords.length) return 0;
  let score = 0;
  const titleLower = (title || '').toLowerCase();
  const contentLower = (content || '').toLowerCase();
  keywords.forEach(k => {
    const kl = k.toLowerCase();
    if (titleLower.includes(kl)) score += 0.6;
    if (contentLower.includes(kl)) score += 0.4;
  });
  // 归一化：每个关键词最多贡献 1.0
  return Math.min(1, score / keywords.length);
}

/**
 * 拼接绝对 URL
 */
function toAbsolute(base, href) {
  try {
    return new URL(href, base).href;
  } catch (e) {
    return href;
  }
}

/**
 * 从详情页提取正文字本
 * @param {Function} $ cheerio 实例（由调用方传入）
 * @param {Object} root cheerio 选择集（通常为 $('body')）
 */
function extractContent($, root) {
  const container = root.find('article, .article, #content, .content, .news-content, .v_news_content').first();
  const $body = container.length ? container : root;
  return $body.find('p, div, span').contents().filter(function () {
    return this.type === 'text';
  }).map(function () {
    return $(this).text().trim();
  }).get().join('\n').slice(0, 4000);
}

/**
 * 尝试从文本中解析发布日期
 */
function parseDate(text) {
  const m = text.match(/(\d{4})[-年.](\d{1,2})[-月.](\d{1,2})/);
  if (m) {
    return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
  }
  return null;
}

module.exports = { extractKeywords, scoreArticle, toAbsolute, extractContent, parseDate };
