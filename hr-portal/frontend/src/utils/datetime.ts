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

// ── 日期选择器提交 / 回填的时区闭环 ───────────────────────
// 后端存储与接口约定为 UTC 朴素串（YYYY-MM-DDTHH:mm:ss，无时区）。
// 但 el-date-picker 的 value-format 朴素串按【浏览器本地】解释，
// 因此：提交前把本地朴素串转为 UTC 朴素串；回填时反向转为本地朴素串，
// 这样"你选的北京时间"在经 formatDateTime 回看时完全一致（不再 +8 小时）。

// 本地朴素串 / Date → UTC 朴素串（用于提交到后端）
export function toUtcNaive(v: string | Date | null | undefined): string | null {
  if (v === null || v === undefined || v === '') return null
  const d = new Date(v as any)
  if (isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 19)
}

// UTC 朴素串 → 本地朴素串（用于回填日期选择器，使其显示北京时间）
export function toLocalNaive(v: string | null | undefined): string | null {
  if (!v) return null
  const normalized = v.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(v) ? v : v + 'Z'
  const d = new Date(normalized)
  if (isNaN(d.getTime())) return null
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
