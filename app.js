import { createStore, riskLevelMeta, reports as seedReports } from './data.js';
import { probe, inspectCompany, inspectBatch, fetchCompanyProfile, getSource } from './api.js';
import { loadImportedCompanies, saveImportedCompanies, loadLiveRisks, saveLiveRisks, loadHideDemo, saveHideDemo } from './persist.js';

const state = createStore();

// 给演示种子企业打标记，界面上一眼能分清「演示」和「真实」
state.companies.forEach((company) => {
  if (!company.origin) company.origin = 'demo';
});

// 恢复本地保存的真实企业与真实风险（刷新不丢），排在演示数据之前
const restoredCompanies = loadImportedCompanies();
if (restoredCompanies.length) state.companies = [...restoredCompanies, ...state.companies];

// 用户选择隐藏演示企业时，台账只保留真实导入的主体
if (loadHideDemo()) state.companies = state.companies.filter((company) => company.origin !== 'demo');

const restoredRisks = loadLiveRisks();
if (restoredRisks.length) state.risks = [...restoredRisks, ...state.risks];
let activeView = 'dashboard';
let selectedCompanies = new Set();
let riskFilters = { query: '', level: 'all', type: 'all' };
let companyFilters = { query: '', status: 'all' };
let alertFilter = 'pending';
let runTimer;
let toastTimer;
let liveRunDone = restoredRisks.length > 0; // 是否已有真实巡检结果，用于切换任务记录里的数字来源

// 数据源状态：由 /api/health 探测后更新；纯静态托管时保持演示文案
const dataSource = { label: '检测中…', dot: 'var(--subtle)' };

const navItems = [
  { id: 'dashboard', label: '总览驾驶舱', icon: 'grid' },
  { id: 'companies', label: '企业台账', icon: 'building' },
  { id: 'inspections', label: '巡检任务', icon: 'scan' },
  { id: 'risks', label: '风险事件', icon: 'alert', badge: true },
  { id: 'alerts', label: '告警中心', icon: 'bell', badge: true },
  { id: 'reports', label: '周报中心', icon: 'file' },
  { id: 'assistant', label: 'AI 风控助手', icon: 'spark' },
];

const iconPaths = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  building: '<path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M2 21h20M8 7h2M8 11h2M8 15h2M16 9h2M16 13h2M16 17h2"/>',
  scan: '<path d="M4 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10M12 7v10"/>',
  alert: '<path d="M10.3 3.3 2.8 16a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 3.3a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h6"/>',
  spark: '<path d="m12 3-1.3 5.7L5 10l5.7 1.3L12 17l1.3-5.7L19 10l-5.7-1.3L12 3ZM19 17l-.6 2.4L16 20l2.4.6L19 23l.6-2.4L22 20l-2.4-.6L19 17Z"/>',
  settings: '<path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path d="m19.4 15 .1.1a2 2 0 0 1-2.8 2.8l-.1-.1a2 2 0 0 0-3.4 1.4v.2a2 2 0 0 1-4 0v-.2a2 2 0 0 0-3.4-1.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a2 2 0 0 0-1.4-3.4h-.2a2 2 0 0 1 0-4h.2A2 2 0 0 0 4.9 4.2l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a2 2 0 0 0 3.4-1.4V0a2 2 0 0 1 4 0v.2a2 2 0 0 0 3.4 1.4l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a2 2 0 0 0 1.4 3.4h.2a2 2 0 0 1 0 4h-.2a2 2 0 0 0-3.2 3.2Z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  play: '<path d="m8 5 11 7-11 7V5Z"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.2 1.2M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 7 20l1.2-1.2"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  filter: '<path d="M4 5h16M7 12h10M10 19h4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.7-3L3 11M4 5v6h6M4 13a8 8 0 0 0 14.7 3L21 13m0 6v-6h-6"/>',
  user: '<circle cx="12" cy="8" r="3"/><path d="M5 21a7 7 0 0 1 14 0"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  message: '<path d="M20 11.5a7 7 0 0 1-7.5 7L7 21l1.2-3.5A7 7 0 1 1 20 11.5Z"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7"/>',
  shield: '<path d="M12 3 5 6v5c0 4.6 2.9 8 7 10 4.1-2 7-5.4 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/>',
};

function icon(name, className = '') {
  return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true">${iconPaths[name] || iconPaths.info}</svg>`;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
}

function levelTag(level) {
  const meta = riskLevelMeta[level] || riskLevelMeta.low;
  return `<span class="level-tag ${level}">${meta.label}</span>`;
}

function statusTag(status) {
  const labels = { new: '新发现', pending: '待处理', acknowledged: '已确认', closed: '已关闭', ignored: '已忽略', active: '监控中', paused: '已暂停' };
  return `<span class="status ${status}">${labels[status] || status}</span>`;
}

function pageTitle(title, desc, actions = '') {
  return `<div class="page-heading"><div><h1>${title}</h1><p>${desc}</p></div><div class="heading-actions">${actions}</div></div>`;
}

function panelHead(title, subtitle, tools = '') {
  return `<div class="panel-head"><div><div class="panel-title">${title}</div>${subtitle ? `<div class="panel-sub">${subtitle}</div>` : ''}</div><div class="panel-tools">${tools}</div></div>`;
}

function appShell() {
  const pending = state.alerts.filter((item) => item.status === 'pending').length;
  return `<div class="app-shell">
    <aside class="sidebar">
      <div class="brand"><div class="brand-mark">衡源</div><div class="brand-copy"><span class="brand-name">衡源风控</span><span class="brand-sub">ENTERPRISE RISK OPS</span></div></div>
      <nav class="nav-group" aria-label="主导航">
        <div class="nav-label">工作台</div>
        ${navItems.map((item) => `<button class="nav-item ${activeView === item.id ? 'active' : ''}" data-nav="${item.id}">${icon(item.icon, 'nav-icon')}<span>${item.label}</span>${item.badge && pending ? `<b class="nav-badge">${pending}</b>` : ''}</button>`).join('')}
        <div class="nav-label" style="margin-top:24px">系统</div>
        <button class="nav-item ${activeView === 'settings' ? 'active' : ''}" data-nav="settings">${icon('settings', 'nav-icon')}<span>系统设置</span></button>
      </nav>
      <div class="sidebar-bottom"><div class="data-source"><div class="data-source-title"><span>数据源状态</span><i class="source-dot" style="background:${dataSource.dot}"></i></div><div class="data-source-value">${dataSource.label}</div></div></div>
    </aside>
    <section class="main-shell">
      <header class="topbar"><div class="topbar-context"><i class="context-mark"></i><span>供应商合规作业台</span><span>/</span><strong>${navItems.find((item) => item.id === activeView)?.label || '系统设置'}</strong></div><div class="topbar-actions"><div class="cycle-pill">当前周期 <strong>2026.10.27 - 11.02</strong></div><button class="icon-button" data-action="show-notice" aria-label="通知">${icon('bell')}</button><div class="avatar">林</div></div></header>
      <main class="page fade-up">${renderView()}</main>
    </section>
  </div>`;
}

function renderView() {
  switch (activeView) {
    case 'companies': return renderCompanies();
    case 'inspections': return renderInspections();
    case 'risks': return renderRisks();
    case 'alerts': return renderAlerts();
    case 'reports': return renderReports();
    case 'assistant': return renderAssistant();
    case 'settings': return renderSettings();
    default: return renderDashboard();
  }
}

function getKpis() {
  return {
    companies: state.companies.filter((item) => item.status === 'active').length,
    completion: state.run.progress,
    risks: state.risks.length,
    high: state.risks.filter((item) => item.level === 'high' && ['new', 'acknowledged'].includes(item.status)).length,
    pending: state.alerts.filter((item) => item.status === 'pending').length,
  };
}

function renderDashboard() {
  const kpi = getKpis();
  const action = `<button class="btn btn-primary" data-action="run-inspection">${icon('play')} ${state.run.status === 'running' ? '巡检进行中' : '运行本周期巡检'}</button>`;
  return `${pageTitle('总览驾驶舱', '持续监控供应商合规状态，让每一次风险变化都有据可查。', action)}
    <section class="kpi-grid">
      ${kpiCard('监控企业', kpi.companies, '家', icon('building'), '较上周期 +3 家', 'up')}
      ${kpiCard('本周期完成率', `${kpi.completion}%`, '', icon('scan'), state.run.status === 'running' ? '正在执行增量巡检' : '上次耗时 01:09', 'up')}
      ${kpiCard('发现风险', kpi.risks, '条', icon('alert'), '较上周期 -2 条', 'up')}
      ${kpiCard('待处理告警', kpi.pending, '条', icon('bell'), kpi.pending ? '需要立即跟进' : '当前没有待处理告警', kpi.pending ? 'alert' : 'up')}
    </section>
    <section class="dashboard-grid">
      <div class="panel chart-panel">${panelHead('风险趋势', '近 6 个巡检周期 · 按风险等级统计', '<span class="code-label">Freshness=d7</span>')}${renderTrendChart()}</div>
      <div class="panel distribution">${panelHead('风险等级分布', '本周期 7 条有效风险')}${renderDistribution()}</div>
      <div class="panel risk-table-panel">${panelHead('最近高风险事件', '需要优先确认的供应商风险', `<button class="btn btn-quiet btn-small" data-nav="risks">查看全部 ${icon('arrow')}</button>`)}${renderRiskTable(state.risks.filter((item) => item.level === 'high').slice(0, 4), true)}</div>
    </section>
    <section class="sub-grid"><div class="panel">${panelHead('巡检执行日志', '最近一次任务的关键节点')}${renderActivity()}</div><div class="panel">${panelHead('权威信源覆盖', 'gov 垂域检索命中来源')}${renderSourceSummary()}</div></section>`;
}

