export const riskLevelMeta = {
  high: { label: '高风险', tone: 'danger', score: 86 },
  medium: { label: '中风险', tone: 'warning', score: 58 },
  low: { label: '低风险', tone: 'safe', score: 24 },
};

export const sourceMeta = {
  credit: { label: '信用中国', domain: 'creditchina.gov.cn' },
  market: { label: '国家企业信用信息公示系统', domain: 'gsxt.gov.cn' },
  tender: { label: '中国政府采购网', domain: 'ccgp.gov.cn' },
  housing: { label: '住建部监管平台', domain: 'mohurd.gov.cn' },
};

const companyNames = [
  ['华东智造设备有限公司', '91310000MA1K4H2M8X', '工业设备'],
  ['远澜新材料科技有限公司', '91320100MA27W9QF4C', '新材料'],
  ['北辰云科信息技术有限公司', '91110108MA01Y7KQ6P', '软件服务'],
  ['海岳建设工程有限公司', '91330106MA2H8N4R2Q', '工程建设'],
  ['启元供应链管理有限公司', '91440300MA5F8P2D7L', '供应链'],
  ['中衡检测技术有限公司', '91320594MA1M6K7V3D', '检测认证'],
  ['澄明环保科技有限公司', '91350100MA32V8YQ1J', '环保服务'],
  ['安拓医疗器械有限公司', '91310115MA1K3W8E9N', '医疗器械'],
  ['森屿包装印刷有限公司', '91370211MA3B9Q4X8K', '包装印刷'],
  ['嘉衡智能物流有限公司', '91440101MA5D6T2P8A', '智能物流'],
  ['云岑电气设备有限公司', '91360000MA39M6C5R7', '电气设备'],
  ['锦禾餐饮管理有限公司', '91320600MA20R7V2F9', '餐饮服务'],
  ['青禾建筑设计事务所', '91310110MA1G2N8U5L', '建筑设计'],
  ['凌越汽车零部件有限公司', '91310000MA1L5R8T2B', '汽车零部件'],
  ['元川能源技术有限公司', '91120116MA06T4Q8C3', '新能源'],
  ['和序贸易有限公司', '91310120MA1J8V6E2M', '进出口贸易'],
  ['联景电子科技有限公司', '91320505MA1N4D7U8Q', '电子科技'],
  ['知行教育服务有限公司', '91330108MA2B7P5S6Y', '教育服务'],
  ['翰墨文化传媒有限公司', '91110105MA01C8L4P6', '文化传媒'],
  ['青岚物业服务有限公司', '91340100MA2N9X5H7E', '物业服务'],
  ['博跃软件外包有限公司', '91310000MA1H2F9G6W', '软件服务'],
  ['森桥园林工程有限公司', '91350103MA32K7R8V9', '园林工程'],
  ['鸿启工业服务有限公司', '91420100MA49Q6M7P2', '工业服务'],
  ['朗原食品科技有限公司', '91310114MA1GW8T2K5', '食品科技'],
  ['银石金融科技有限公司', '91110108MA01S7V9D4', '金融科技'],
  ['时序人力资源有限公司', '91320594MA1P6X8C2N', '人力资源'],
  ['泽川数据服务有限公司', '91440300MA5H7J9R1Q', '数据服务'],
  ['东禾家具制造有限公司', '91370213MA3T8E4F5L', '家具制造'],
  ['远景测绘工程有限公司', '91330109MA2D6N8W3H', '测绘工程'],
  ['澜石水务科技有限公司', '91310000MA1Q4M6Y8A', '水务科技'],
  ['言序咨询服务有限公司', '91110108MA02K7P4C6', '咨询服务'],
  ['景曜照明工程有限公司', '91320612MA21R8V4N7', '照明工程'],
  ['乘风数字营销有限公司', '91440300MA5G9S2H7D', '数字营销'],
  ['沐光新能源设备有限公司', '91350100MA34L6X8T2', '新能源'],
  ['恒岳精密制造有限公司', '91310000MA1W7E2Q5F', '精密制造'],
];

