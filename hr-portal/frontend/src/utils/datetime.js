const TZ = 'Asia/Shanghai';
// 后端时间统一为 UTC（带或不带 +00:00 偏移），这里强制按北京时间显示，
// 不依赖浏览器/服务器本地时区。
function toDate(v) {
    if (v === null || v === undefined || v === '')
        return null;
    // 兼容后端可能返回的无时区 ISO 串（如 2026-06-17T09:00:00），按 UTC 解析
    let s = v;
    if (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) {
        s = s + 'Z';
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
}
// 日期+时间，按北京时间显示，如 2026/06/17 17:30:00
export function formatDateTime(v, fallback = '—') {
    const d = toDate(v);
    if (!d)
        return fallback;
    return d.toLocaleString('zh-CN', { timeZone: TZ, hour12: false });
}
// 纯日期字段（如入职日期），不做时区偏移，仅取日期部分
export function formatDateOnly(v, fallback = '—') {
    if (v === null || v === undefined || v === '')
        return fallback;
    if (typeof v === 'string') {
        const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m)
            return `${m[1]}/${m[2]}/${m[3]}`;
    }
    const d = new Date(v);
    return isNaN(d.getTime()) ? fallback : d.toLocaleDateString('zh-CN', { timeZone: TZ });
}
// 北京时间 datetime-local 值 → UTC ISO 字符串。datetime-local 没有时区，必须按业务时区解释。
export function shanghaiLocalToUtcIso(v) {
    if (!v)
        return null;
    const normalized = v.length === 16 ? `${v}:00` : v;
    const d = new Date(`${normalized}+08:00`);
    return isNaN(d.getTime()) ? null : d.toISOString();
}
// UTC 时间 → datetime-local 所需的北京时间墙上时间。
export function utcToShanghaiLocal(v) {
    const d = toDate(v);
    if (!d)
        return null;
    const values = new Intl.DateTimeFormat('en-CA', {
        timeZone: TZ,
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(d).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
    return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}
// ── 日期选择器提交 / 回填的时区闭环 ───────────────────────
// 后端存储与接口约定为 UTC 朴素串（YYYY-MM-DDTHH:mm:ss，无时区）。
// 但 el-date-picker 的 value-format 朴素串按【浏览器本地】解释，
// 因此：提交前把本地朴素串转为 UTC 朴素串；回填时反向转为本地朴素串，
// 这样"你选的北京时间"在经 formatDateTime 回看时完全一致（不再 +8 小时）。
// 本地朴素串 / Date → UTC 朴素串（用于提交到后端）
export function toUtcNaive(v) {
    if (v === null || v === undefined || v === '')
        return null;
    const d = new Date(v);
    if (isNaN(d.getTime()))
        return null;
    return d.toISOString().slice(0, 19);
}
// UTC 朴素串 → 本地朴素串（用于回填日期选择器，使其显示北京时间）
export function toLocalNaive(v) {
    if (!v)
        return null;
    const normalized = v.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(v) ? v : v + 'Z';
    const d = new Date(normalized);
    if (isNaN(d.getTime()))
        return null;
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