function kpiCard(label, value, suffix, iconMarkup, meta, tone) {
  return `<article class="kpi"><div class="kpi-label"><span class="kpi-icon">${iconMarkup}</span>${label}</div><div class="kpi-value">${value}<small style="font-size:13px;letter-spacing:0;color:var(--muted);margin-left:4px">${suffix}</small></div><div class="kpi-meta ${tone}">${meta}</div></article>`;
}

function renderTrendChart() {
  return `<div class="trend-chart"><div class="chart-y"><span>8</span><span>6</span><span>4</span><span>2</span><span>0</span></div><div class="chart-area"><svg class="trend-svg" viewBox="0 0 600 165" preserveAspectRatio="none"><path class="line-high" d="M0 140 C45 130 61 132 101 126 S150 120 188 108 S230 111 263 95 S315 112 351 89 S400 97 438 73 S480 80 522 45 S563 65 600 34"/><path class="line-mid" d="M0 111 C40 103 68 112 101 100 S152 93 188 91 S236 82 265 80 S311 89 351 71 S400 77 438 68 S482 55 522 67 S567 48 600 55"/><path class="line-low" d="M0 150 C47 146 65 143 101 144 S152 136 188 143 S233 135 263 130 S309 137 351 125 S400 128 438 123 S480 121 522 116 S563 110 600 113"/><circle class="chart-dot" cx="600" cy="34" r="4" fill="var(--red)"/><circle class="chart-dot" cx="600" cy="55" r="4" fill="var(--amber)"/><circle class="chart-dot" cx="600" cy="113" r="4" fill="var(--blue)"/></svg><div class="chart-x"><span>10.07</span><span>10.14</span><span>10.21</span><span>10.28</span><span>11.02</span></div></div></div><div class="chart-legend"><span class="legend-item"><i class="legend-dot" style="background:var(--red)"></i>高风险</span><span class="legend-item"><i class="legend-dot" style="background:var(--amber)"></i>中风险</span><span class="legend-item"><i class="legend-dot" style="background:var(--blue)"></i>低风险</span></div>`;
}

function renderDistribution() {
  const high = state.risks.filter((item) => item.level === 'high').length;
  const medium = state.risks.filter((item) => item.level === 'medium').length;
  const low = state.risks.filter((item) => item.level === 'low').length;
  const total = high + medium + low || 1;
  return `<div class="distribution-body"><div class="donut-row"><div class="donut"><div class="donut-center"><strong>${total}</strong><span>有效风险</span></div></div><div class="distribution-list">${distRow('high', high, total)}${distRow('medium', medium, total)}${distRow('low', low, total)}</div></div><div class="distribution-note">${icon('info')}<span>高风险事件将立即推送至企业微信、邮件和站内待办。</span></div></div>`;
}

function distRow(level, count, total) {
  const meta = riskLevelMeta[level];
  return `<div class="dist-row"><i style="width:8px;height:8px;border-radius:50%;background:var(--${level === 'high' ? 'red' : level === 'medium' ? 'amber' : 'blue'})"></i><div><div>${meta.label}</div><div class="dist-bar"><i style="width:${Math.round((count / total) * 100)}%;background:var(--${level === 'high' ? 'red' : level === 'medium' ? 'amber' : 'blue'})"></i></div></div><b class="dist-count">${count}</b></div>`;
}

function renderFlow() {
  const stages = [
    ['building', '台账', state.run.stage >= 1 ? '35 家已读取' : '等待开始'],
    ['spark', 'Query Agent', state.run.stage >= 2 ? '140 条已拆解' : '等待拆解'],
    ['search', 'gov 检索', state.run.stage >= 3 ? '318 条结果' : '等待检索'],
    ['shield', '交叉核验', state.run.stage >= 4 ? '7 条候选' : '等待核验'],
    ['alert', '分级告警', state.run.stage >= 5 ? '2 条高风险' : '等待分级'],
    ['file', '自动周报', state.run.stage >= 6 ? '已归档' : '等待生成'],
  ];
  return `<div class="flow-track">${stages.map(([ico, label, detail], index) => `<div class="flow-step ${state.run.stage > index ? 'done' : ''} ${state.run.stage === index ? 'current' : ''}"><div class="flow-node">${icon(ico)}</div><div class="flow-label">${label}</div><div class="flow-detail">${detail}</div></div>`).join('')}</div>`;
}

function renderRiskTable(items, compact = false) {
  if (!items.length) return '<div class="empty">暂无符合条件的风险事件</div>';
  return `<div class="table-wrap"><table><thead><tr><th>企业 / 事件</th><th>类型</th><th>等级</th><th>发现时间</th><th>处置状态</th><th></th></tr></thead><tbody>${items.map((item) => `<tr><td><div class="risk-title-cell"><i class="risk-severity-bar" style="background:var(--${item.level === 'high' ? 'red' : item.level === 'medium' ? 'amber' : 'blue'})"></i><div><div class="risk-title">${escapeHtml(item.title)}</div><div class="company-code">${escapeHtml(item.company)}</div></div></div></td><td class="risk-type">${item.type}</td><td>${levelTag(item.level)}</td><td class="mono">${item.date.replace('2026-', '')}</td><td>${statusTag(item.status)}</td><td><button class="row-action" data-action="open-risk" data-id="${item.id}">查看证据 ${icon('chevron')}</button></td></tr>`).join('')}</tbody></table></div>`;
}

function renderActivity() {
  return `<div class="activity-list">${state.logs.map((item) => `<div class="activity-item"><span class="activity-time">${item.time}</span><i class="activity-node ${item.tone}"></i><div class="activity-text">${escapeHtml(item.text)}</div></div>`).join('')}</div>`;
}

function renderSourceSummary() {
  return `<div class="source-summary"><div class="source-summary-row"><div class="source-icon">信</div><div class="source-info"><strong>信用中国</strong><span>creditchina.gov.cn</span></div><b class="source-pct">42%</b></div><div class="source-summary-row"><div class="source-icon">市</div><div class="source-info"><strong>国家企业信用公示系统</strong><span>gsxt.gov.cn</span></div><b class="source-pct">31%</b></div><div class="source-summary-row"><div class="source-icon">采</div><div class="source-info"><strong>中国政府采购网</strong><span>ccgp.gov.cn</span></div><b class="source-pct">19%</b></div><div class="source-summary-row"><div class="source-icon">住</div><div class="source-info"><strong>住建部监管平台</strong><span>mohurd.gov.cn</span></div><b class="source-pct">8%</b></div></div>`;
}

function renderCompanies() {
  const filtered = state.companies.filter((item) => {
    const query = companyFilters.query.toLowerCase();
    const matchQuery = !query || item.name.toLowerCase().includes(query) || item.code.toLowerCase().includes(query);
    const matchStatus =
      companyFilters.status === 'all'
        ? true
        : companyFilters.status === 'imported'
          ? item.origin === 'imported'
          : item.status === companyFilters.status;
    return matchQuery && matchStatus;
  });

  const importedCount = state.companies.filter((item) => item.origin === 'imported').length;
  const demoCount = state.companies.filter((item) => item.origin === 'demo').length;
  const demoHidden = loadHideDemo();

  const action = `<button class="btn btn-secondary" data-action="import-companies">${icon('plus')} 导入企业</button><button class="btn btn-primary" data-action="bulk-run">${icon('play')} 对选中企业巡检</button>`;
  const sub = `当前共 ${state.companies.length} 家企业 · 其中 ${importedCount} 家真实导入`;

  // 一家真实企业都没导入时，明确告知台账全是演示数据，避免误以为系统在查真实主体
  const banner = importedCount === 0
    ? `<div class="ledger-banner"><div class="ledger-banner-text"><b>这 ${demoCount} 家企业全部是演示数据</b>——它们并不真实存在，检索不到任何公示。粘贴你自己的供应商名单后，巡检才会返回真实结果。</div><button class="btn btn-primary btn-small" data-action="import-companies">${icon('plus')} 导入真实企业</button></div>`
    : '';

  const demoButton = demoCount > 0
    ? `<button class="btn btn-quiet btn-small" data-action="hide-demo">隐藏 ${demoCount} 家演示企业</button>`
    : demoHidden
      ? `<button class="btn btn-quiet btn-small" data-action="restore-demo">恢复演示企业</button>`
      : '';

  return `${pageTitle('企业台账', '管理监控主体、巡检频率和风险关注范围。', action)}${banner}<section class="panel company-table-panel">${panelHead('监控主体', sub, `<span class="filter-count">已选 ${selectedCompanies.size} 家</span>`)}<div class="toolbar"><div class="search-box">${icon('search')}<input data-input="company-query" value="${escapeHtml(companyFilters.query)}" placeholder="搜索企业名称或统一社会信用代码" /></div><select class="select" data-select="company-status"><option value="all" ${companyFilters.status === 'all' ? 'selected' : ''}>全部状态</option><option value="imported" ${companyFilters.status === 'imported' ? 'selected' : ''}>仅真实导入</option><option value="active" ${companyFilters.status === 'active' ? 'selected' : ''}>监控中</option><option value="paused" ${companyFilters.status === 'paused' ? 'selected' : ''}>已暂停</option></select><button class="btn btn-secondary btn-small" data-action="clear-company-filter">${icon('filter')} 筛选</button>${demoButton}</div>${renderCompanyTable(filtered)}</section>`;
}

