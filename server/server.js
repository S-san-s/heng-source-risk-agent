/**
 * 衡源风控 · 本地后端网关
 *
 * 作用：静态托管前端 + 代理腾讯云元宝搜索（wsa / SearchPro）
 * 为什么需要它：SearchPro 需要 SecretKey 做 TC3 签名，密钥绝不能进浏览器；
 *              wsa.tencentcloudapi.com 也不支持浏览器跨域。
 *
 * 启动：
 *   node server/server.js
 *   浏览器打开 http://127.0.0.1:4174/
 *
 * 环境变量（也可写在 server/.env）：
 *   TENCENTCLOUD_SECRET_ID=...
 *   TENCENTCLOUD_SECRET_KEY=...
 *   PORT=4174
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const { searchPro, buildSignedHeaders } = require('./tencent-wsa');
const { inspectCompany, QUERY_TEMPLATES } = require('./risk-mapper');
const { fetchCompanyProfile, providerStatus } = require('./company-provider');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 4174);

/* ---------------------------------------------------------------- 环境变量 */

require('./env'); // 极简 .env 读取，避免引入 dotenv 依赖

const hasCredentials = () =>
  Boolean(process.env.TENCENTCLOUD_SECRET_ID && process.env.TENCENTCLOUD_SECRET_KEY);

/* ------------------------------------------------------------------ 工具 */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.md': 'text/markdown; charset=utf-8',
};

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 2 * 1024 * 1024) {
        reject(new Error('请求体超过 2MB'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('请求体不是合法 JSON'));
      }
    });
    req.on('error', reject);
  });
}

/* ------------------------------------------------------------- 静态文件 */

function serveStatic(req, res, urlPath) {
  // 去掉查询串，防止路径穿越
  const cleanPath = decodeURIComponent(urlPath.split('?')[0]);
  const relative = cleanPath === '/' ? 'index.html' : cleanPath.replace(/^\/+/, '');

  // 禁止直接下载 server/ 目录（里面有 .env 密钥）
  if (relative.startsWith('server/') || relative.startsWith('server\\')) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }).end('403 Forbidden');
    return;
  }

  const filePath = path.join(ROOT, relative);

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  sendFile(res, filePath);
}

