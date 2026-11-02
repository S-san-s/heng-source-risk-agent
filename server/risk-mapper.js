/**
 * 把元宝搜索（SearchPro）的原始结果，映射成衡源风控现有的 riskEvents 数据结构。
 *
 * 设计原则：
 * 1. 只认官方域名，非 gov 域名的结果不进入风险库（避免"AI 幻觉式"误报）
 * 2. 风险类型由关键词命中决定，等级由类型 + 权威度共同决定
 * 3. 每条风险必须保留可追溯的原文链接（Deeplinks）
 */

// 四类巡检 Query，对应设计文档里的「Query Agent 拆解四类查询」
const QUERY_TEMPLATES = [
  { type: '行政处罚', level: 'high', query: (name) => `${name} 行政处罚`, keywords: ['处罚', '罚款', '行政处罚决定书'] },
  { type: '经营异常', level: 'high', query: (name) => `${name} 经营异常 名录`, keywords: ['经营异常', '异常名录', '未按规定'] },
  { type: '招投标', level: 'medium', query: (name) => `${name} 招标 中标 资格`, keywords: ['招标', '中标', '投标', '资格'] },
  { type: '资质到期', level: 'medium', query: (name) => `${name} 资质 证书 到期`, keywords: ['资质', '证书', '到期', '续期'] },
];

// 官方信源白名单：只有这些域名的结果才被采信
const TRUSTED_DOMAINS = [
  'gov.cn',
  'creditchina.gov.cn',
  'gsxt.gov.cn',
  'ccgp.gov.cn',
  'mohurd.gov.cn',
  'samr.gov.cn',
  'ndrc.gov.cn',
];