export const companies = companyNames.map(([name, code, industry], index) => ({
  id: `company-${index + 1}`,
  name,
  code,
  industry,
  status: index === 6 || index === 18 ? 'paused' : 'active',
  cadence: index % 4 === 0 ? '每日' : index % 3 === 0 ? '每周' : '每月',
  lastScan: index < 4 ? '2026-11-02 09:42' : '2026-10-27 02:12',
  level: index === 0 || index === 3 ? 'high' : index === 1 || index === 8 || index === 14 ? 'medium' : 'low',
  alert: index === 0 || index === 3 ? 'pending' : index === 1 ? 'acknowledged' : 'none',
}));

export const riskEvents = [
  {
    id: 'risk-001', companyId: 'company-1', company: companies[0].name, type: '行政处罚', level: 'high',
    title: '华东智造设备有限公司被处以行政处罚', date: '2026-11-02 09:42', score: 94, status: 'new',
    summary: '上海市市场监督管理局发布行政处罚决定书，涉及产品质量抽检不合格。',
    reason: '命中“行政处罚”高风险规则，且由两家政务源交叉验证。',
    sources: [
      { name: sourceMeta.market.label, domain: sourceMeta.market.domain, url: 'https://www.gsxt.gov.cn/' },
      { name: sourceMeta.credit.label, domain: sourceMeta.credit.domain, url: 'https://www.creditchina.gov.cn/' },
    ],
  },
  {
    id: 'risk-002', companyId: 'company-4', company: companies[3].name, type: '经营异常', level: 'high',
    title: '海岳建设工程有限公司列入经营异常名录', date: '2026-11-01 16:18', score: 91, status: 'new',
    summary: '企业未按规定期限公示年度报告，被市场监管部门列入经营异常名录。',
    reason: '经营异常属于高风险事件，官方公告与信用记录均已命中。',
    sources: [
      { name: sourceMeta.market.label, domain: sourceMeta.market.domain, url: 'https://www.gsxt.gov.cn/' },
      { name: sourceMeta.credit.label, domain: sourceMeta.credit.domain, url: 'https://www.creditchina.gov.cn/' },
    ],
  },
  {
    id: 'risk-003', companyId: 'company-2', company: companies[1].name, type: '资质到期', level: 'medium',
    title: '远澜新材料科技有限公司资质证书将于 30 天内到期', date: '2026-11-02 09:44', score: 63, status: 'acknowledged',
    summary: '建筑材料检测资质将于 2026-12-01 到期，建议提前确认续期计划。',
    reason: '命中资质到期中风险规则，尚未发现处罚或失信记录。',
    sources: [
      { name: sourceMeta.housing.label, domain: sourceMeta.housing.domain, url: 'https://www.mohurd.gov.cn/' },
      { name: sourceMeta.market.label, domain: sourceMeta.market.domain, url: 'https://www.gsxt.gov.cn/' },
    ],
  },
  {
    id: 'risk-004', companyId: 'company-9', company: companies[8].name, type: '招投标', level: 'medium',
    title: '森屿包装印刷有限公司中标资格待复核', date: '2026-10-31 11:26', score: 54, status: 'closed',
    summary: '公共资源交易公告显示项目资格审查结果发生变更，建议留存复核记录。',
    reason: '两条公共资源交易公告指向同一项目，按中风险留痕。',
    sources: [
      { name: sourceMeta.tender.label, domain: sourceMeta.tender.domain, url: 'https://www.ccgp.gov.cn/' },
      { name: sourceMeta.credit.label, domain: sourceMeta.credit.domain, url: 'https://www.creditchina.gov.cn/' },
    ],
  },
  {
    id: 'risk-005', companyId: 'company-15', company: companies[14].name, type: '监管问询', level: 'medium',
    title: '元川能源技术有限公司收到监管问询', date: '2026-10-30 14:05', score: 49, status: 'ignored',
    summary: '监管部门就信息披露事项发出问询，企业已提交说明。',
    reason: '存在官方问询记录，但暂未形成处罚或经营异常。',
    sources: [
      { name: sourceMeta.credit.label, domain: sourceMeta.credit.domain, url: 'https://www.creditchina.gov.cn/' },
      { name: sourceMeta.market.label, domain: sourceMeta.market.domain, url: 'https://www.gsxt.gov.cn/' },
    ],
  },
  {
    id: 'risk-006', companyId: 'company-22', company: companies[21].name, type: '工商变更', level: 'low',
    title: '森桥园林工程有限公司完成法定代表人变更', date: '2026-11-02 10:12', score: 18, status: 'closed',
    summary: '企业完成法定代表人备案变更，暂无负面监管信息。',
    reason: '普通工商公示，仅进入周报，不触发即时告警。',
    sources: [
      { name: sourceMeta.market.label, domain: sourceMeta.market.domain, url: 'https://www.gsxt.gov.cn/' },
    ],
  },
  {
    id: 'risk-007', companyId: 'company-30', company: companies[29].name, type: '许可变更', level: 'low',
    title: '澜石水务科技有限公司完成许可信息变更', date: '2026-10-29 09:20', score: 12, status: 'closed',
    summary: '企业完成经营许可信息备案更新，未发现异常。',
    reason: '低风险信息变更，不触发告警。',
    sources: [{ name: sourceMeta.market.label, domain: sourceMeta.market.domain, url: 'https://www.gsxt.gov.cn/' }],
  },
];

