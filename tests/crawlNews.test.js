/**
 * crawlNews 云函数单元测试
 * 运行：node tests/crawlNews.test.js
 * 覆盖：
 *  - 纯解析逻辑（extractKeywords / scoreArticle / parseDate / toAbsolute / extractContent）离线单测
 *  - main 入参校验（缺失 OPENID / 缺失关键词）
 *  - main 端到端抓取（axios 桩 + 真实 cheerio 解析假 HTML，写入 news_cache）
 *  - main 抓取失败时回退到已有缓存
 * 说明：不真实联网。axios 由 _mockCloudSdk 桩接管，返回可控假 HTML；cheerio 使用真实包解析。
 */
const assert = require('assert');
const cheerio = require('cheerio');
const {
  installMock, getMockDb, seed, setFakeHttp, setWXContext
} = require('./_mockCloudSdk.js');

installMock();

const parser = require('../cloudfunctions/crawlNews/parser');
const crawlNews = require('../cloudfunctions/crawlNews/index.js').main;
const db = getMockDb();

let failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`✅ ${name}`); }
  catch (err) { failed++; console.error(`❌ ${name}: ${err.message}`); }
}

async function run() {
  // ---- 纯函数单测（无需网络） ----
  // TC-88 关键词提取：整词 + 中文二元组 + 去重 + 最短长度 2
  await test('TC-88 extractKeywords 整词/二元组/去重/最小长度', async () => {
    const kw = parser.extractKeywords('摄影 活动，采访');
    assert.ok(kw.includes('摄影'), '应含整词 摄影');
    assert.ok(kw.includes('活动'), '应含整词 活动');
    assert.ok(kw.includes('采访'), '应含整词 采访');
    assert.ok(kw.includes('影活'), '应含二元组 影活');
    assert.ok(!kw.includes('摄影活动'), '整词未分隔不应含 摄影活动');

    const short = parser.extractKeywords('a b 摄影');
    assert.deepStrictEqual(short, ['摄影'], '长度<2 的词应被过滤');

    const dup = parser.extractKeywords('摄影 摄影');
    assert.strictEqual(dup.filter(w => w === '摄影').length, 1, '重复整词应去重');
  });

  // TC-89 评分：标题权重 0.6 / 正文 0.4 / 归一化 / 空关键词
  await test('TC-89 scoreArticle 标题权重与归一化', async () => {
    assert.strictEqual(parser.scoreArticle([], 't', 'c'), 0, '空关键词应为 0');

    // 标题命中 +0.6，正文命中 +0.4 → 1.0
    assert.strictEqual(parser.scoreArticle(['x'], 'x', 'x'), 1, '标题+正文均命中应为 1');

    // 仅标题命中 → 0.6
    assert.strictEqual(parser.scoreArticle(['x'], 'x', 'no'), 0.6, '仅标题命中应为 0.6');

    // 仅正文命中 → 0.4
    assert.strictEqual(parser.scoreArticle(['x'], 'no', 'x'), 0.4, '仅正文命中应为 0.4');

    // 归一化：两个关键词各贡献 0.5（标题命中 a、正文命中 b）
    const s = parser.scoreArticle(['a', 'b'], 'a', 'b');
    assert.strictEqual(s, 0.5, '多关键词应归一化到 0.5');
  });

  // TC-90 日期解析：多种分隔符 + 非法返回 null
  await test('TC-90 parseDate 多种格式与非法输入', async () => {
    const d1 = parser.parseDate('发布于2025-03-12');
    assert.strictEqual(d1.getFullYear(), 2025); assert.strictEqual(d1.getMonth(), 2); assert.strictEqual(d1.getDate(), 12);

    const d2 = parser.parseDate('2025年03月12日');
    assert.strictEqual(d2.getMonth(), 2); assert.strictEqual(d2.getDate(), 12);

    const d3 = parser.parseDate('2025.03.12');
    assert.strictEqual(d3.getFullYear(), 2025); assert.strictEqual(d3.getMonth(), 2);

    assert.strictEqual(parser.parseDate('今天没有日期'), null, '无日期应返回 null');
  });

  // TC-91 绝对 URL 拼接
  await test('TC-91 toAbsolute 相对/绝对/非法', async () => {
    assert.strictEqual(parser.toAbsolute('https://a.com/x/', '/y.html'), 'https://a.com/y.html');
    assert.strictEqual(parser.toAbsolute('https://a.com/', 'https://b.com/z'), 'https://b.com/z');
    assert.strictEqual(parser.toAbsolute('bad', '%%%'), '%%%', '非法输入应原样返回');
  });

  // TC-92 正文提取：优先 article 容器，回退到 root
  await test('TC-92 extractContent 容器优先与回退', async () => {
    const $1 = cheerio.load('<html><body><article><p>第一段正文。</p><div>第二段。</div><span>尾注</span></article></body></html>');
    const t1 = parser.extractContent($1, $1('body'));
    assert.ok(t1.includes('第一段正文'), '应提取第一段');
    assert.ok(t1.includes('第二段'), '应提取第二段');
    assert.ok(t1.includes('尾注'), '应提取尾注');

    const $2 = cheerio.load('<html><body><div>只有 div 文本</div></body></html>');
    const t2 = parser.extractContent($2, $2('body'));
    assert.ok(t2.includes('只有 div 文本'), '无 article 时应回退到 root');
  });

  // ---- main 入参校验 ----
  // TC-93 缺失 OPENID → 参数错误
  await test('TC-93 main 缺失 OPENID 返回参数错误', async () => {
    setWXContext({ OPENID: '' });
    const res = await crawlNews({ keyword: '摄影' });
    assert.strictEqual(res.code, 1, '应参数错误');
    setWXContext({ OPENID: 'test-openid' });
  });

  // TC-94 缺失关键词 → 参数错误
  await test('TC-94 main 缺失关键词返回参数错误', async () => {
    const res = await crawlNews({ OPENID: 'test-openid' });
    assert.strictEqual(res.code, 1, '应参数错误');
  });

  // ---- main 端到端（离线） ----
  // TC-95 有效抓取 → 命中并写入缓存
  await test('TC-95 main 端到端抓取命中并写缓存', async () => {
    const listHtml = `<html><body>
      <a href="/news/1.html">摄影活动圆满落幕</a>
      <a href="/login">登录入口</a>
    </body></html>`;
    const detailHtml = `<html><body><article>
      <p>本次摄影活动在校内顺利开展，参与者热情高涨。</p>
      <p>发布日期：2026-07-10</p>
    </article></body></html>`;
    setFakeHttp({
      'https://fake.news/': listHtml,
      'https://fake.news/news/1.html': detailHtml
    });
    seed({ news_cache: [] });

    const res = await crawlNews({
      sourceUrl: 'https://fake.news/',
      keyword: '摄影活动',
      time: '2026-07-12T12:00:00'
    });
    assert.strictEqual(res.code, 0, '应成功');
    assert.strictEqual(res.data.fromCache, false, '应为实时抓取');
    assert.strictEqual(res.data.newsList.length, 1, '应命中 1 条');
    assert.strictEqual(res.data.newsList[0].title, '摄影活动圆满落幕');
    assert.strictEqual(res.data.newsList[0].matchScore, 1, '评分应为 1.0');
    assert.strictEqual(db._collections.news_cache.length, 1, '应写入 1 条缓存');
    assert.strictEqual(db._collections.news_cache[0].keyword, '摄影活动');
  });

  // TC-96 抓取失败 → 回退已有缓存（degraded）
  await test('TC-96 main 抓取失败回退缓存', async () => {
    setFakeHttp({ 'https://news.swpu.edu.cn/': new Error('network down') });
    seed({
      news_cache: [{
        _id: 'cache1', taskId: 'manual', keyword: '旧词',
        newsList: [{ title: '旧缓存新闻', url: 'https://x', matchScore: 0.3 }],
        cachedAt: new Date(), expireAt: new Date(Date.now() + 86400000)
      }]
    });

    const res = await crawlNews({ keyword: '摄影' });
    assert.strictEqual(res.code, 0, '应成功（降级）');
    assert.strictEqual(res.data.fromCache, true, '应标记来自缓存');
    assert.strictEqual(res.data.degraded, true, '应标记降级');
    assert.strictEqual(res.data.newsList[0].title, '旧缓存新闻');
  });

  console.log('\ncrawlNews 测试完成');
  if (failed) process.exitCode = 1;
}

run().catch((e) => { console.error(e); process.exit(1); });
