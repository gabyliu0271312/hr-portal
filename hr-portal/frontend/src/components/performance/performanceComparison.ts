export interface PerformanceComparisonOption {
  value: string
  label: string
  color?: string
}

export interface PerformanceComparisonCellData {
  count: number
  heatLevel?: 1 | 2 | 3
}

export interface PerformanceComparisonFocusArea {
  side: 'left' | 'right'
  rowStart: number
  rowSpan: number
  columnSpan: number
}
