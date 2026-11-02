/**
 * 数据源适配层
 *
 * 目标：让前端在「有后端 + 有密钥」时走真实元宝搜索，其余情况自动回落演示数据，
 *       且任何时刻界面都能明确显示当前用的是哪一种，绝不把 mock 当真实结果展示。
 *
 * 判定优先级：
 *   1. /api/health 可达 且 credentialsConfigured=true  → live（真实接口）
 *   2. /api/health 可达 但未配密钥                     → mock（原因：未配置密钥）
 *   3. /api/health 不可达（如 python 静态托管）        → mock（原因：未连接后端）
 */

const source = {
  probed: false,
  live: false,
  reason: '尚未检测',
  version: '',
};

export function getSource() {
  return { ...source };
}

export function isLive() {
  return source.live;
}

/** 探测后端可用性，结果缓存在模块内 */
export async function probe() {
  try {
    const res = await fetch('api/health', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const info = await res.json();
    source.probed = true;
    source.live = Boolean(info.credentialsConfigured);
    source.version = info.version || '';
    source.reason = source.live ? '已连接元宝搜索' : '未配置腾讯云密钥';
  } catch {
    source.probed = true;
    source.live = false;
    source.reason = '未连接后端网关';
  }
  return getSource();
}

/**
 * 批量巡检（真实接口，单次最多 5 家）
 * @param {{companies:Array<{id?:string,name:string,code?:string,industry?:string}>, freshness?:string, cnt?:number}} opts
 * @returns {Promise<{risks:Array, leads:Array, errors:Array, durationMs:number, queries:number}>}
 */
export async function inspectBatch({ companies, freshness = 'y2', cnt = 10 }) {
  const res = await fetch('api/inspect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      companies: companies.map((company, index) => ({
        id: company.id || `live-${index}`,
        name: company.name,
        code: company.code || '',
        industry: company.industry || '',
      })),
      freshness,
      cnt,
    }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.error || `接口返回 HTTP ${res.status}`);
    err.hint = json.hint || '';
    throw err;
  }
  return json;
}

/**
 * 单企业巡检（真实接口）
 * @param {{name:string, code?:string, freshness?:string, cnt?:number}} opts
 */
export async function inspectCompany({ name, code, freshness = 'y2', cnt = 10 }) {
  return inspectBatch({ companies: [{ name, code }], freshness, cnt });
}

/**
 * 企业主体信息（工商登记字段，来自企查查/天眼查等结构化征信接口）
 * @param {string} name 企业全称
 */
export async function fetchCompanyProfile(name) {
  const res = await fetch('api/company', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) {
    const err = new Error(json.error || `接口返回 HTTP ${res.status}`);
    err.code = json.code || null;
    err.hint = json.hint || '';
    throw err;
  }
  return json;
}
