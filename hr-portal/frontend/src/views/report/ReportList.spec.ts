import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ReportList from './ReportList.vue'

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  datasets: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
}))

vi.mock('@/api/reports', () => ({
  reportsApi: {
    list: mocks.list,
    get: vi.fn(),
    create: vi.fn(),
    remove: vi.fn(),
    push: vi.fn(),
  },
  REPORT_VISIBILITY_LABELS: { private: '私密', scoped: '指定范围', public: '公开' },
}))
vi.mock('@/api/datasets', () => ({ datasetsApi: { list: mocks.datasets } }))
vi.mock('@/stores/user', () => ({
  useUserStore: () => ({
    menus: [{ code: 'report.list' }],
    hasOp: () => true,
  }),
}))
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {}, fullPath: '/report/list' }),
  useRouter: () => ({ replace: mocks.replace, push: mocks.push }),
}))

const stubs = {
  ElIcon: { template: '<span><slot /></span>' },
  ElSelect: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<select class="dataset-select" :value="modelValue ?? \'\'" @change="$emit(\'update:modelValue\', $event.target.value ? Number($event.target.value) : null)"><slot /></select>',
  },
  ElOption: { props: ['value', 'label'], template: '<option :value="value">{{ label }}</option>' },
  ElInput: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<label><input class="name-input" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" /><slot name="prefix" /></label>',
  },
  ElButton: { template: '<button @click="$emit(\'click\')"><slot /></button>' },
  ElTooltip: { template: '<span><slot /></span>' },
  ElTable: { template: '<div><slot /><slot name="empty" /></div>' },
  ElTableColumn: true,
  ElTag: true,
  ElDropdown: true,
  ElDropdownMenu: true,
  ElDropdownItem: true,
  ElPagination: true,
  ElEmpty: { props: ['description'], template: '<div>{{ description }}<slot /></div>' },
}

describe('ReportList', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.list.mockReset().mockResolvedValue([])
    mocks.datasets.mockReset().mockResolvedValue([{ id: 8, name: '工资数据集' }])
    mocks.replace.mockReset().mockResolvedValue(undefined)
    mocks.push.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('filters automatically without query or reset buttons', async () => {
    const wrapper = mount(ReportList, {
      global: { stubs, directives: { loading: {} } },
    })
    await flushPromises()
    expect(mocks.list).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).not.toContain('查询')
    expect(wrapper.text()).not.toContain('重置')
    expect(wrapper.html()).not.toContain('label="运行次数"')
    expect(wrapper.html()).not.toContain('label="上次运行"')
    expect(wrapper.html()).not.toContain('label="更新时间"')

    await wrapper.get('.name-input').setValue('薪酬')
    await vi.advanceTimersByTimeAsync(299)
    expect(mocks.list).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    await flushPromises()
    expect(mocks.list).toHaveBeenLastCalledWith({ dataset_id: undefined, keyword: '薪酬' })
    expect(mocks.replace).toHaveBeenLastCalledWith({ query: { keyword: '薪酬' } })

    await wrapper.get('.name-input').setValue('')
    await flushPromises()
    expect(mocks.list).toHaveBeenLastCalledWith({ dataset_id: undefined, keyword: undefined })

    await wrapper.get('.dataset-select').setValue('8')
    await flushPromises()
    expect(mocks.list).toHaveBeenLastCalledWith({ dataset_id: 8, keyword: undefined })
  })

  it('shows an inline retry state when loading fails', async () => {
    mocks.list.mockRejectedValueOnce({ response: { data: { detail: '服务暂不可用' } } })
    const wrapper = mount(ReportList, {
      global: { stubs, directives: { loading: {} } },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('服务暂不可用')
    expect(wrapper.text()).toContain('重新加载')
  })
})