export const alerts = [
  { id: 'alert-001', riskId: 'risk-001', company: companies[0].name, title: '行政处罚公告需要确认', level: 'high', status: 'pending', owner: '待指派', createdAt: '今天 09:42', channels: ['企业微信', '邮件', '站内'] },
  { id: 'alert-002', riskId: 'risk-002', company: companies[3].name, title: '经营异常名录命中', level: 'high', status: 'pending', owner: '待指派', createdAt: '昨天 16:18', channels: ['企业微信', '邮件', '站内'] },
  { id: 'alert-003', riskId: 'risk-003', company: companies[1].name, title: '资质到期提醒', level: 'acknowledged', status: 'acknowledged', owner: '王晓雯', createdAt: '今天 09:44', channels: ['站内'] },
];

export const reports = [
  { id: 'report-001', period: '2026.10.27 - 2026.11.02', status: 'ready', companies: 35, total: 7, high: 2, medium: 3, low: 2, createdAt: '今天 10:05', size: '48 KB' },
  { id: 'report-002', period: '2026.10.20 - 2026.10.26', status: 'ready', companies: 35, total: 5, high: 1, medium: 2, low: 2, createdAt: '2026.10.26 10:06', size: '42 KB' },
  { id: 'report-003', period: '2026.10.13 - 2026.10.19', status: 'ready', companies: 34, total: 4, high: 0, medium: 2, low: 2, createdAt: '2026.10.19 10:04', size: '38 KB' },
];

export const seedLogs = [
  { time: '09:42:01', tone: 'info', text: '读取 35 家企业监控台账，任务已创建' },
  { time: '09:42:03', tone: 'info', text: 'Agent 已拆解 140 条 gov 检索 Query' },
  { time: '09:42:16', tone: 'success', text: 'SearchPro 返回 318 条权威结果，完成去重' },
  { time: '09:42:31', tone: 'warning', text: '发现 7 条候选风险，进入交叉核验' },
  { time: '09:42:44', tone: 'success', text: '确认 2 条高风险，已生成告警' },
  { time: '09:43:02', tone: 'success', text: '周报生成完成，已写入归档' },
];

export const createStore = () => ({
  companies: structuredClone(companies),
  risks: structuredClone(riskEvents),
  alerts: structuredClone(alerts),
  reports: structuredClone(reports),
  logs: structuredClone(seedLogs),
  run: { status: 'completed', progress: 100, current: '已完成', startedAt: '2026-11-02 09:42', duration: '01:09', stage: 6 },
  settings: { cadence: '每周一 02:00', freshness: '近 7 天', mode: '演示数据', wecom: true, email: true, site: true },
  assistant: [
    { role: 'assistant', text: '你好，我可以帮你查询企业风险、解释判级依据，或生成单企业简报。试试输入“查一下华东智造设备有限公司”。', time: '09:44' },
  ],
});