function renderCompanyTable(items) {
  if (!items.length) {
    return `<div class="table-empty">没有匹配的企业。点右上角「导入企业」，粘贴真实企业名单后即可巡检。</div>`;
  }
  return `<div class="table-wrap"><table><thead><tr><th class="table-select"><input class="check" type="checkbox" data-action="select-all" ${items.length && items.every((item) => selectedCompanies.has(item.id)) ? 'checked' : ''}/></th><th>企业主体</th><th>所属行业</th><th>巡检频率</th><th>最近巡检</th><th>风险等级</th><th>状态</th><th></th></tr></thead><tbody>${items.map((item) => `<tr><td><input class="check" type="checkbox" data-action="select-company" data-id="${item.id}" ${selectedCompanies.has(item.id) ? 'checked' : ''}/></td><td><div class="company-cell"><span class="company-name">${escapeHtml(item.name)}${item.origin === 'imported' ? '<span class="origin-tag">真实</span>' : '<span class="origin-tag demo">演示</span>'}</span><span class="company-code">${escapeHtml(item.code || '—')}</span></div></td><td class="company-industry">${escapeHtml(item.industry || '—')}</td><td>${item.cadence}</td><td class="mono">${String(item.lastScan).replace('2026-', '')}</td><td>${levelTag(item.level)}</td><td>${statusTag(item.status)}</td><td><div class="row-actions"><button class="row-action" data-action="company-profile" data-id="${item.id}">查主体</button>${item.origin === 'imported' ? `<button class="row-action row-danger" data-action="remove-company" data-id="${item.id}">移除</button>` : ''}<button class="row-action" data-action="run-company" data-id="${item.id}">立即巡检</button></div></td></tr>`).join('')}</tbody></table></div>`;
}

function renderInspections() {
  const action = `<button class="btn btn-primary" data-action="run-inspection">${icon('play')} ${state.run.status === 'running' ? '巡检进行中' : '运行本周期巡检'}</button>`;
  // 跑过真实巡检后，本周期风险数改用真实结果，避免继续显示演示数字
  const liveRisks = state.risks.filter((risk) => risk.origin === 'live').length;
  const currentCount = liveRunDone ? liveRisks : 7;
  const currentDuration = liveRunDone ? state.run.duration : '01:09';
  return `${pageTitle('巡检任务', '批量任务按周期自动运行，所有检索与判级动作均可回溯。', action)}<section class="panel">${panelHead('任务记录', '最近 3 次任务执行情况', '<span class="code-label">APScheduler / Asia-Shanghai</span>')}<div class="task-list">${renderTaskRow('2026.10.27 - 11.02', state.run.status === 'running' ? state.run.progress : 100, state.run.status === 'running' ? '运行中' : '已完成', state.run.status === 'running' ? '00:34' : currentDuration, currentCount, liveRunDone ? '本周期 · 真实' : '本周期')} ${renderTaskRow('2026.10.20 - 10.26', 100, '已完成', '01:05', 5, '上周期（演示）')} ${renderTaskRow('2026.10.13 - 10.19', 100, '已完成', '01:14', 4, '历史任务（演示）')}</div></section><section class="sub-grid section-spacer"><div class="panel">${panelHead('当前任务明细', state.run.status === 'running' ? '实时更新执行进度' : '上次任务关键结果', `<span class="mode-tag">${state.run.current}</span>`)}${renderInspectionDetail()}</div><div class="panel">${panelHead('执行日志', 'Agent 与 SearchPro 调用记录')}${renderActivity()}</div></section>`;
}

function renderTaskRow(period, progress, status, duration, risks, label) {
  return `<div class="task-row"><div class="task-main"><span class="task-label">${label}</span><strong>${period}</strong><span>全量供应商台账</span></div><div><span class="task-label">进度</span><div class="task-progress"><i style="width:${progress}%"></i></div><span>${progress}%</span></div><div class="task-value"><span class="task-label">状态</span><strong>${status}</strong></div><div class="task-value"><span class="task-label">耗时</span><strong>${duration}</strong></div><div class="task-value"><span class="task-label">风险</span><strong>${risks} 条</strong></div><button class="btn btn-secondary btn-small" data-action="show-report">查看报告 ${icon('arrow')}</button></div>`;
}

function renderInspectionDetail() {
  const rows = state.companies
    .slice(0, 6)
    .map((company) => {
      const own = state.risks.filter(
        (risk) => risk.company === company.name || risk.companyId === company.id
      );
      const high = own.filter((risk) => risk.level === 'high').length;
      const medium = own.filter((risk) => risk.level === 'medium').length;

      let icon = '✓';
      let tone = 'var(--teal)';
      let bg = 'var(--teal-soft)';
      let text = '4 类 Query 已完成核验';
      let tag = statusTag('closed');

      if (high) {
        icon = '!'; tone = 'var(--red)'; bg = 'var(--red-soft)';
        text = `${high} 条高风险已进入告警队列`;
        tag = levelTag('high');
      } else if (medium) {
        icon = '!'; tone = 'var(--amber)'; bg = 'var(--amber-soft)';
        text = `${medium} 条中风险待复核`;
        tag = levelTag('medium');
      } else if (own.length) {
        text = `${own.length} 条低风险，已归档`;
      } else if (company.lastScan === '未巡检') {
        icon = '·'; tone = 'var(--subtle)'; bg = 'var(--surface-soft)';
        text = '尚未巡检';
        tag = '<span class="status">待巡检</span>';
      } else if (company.origin === 'imported') {
        text = '真实检索完成，未发现达采信标准的风险';
      }

      return `<div class="source-summary-row"><div class="source-icon" style="background:${bg};color:${tone}">${icon}</div><div class="source-info"><strong>${escapeHtml(company.name)}</strong><span>${text}</span></div><div>${tag}</div></div>`;
    })
    .join('');
  return `<div class="source-summary">${rows}</div>`;
}

function renderRisks() {
  const types = [...new Set(state.risks.map((item) => item.type))];
  const filtered = state.risks.filter((item) => (!riskFilters.query || `${item.company}${item.title}`.toLowerCase().includes(riskFilters.query.toLowerCase())) && (riskFilters.level === 'all' || item.level === riskFilters.level) && (riskFilters.type === 'all' || item.type === riskFilters.type));
  const action = `<button class="btn btn-secondary" data-action="export-risks">${icon('download')} 导出风险清单</button>`;
  return `${pageTitle('风险事件', '从权威信源识别、核验并留痕每一条风险变化。', action)}<section class="panel risk-list-panel">${panelHead('风险清单', '只展示已通过 gov 信源与规则核验的事件', `<span class="filter-count">共 ${filtered.length} 条</span>`)}<div class="toolbar"><div class="search-box">${icon('search')}<input data-input="risk-query" value="${escapeHtml(riskFilters.query)}" placeholder="搜索企业、事件标题" /></div><select class="select" data-select="risk-level"><option value="all">全部等级</option><option value="high" ${riskFilters.level === 'high' ? 'selected' : ''}>高风险</option><option value="medium" ${riskFilters.level === 'medium' ? 'selected' : ''}>中风险</option><option value="low" ${riskFilters.level === 'low' ? 'selected' : ''}>低风险</option></select><select class="select" data-select="risk-type"><option value="all">全部类型</option>${types.map((type) => `<option value="${type}" ${riskFilters.type === type ? 'selected' : ''}>${type}</option>`).join('')}</select></div>${renderRiskTable(filtered)}</section>`;
}

