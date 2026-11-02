/**
 * 企业主体信息数据源（结构化征信接口）
 *
 * 为什么需要它：
 *   元宝搜索是「主题检索」，只能发现公开信息线索，拿不到工商登记字段
 *   （注册资本、实缴资本、参保人数、法定代表人、经营状态等）。
 *   要复刻企查查/天眼查那种企业画像，必须接结构化征信接口。
 *
 * 支持两个后端，按 .env 里配置了哪个 key 自动选择：
 *   企查查开放平台  QCC_KEY + QCC_SECRET_KEY
 *   天眼查开放平台  TYC_TOKEN
 *
 * 两家都未配置时抛 NO_PROVIDER，前端会明确提示去配置，而不是返回假数据。
 */

const crypto = require('crypto');

require('./env');

const QCC_HOST = 'https://api.qichacha.com';
const TYC_HOST = 'https://open.api.tianyancha.com';

/* ------------------------------------------------------------------ 工具 */

function pick(source, keys) {
  for (const key of keys) {
    if (source && source[key] != null && source[key] !== '') return source[key];
  }
  return '';
}

function toText(value) {
  if (value == null) return '';
  return String(value).trim();
}

/** 判断当前可用的数据源 */
function activeProvider() {
  if (process.env.QCC_KEY && process.env.QCC_SECRET_KEY) return 'qcc';
  if (process.env.TYC_TOKEN) return 'tyc';
  return null;
}

function providerStatus() {
  const provider = activeProvider();
  return {
    provider,
    configured: Boolean(provider),
    hint:
      provider === 'qcc'
        ? '企查查开放平台'
        : provider === 'tyc'
          ? '天眼查开放平台'
          : '在 server/.env 配置 QCC_KEY + QCC_SECRET_KEY（企查查）或 TYC_TOKEN（天眼查）',
  };
}

/* -------------------------------------------------------------- 企查查 */

/**
 * 企查查签名：Token = MD5(key + timespan + secretKey).toUpperCase()
 * 文档：https://openapi.qcc.com/
 */
function qccSign(key, secretKey) {
  const timespan = Math.floor(Date.now() / 1000).toString();
  const token = crypto
    .createHash('md5')
    .update(key + timespan + secretKey, 'utf8')
    .digest('hex')
    .toUpperCase();
  return { token, timespan };
}

async function fetchFromQcc(name) {
  const key = process.env.QCC_KEY;
  const secretKey = process.env.QCC_SECRET_KEY;
  const { token, timespan } = qccSign(key, secretKey);

  const url = `${QCC_HOST}/ECIV4/GetBasicDetailsByName?keyword=${encodeURIComponent(name)}&key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    headers: { Token: token, Timespan: timespan },
  });
  const json = await res.json().catch(() => ({}));

  // 企查查成功时 Status 为 "200"
  if (String(json.Status) !== '200' || !json.Result) {
    const err = new Error(`企查查返回：${json.Message || '未知错误'}`);
    err.code = `QCC_${json.Status || 'UNKNOWN'}`;
    throw err;
  }

  const result = json.Result;
  return {
    provider: 'qcc',
    providerName: '企查查',
    profile: {
      name: toText(pick(result, ['Name'])),
      creditCode: toText(pick(result, ['CreditCode'])),
      status: toText(pick(result, ['Status'])),
      legalPerson: toText(pick(result, ['OperName'])),
      regCapital: toText(pick(result, ['RegistCapi'])),
      actualCapital: toText(pick(result, ['RecCap'])),
      establishedAt: toText(pick(result, ['StartDate'])),
      staffCount: toText(pick(result, ['EconNum'])),
      businessScope: toText(pick(result, ['Scope'])),
      address: toText(pick(result, ['Address'])),
      industry: toText(pick(result, ['Industry'])),
    },
  };
}

/* -------------------------------------------------------------- 天眼查 */

async function fetchFromTyc(name) {
  const token = process.env.TYC_TOKEN;
  const url = `${TYC_HOST}/services/open/ic/baseinfo/normal?keyword=${encodeURIComponent(name)}`;
  const res = await fetch(url, { headers: { Authorization: token } });
  const json = await res.json().catch(() => ({}));

  if (json.error_code !== 0 || !json.result) {
    const err = new Error(`天眼查返回：${json.reason || '未知错误'}`);
    err.code = `TYC_${json.error_code || 'UNKNOWN'}`;
    throw err;
  }

  const result = json.result;
  return {
    provider: 'tyc',
    providerName: '天眼查',
    profile: {
      name: toText(pick(result, ['name'])),
      creditCode: toText(pick(result, ['creditCode'])),
      status: toText(pick(result, ['regStatus'])),
      legalPerson: toText(pick(result, ['legalPersonName'])),
      regCapital: toText(pick(result, ['regCapital'])),
      actualCapital: toText(pick(result, ['actualCapital'])),
      // 天眼查字段名就是 estiblishTime（官方拼写）
      establishedAt: toText(pick(result, ['estiblishTime', 'estiblishTimeStr'])),
      staffCount: toText(pick(result, ['socialStaffNum'])),
      businessScope: toText(pick(result, ['businessScope'])),
      address: toText(pick(result, ['regLocation'])),
      industry: toText(pick(result, ['industry'])),
    },
  };
}

/* ---------------------------------------------------------------- 对外 */

/**
 * 查询企业主体信息
 * @param {string} name 企业全称
 * @returns {Promise<{provider:string, providerName:string, profile:object}>}
 */
async function fetchCompanyProfile(name) {
  const provider = activeProvider();

  if (!provider) {
    const err = new Error('未配置企业征信数据源');
    err.code = 'NO_PROVIDER';
    err.hint = '在 server/.env 配置 QCC_KEY + QCC_SECRET_KEY（企查查）或 TYC_TOKEN（天眼查）后重启';
    throw err;
  }
  if (!name || !String(name).trim()) {
    const err = new Error('企业名称不能为空');
    err.code = 'EMPTY_NAME';
    throw err;
  }

  return provider === 'qcc' ? fetchFromQcc(String(name).trim()) : fetchFromTyc(String(name).trim());
}

module.exports = { fetchCompanyProfile, providerStatus, activeProvider };