const SOURCE_NAMES = {
  'creditchina.gov.cn': '信用中国',
  'gsxt.gov.cn': '国家企业信用信息公示系统',
  'ccgp.gov.cn': '中国政府采购网',
  'mohurd.gov.cn': '住建部监管平台',
  'samr.gov.cn': '国家市场监督管理总局',
  'ndrc.gov.cn': '国家发展改革委',
};

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function isTrusted(url) {
  const host = hostOf(url);
  if (!host) return false;
  return TRUSTED_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function sourceNameFor(url) {
  const host = hostOf(url);
  for (const [domain, name] of Object.entries(SOURCE_NAMES)) {
    if (host === domain || host.endsWith(`.${domain}`)) return name;
  }
  return host || '官方信源';
}

function normalizeDate(dateText) {
  if (!dateText) return '';
  // 接口常见格式："2025/02/26 09:37:00"
  const match = String(dateText).match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (!match) return '';
  const [, y, m, d] = match;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * 计算证据强度 0~100
 * 权威度（0~5）占 60 分，相关性（0~1）占 25 分，多源交叉命中占 15 分
 * 强证据额外 +12 分（封顶 100）
 */
function computeScore(page, crossSourceCount, confidence) {
  const authority = typeof page.authorityLevel === 'number' ? page.authorityLevel : 3;
  const relevance = typeof page.score === 'number' ? page.score : 0.5;
  const authorityPart = (authority / 5) * 60;
  const relevancePart = relevance * 25;
  const crossPart = Math.min(crossSourceCount, 2) * 7.5;
  const confidencePart = confidence === 'strong' ? 12 : 0;
  return Math.round(Math.min(100, authorityPart + relevancePart + crossPart + confidencePart));
}

/**
 * 生成企业名匹配变体。
 * 检索结果里常写全称，也可能只写字号（去掉「有限公司」等后缀），两种都认。
 * 例：「华东智造设备有限公司」→ ["华东智造设备有限公司", "华东智造设备"]
 */
function buildNameVariants(name) {
  const raw = String(name || '').trim();
  if (!raw) return [];
  const stripped = raw
    .replace(/[（(][^）)]*[）)]/g, '')            // 去掉括号补充说明
    .replace(/(股份)?有限(责任)?公司$/, '')       // 去掉公司后缀
    .trim();
  const variants = new Set([raw]);
  if (stripped.length >= 2) variants.add(stripped);
  return [...variants];
}

/**
 * 评估单条检索结果的证据等级
 *
 * 政府网站上「处罚」「招标」「资质」这类词遍地都是，仅靠关键词命中会大面积误报。
 * 实测案例：查「深圳市腾讯计算机系统有限公司 行政处罚」，返回的是
 * 《不合格食品核查处置通告》，正文只有一句「微信平台（深圳市腾讯计算机系统有限公司）」——
 * 这是提到腾讯，不是处罚腾讯。
 *
 * 因此按「企业名出现在哪 + 关键词命中几次」分级：
 *   strong  统一社会信用代码命中 / 标题同时含企业名和关键词
 *   medium  标题点名企业，且正文命中 2 个以上风险关键词
 *   weak    仅正文提及企业名，或只命中单个泛化关键词 → 只作线索，不入风险库
 */
function evaluatePage({ page, nameVariants, code, keywords }) {
  const title = page.title || '';
  const body = `${page.passage || ''} ${page.content || ''}`;
  const all = `${title} ${body}`;

  const nameInTitle = nameVariants.some((variant) => title.includes(variant));
  const nameInBody = nameVariants.some((variant) => body.includes(variant));
  const kwInTitle = keywords.some((keyword) => title.includes(keyword));
  const kwHits = keywords.filter((keyword) => all.includes(keyword)).length;
  const codeHit =
    Boolean(code) && String(code).length >= 15 && all.includes(String(code));

  let confidence = null;
  if (codeHit) confidence = 'strong';
  else if (nameInTitle && kwInTitle) confidence = 'strong';
  else if (nameInTitle && kwHits >= 2) confidence = 'medium';
  else if (nameInTitle && kwHits === 1) confidence = 'weak';
  else if (kwInTitle && nameInBody) confidence = 'weak';

  return { nameInTitle, nameInBody, kwInTitle, kwHits, codeHit, confidence };
}

/**
 * 单家企业 + 单个风险类型的检索结果 → 风险事件（可能为 null）
 *
 * 三道门槛（缺一不可）：
 *   1. 必须来自官方域名白名单
 *   2. 企业名必须真实出现在文中
 *   3. 证据等级必须达到 medium 以上；weak 归入 leads（线索），不计入风险
 *
 * @param {Array} [leads] 传入数组时，弱证据会追加到这里
 */
function mapToRiskEvent({ company, template, pages, index, leads }) {
  const trustedPages = pages.filter((page) => isTrusted(page.url));
  if (!trustedPages.length) return null;

  const nameVariants = buildNameVariants(company.name);
  const matched = [];

  for (const page of trustedPages) {
    const verdict = evaluatePage({
      page,
      nameVariants,
      code: company.code,
      keywords: template.keywords,
    });

    if (!verdict.confidence) continue;

    if (verdict.confidence === 'weak') {
      if (Array.isArray(leads)) {
        leads.push({
          id: `lead-${company.id}-${index}-${leads.length}`,
          companyId: company.id,
          company: company.name,
          type: template.type,
          title: page.title,
          url: page.url,
          date: normalizeDate(page.date),
          source: sourceNameFor(page.url),
          reason: verdict.nameInTitle
            ? '标题点名企业，但正文仅命中 1 个泛化关键词'
            : verdict.kwInTitle
              ? '标题命中风险关键词，但企业名仅出现在正文，需确认当事人身份'
              : '仅正文提及企业名，标题与该风险类型无关',
        });
      }
      continue;
    }

    matched.push({ page, verdict });
  }

  if (!matched.length) return null;

  // 按相关性排序，取最相关的一条作为主事件
  const primaryMatch = [...matched].sort(
    (a, b) => (b.page.score || 0) - (a.page.score || 0)
  )[0];
  const primary = primaryMatch.page;
  const confidence = primaryMatch.verdict.confidence;

  // 交叉核验：不同域名算不同信源
  const sources = [];
  const seenHosts = new Set();
  for (const { page } of matched) {
    const host = hostOf(page.url);
    if (!host || seenHosts.has(host)) continue;
    seenHosts.add(host);
    sources.push({
      name: sourceNameFor(page.url),
      domain: host,
      url: page.url,
      title: page.title,
      date: normalizeDate(page.date),
    });
  }

  const crossSourceCount = sources.length;
  const score = computeScore(primary, crossSourceCount, confidence);
  const authText =
    primary.authorityLevel != null
      ? `最高权威度 ${primary.authorityLevel}/5`
      : '当前账号版本未返回权威度（仅旗舰版提供）';
  const evidenceText =
    confidence === 'strong'
      ? primaryMatch.verdict.codeHit
        ? '统一社会信用代码命中，强证据'
        : '标题同时点名企业与风险关键词，强证据'
      : '标题点名企业且正文命中多个关键词，中等证据';

  return {
    id: `risk-${company.id}-${index}`,
    companyId: company.id,
    company: company.name,
    type: template.type,
    level: template.level,
    confidence,
    title: primary.title,
    url: primary.url,
    date: normalizeDate(primary.date) || new Date().toISOString().slice(0, 10),
    score,
    status: 'new',
    summary: primary.passage || primary.content || '',
    caveat:
      '本结论由公开信息检索推断，不构成处罚认定。检索结果可能把权利人、关联方或同名主体误认为当事人' +
      '（实例：某处罚决定书正文出现「蜜雪冰城股份有限公司」，但实际被处罚的是侵权门店）。' +
      '处罚归属请以信用中国 / 国家企业信用信息公示系统为准。',
    reason:
      `命中「${template.type}」规则，关键词：` +
      `${template.keywords.filter((k) => `${primary.title} ${primary.passage}`.includes(k)).join('、')}；` +
      `${evidenceText}；共 ${crossSourceCount} 个官方信源命中（展示前 ${Math.min(crossSourceCount, 4)} 条），${authText}。`,
    sources: sources.slice(0, 4),
  };
}

/**
 * 一次完整巡检：对单家企业跑四类 Query
 *
 * @param {object} params
 * @param {object} params.company  { id, name, code, industry }
 * @param {Function} params.search (query, template) => Promise<{ pages: object[] }>
 * @returns {Promise<{risks: object[], leads: object[], errors: object[]}>}
 */
async function inspectCompany({ company, search }) {
  const risks = [];
  const leads = [];
  const errors = [];
  const diagnostics = [];

  // 串行执行，避免触发 QPS 限流；也可改为 Promise.all 提速
  for (const [index, template] of QUERY_TEMPLATES.entries()) {
    const query = template.query(company.name);
    try {
      const result = await search(query, template);
      const pages = result.pages || [];

      // 诊断：这次检索返回了多少条，其中有多少条真的提到了该企业
      const nameVariants = buildNameVariants(company.name);
      const nameMatched = pages.filter((page) =>
        nameVariants.some((variant) =>
          `${page.title} ${page.passage} ${page.content}`.includes(variant)
        )
      ).length;
      diagnostics.push({
        type: template.type,
        query,
        returned: pages.length,
        nameMatched,
      });

      const risk = mapToRiskEvent({
        company,
        template,
        pages,
        index,
        leads,
      });
      if (risk) risks.push(risk);
    } catch (err) {
      // 单条 Query 失败不影响整家企业巡检，记录后继续
      errors.push({
        id: `err-${company.id}-${index}`,
        companyId: company.id,
        company: company.name,
        type: template.type,
        message: err.message,
        code: err.code || null,
        requestId: err.requestId || null,
      });
      diagnostics.push({
        type: template.type,
        query,
        returned: 0,
        nameMatched: 0,
        failed: true,
      });
    }
  }

  return { risks, leads, errors, diagnostics };
}

module.exports = {
  QUERY_TEMPLATES,
  TRUSTED_DOMAINS,
  inspectCompany,
  mapToRiskEvent,
  evaluatePage,
  buildNameVariants,
  isTrusted,
  computeScore,
};
