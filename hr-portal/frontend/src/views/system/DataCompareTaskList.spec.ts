import { shallowMount, flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import DataCompareTaskList from './DataCompareTaskList.vue'
import { dataCompareApi } from '@/api/data-compare'

vi.mock('@/api/data-compare', () => ({ dataCompareApi: { listSkills: vi.fn(), getRun: vi.fn() } }))
const table = { props: ['columns', 'rows'], template: '<div><template v-for="row in rows"><template v-for="column in columns"><slot name="cell" :row="row" :column="column" :value="row[column.key]">{{ row[column.key] }}</slot></template></template></div>' }
const dialog = { props: ['modelValue'], template: '<section v-if="modelValue"><slot /><slot name="footer" /></section>' }
function setup() {
  return shallowMount(DataCompareTaskList, { global: { stubs: { UiSurface: { template: '<div><slot /></div>' }, ElTabs: { template: '<div><slot /></div>' }, ElTabPane: { template: '<div><slot /></div>' }, UiDialogShell: dialog, UiTable: table } } })
}
const item = { period: '202605', metric_id: 'salary', label: '实发金额', amount_a: '12345678901234567890.12', amount_b: null, diff: null, status: 'data_incomplete' }
const run = { id: 42, summary: { items: [item] }, detail: null }

describe('报表金额运行快照', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(dataCompareApi.listSkills).mockResolvedValue({ items: [], total: 0 }) })
  it('使用 label、十进制字符串和缺数状态，不将缺数当成一致', async () => {
    vi.mocked(dataCompareApi.getRun).mockResolvedValue(run as any)
    const wrapper = setup()
    await (wrapper.vm as any).openRun(42)
    await flushPromises()
    expect(wrapper.text()).toContain('实发金额')
    expect(wrapper.text()).toContain('12345678901234567890.12')
    expect(wrapper.text()).toContain('数据不完整')
    expect(wrapper.text()).toContain('—')
    expect((wrapper.vm as any).statusLabel('match')).toBe('一致')
    expect((wrapper.vm as any).statusLabel('diff')).toBe('有差异')
  })
  it('下钻和分页固定同一个 run，使用 dimension，筛选不覆盖汇总', async () => {
    vi.mocked(dataCompareApi.getRun).mockResolvedValueOnce(run as any).mockResolvedValue({ ...run, detail: { items: [{ ...item, dimension: '部门甲', status: 'diff' }], total: 35, limit: 20, offset: 20 } } as any)
    const wrapper = setup(), vm = wrapper.vm as any
    await vm.openRun(42)
    await vm.drill({ period: '202605', metric_id: 'salary' }, 2)
    await flushPromises()
    expect(dataCompareApi.getRun).toHaveBeenLastCalledWith(42, { period: '202605', metric_id: 'salary', only_diff: true, limit: 20, offset: 20 })
    expect(wrapper.text()).toContain('部门甲')
    expect(wrapper.text()).toContain('有差异')
    expect(vm.runDetail.summary.items).toEqual([item])
    expect(vm.groupTotal).toBe(35)
  })
  it('忽略较早运行详情的迟到响应', async () => {
    let resolve!: (value: any) => void
    vi.mocked(dataCompareApi.getRun).mockReturnValueOnce(new Promise(r => { resolve = r })).mockResolvedValueOnce({ ...run, id: 43 } as any)
    const wrapper = setup(), vm = wrapper.vm as any
    const old = vm.openRun(42)
    await vm.openRun(43)
    resolve(run)
    await old
    expect(vm.runDetail.id).toBe(43)
  })
})