function renderAlerts() {
  const filtered = state.alerts.filter((item) => alertFilter === 'all' || item.status === alertFilter);
  const tabs = [['pending', '待处理'], ['acknowledged', '已确认'], ['ignored', '已忽略'], ['closed', '已关闭'], ['all', '全部']];
  return `${pageTitle('告警中心', '按风险等级分流处置，确保高风险事件有人确认、有人跟进。', '<button class="btn btn-secondary" data-action="refresh-alerts">'+icon('refresh')+' 刷新状态</button>')}<section class="panel alert-list-panel">${panelHead('告警队列', '高风险已通过企业微信、邮件和站内通知发送', '')}<div class="toolbar">${tabs.map(([key, label]) => `<button class="btn ${alertFilter === key ? 'btn-primary' : 'btn-secondary'} btn-small" data-alert-filter="${key}">${label} ${key === 'pending' ? `<span style="font-family:var(--font-mono);margin-left:2px">${state.alerts.filter((item) => item.status === 'pending').length}</span>` : ''}</button>`).join('')}</div>${filtered.length ? `<div class="table-wrap"><table><thead><tr><th>告警事件</th><th>等级</th><th>发送渠道</th><th>负责人</th><th>创建时间</th><th>状态</th><th>操作</th></tr></thead><tbody>${filtered.map((item) => `<tr><td><div class="company-cell"><span class="company-name">${escapeHtml(item.title)}</span><span class="company-code">${escapeHtml(item.company)}</span></div></td><td>${levelTag(item.level)}</td><td><div style="display:flex;gap:5px;flex-wrap:wrap">${item.channels.map((channel) => `<span class="source-chip">${channel}</span>`).join('')}</div></td><td><div class="owner-cell"><div class="owner-avatar">${item.owner === '待指派' ? '?' : item.owner.slice(0, 1)}</div>${item.owner}</div></td><td class="mono">${item.createdAt}</td><td>${statusTag(item.status)}</td><td>${item.status === 'pending' ? `<button class="btn btn-primary btn-small" data-action="ack-alert" data-id="${item.id}">确认告警</button>` : `<button class="row-action" data-action="open-risk" data-id="${item.riskId}">查看事件 ${icon('chevron')}</button>`}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">当前筛选下没有告警</div>'}</section>`;
}

function renderReports() {
  const action = `<button class="btn btn-primary" data-action="generate-report">${icon('file')} 生成本周周报</button>`;
  return `${pageTitle('周报中心', '巡检结果自动汇总为可审计、可转发的合规周报。', action)}<section class="panel report-panel">${panelHead('自动周报', '每周一 10:00 自动生成，保留所有官方原文链接', '<span class="code-label">Markdown / HTML</span>')}<div class="report-grid">${state.reports.map((report) => `<article class="report-card"><div class="report-card-top"><div class="report-period">${report.period}</div><span class="report-status">${report.status === 'ready' ? '已生成' : '生成中'}</span></div><div class="report-meta">覆盖 ${report.companies} 家企业 · ${report.createdAt} · ${report.size}</div><div class="report-counts"><div class="report-count"><strong style="color:var(--red)">${report.high}</strong><span>高风险</span></div><div class="report-count"><strong style="color:var(--amber)">${report.medium}</strong><span>中风险</span></div><div class="report-count"><strong style="color:var(--blue)">${report.low}</strong><span>低风险</span></div></div><div class="report-actions"><button class="btn btn-quiet btn-small" data-action="show-report" data-id="${report.id}">预览报告 ${icon('arrow')}</button><button class="icon-button" data-action="download-report" data-id="${report.id}" aria-label="下载报告">${icon('download')}</button></div></article>`).join('')}</div></section><section class="sub-grid section-spacer"><div class="panel">${panelHead('报告内容结构', '每一条风险都包含可追溯证据')}${renderReportOutline()}</div><div class="panel">${panelHead('发送记录', '已配置的内部交付渠道')}${renderDelivery()}</div></section>`;
}

function renderReportOutline() {
  return `<div class="activity-list"><div class="activity-item"><span class="activity-time">01</span><i class="activity-node success"></i><div class="activity-text"><strong>执行摘要</strong><br/>本周期覆盖企业、风险趋势、处理率</div></div><div class="activity-item"><span class="activity-time">02</span><i class="activity-node success"></i><div class="activity-text"><strong>分级风险清单</strong><br/>按高、中、低风险分组并保留判级依据</div></div><div class="activity-item"><span class="activity-time">03</span><i class="activity-node success"></i><div class="activity-text"><strong>官方证据索引</strong><br/>每条事件对应 gov 原文 Deeplinks</div></div><div class="activity-item"><span class="activity-time">04</span><i class="activity-node success"></i><div class="activity-text"><strong>处置建议</strong><br/>待确认告警、负责人和下一步动作</div></div></div>`;
}

function renderDelivery() {
  return `<div class="source-summary"><div class="source-summary-row"><div class="source-icon">企</div><div class="source-info"><strong>企业微信机器人</strong><span>高风险即时推送 · 已送达</span></div><b class="source-pct">09:43</b></div><div class="source-summary-row"><div class="source-icon">邮</div><div class="source-info"><strong>风险负责人邮箱</strong><span>weekly-risk@hengyuan.cn</span></div><b class="source-pct">10:05</b></div><div class="source-summary-row"><div class="source-icon">站</div><div class="source-info"><strong>站内归档</strong><span>报告中心 · 可追溯</span></div><b class="source-pct">完成</b></div></div>`;
}

function renderAssistant() {
  const quick = ['查一下华东智造设备有限公司', '为什么判定为高风险？', '生成单企业简报'];
  return `${pageTitle('AI 风控助手', '用自然语言查询企业风险，Agent 会自动调用 gov 权威检索和 MCP 工具。', '<span class="mode-tag">MCP · query_company_risk</span>')}<div class="assistant-layout"><section class="panel assistant-panel"><div class="assistant-head"><div class="assistant-identity"><div class="assistant-mark">${icon('spark')}</div><div><div class="assistant-name">衡源 Agent</div><div class="assistant-status">${getSource().live ? '在线 · 元宝搜索真实接口' : `演示模式 · ${escapeHtml(getSource().reason)}`}</div></div></div><button class="icon-button" data-action="clear-assistant" aria-label="清空对话">${icon('refresh')}</button></div>${getSource().live ? '' : `<div class="demo-banner">演示模式：未连接真实接口，下面的回答是内置样例数据。<a href="/debug" target="_blank" rel="noreferrer">去自测台验证接口 →</a></div>`}<div class="assistant-messages">${state.assistant.map((message) => renderMessage(message)).join('')}</div><div class="assistant-input"><div class="quick-prompts">${quick.map((prompt) => `<button class="quick-prompt" data-assistant-prompt="${escapeHtml(prompt)}">${prompt}</button>`).join('')}</div><div class="compose"><input data-input="assistant" placeholder="输入企业名称或风险问题，例如：查一下远澜新材料最近的资质状态"/><button class="btn btn-primary" data-action="send-assistant">发送 ${icon('arrow')}</button></div></div></section><aside class="assistant-side"><section class="panel agent-card">${panelHead('本次调用链', '自动拆解为 4 类 gov Query')}${['行政处罚', '经营异常', '招投标违规', '资质证书到期'].map((query, index) => `<div class="agent-query"><span class="query-index">0${index + 1}</span><div class="query-info"><strong>${query}</strong><span>Industry=gov · Freshness=d7</span></div><span class="agent-check">${icon('check')}</span></div>`).join('')}</section><div class="callout"><div class="callout-title">MCP 能力已接通</div><div class="callout-copy">内部 AI 助手只需传入企业名称，即可复用同一套风险查询、分级和证据返回能力。</div></div><section class="panel agent-card">${panelHead('查询结果规范', '每次回答都要有依据')}${['官方域名优先', '两条信源交叉核验', '风险等级可解释', '原文链接可追溯'].map((item) => `<div class="agent-query"><span class="agent-check">${icon('shield')}</span><div class="query-info"><strong>${item}</strong></div></div>`).join('')}</section></aside></div>`;
}

function renderMessage(message) {
  if (message.type === 'loading') {
    return `<div class="message"><div class="message-bubble live-loading"><span class="live-spinner"></span>${escapeHtml(message.text)}</div><span class="message-time">查询中</span></div>`;
  }

  if (message.type === 'error') {
    return `<div class="message"><div class="message-bubble live-error"><strong>检索失败</strong><div style="margin-top:6px">${escapeHtml(message.text)}</div><div style="margin-top:8px"><a class="text-link" href="/debug" target="_blank" rel="noreferrer">打开自测台排查 →</a></div></div><span class="message-time">${message.time}</span></div>`;
  }

  if (message.type === 'notice') {
    return `<div class="message"><div class="message-bubble live-notice">${escapeHtml(message.text)}</div><span class="message-time">${message.time}</span></div>`;
  }

  if (message.type === 'live') return renderLiveResult(message);

  if (message.type === 'result') {
    const risk = state.risks[0];
    return `<div class="message"><div class="message-bubble"><strong>已完成 gov 权威检索</strong><span class="mock-chip">演示数据</span><div style="margin-top:7px">${escapeHtml(message.text)}</div><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">${levelTag(risk.level)}<span class="source-chip">双源核验</span><span class="source-chip">${risk.sources.length} 条原文</span></div><div style="display:flex;gap:7px;margin-top:13px"><button class="btn btn-secondary btn-small" data-action="open-risk" data-id="${risk.id}">查看证据</button><button class="btn btn-primary btn-small" data-action="ack-alert" data-id="alert-001">加入告警</button></div></div><span class="message-time">${message.time}</span></div>`;
  }

  return `<div class="message ${message.role === 'user' ? 'user' : ''}"><div class="message-bubble">${escapeHtml(message.text)}</div><span class="message-time">${message.time}</span></div>`;
}

/** 真实检索结果：逐条展示风险与线索，并明确标注证据等级与能力边界 */
function renderLiveResult(message) {
  const {
    company,
    risks = [],
    leads = [],
    errors = [],
    durationMs = 0,
    returnedTotal = 0,
    nameMatchedTotal = 0,
  } = message.payload;

  const stats = `<div class="live-meta"><span>${escapeHtml(company)}</span><b>${risks.length}</b> 条风险 · <b>${leads.length}</b> 条线索 · 检索 ${returnedTotal} 条 / 提及该企业 ${nameMatchedTotal} 条 · ${durationMs}ms</div>`;

  let body = '';
  if (risks.length) {
    body = risks.map((risk) => `<div class="live-risk">
      <div class="live-risk-top">${levelTag(risk.level)}<span class="source-chip">${risk.confidence === 'strong' ? '强证据' : '中等证据'}</span><span class="source-chip">证据 ${risk.score}/100</span><span class="source-chip">${risk.type}</span></div>
      <div class="live-risk-title">${risk.url ? `<a href="${risk.url}" target="_blank" rel="noreferrer">${escapeHtml(risk.title)}</a>` : escapeHtml(risk.title)}</div>
      <div class="live-risk-sum">${escapeHtml((risk.summary || '').slice(0, 200))}</div>
      <div class="live-risk-src">${(risk.sources || []).map((s) => escapeHtml(s.name)).join(' · ') || '—'}</div>
    </div>`).join('');
  } else if (nameMatchedTotal === 0) {
    // 检索跑了但结果与该企业无关，这是最常见的情况，必须解释清楚
    body = `<div class="live-empty live-empty-warn"><b>检索已完成，但没有一条结果提到这家企业。</b><br/>${returnedTotal} 条返回内容全是行业新闻、政策解读或问答，正文里不含该公司名称。元宝搜索做的是<b>主题检索</b>，不是企业主体检索——长尾企业名会被拆成关键词匹配主题，返回结果与主体无关。<br/>要按主体精确核查，请用统一社会信用代码查<b>信用中国</b>或<b>国家企业信用信息公示系统</b>。</div>`;
  } else {
    body = `<div class="live-empty">没有达到采信标准的风险事件。检索到 ${nameMatchedTotal} 条提及该企业的内容，但均未同时满足「官方域名 + 风险关键词 + 证据等级」三条门槛，已归入下方待核实线索。</div>`;
  }

  if (leads.length) {
    body += `<div class="live-leads-title">待核实线索 ${leads.length} 条（不计入风险库）</div>` +
      leads.slice(0, 4).map((lead) => `<div class="live-lead">
        <div class="live-risk-top"><span class="source-chip">${escapeHtml(lead.type)}</span><span class="source-chip">${escapeHtml(lead.date || '日期未知')}</span></div>
        <div class="live-risk-title">${lead.url ? `<a href="${lead.url}" target="_blank" rel="noreferrer">${escapeHtml(lead.title)}</a>` : escapeHtml(lead.title)}</div>
        <div class="live-risk-src">${escapeHtml(lead.source || '')} · ${escapeHtml(lead.reason || '')}</div>
      </div>`).join('');
  }

  if (errors.length) {
    body += `<div class="live-caveat">有 ${errors.length} 条 Query 调用失败：${escapeHtml(errors[0].code || errors[0].message || '')}</div>`;
  }

  return `<div class="message"><div class="message-bubble"><strong>已完成元宝搜索检索</strong><span class="live-chip">真实接口</span>${stats}${body}<div class="live-caveat">结论由公开信息检索推断，不构成处罚认定。当事人身份需人工核实，处罚归属以信用中国 / 国家企业信用信息公示系统为准。</div></div><span class="message-time">${message.time}</span></div>`;
}

function renderSettings() {
  return `${pageTitle('系统设置', '配置巡检节奏、数据源和风险处置规则。', '<button class="btn btn-primary" data-action="save-settings">保存设置</button>')}<div class="settings-grid"><section class="panel">${panelHead('巡检策略', '本地演示配置会实时影响闭环状态')}<div class="settings-list"><div class="setting-row"><div><div class="setting-title">自动巡检频率</div><div class="setting-copy">任务调度器的默认触发周期</div></div><select class="select" data-setting="cadence"><option ${state.settings.cadence === '每周一 02:00' ? 'selected' : ''}>每周一 02:00</option><option ${state.settings.cadence === '每日 02:00' ? 'selected' : ''}>每日 02:00</option><option ${state.settings.cadence === '每月 1 日 02:00' ? 'selected' : ''}>每月 1 日 02:00</option></select></div><div class="setting-row"><div><div class="setting-title">Freshness 时效范围</div><div class="setting-copy">只检索最近时间窗内新增公示</div></div><select class="select" data-setting="freshness"><option ${state.settings.freshness === '近 7 天' ? 'selected' : ''}>近 7 天</option><option ${state.settings.freshness === '近 30 天' ? 'selected' : ''}>近 30 天</option></select></div><div class="setting-row"><div><div class="setting-title">高风险即时推送</div><div class="setting-copy">行政处罚、经营异常、严重失信、招投标作废</div></div><button class="toggle ${state.settings.wecom ? 'on' : ''}" data-toggle="wecom" aria-label="切换企业微信推送"></button></div><div class="setting-row"><div><div class="setting-title">周报邮件分发</div><div class="setting-copy">周报生成后自动发送至风险负责人</div></div><button class="toggle ${state.settings.email ? 'on' : ''}" data-toggle="email" aria-label="切换邮件分发"></button></div></div></section><section class="panel">${panelHead('数据源与接入', 'Demo 中使用稳定的结构化样例结果')}<div class="settings-list"><div class="setting-row"><div><div class="setting-title">元宝 SearchPro</div><div class="setting-copy">Industry=gov · Mode=1 · Deeplinks</div></div><span class="status active">在线</span></div><div class="setting-row"><div><div class="setting-title">MCP 风控工具</div><div class="setting-copy">query_company_risk · streamableHttp</div></div><span class="status active">已接通</span></div><div class="setting-row"><div><div class="setting-title">当前数据模式</div><div class="setting-copy">比赛演示使用本地可重复数据，不暴露真实密钥</div></div><select class="select" data-setting="mode"><option ${state.settings.mode === '演示数据' ? 'selected' : ''}>演示数据</option><option ${state.settings.mode === '真实接口占位' ? 'selected' : ''}>真实接口占位</option></select></div><div class="setting-row"><div><div class="setting-title">系统版本</div><div class="setting-copy">QH-RISK / 2026.11</div></div><span class="code-label">STABLE</span></div></div></section></div>`;
}

function openRiskDrawer(id) {
  const risk = state.risks.find((item) => item.id === id);
  if (!risk) return;
  document.querySelector('#drawer-root').innerHTML = `<div class="drawer-backdrop" data-action="close-drawer"></div><aside class="drawer"><div class="drawer-head"><div><div class="drawer-title">${escapeHtml(risk.title)}</div><div class="drawer-sub">${escapeHtml(risk.company)} · ${risk.date}</div></div><button class="icon-button" data-action="close-drawer" aria-label="关闭">${icon('close')}</button></div><div class="drawer-body"><div style="display:flex;align-items:center;justify-content:space-between;gap:10px">${levelTag(risk.level)}<span class="mono">证据强度 ${risk.score}/100</span></div><div class="evidence-score"><div class="score-big">${risk.score}<span style="font-size:12px;color:var(--muted);letter-spacing:0">/100</span></div><div class="score-copy">基于官方信源、关键词<br/>和交叉核验综合计算</div></div><div class="evidence-section"><div class="evidence-section-title">事件摘要</div><div class="evidence-summary">${escapeHtml(risk.summary)}</div></div><div class="evidence-section"><div class="evidence-section-title">判级依据</div><div class="reason-box">${escapeHtml(risk.reason)}</div></div><div class="evidence-section"><div class="evidence-section-title">权威原文（Deeplinks）</div><div class="source-list">${risk.sources.map((source) => `<div class="source-row"><div class="source-icon">${source.name.slice(0, 1)}</div><div class="source-row-info"><strong>${escapeHtml(source.name)}</strong><span>${source.domain}</span></div><a class="source-open" href="${source.url}" target="_blank" rel="noreferrer">打开原文 ${icon('arrow')}</a></div>`).join('')}</div></div></div><div class="drawer-footer"><button class="btn btn-secondary" data-action="close-drawer">关闭</button>${risk.level === 'high' ? `<button class="btn btn-primary" data-action="ack-alert" data-id="${state.alerts.find((item) => item.riskId === risk.id)?.id || 'alert-001'}">确认并跟进</button>` : ''}</div></aside>`;
}

/* ---------------------------------------------------------------- 导入企业 */

/**
 * 解析粘贴的名单，每行一家企业。
 * 支持：企业全称 / 企业全称,信用代码 / 企业全称<TAB>信用代码 / 企业全称 信用代码
 */
function parseCompanyList(text) {
  const existing = new Set(state.companies.map((item) => item.name));
  const accepted = [];
  let skipped = 0;

  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    let parts = line.split(/[,，\t|]+/).map((part) => part.trim()).filter(Boolean);
    if (parts.length === 1) {
      const matched = line.match(/^(.*?)\s+([0-9A-Z]{18})$/);
      if (matched) parts = [matched[1].trim(), matched[2]];
    }

    // 去掉「1. 」「2、」这类序号
    const name = (parts[0] || '').replace(/^\d+[.、)]\s*/, '').trim();
    const code = parts[1] || '';

    if (name.length < 2 || existing.has(name)) {
      skipped += 1;
      continue;
    }

    existing.add(name);
    accepted.push({
      id: `imported-${Date.now()}-${accepted.length}`,
      name,
      code,
      industry: parts[2] || '待补充',
      status: 'active',
      cadence: '手动',
      lastScan: '未巡检',
      level: 'low',
      alert: 'none',
      origin: 'imported',
    });
  }

  return { accepted, skipped };
}

