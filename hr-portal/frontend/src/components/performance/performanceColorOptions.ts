export interface PerformanceColorOption {
  value: string
  trigger: string
  foreground?: string
  swatch?: string
  background?: string
}

/* 档位色板：value = 配置里存的档位色，trigger = 结果态/选中态胶囊底色，foreground = 胶囊文字色。
   trigger/foreground 取自 REA 实测令牌（例如 3星：bg rgb(225,234,255) / 文字 rgb(12,41,110)）。 */
export const PERFORMANCE_LEVEL_COLORS: PerformanceColorOption[] = [
  { value: 'rgb(251, 191, 188)', trigger: 'rgb(253, 226, 226)', foreground: 'rgb(122, 28, 22)' },
  { value: 'rgb(254, 212, 164)', trigger: 'rgb(254, 234, 210)', foreground: 'rgb(122, 71, 16)' },
  { value: 'rgb(248, 230, 171)', trigger: 'rgb(250, 241, 209)' },
  { value: 'rgb(183, 237, 177)', trigger: 'rgb(217, 245, 214)', foreground: 'rgb(31, 82, 26)' },
  { value: 'rgb(169, 239, 230)', trigger: 'rgb(211, 247, 242)' },
  { value: 'rgb(177, 232, 252)', trigger: 'rgb(215, 243, 253)' },
  { value: 'rgb(186, 206, 253)', trigger: 'rgb(225, 234, 255)', foreground: 'rgb(12, 41, 110)' },
  { value: 'rgb(180, 185, 243)', trigger: 'rgb(222, 224, 250)' },
  { value: 'rgb(205, 178, 250)', trigger: 'rgb(233, 220, 252)', foreground: 'rgb(66, 32, 120)' },
  { value: 'rgb(239, 185, 239)', trigger: 'rgb(248, 221, 248)' },
  { value: 'rgb(249, 174, 217)', trigger: 'rgb(252, 217, 237)' },
  { value: 'rgb(210, 211, 212)', trigger: 'rgb(235, 236, 237)' },
]

export const PERFORMANCE_GROUP_TAG_COLORS: PerformanceColorOption[] = [
  { value: 'purple-option', foreground: '#2f0080', background: 'rgba(141,85,237,0.2)', trigger: '#dcc9fd', swatch: '#dcc9fd' },
  { value: 'indigo-option', foreground: '#151b70', background: 'rgba(91,101,245,0.2)', trigger: '#cccff9', swatch: '#cccff9' },
  { value: 'lime-option', foreground: '#262e00', background: 'rgba(145,173,0,0.2)', trigger: '#e3f0a3', swatch: '#e3f0a3' },
  { value: 'wathet-option', foreground: '#072b3d', background: 'rgba(62,195,247,0.2)', trigger: '#caeffc', swatch: '#caeffc' },
  { value: 'turquoise-option', foreground: '#02312A', background: 'rgba(51,214,192,0.2)', trigger: '#c4f2ec', swatch: '#c4f2ec' },
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
  if (level?.foreground) return level.foreground
  const source = parseLevelColor(level ? level.value : value)
  if (!source) return '#1f2329'
  // 自定义色没有对应令牌：以同色相压暗到 ~24% 明度，得到与令牌同族的深色文字。
  const [r, g, b] = source.map(channel => Math.round(channel * 0.4))
  return `rgb(${r}, ${g}, ${b})`
}
