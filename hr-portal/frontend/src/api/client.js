import axios, { CanceledError } from "axios";
import { employeeSwitchSession, employeeSwitchEpoch, employeeSwitchRequests, clearEmployeeSwitch } from "@/stores/identitySwitch";
import { ElMessage } from "element-plus";
const TOKEN_KEY = "hr_portal.token";
function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
function setToken(t) {
  if (!t) clearEmployeeSwitch();
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}
const api = axios.create({
  baseURL: "/api/v1",
  timeout: 15e3
});
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  const session = employeeSwitchSession.value;
  if (session && config.url?.startsWith("/performance/") && !config.url.startsWith("/performance/identity-switch/")) {
    config.headers.set("X-App-Switch-Session", session.session_token);
    if (!config.headers.has("X-App-Switch-Request")) config.headers.set("X-App-Switch-Request", `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const tracked = config;
    tracked.switchEpoch = employeeSwitchEpoch.value;
    if (!config.signal) {
      tracked.switchAbort = new AbortController();
      config.signal = tracked.switchAbort.signal;
      employeeSwitchRequests.add(tracked.switchAbort);
    }
  }
  return config;
});
let onUnauthorized = null;
function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}
function formatDetail(data, fallback) {
  if (!data) return fallback;
  const d = data.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) {
    return d.map((it) => {
      const loc = Array.isArray(it.loc) ? it.loc.filter((x) => x !== "body").join(".") : "";
      const msg = it.msg || it.message || JSON.stringify(it);
      return loc ? `${loc}: ${msg}` : msg;
    }).join("\uFF1B");
  }
  if (typeof d === "object") return d.message || JSON.stringify(d);
  return fallback;
}
api.interceptors.response.use(
  (resp) => {
    const config = resp.config;
    if (config.switchAbort) employeeSwitchRequests.delete(config.switchAbort);
    if (config.switchEpoch !== void 0 && config.switchEpoch !== employeeSwitchEpoch.value) throw new CanceledError("\u65E7\u8EAB\u4EFD\u54CD\u5E94\u5DF2\u4E22\u5F03");
    return resp;
  },
  (error) => {
    const config = error.config;
    if (config?.switchAbort) employeeSwitchRequests.delete(config.switchAbort);
    if (axios.isCancel(error) || config?.switchEpoch !== void 0 && config.switchEpoch !== employeeSwitchEpoch.value) return Promise.reject(new CanceledError("\u8EAB\u4EFD\u5DF2\u53D8\u5316"));
    const rawDetail = error.response?.data?.detail;
    const status = error.response?.status;
    if (config?.switchEpoch !== void 0 && status && status < 500 && rawDetail?.code?.startsWith("SWITCH_")) clearEmployeeSwitch(rawDetail.message || "\u8EAB\u4EFD\u5207\u6362\u5DF2\u5931\u6548\uFF0C\u8BF7\u6062\u590D\u672C\u4EBA");
    const detail = formatDetail(error.response?.data, error.message || "\u7F51\u7EDC\u5F02\u5E38");
    if (error.response) {
      if (error.response.data && typeof error.response.data === "object") {
        ;
        error.response.data.detail = detail;
      } else {
        error.response.data = { detail };
      }
    }
    if (status === 401) {
      setToken(null);
      if (onUnauthorized) onUnauthorized();
    } else if (status === 403) {
      ElMessage.error(`\u65E0\u6743\u9650\uFF1A${detail}`);
    } else if (status === 422) {
      ElMessage.error(`\u53C2\u6570\u6821\u9A8C\u5931\u8D25\uFF1A${detail}`);
    } else if (status === 423) {
      ElMessage.error(detail);
    } else if (status && status >= 500) {
      ElMessage.error(`\u670D\u52A1\u5668\u9519\u8BEF\uFF1A${detail}`);
    }
    return Promise.reject(error);
  }
);
export {
  api,
  getToken,
  setToken,
  setUnauthorizedHandler
};
