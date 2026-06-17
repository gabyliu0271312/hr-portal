const TZ = 'Asia/Shanghai'

// 后端时间统一为 UTC（带或不带 +00:00 偏移），这里强制按北京时间显示，
// 不依赖浏览器/服务器本地时区。
function toDate(v: string | number | Date | null | undefined): Date | null {
  if (v === null || v === undefined || v === '') return null
  // 兼容后端可能返回的无时区 ISO 串（如 2026-06-17T09:00:00），按 UTC 解析
  let s = v
  if (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) {
    s = s + 'Z'
  }
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

// 日期+时间，按北京时间显示，如 2026/06/17 17:30:00
export function formatDateTime(v: string | number | Date | null | undefined, fallback = '—'): string {
  const d = toDate(v)
  if (!d) return fallback
  return d.toLocaleString('zh-CN', { timeZone: TZ, hour12: false })
}

// 纯日期字段（如入职日期），不做时区偏移，仅取日期部分
export function formatDateOnly(v: string | number | Date | null | undefined, fallback = '—'): string {
  if (v === null || v === undefined || v === '') return fallback
  if (typeof v === 'string') {
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (m) return `${m[1]}/${m[2]}/${m[3]}`
  }
  const d = new Date(v)
  return isNaN(d.getTime()) ? fallback : d.toLocaleDateString('zh-CN', { timeZone: TZ })
}
