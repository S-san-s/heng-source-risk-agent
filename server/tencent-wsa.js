/**
 * 腾讯云元宝搜索（Tencent Yuanbao Search，产品代号 wsa）Node.js 客户端
 * 零依赖，Node 18+（使用内置 fetch）
 *
 * 接口：POST https://wsa.tencentcloudapi.com
 * Action：SearchPro
 * Version：2025-05-08
 * 签名：TC3-HMAC-SHA256
 */

const crypto = require('crypto');

require('./env'); // 读取 server/.env，保证命令行直接运行时也能拿到密钥

const HOST = 'wsa.tencentcloudapi.com';
const SERVICE = 'wsa';
const VERSION = '2025-05-08';
const ACTION = 'SearchPro';

const sha256hex = (input) => crypto.createHash('sha256').update(input, 'utf8').digest('hex');

function hmac(key, message) {
  return crypto.createHmac('sha256', key).update(message, 'utf8').digest();
}

/**
 * 生成 TC3-HMAC-SHA256 签名头
 * 文档：https://cloud.tencent.com/document/api/1806/121815
 */
function buildSignedHeaders({ secretId, secretKey, payload }) {
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const body = JSON.stringify(payload);
  const contentType = 'application/json; charset=utf-8';

  // 1. 拼接规范请求串（POST 的 CanonicalURI 固定为 /）
  const canonicalHeaders = `content-type:${contentType}\nhost:${HOST}\n`;
  const signedHeaders = 'content-type;host';
  const canonicalRequest = [
    'POST',
    '/',
    '',
    canonicalHeaders,
    signedHeaders,
    sha256hex(body),
  ].join('\n');

  // 2. 拼接待签名字符串
  const credentialScope = `${date}/${SERVICE}/tc3_request`;
  const stringToSign = [
    'TC3-HMAC-SHA256',
    timestamp,
    credentialScope,
    sha256hex(canonicalRequest),
  ].join('\n');

  // 3. 逐级派生签名密钥
  const kDate = hmac(`TC3${secretKey}`, date);
  const kService = hmac(kDate, SERVICE);
  const kSigning = hmac(kService, 'tc3_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');

  return {
    body,
    headers: {
      'Content-Type': contentType,
      Host: HOST,
      'X-TC-Action': ACTION,
      'X-TC-Version': VERSION,
      'X-TC-Timestamp': String(timestamp),
      Authorization:
        `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, ` +
        `SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  };
}

/**
 * 调用 SearchPro
 *
 * @param {object} opts
 * @param {string} opts.secretId
 * @param {string} opts.secretKey
 * @param {string} opts.query            搜索词（必填）
 * @param {number} [opts.mode=2]         0 公开网页 / 1 权威垂直信源 / 2 混合（极速版不支持）
 * @param {string} [opts.industry]       gov | news | acad | finance（极速版不支持）
 * @param {string} [opts.freshness]      d7 / m3 / y2 / 2026-08-20 / 2026-08-20,2026-08-30
 * @param {number} [opts.cnt=10]         10 / 20 / 30 / 40 / 50（极速版不支持）
 * @param {string} [opts.site]           "qq.com" 或 "exclude:qq.com|sohu.com"
 * @param {boolean} [opts.deeplinks]     是否返回附件子链（仅旗舰版）
 * @returns {Promise<{query:string, version:string, requestId:string, pages:object[]}>}
 */
async function searchPro(opts) {
  const {
    secretId = process.env.TENCENTCLOUD_SECRET_ID,
    secretKey = process.env.TENCENTCLOUD_SECRET_KEY,
    query,
    mode,
    industry,
    freshness,
    cnt,
    site,
    deeplinks,
  } = opts || {};

  if (!secretId || !secretKey) {
    throw new Error('缺少 TENCENTCLOUD_SECRET_ID / TENCENTCLOUD_SECRET_KEY 环境变量');
  }
  if (!query || !String(query).trim()) {
    throw new Error('Query 不能为空');
  }

  // 只传有值的参数，避免把 undefined 序列化进请求体
  const payload = { Query: String(query).trim() };
  if (mode !== undefined) payload.Mode = Number(mode);
  if (industry) payload.Industry = industry;
  if (freshness) payload.Freshness = freshness;
  if (cnt !== undefined) payload.Cnt = Number(cnt);
  if (site) payload.Site = site;
  if (deeplinks !== undefined) payload.Deeplinks = Boolean(deeplinks);

  const { body, headers } = buildSignedHeaders({ secretId, secretKey, payload });

  const res = await fetch(`https://${HOST}`, { method: 'POST', headers, body });
  const json = await res.json();

  if (json.Response && json.Response.Error) {
    const err = new Error(`${json.Response.Error.Code}: ${json.Response.Error.Message}`);
    err.code = json.Response.Error.Code;
    err.requestId = json.Response.RequestId;
    throw err;
  }

  return normalizeResponse(json.Response);
}

/**
 * 把接口返回的 Pages（JSON 字符串数组）解析成对象数组
 */
function normalizeResponse(response = {}) {
  const rawPages = Array.isArray(response.Pages) ? response.Pages : [];
  const pages = rawPages
    .map((item) => {
      try {
        return typeof item === 'string' ? JSON.parse(item) : item;
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  // score 量级因版本而异：文档写 0~1，实测标准版约 0~4。
  // 统一按本批最大值归一到 0~1，保证下游 computeScore 的权重稳定。
  const maxScore = pages.reduce((max, p) => (typeof p.score === 'number' && p.score > max ? p.score : max), 0);
  const scale = maxScore > 1 ? maxScore : 1;

  return {
    query: response.Query || '',
    version: response.Version || '', // lite / standard / flagship
    msg: response.Msg || '',
    requestId: response.RequestId || '',
    pages: pages.map((page) => ({
      title: page.title || '',
      url: page.url || '',
      date: page.date || '',
      passage: page.passage || '',
      content: page.content || '',
      site: page.site || '',
      score: typeof page.score === 'number' ? Number((page.score / scale).toFixed(4)) : null, // 已归一 0~1
      rawScore: typeof page.score === 'number' ? page.score : null,                            // 接口原始分，便于排查
      authorityLevel: typeof page.authority_level === 'number' ? page.authority_level : null, // 0~5，仅旗舰版
      favicon: page.favicon || '',
      pics: Array.isArray(page.pics) ? page.pics : [],
      deeplinks: Array.isArray(page.deeplinks) ? page.deeplinks : [],
    })),
  };
}

module.exports = { searchPro, buildSignedHeaders, normalizeResponse };

// 允许直接命令行调试：node server/tencent-wsa.js "华东智造设备有限公司 行政处罚"
if (require.main === module) {
  const query = process.argv[2] || '人工智能发展现状';
  searchPro({ query, mode: 2, industry: 'gov', freshness: 'd7', cnt: 10 })
    .then((result) => {
      console.log(JSON.stringify({ ...result, pages: result.pages.slice(0, 3) }, null, 2));
    })
    .catch((err) => {
      console.error('[wsa] 调用失败:', err.message);
      if (err.requestId) console.error('RequestId:', err.requestId);
      process.exit(1);
    });
}