function openImportModal() {
  document.querySelector('#modal-root').innerHTML = `<div class="modal-backdrop" data-action="close-modal"></div><section class="modal"><div class="modal-head"><div class="modal-title">导入真实企业</div><button class="icon-button" data-action="close-modal" aria-label="关闭">${icon('close')}</button></div><div class="modal-body"><div class="import-hint">每行一家企业，两种写法都支持：<br/><code>企业全称</code>　或　<code>企业全称,统一社会信用代码</code><br/>从 Excel 复制「名称」「信用代码」两列直接粘贴即可，逗号、制表符、竖线都能识别。</div><textarea class="import-area" data-input="import-text" placeholder="在这里粘贴企业名单，每行一家……"></textarea><div class="import-error" id="import-error"></div><div class="import-note">导入后这些企业标记为「真实」，巡检会调用元宝搜索检索真实公示信息，并保存到本地（刷新不丢）。想只看真实企业，可在台账点「隐藏演示企业」。</div></div><div class="drawer-footer"><button class="btn btn-secondary" data-action="close-modal">取消</button><button class="btn btn-primary" data-action="submit-import">开始导入</button></div></section>`;
  setTimeout(() => document.querySelector('[data-input="import-text"]')?.focus(), 60);
}

function submitImport() {
  const area = document.querySelector('[data-input="import-text"]');
  const errorBox = document.querySelector('#import-error');
  const raw = (area?.value || '').trim();

  if (!raw) {
    if (errorBox) errorBox.textContent = '文本框是空的——需要先粘贴企业名单，上面的灰色文字只是占位提示，不会被导入。';
    area?.focus();
    return;
  }

  const { accepted, skipped } = parseCompanyList(raw);

  if (!accepted.length) {
    if (errorBox) {
      errorBox.textContent = `解析了 ${skipped} 行，但没有有效企业（可能全部重复或格式不对）。格式：企业全称,统一社会信用代码`;
    }
    return;
  }

  state.companies = [...accepted, ...state.companies];
  saveImportedCompanies(state.companies.filter((item) => item.origin === 'imported'));
  document.querySelector('#modal-root').innerHTML = '';
  companyFilters.status = 'imported';
  rerender();
  showToast(`已导入 ${accepted.length} 家企业${skipped ? `，跳过 ${skipped} 行（重复或无效）` : ''}`);
}

