# 衡源 · 企业风险巡检

面向采购 / 法务 / 风控团队的企业外部风险监控台。把「企业台账 → 风险发现 → 证据留痕 → 告警处置 → 周报归档」串成一条可追溯的链路，风险事件的原始出处全部指向政府官网原文。

> 核心原则：**绝不把演示数据当真实结果展示**。当前用的是真实接口还是内置样例，界面上始终有明确标识。

## 特性

- **企业台账**：批量导入真实企业（每行一家，支持 `企业名,统一社会信用代码`），与内置演示企业视觉可区分
- **真实风险检索**：接入腾讯云元宝搜索 `SearchPro`，按行政处罚 / 经营异常 / 招投标 / 资质到期四类自动拆解 Query
- **三级证据判定**：`strong` / `medium` 进风险库，`weak` 只进「待核实线索」，避免关键词命中就误报
- **主体信息查询**：对接企查查 / 天眼查开放平台，拉取工商登记字段（注册资本、实缴资本、参保人数等）
- **可解释的「查不到」**：返回 0 条时区分「没返回结果」「有结果但没提到该企业」「提到了但证据不足」三种情况，并说明原因
- **巡检与周报**：按企业批量巡检、生成告警、导出 Markdown 周报
- **本地持久化**：导入的企业、真实巡检结果存在 localStorage，刷新不丢

## 架构

```
浏览器（纯 ES Module，无构建步骤）
  app.js      视图 / 状态 / 事件
  api.js      数据源适配层：探测后端 → live 或 mock
  persist.js  localStorage 持久化
        │
        │  fetch  api/health · api/inspect · api/company
        ▼
Node 零依赖网关（server/，仅用内置模块）
  server.js           静态托管 + /api/* 路由
  tencent-wsa.js      TC3-HMAC-SHA256 签名 → 元宝 SearchPro
  risk-mapper.js      检索结果 → 风险事件，含官方域名白名单 + 三级证据判定
  company-provider.js 企查查 / 天眼查适配器
  env.js              极简 .env 加载器
  debug.html          接口自测台（/debug）
        │
        ▼
腾讯云 SearchPro · 企查查 / 天眼查开放平台
```

## 目录结构

```
.
├── index.html            入口
├── app.js                前端主逻辑
├── api.js                数据源适配层
├── persist.js            localStorage 封装
├── data.js               内置演示数据
├── styles.css
├── docs/                 设计文档与实施计划
└── server/               后端网关（零第三方依赖）
    ├── server.js
    ├── tencent-wsa.js
    ├── risk-mapper.js
    ├── company-provider.js
    ├── env.js
    ├── debug.html
    ├── .env.example      环境变量模板
    └── README.md         接口对接细节、判级规则、能力边界
```

## 本地运行

要求 Node.js ≥ 18（内置 `fetch`，无需 npm install）。

```bash
# 1. 配置环境变量
cp server/.env.example server/.env
# 编辑 server/.env，填入腾讯云密钥

# 2. 启动
npm start          # 等价于 node server/server.js
```

打开 http://127.0.0.1:4174/

> 必须通过 HTTP 服务访问。直接双击 `index.html`（`file://`）会因 ES Module 跨域限制白屏。

### 接口自测台

浏览器打开 http://127.0.0.1:4174/debug ，可可视化验证三步链路：签名自检 → 单次检索 → 企业巡检。

## 环境变量

在 `server/.env` 中配置（该文件已被 `.gitignore` 忽略，不会进版本库）：

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `TENCENTCLOUD_SECRET_ID` | 是 | 腾讯云 API 密钥 ID，`AKID` 开头 |
| `TENCENTCLOUD_SECRET_KEY` | 是 | 腾讯云 API 密钥 Key |
| `PORT` | 否 | 服务端口，默认 `4174` |
| `QCC_KEY` / `QCC_SECRET_KEY` | 否 | 企查查开放平台，用于「查主体」 |
| `TYC_TOKEN` | 否 | 天眼查开放平台，与企查查二选一 |

获取地址：
- 腾讯云 API 密钥：https://console.cloud.tencent.com/cam/capi
- 企查查开放平台：https://openapi.qcc.com/
- 天眼查开放平台：https://open.tianyancha.com/

> 强烈建议使用「子账号 + 仅授予 `QcloudWSAFullAccess` 策略」的密钥，不要用主账号密钥。

## 能力边界（重要）

**元宝搜索是「主题检索」，不是「企业主体检索」。**

- 它能返回「和这串字相关的公开网页」，适合找处罚通告、招标公告这类**事件**
- 它拿不到注册资本、实缴资本、参保人数这类**结构化工商字段**——那些必须接企业征信 API
- 长尾小微企业常常没有任何网页提及，此时检索结果为 0 是正常现象，不是代码故障

所以本系统把两件事分开：风险事件走元宝搜索，主体画像走征信 API。详见 [`server/README.md`](server/README.md)。

## 部署

### 方案 A：GitHub Pages（仅静态，演示模式）

适合「给人看界面」。**真实接口不可用**，因为 Pages 只能托管静态文件，跑不了 Node 网关。

1. 仓库 Settings → Pages → Source 选 `Deploy from a branch`，分支 `main`，目录 `/ (root)`
2. 访问 `https://<用户名>.github.io/<仓库名>/`

此时页面顶部数据源会显示 `DEMO · 未连接后端网关`，功能按演示数据走。前端用的是相对路径（`api/health`），所以部署在子路径下也不会 404。

### 方案 B：需要真实接口 → 托管 Node 服务

把 `server/` 部署到任意能跑 Node 的平台（Render、Railway、Fly.io、自建 VPS），平台会读取 `package.json` 的 `start` 脚本。

环境变量在**平台的控制台**里配置，不要把 `.env` 提交到仓库。

| 平台 | 要点 |
| --- | --- |
| Render | New Web Service → 构建命令留空 → 启动命令 `npm start` |
| Railway | 直接连仓库，自动识别 `package.json` |
| Fly.io | `fly launch` 后设置 `PORT=8080` |
| 自建 VPS | `node server/server.js`，前面挂 Nginx 反代 |

前端与后端同域时无需任何配置；分开部署则需把 `api.js` 里的相对路径改成后端完整地址，并处理 CORS。

## 主要接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查，返回密钥与征信数据源配置状态 |
| POST | `/api/search` | 单次检索透传 |
| POST | `/api/inspect` | 企业巡检，返回 `risks` / `leads` / `errors` / `diagnostics` |
| POST | `/api/company` | 企业主体信息（工商登记字段） |
| POST | `/api/selftest` | 签名链路自检（用假密钥，验证签名算法是否正确） |

字段与判级规则见 [`server/README.md`](server/README.md)。

## 免责声明

本项目输出的风险结论仅用于内部风险提示，**不构成行政处罚认定或法律意见**。所有结论均需回到政府官网原文人工复核，页面中每条风险都附有原始出处链接。
