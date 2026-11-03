export interface PerformanceColorOption {
  value: string
  trigger: string
}

export const PERFORMANCE_LEVEL_COLORS: PerformanceColorOption[] = [
  { value: 'rgb(251, 191, 188)', trigger: 'rgb(253, 226, 226)' },
  { value: 'rgb(254, 212, 164)', trigger: 'rgb(254, 234, 210)' },
  { value: 'rgb(248, 230, 171)', trigger: 'rgb(250, 241, 209)' },
  { value: 'rgb(183, 237, 177)', trigger: 'rgb(217, 245, 214)' },
  { value: 'rgb(169, 239, 230)', trigger: 'rgb(211, 247, 242)' },
  { value: 'rgb(177, 232, 252)', trigger: 'rgb(215, 243, 253)' },
  { value: 'rgb(186, 206, 253)', trigger: 'rgb(221, 232, 254)' },
  { value: 'rgb(180, 185, 243)', trigger: 'rgb(222, 224, 250)' },
  { value: 'rgb(205, 178, 250)', trigger: 'rgb(233, 220, 252)' },
  { value: 'rgb(239, 185, 239)', trigger: 'rgb(248, 221, 248)' },
  { value: 'rgb(249, 174, 217)', trigger: 'rgb(252, 217, 237)' },
  { value: 'rgb(210, 211, 212)', trigger: 'rgb(235, 236, 237)' },
]

export function performanceLevelBackground(value: unknown): string {
  if (typeof value !== 'string') return 'transparent'
  const normalized = value.replace(/\s+/g, '').toLowerCase()
  return PERFORMANCE_LEVEL_COLORS.find(option => option.value.replace(/\s+/g, '').toLowerCase() === normalized)?.trigger ?? value
}

function parseLevelColor(value: string): [number, number, number] | null {
  const rgb = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
  const hex = value.trim().replace(/^#/, '')
  if (/^[0-9a-f]{6}$/i.test(hex)) return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)]
  return null
}

export function performanceLevelForeground(value: unknown): string {
  if (typeof value !== 'string') return '#1f2329'
  const normalized = value.replace(/\s+/g, '').toLowerCase()
  const level = PERFORMANCE_LEVEL_COLORS.find(option => option.value.replace(/\s+/g, '').toLowerCase() === normalized)
  const source = parseLevelColor(level ? level.value : value)
  if (!source) return '#1f2329'
  // 等级代号徽章与名称使用同一色系的深色文字（约为主色 ×0.4，对齐飞书 B-900 的做法）。
  const [r, g, b] = source.map(channel => Math.round(channel * 0.4))
  return `rgb(${r}, ${g}, ${b})`
}
