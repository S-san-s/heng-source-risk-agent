/**
 * 本地持久化：把用户导入的真实企业和真实检索结果存到 localStorage，
 * 刷新页面不丢失。演示种子数据不进这里，避免和 mock 混在一起。
 */

const KEY_COMPANIES = 'hengyuan:imported-companies:v1';
const KEY_RISKS = 'hengyuan:live-risks:v1';
const KEY_HIDE_DEMO = 'hengyuan:hide-demo:v1';

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 隐私模式或超出配额时静默失败，不影响当前会话
  }
}

export function loadImportedCompanies() {
  return readJson(KEY_COMPANIES, []);
}

export function saveImportedCompanies(list) {
  writeJson(KEY_COMPANIES, list);
}

export function loadLiveRisks() {
  return readJson(KEY_RISKS, []);
}

export function saveLiveRisks(list) {
  // 只存真实检索结果，最多保留 200 条，防止 localStorage 撑爆
  writeJson(KEY_RISKS, list.slice(0, 200));
}

/** 是否隐藏演示企业（让台账只保留真实导入的企业） */
export function loadHideDemo() {
  try {
    return localStorage.getItem(KEY_HIDE_DEMO) === '1';
  } catch {
    return false;
  }
}

export function saveHideDemo(hidden) {
  try {
    if (hidden) localStorage.setItem(KEY_HIDE_DEMO, '1');
    else localStorage.removeItem(KEY_HIDE_DEMO);
  } catch {
    // ignore
  }
}

export function clearAll() {
  try {
    localStorage.removeItem(KEY_COMPANIES);
    localStorage.removeItem(KEY_RISKS);
    localStorage.removeItem(KEY_HIDE_DEMO);
  } catch {
    // ignore
  }
}