function removeCompany(id) {
  state.companies = state.companies.filter((item) => item.id !== id);
  selectedCompanies.delete(id);
  saveImportedCompanies(state.companies.filter((item) => item.origin === 'imported'));
  rerender();
  showToast('已从台账移除该企业');
}

/** 单企业巡检：立即调用真实接口 */
async function runSingleCompany(id) {
  const company = state.companies.find((item) => item.id === id);
  if (!company) return;

  if (!getSource().live) {
    showToast('演示模式：未调用真实接口，去 /debug 配置密钥', 'info');
    return;
  }

  showToast(`正在检索「${company.name}」…`, 'info');
  try {
    const result = await inspectCompany({ name: company.name, code: company.code });
    const added = applyLiveResults(result.risks || [], [company]);
    liveRunDone = true;
    rerender();
    showToast(`${company.name}：新增 ${added} 条风险 / ${(result.leads || []).length} 条线索`);
  } catch (error) {
    showToast(`检索失败：${error.message}`, 'warning');
  }
}

/* -------------------------------------------------------------- 企业主体查询 */

/** 打开企业主体信息抽屉（工商登记字段，来自企查查/天眼查） */
async function openCompanyDrawer(id) {
  const company = state.companies.find((item) => item.id === id);
  if (!company) return;

  const root = document.querySelector('#drawer-root');
  root.innerHTML = `<div class="drawer-backdrop" data-action="close-drawer"></div><aside class="drawer"><div class="drawer-head"><div><div class="drawer-title">${escapeHtml(company.name)}</div><div class="drawer-sub">正在查询工商登记信息…</div></div><button class="icon-button" data-action="close-drawer" aria-label="关闭">${icon('close')}</button></div><div class="drawer-body"><div class="live-loading" style="padding:20px 0"><span class="live-spinner"></span>正在调用企业征信接口…</div></div></aside>`;

  try {
    const data = await fetchCompanyProfile(company.name);
    const p = data.profile || {};
    const rows = [
      ['统一社会信用代码', p.creditCode],
      ['登记状态', p.status],
      ['法定代表人', p.legalPerson],
      ['注册资本', p.regCapital],
      ['实缴资本', p.actualCapital],
      ['成立日期', p.establishedAt],
      ['参保人数', p.staffCount],
      ['所属行业', p.industry],
      ['注册地址', p.address],
    ]
      .filter(([, value]) => value)
      .map(
        ([label, value]) =>
          `<div class="profile-row"><span class="profile-label">${label}</span><span class="profile-value">${escapeHtml(String(value))}</span></div>`
      )
      .join('');

    root.innerHTML = `<div class="drawer-backdrop" data-action="close-drawer"></div><aside class="drawer"><div class="drawer-head"><div><div class="drawer-title">${escapeHtml(p.name || company.name)}</div><div class="drawer-sub">数据源：${escapeHtml(data.providerName || '企业征信接口')}</div></div><button class="icon-button" data-action="close-drawer" aria-label="关闭">${icon('close')}</button></div><div class="drawer-body">${rows ? `<div class="profile-grid">${rows}</div>` : '<div class="empty">接口没有返回可用字段。</div>'}${p.businessScope ? `<div class="evidence-section"><div class="evidence-section-title">经营范围</div><div class="evidence-summary">${escapeHtml(p.businessScope)}</div></div>` : ''}</div><div class="drawer-footer"><button class="btn btn-secondary" data-action="close-drawer">关闭</button><button class="btn btn-primary" data-action="run-company" data-id="${company.id}">继续查风险</button></div></aside>`;
  } catch (error) {
    const notConfigured = error.code === 'NO_PROVIDER';
    const q = encodeURIComponent(company.name);
    const jump = `<div class="evidence-section"><div class="evidence-section-title">先去这些平台核对（新窗口打开）</div><div class="source-list">
      <a class="source-row" href="https://www.qcc.com/web/search?key=${q}" target="_blank" rel="noreferrer"><span class="source-icon">企</span><span class="source-row-info"><strong>企查查</strong><span>工商登记 / 涉诉 / 失信 / 商标</span></span><span class="source-open">打开 ↗</span></a>
      <a class="source-row" href="https://www.tianyancha.com/search?key=${q}" target="_blank" rel="noreferrer"><span class="source-icon">天</span><span class="source-row-info"><strong>天眼查</strong><span>工商登记 / 司法风险 / 经营异常</span></span><span class="source-open">打开 ↗</span></a>
      <a class="source-row" href="https://aiqicha.baidu.com/s?q=${q}" target="_blank" rel="noreferrer"><span class="source-icon">爱</span><span class="source-row-info"><strong>爱企查</strong><span>免费工商信息 / 股东 / 主要人员</span></span><span class="source-open">打开 ↗</span></a>
      <a class="source-row" href="https://www.gsxt.gov.cn/index.html" target="_blank" rel="noreferrer"><span class="source-icon">政</span><span class="source-row-info"><strong>国家企业信用信息公示系统</strong><span>官方权威源，需手动输入企业名 + 验证码</span></span><span class="source-open">打开 ↗</span></a>
    </div></div>`;
    root.innerHTML = `<div class="drawer-backdrop" data-action="close-drawer"></div><aside class="drawer"><div class="drawer-head"><div><div class="drawer-title">${escapeHtml(company.name)}</div><div class="drawer-sub">主体信息查询</div></div><button class="icon-button" data-action="close-drawer" aria-label="关闭">${icon('close')}</button></div><div class="drawer-body">${
      notConfigured
        ? `<div class="live-empty live-empty-warn"><b>系统内还没接企业征信数据源。</b><br/>注册资本、实缴资本、参保人数、法定代表人、经营状态这些是数据库的结构化字段，元宝搜索（主题检索）给不了，必须接一家征信 API。<br/>配置方式：在 <code>server/.env</code> 填 <code>QCC_KEY</code> + <code>QCC_SECRET_KEY</code>（企查查）或 <code>TYC_TOKEN</code>（天眼查），重启服务后这里就会直接出表。</div>${jump}`
        : `<div class="live-error">查询失败：${escapeHtml(error.message)}${error.hint ? '｜' + escapeHtml(error.hint) : ''}</div>${jump}`
    }</div><div class="drawer-footer"><button class="btn btn-secondary" data-action="close-drawer">关闭</button><button class="btn btn-primary" data-action="run-company" data-id="${company.id}">继续查风险</button></div></aside>`;
  }
}

function openReportModal(id = 'report-001') {
  const report = state.reports.find((item) => item.id === id) || state.reports[0];
  const risks = state.risks;
  document.querySelector('#modal-root').innerHTML = `<div class="modal-backdrop" data-action="close-modal"></div><section class="modal wide"><div class="modal-head"><div class="modal-title">周报预览 · ${report.period}</div><button class="icon-button" data-action="close-modal" aria-label="关闭">${icon('close')}</button></div><div class="modal-body"><div class="report-preview"><h2>供应商合规巡检周报</h2><div class="report-date">巡检周期：${report.period}　生成时间：${report.createdAt}　数据源：SearchPro gov</div><div class="report-highlight"><div><strong>${report.companies}</strong><span>覆盖企业</span></div><div><strong>${report.total}</strong><span>有效风险</span></div><div><strong style="color:var(--red)">${report.high}</strong><span>高风险</span></div><div><strong style="color:var(--teal)">92%</strong><span>权威召回率</span></div></div><div class="preview-section"><h3>一、重点风险</h3>${risks.filter((item) => item.level === 'high').map((item) => `<div class="preview-risk"><div>${levelTag(item.level)}</div><div><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.company)} · ${escapeHtml(item.summary)} · <a class="text-link" href="${item.sources[0].url}" target="_blank" rel="noreferrer">查看官方原文</a></span></div></div>`).join('')}</div><div class="preview-section"><h3>二、风险分布</h3><div class="preview-risk"><div style="width:100%"><strong>高风险 2 条　中风险 3 条　低风险 2 条</strong><span>较上周期风险总量下降 22%，高风险均已进入告警队列。</span></div></div></div><div class="preview-section"><h3>三、处置建议</h3><div class="preview-risk"><div style="width:100%"><strong>优先完成 2 条高风险告警确认</strong><span>建议采购与法务负责人在 24 小时内完成供应商复核，并在系统中补充处置意见。</span></div></div></div></div></div><div class="drawer-footer"><button class="btn btn-secondary" data-action="copy-report">${icon('copy')} 复制 Markdown</button><button class="btn btn-primary" data-action="download-report">${icon('download')} 下载周报</button></div></section>`;
}

