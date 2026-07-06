/**
 * 数据仓库分层字典 (Q0102)
 *
 * 统一维护 4 层 code、中文名、颜色映射。
 * 所有页面/组件引入此文件，不各自硬编码颜色或标签映射。
 *
 * RAW/DM/METRIC 不属于数仓分层（warehouse_layer），
 * 分别在来源标签、消费域/主题域标签、资产类型标签中展示。
 */

/** 分层 code → 中文短标签 */
export const WAREHOUSE_LAYER_LABELS: Record<string, string> = {
  ODS: 'ODS 贴源数据',
  DWD: 'DWD 明细数据',
  DWS: 'DWS 汇总数据',
  ADS: 'ADS 应用数据',
}

/** 分层 code → Element Plus tag type */
export const WAREHOUSE_LAYER_TAG_TYPES: Record<string, string> = {
  ODS: '',
  DWD: 'success',
  DWS: 'warning',
  ADS: 'danger',
}

/** 分层 code → 颜色（用于统计卡片/图表） */
export const WAREHOUSE_LAYER_COLORS: Record<string, string> = {
  ODS: '#909399',
  DWD: '#67C23A',
  DWS: '#E6A23C',
  ADS: '#F56C6C',
}

/** 分层 code → Element Plus 图标名 */
export const WAREHOUSE_LAYER_ICONS: Record<string, string> = {
  ODS: 'Folder',
  DWD: 'Document',
  DWS: 'DataAnalysis',
  ADS: 'TrendCharts',
}

/** 4 层 code 列表（按数据流向排序） */
export const WAREHOUSE_LAYER_CODES = [
  'ODS', 'DWD', 'DWS', 'ADS',
] as const

export type WarehouseLayerCode = typeof WAREHOUSE_LAYER_CODES[number]

/** 分层选项（供 el-select 使用，含"全部"空值选项） */
export const WAREHOUSE_LAYER_OPTIONS = [
  { value: '', label: '全部' },
  ...WAREHOUSE_LAYER_CODES.map(code => ({
    value: code,
    label: WAREHOUSE_LAYER_LABELS[code],
  })),
]

/**
 * 获取分层展示元数据。
 * 未知/空值返回"未分层"。
 */
export function getWarehouseLayerMeta(code: string | null | undefined) {
  if (!code || !(code in WAREHOUSE_LAYER_LABELS)) {
    return {
      code: code || '',
      label: '未分层',
      tagType: 'info' as string,
      color: '#C0C4CC',
      icon: 'QuestionFilled',
    }
  }
  return {
    code,
    label: WAREHOUSE_LAYER_LABELS[code],
    tagType: WAREHOUSE_LAYER_TAG_TYPES[code] || 'info',
    color: WAREHOUSE_LAYER_COLORS[code] || '#909399',
    icon: WAREHOUSE_LAYER_ICONS[code] || 'Folder',
  }
}