function sendFile(res, filePath) {
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      // 开发期禁用缓存，避免改了文件浏览器还读旧内容
      'Cache-Control': 'no-store, must-revalidate',
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

/* ---------------------------------------------------------------- 接口 */

async function handleSearch(req, res) {
  const body = await readBody(req);
  if (!body.query) return sendJson(res, 400, { error: 'query 必填' });

  const result = await searchPro({
    query: body.query,
    mode: body.mode,
    industry: body.industry,
    freshness: body.freshness,
    cnt: body.cnt,
    site: body.site,
    deeplinks: body.deeplinks,
  });
  sendJson(res, 200, result);
}

async function handleInspect(req, res) {
  const body = await readBody(req);
  const companies = Array.isArray(body.companies) ? body.companies : [];
  if (!companies.length) return sendJson(res, 400, { error: 'companies 必须是非空数组' });

  // 单次请求最多 5 家，防止把 QPS 打满（按需调整）
  const batch = companies.slice(0, 5);
  const startedAt = Date.now();
  const allRisks = [];
  const allLeads = [];
  const allErrors = [];
  const allDiagnostics = [];

  for (const company of batch) {
    const { risks, leads, errors, diagnostics } = await inspectCompany({
      company,
      search: (query, template) =>
        searchPro({
          query,
          mode: 2,              // 混合结果：既有自然结果，也有权威垂直信源
          industry: 'gov',      // 垂域：政府
          freshness: body.freshness || 'd7',
          cnt: body.cnt || 10,
          deeplinks: true,
        }),
    });
    allRisks.push(...risks);
    allLeads.push(...leads);
    allErrors.push(...errors);
    allDiagnostics.push(...(diagnostics || []));
  }

  const returnedTotal = allDiagnostics.reduce((sum, item) => sum + (item.returned || 0), 0);
  const nameMatchedTotal = allDiagnostics.reduce((sum, item) => sum + (item.nameMatched || 0), 0);

  sendJson(res, 200, {
    companies: batch.length,
    queries: batch.length * QUERY_TEMPLATES.length,
    risks: allRisks,
    leads: allLeads,
    errors: allErrors,
    diagnostics: allDiagnostics,
    // 检索诊断：接口返回了多少条，其中多少条真的提到该企业
    returnedTotal,
    nameMatchedTotal,
    durationMs: Date.now() - startedAt,
  });
}

/* ---------------------------------------------------------------- 自检 */

/**
 * 用假密钥发一次真实请求，验证签名链路是否打通。
 * 预期结果：腾讯云返回 AuthFailure.SecretIdNotFound（鉴权失败）。
 * 只要拿到 RequestId，就说明请求头、签名算法、网络都正确，只差有效密钥。
 */
async function handleSelftest(req, res) {
  const startedAt = Date.now();
  const fakeId = 'AKID_SELFTEST0000000000000000000000';
  const fakeKey = 'SELFTESTKEY0000000000000000000000';

  const payload = { Query: '企业行政处罚', Mode: 2, Industry: 'gov', Cnt: 10 };
  const sample = buildSignedHeaders({ secretId: fakeId, secretKey: fakeKey, payload });

  try {
    const result = await searchPro({
      secretId: fakeId,
      secretKey: fakeKey,
      query: payload.Query,
      mode: payload.Mode,
      industry: payload.Industry,
      cnt: payload.Cnt,
    });
    // 假密钥理论上不可能走到这里
    return sendJson(res, 200, {
      reachedCloud: true,
      ok: true,
      durationMs: Date.now() - startedAt,
      verdict: '请求成功返回，密钥意外有效。',
      signedRequest: { body: sample.body, headers: sample.headers },
      result,
    });
  } catch (err) {
    const reached = Boolean(err.requestId);
    return sendJson(res, 200, {
      reachedCloud: reached,
      ok: false,
      code: err.code || null,
      message: err.message,
      requestId: err.requestId || null,
      durationMs: Date.now() - startedAt,
      verdict: reached
        ? '签名与网络链路正常：腾讯云已受理请求并返回鉴权错误（假密钥导致，符合预期）。'
        : '请求未能抵达腾讯云，请检查本机网络或代理设置。',
      signedRequest: { body: sample.body, headers: sample.headers },
    });
  }
}

/* ------------------------------------------------------------ 企业主体查询 */

async function handleCompany(req, res) {
  const body = await readBody(req);
  try {
    const result = await fetchCompanyProfile(body.name);
    sendJson(res, 200, { ok: true, ...result });
  } catch (err) {
    const status =
      err.code === 'NO_PROVIDER' ? 503 : err.code === 'EMPTY_NAME' ? 400 : 502;
    sendJson(res, status, {
      ok: false,
      error: err.message,
      code: err.code || null,
      hint: err.hint || null,
    });
  }
}

/* ---------------------------------------------------------------- 路由 */

const server = http.createServer(async (req, res) => {
  const url = req.url || '/';

  try {
    if (url.startsWith('/api/')) {
      if (url.startsWith('/api/health')) {
        return sendJson(res, 200, {
          ok: true,
          credentialsConfigured: hasCredentials(),
          service: 'wsa',
          action: 'SearchPro',
          version: '2025-05-08',
          companyProvider: providerStatus(),
        });
      }

      // 企业主体查询走独立数据源，不受元宝密钥校验影响
      if (url.startsWith('/api/company') && req.method === 'POST') return await handleCompany(req, res);

      // 自检故意使用假密钥，必须放在密钥校验之前
      if (url.startsWith('/api/selftest') && req.method === 'POST') return await handleSelftest(req, res);

      // 所有真实调用前先校验密钥，避免前端拿到难懂的签名错误
      if (!hasCredentials()) {
        return sendJson(res, 503, {
          error: '未配置腾讯云密钥',
          hint: '在 server/.env 写入 TENCENTCLOUD_SECRET_ID 和 TENCENTCLOUD_SECRET_KEY 后重启服务',
          fallback: '前端会自动降级使用演示数据',
        });
      }

      if (url.startsWith('/api/search') && req.method === 'POST') return await handleSearch(req, res);
      if (url.startsWith('/api/inspect') && req.method === 'POST') return await handleInspect(req, res);

      return sendJson(res, 404, { error: '接口不存在' });
    }

    // 接口自测台（不在静态根目录暴露 server/，单独路由）
    const pathname = url.split('?')[0];
    if (pathname === '/debug' || pathname === '/debug/') {
      return sendFile(res, path.join(__dirname, 'debug.html'));
    }

    serveStatic(req, res, url);
  } catch (err) {
    console.error('[server]', err);
    if (!res.headersSent) {
      sendJson(res, 500, {
        error: err.message,
        code: err.code || null,
        requestId: err.requestId || null,
      });
    }
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`衡源风控 已启动  http://127.0.0.1:${PORT}/`);
  console.log(`元宝搜索密钥：${hasCredentials() ? '已配置 ✓' : '未配置 ✗（将使用演示数据）'}`);
});