function reportMarkdown(report = state.reports[0]) {
  return `# 供应商合规巡检周报\n\n巡检周期：${report.period}\n生成时间：${report.createdAt}\n数据源：SearchPro gov\n\n## 执行摘要\n- 覆盖企业：${report.companies} 家\n- 有效风险：${report.total} 条\n- 高风险：${report.high} 条\n- 权威召回率：92%\n\n## 重点风险\n${state.risks.filter((item) => item.level === 'high').map((item) => `- **${item.title}**（${item.company}）\n  - ${item.summary}\n  - 官方原文：${item.sources[0].url}`).join('\\n')}\n\n## 处置建议\n优先完成高风险告警确认，并在供应商复核后补充处置意见。`;
}

function downloadReport(id) {
  const report = state.reports.find((item) => item.id === id) || state.reports[0];
  const blob = new Blob([reportMarkdown(report)], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `hengyuan-risk-report-${report.period.replaceAll('.', '').replaceAll(' ', '').replaceAll('-', '_')}.md`;
  link.click();
  URL.revokeObjectURL(url);
  showToast('周报已下载为 Markdown 文件');
}

function showToast(message, tone = 'success') {
  clearTimeout(toastTimer);
  const region = document.querySelector('#toast-region');
  region.innerHTML = `<div class="toast">${icon(tone === 'success' ? 'check' : 'info')}<span>${escapeHtml(message)}</span></div>`;
  toastTimer = setTimeout(() => { region.innerHTML = ''; }, 3200);
}

function rerender() {
  document.querySelector('#app').innerHTML = appShell();
}

/** 巡检目标：优先用户勾选的企业，否则取台账前 3 家（真实接口单次最多 5 家） */
function pickInspectionTargets() {
  const selected = state.companies.filter((company) => selectedCompanies.has(company.id));
  return (selected.length ? selected : state.companies).slice(0, 3);
}

/** 把真实检索结果合并进风险库与告警中心，返回新增条数 */
function applyLiveResults(risks, targets = []) {
  const seen = new Set(state.risks.map((risk) => risk.url || risk.id));
  const fresh = risks
    .filter((risk) => !seen.has(risk.url || risk.id))
    .map((risk) => ({ ...risk, origin: 'live' }));

  state.risks = [...fresh, ...state.risks];
  saveLiveRisks(state.risks.filter((risk) => risk.origin === 'live'));

  fresh
    .filter((risk) => risk.level === 'high')
    .forEach((risk, index) => {
      state.alerts.unshift({
        id: `alert-live-${Date.now()}-${index}`,
        riskId: risk.id,
        company: risk.company,
        title: risk.title,
        level: risk.level,
        status: 'pending',
        owner: '待指派',
        createdAt: '刚刚',
        channels: ['企业微信', '邮件', '站内'],
      });
    });

  // 回写台账的最近巡检时间与风险等级
  targets.forEach((company) => {
    const own = fresh.filter(
      (risk) => risk.companyId === company.id || risk.company === company.name
    );
    company.lastScan = '刚刚';
    company.level = own.some((risk) => risk.level === 'high')
      ? 'high'
      : own.length
        ? 'medium'
        : 'low';
  });

  return fresh.length;
}

function startInspection() {
  if (state.run.status === 'running') return showToast('本周期巡检正在执行，请稍候', 'info');
  clearInterval(runTimer);

  const live = getSource().live;
  const targets = live ? pickInspectionTargets() : [];
  const liveTask = live && targets.length
    ? inspectBatch({ companies: targets, freshness: 'y2', cnt: 10 })
    : null;

  state.run = { ...state.run, status: 'running', progress: 8, current: '读取企业台账', stage: 1, startedAt: '刚刚', duration: '00:00' };
  state.logs = [{
    time: nowTime(),
    tone: 'info',
    text: live
      ? `读取 ${targets.length} 家企业台账（${targets.map((item) => item.name).join('、')}），将调用真实元宝搜索`
      : '演示模式：读取 35 家企业监控台账，任务已创建',
  }];
  activeView = 'inspections';
  rerender();
  showToast(live ? '已启动真实巡检，Agent 正在拆解查询' : '批量巡检已启动（演示模式）');

  const stages = live
    ? [
        { progress: 22, stage: 2, current: 'Agent 拆解 Query', text: `Agent 已拆解 ${targets.length * 4} 条 gov 检索 Query` },
        { progress: 46, stage: 3, current: 'SearchPro gov 检索', text: '正在调用真实接口，等待腾讯云返回…' },
        { progress: 68, stage: 4, current: '多源交叉核验', text: '按官方域名白名单与企业名匹配做交叉核验' },
        { progress: 86, stage: 5, current: '风险分级与告警', text: '按证据等级分级，弱证据归入待核实线索' },
        { progress: 100, stage: 6, current: '汇总结果', text: '等待真实检索结果返回…' },
      ]
    : [
        { progress: 22, stage: 2, current: 'Agent 拆解 Query', text: 'Agent 已拆解 140 条 gov 检索 Query' },
        { progress: 46, stage: 3, current: 'SearchPro gov 检索', text: '演示数据：SearchPro 返回 318 条样例结果，完成去重' },
        { progress: 68, stage: 4, current: '多源交叉核验', text: '演示数据：发现 7 条候选风险，进入交叉核验' },
        { progress: 86, stage: 5, current: '风险分级与告警', text: '演示数据：确认 2 条高风险，已生成告警' },
        { progress: 100, stage: 6, current: '周报已生成', text: '演示数据：周报生成完成，已写入归档' },
      ];

  let index = 0;
  runTimer = setInterval(async () => {
    const step = stages[index++];
    state.run = { ...state.run, ...step, status: step.progress === 100 ? 'completed' : 'running', duration: step.progress === 100 ? '01:09' : `00:${String(index * 14).padStart(2, '0')}` };
    state.logs = [...state.logs, { time: nowTime(), tone: step.stage === 4 ? 'warning' : step.stage === 5 ? 'success' : 'info', text: step.text }];
    rerender();

    if (step.progress !== 100) return;
    clearInterval(runTimer);

    if (!liveTask) {
      showToast('演示模式：巡检完成（未调用真实接口）', 'info');
      return;
    }

    try {
      const result = await liveTask;
      const added = applyLiveResults(result.risks || [], targets);
      liveRunDone = true;
      state.logs = [
        ...state.logs.filter((log) => !log.text.startsWith('等待真实检索结果')),
        {
          time: nowTime(),
          tone: 'success',
          text: `真实检索完成：${result.queries} 次 Query · ${result.durationMs}ms · 新增 ${added} 条风险 / ${(result.leads || []).length} 条待核实线索`,
        },
      ];
      state.run = { ...state.run, status: 'completed', progress: 100, current: '已完成（真实数据）', duration: `${(result.durationMs / 1000).toFixed(1)}s` };
      rerender();
      showToast(`真实巡检完成：新增 ${added} 条风险`);
    } catch (error) {
      state.logs = [...state.logs, { time: nowTime(), tone: 'warning', text: `真实检索失败：${error.message}` }];
      state.run = { ...state.run, status: 'completed', current: '真实检索失败' };
      rerender();
      showToast('真实检索失败，请查看执行日志', 'warning');
    }
  }, 1100);
}

const COMPANY_RE = /^([\u4e00-\u9fa5A-Za-z0-9（）()·]{2,30}?(?:股份有限公司|有限责任公司|有限公司|集团|公司|事务所|研究院|工厂))/;
const LEAD_VERBS = /^(?:请|帮我|麻烦|查一下|查查|查询|检索|搜索一下|搜索|看看|了解一下|了解|分析一下|分析|评估一下|评估|查)+/;

function nowTime() {
  return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

/**
 * 从自然语言里提取企业名
 * 三级策略，逐级放宽：
 *   1. 台账全称出现在句子里
 *   2. 台账企业的字号（去掉「有限公司」等后缀）出现在句子里
 *   3. 剥掉「查一下」这类动词后，从句子开头匹配带公司后缀的名称
 * 第 3 步必须先剥动词，否则会把「查一下蜜雪冰城股份有限公司」整串当成企业名。
 */
function extractCompany(text) {
  const exact = state.companies.find((company) => text.includes(company.name));
  if (exact) return { name: exact.name, code: exact.code };

  const byCore = state.companies.find((company) => {
    const core = company.name.replace(/(股份)?有限(责任)?公司$/, '');
    if (core.length >= 4 && text.includes(core)) return true;
    return core.length >= 4 && text.includes(core.slice(0, 4));
  });
  if (byCore) return { name: byCore.name, code: byCore.code };

  const cleaned = text.replace(LEAD_VERBS, '').trim();
  const matched = cleaned.match(COMPANY_RE);
  if (matched) return { name: matched[1], code: '' };

  return null;
}

async function handleAssistant(prompt) {
  const text = String(prompt || '').trim();
  if (!text) return;

  state.assistant.push({ role: 'user', text, time: nowTime() });
  const info = getSource();

  // 没有真实接口时，明确告知这是演示数据，不再伪装成检索结果
  if (!info.live) {
    state.assistant.push({
      role: 'assistant',
      type: 'notice',
      text: `当前为演示模式（${info.reason}），以下内容是内置样例数据，不是真实检索结果。要验证真实接口，请打开 /debug 自测台。`,
      time: nowTime(),
    });
    state.assistant.push({
      role: 'assistant',
      type: 'result',
      text: '华东智造设备有限公司命中 1 条新增行政处罚，已由信用中国与国家企业信用信息公示系统双源核验。建议在供应商复核完成前暂停新增订单。',
      time: nowTime(),
    });
    rerender();
    showToast('演示模式：未调用真实接口', 'info');
    return;
  }

  const target = extractCompany(text);
  if (!target) {
    state.assistant.push({
      role: 'assistant',
      type: 'text',
      text: '没有识别出企业名称。请给出完整企业名，例如「查一下远澜新材料科技有限公司」。',
      time: nowTime(),
    });
    rerender();
    return;
  }

  const loadingId = `loading-${Date.now()}`;
  state.assistant.push({
    role: 'assistant',
    type: 'loading',
    id: loadingId,
    text: `正在调用元宝搜索检索「${target.name}」，会串行发出 4 类 Query…`,
  });
  rerender();

  const replaceLoading = (message) => {
    const index = state.assistant.findIndex((item) => item.id === loadingId);
    if (index >= 0) state.assistant[index] = message;
    else state.assistant.push(message);
  };

  try {
    const result = await inspectCompany({ name: target.name, code: target.code });
    replaceLoading({
      role: 'assistant',
      type: 'live',
      payload: { company: target.name, ...result },
      time: nowTime(),
    });
    rerender();
    showToast(`检索完成：${result.risks.length} 条风险 · ${result.leads.length} 条线索`);
  } catch (error) {
    replaceLoading({
      role: 'assistant',
      type: 'error',
      text: `${error.message}${error.hint ? '｜' + error.hint : ''}`,
      time: nowTime(),
    });
    rerender();
  }
}

function acknowledgeAlert(id) {
  const alert = state.alerts.find((item) => item.id === id);
  if (!alert) return;
  alert.status = 'acknowledged';
  alert.owner = '林思远';
  const risk = state.risks.find((item) => item.id === alert.riskId);
  if (risk) risk.status = 'acknowledged';
  document.querySelector('#drawer-root').innerHTML = '';
  rerender();
  showToast('告警已确认，已指派给林思远跟进');
}

function handleAction(action, element) {
  const id = element?.dataset.id;
  switch (action) {
    case 'run-inspection': startInspection(); break;
    case 'bulk-run': startInspection(); break;
    case 'run-company': runSingleCompany(id); break;
    case 'company-profile': openCompanyDrawer(id); break;
    case 'import-companies': openImportModal(); break;
    case 'submit-import': submitImport(); break;
    case 'remove-company': removeCompany(id); break;
    case 'hide-demo': {
      const removed = state.companies.filter((company) => company.origin === 'demo').length;
      state.companies = state.companies.filter((company) => company.origin !== 'demo');
      saveHideDemo(true);
      selectedCompanies.clear();
      rerender();
      showToast(`已隐藏 ${removed} 家演示企业，台账只保留真实主体`);
      break;
    }
    case 'restore-demo': saveHideDemo(false); location.reload(); break;
    case 'open-risk': openRiskDrawer(id); break;
    case 'close-drawer': document.querySelector('#drawer-root').innerHTML = ''; break;
    case 'show-report': openReportModal(id); break;
    case 'close-modal': document.querySelector('#modal-root').innerHTML = ''; break;
    case 'generate-report': state.reports.unshift({ id: `report-${Date.now()}`, period: '2026.10.27 - 11.02', status: 'ready', companies: 35, total: state.risks.length, high: 2, medium: 3, low: 2, createdAt: '刚刚', size: '49 KB' }); rerender(); showToast('本周期周报已生成并归档'); break;
    case 'download-report': downloadReport(id); break;
    case 'copy-report': navigator.clipboard?.writeText(reportMarkdown()).then(() => showToast('Markdown 内容已复制到剪贴板')).catch(() => showToast('Markdown 内容已准备好，可直接下载', 'info')); break;
    case 'ack-alert': acknowledgeAlert(id); break;
    case 'refresh-alerts': showToast('告警状态已刷新'); break;
    case 'export-risks': showToast('风险清单已导出（演示文件）'); break;
    case 'send-assistant': { const input = document.querySelector('[data-input="assistant"]'); const value = input?.value || ''; if (input) input.value = ''; handleAssistant(value); break; }
    case 'clear-assistant': state.assistant = [{ role: 'assistant', text: '对话已清空。你可以输入企业名称或直接询问某条风险的判级依据。', time: '刚刚' }]; rerender(); break;
    case 'save-settings': showToast('系统设置已保存'); break;
    case 'show-notice': showToast('当前有 2 条高风险告警待确认', 'info'); break;
    case 'clear-company-filter': companyFilters = { query: '', status: 'all' }; rerender(); break;
    case 'select-all': { const visible = state.companies.filter((item) => (!companyFilters.query || item.name.toLowerCase().includes(companyFilters.query.toLowerCase())) && (companyFilters.status === 'all' || item.status === companyFilters.status)); if (element.checked) visible.forEach((item) => selectedCompanies.add(item.id)); else visible.forEach((item) => selectedCompanies.delete(item.id)); rerender(); break; }
    case 'select-company': if (element.checked) selectedCompanies.add(id); else selectedCompanies.delete(id); rerender(); break;
  }
}

document.addEventListener('click', (event) => {
  const nav = event.target.closest('[data-nav]');
  if (nav) { activeView = nav.dataset.nav; rerender(); return; }
  const action = event.target.closest('[data-action]');
  if (action) { handleAction(action.dataset.action, action); return; }
  const prompt = event.target.closest('[data-assistant-prompt]');
  if (prompt) { handleAssistant(prompt.dataset.assistantPrompt); return; }
  const alertTab = event.target.closest('[data-alert-filter]');
  if (alertTab) { alertFilter = alertTab.dataset.alertFilter; rerender(); }
});

document.addEventListener('change', (event) => {
  const select = event.target.closest('[data-select]');
  if (select) {
    const key = select.dataset.select;
    if (key === 'company-status') companyFilters.status = select.value;
    if (key === 'risk-level') riskFilters.level = select.value;
    if (key === 'risk-type') riskFilters.type = select.value;
    rerender();
    return;
  }
  const setting = event.target.closest('[data-setting]');
  if (setting) { state.settings[setting.dataset.setting] = setting.value; rerender(); }
});

document.addEventListener('input', (event) => {
  const input = event.target.closest('[data-input]');
  if (!input) return;
  if (input.dataset.input === 'company-query') { companyFilters.query = input.value; rerender(); }
  if (input.dataset.input === 'risk-query') { riskFilters.query = input.value; rerender(); }
});

document.addEventListener('click', (event) => {
  const toggle = event.target.closest('[data-toggle]');
  if (toggle) { const key = toggle.dataset.toggle; state.settings[key] = !state.settings[key]; rerender(); }
});

/**
 * 探测后端网关状态，让界面始终反映「真实数据 / 演示数据」：
 * - 有后端且已配密钥 → SearchPro / gov · LIVE
 * - 有后端但没配密钥 → DEMO · 未配置腾讯云密钥
 * - 纯静态托管       → DEMO · 未连接后端网关
 */
async function probeDataSource() {
  const info = await probe();
  if (info.live) {
    dataSource.label = 'SearchPro / gov · LIVE';
    dataSource.dot = 'var(--lime)';
  } else {
    dataSource.label = `DEMO · ${info.reason}`;
    dataSource.dot = 'var(--amber)';
  }
  const value = document.querySelector('.data-source-value');
  if (value) value.textContent = dataSource.label;
  const dot = document.querySelector('.source-dot');
  if (dot) dot.style.background = dataSource.dot;
  rerender(); // 助手页的状态条与演示横幅依赖探测结果
}

rerender();
probeDataSource().then(() => {
  const params = new URLSearchParams(location.search);

  // 深链接：?import=企业名1|企业名2 直接导入并跳转台账
  const importList = params.get('import');
  if (importList) {
    const { accepted } = parseCompanyList(importList.replace(/\|/g, '\n'));
    if (accepted.length) {
      state.companies = [...accepted, ...state.companies];
      saveImportedCompanies(state.companies.filter((item) => item.origin === 'imported'));
      companyFilters.status = 'imported';
    }
    activeView = 'companies';
    rerender();
    if (params.get('run')) startInspection();
    return;
  }

  // 深链接：?profile=企业名 直接打开主体信息抽屉
  const profileName = params.get('profile');
  if (profileName) {
    let target = state.companies.find((item) => item.name === profileName);
    if (!target) {
      const { accepted } = parseCompanyList(profileName);
      if (accepted.length) {
        target = accepted[0];
        state.companies = [target, ...state.companies];
        saveImportedCompanies(state.companies.filter((item) => item.origin === 'imported'));
      }
    }
    activeView = 'companies';
    rerender();
    if (target) openCompanyDrawer(target.id);
    return;
  }

  // 深链接：?ask=企业名 直接跳转 AI 助手并发起一次真实检索
  const ask = params.get('ask');
  if (ask) {
    activeView = 'assistant';
    rerender();
    handleAssistant(`查一下${ask}`);
    return;
  }

  // 深链接：?view=risks 直接定位到指定页面
  const view = params.get('view');
  if (view && (navItems.some((item) => item.id === view) || view === 'settings')) {
    activeView = view;
    rerender();
  }

  // 深链接：?modal=import 直接打开导入企业弹窗
  if (params.get('modal') === 'import') {
    activeView = 'companies';
    rerender();
    openImportModal();
  }

  // 深链接：?run=1 直接跳转巡检任务并启动一次巡检
  if (params.get('run')) {
    activeView = 'inspections';
    rerender();
    startInspection();
  }
});
