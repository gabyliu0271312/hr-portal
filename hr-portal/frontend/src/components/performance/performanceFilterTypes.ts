import type { PerformanceSearchSelectOption } from './PerformanceSearchSelect.vue'

export type PerformanceFilterValues = Record<string, string[]>

export type PerformanceFilterField =
  | {
      key: string
      label: string
      type: 'select'
      options: PerformanceSearchSelectOption[]
      multiple?: boolean
      placeholder?: string
      selectionStyle?: 'tags' | 'plain'
      autoHeight?: boolean
    }
  | {
      key: string
      label: string
      type: 'person'
      options?: PerformanceSearchSelectOption[]
      loadOptions?: (keyword: string) => Promise<PerformanceSearchSelectOption[]>
      multiple?: boolean
      placeholder?: string
      emptyText?: string
      loadingText?: string
      autoHeight?: boolean
    }
