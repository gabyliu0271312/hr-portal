import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FocusPeopleManagement from './FocusPeopleManagement.vue'
import { performanceFocusGroupApi, type PerformanceFocusGroup } from '@/api/performance'

const routerPushMock = vi.hoisted(() => vi.fn())
vi.mock('element-plus', () => ({ ElMessage: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { cycleId: '1' }, query: {} }),
  useRouter: () => ({ push: routerPushMock }),
}))

const fullScreenModalStub = {
  props: ['title', 'showFooter'],
  emits: ['back'],
  template: '<div class="full-screen-modal-stub"><slot /></div>',
}
const lineTabsStub = {
  props: ['tabs', 'modelValue'],
  emits: ['update:modelValue'],
  template: `<div class="line-tabs-stub"><span v-for="tab in tabs" :key="tab.key" class="line-tab-label">{{ tab.label }}</span><slot /></div>`,
}
const managementTableStub = {
  props: ['rows', 'columns', 'loading', 'emptyText', 'scrollMode'],
  emits: [],
  template: `<div class="management-table-stub"><template v-for="row in rows" :key="row.id"><span class="stub-row">{{ row.name }}</span></template><slot v-if="!loading && !rows.length" name="empty" :loading="false" :text="emptyText" /></div>`,
}

function stubGlobals() {
  return {
    stubs: {
      UiFullScreenModal: fullScreenModalStub,
      PerformanceLineTabs: lineTabsStub,
      PerformanceManagementTable: managementTableStub,
      PerformanceCreateButton: { props: ['disabled'], emits: ['click'], template: '<button class="create-button" :disabled="disabled" @click="$emit(\'click\')" />' },
      PerformanceSearchInput: { props: ['modelValue'], emits: ['update:modelValue', 'search', 'clear'], template: '<input class="search-input" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" @keyup.enter="$emit(\'search\')" />' },
      PerformanceConfirmDialog: { props: ['modelValue', 'message'], emits: ['update:modelValue', 'confirm'], template: '<div v-if="modelValue" class="confirm-dialog-stub" @click="$emit(\'confirm\')" />' },
      MetricTemplateEmptyIllustration: { template: '<svg class="empty-illustration" />' },
    },
  }
}

function group(overrides: Partial<PerformanceFocusGroup> = {}): PerformanceFocusGroup {
  return {
    id: 1,
    cycle_ref: 'cycle:1',
    tab: 'semester',
    name: '核心研发团队',
    en_name: '',
    description: {},
    followee_user_ids: [],
    view_permission: 1,
    scope_setting_mode: 0,
    scope: null,
    show_group_tag: false,
    is_communicate_time: false,
    start_time: null,
    end_time: null,
    employee_nos: ['E001', 'E002'],
    scope_mode: 'manual',
    project_ref: null,
    activity_ids: [],
    roles_of_managing_scope: [],
    created_by_type: 'SYSTEM_ACCOUNT',
    created_by_ref: '1',
    updated_by_type: 'SYSTEM_ACCOUNT',
    updated_by_ref: '1',
    created_at: '2026-11-01T08:00:00Z',
    updated_at: '2026-11-02T08:00:00Z',
    ...overrides,
  }
}

describe('FocusPeopleManagement', () => {
  beforeEach(() => {
    routerPushMock.mockClear()
  })

  it('loads groups, renders toolbar and empty/search states', async () => {
    const listSpy = vi.spyOn(performanceFocusGroupApi, 'list').mockResolvedValue({ total: 1, items: [group()] })
    vi.spyOn(performanceFocusGroupApi, 'priorityCheck').mockResolvedValue(true)

    const wrapper = mount(FocusPeopleManagement, { global: stubGlobals() })
    await flushPromises()

    expect(listSpy).toHaveBeenCalledWith(1, { tab: 'semester', keyword: undefined })
    expect(wrapper.text()).toContain('核心研发团队')
    expect(wrapper.text()).toContain('周期级人员组')
    expect(wrapper.text()).toContain('关联评估项目的人员组')

    // 工具栏：新建（可用）+ 搜索 + 筛选
    expect(wrapper.find('.create-button').exists()).toBe(true)
    expect(wrapper.find('.search-input').exists()).toBe(true)
    expect(wrapper.find('.filter-button').exists()).toBe(true)

    // priority check 通过后新建按钮可用
    const createButton = wrapper.find('.create-button')
    expect((createButton as any).attributes('disabled')).toBeUndefined()
  })

  it('switches Tab2 and re-requests list with project tab', async () => {
    const listSpy = vi.spyOn(performanceFocusGroupApi, 'list').mockResolvedValue({ total: 0, items: [] })
    vi.spyOn(performanceFocusGroupApi, 'priorityCheck').mockResolvedValue(true)

    const wrapper = mount(FocusPeopleManagement, { global: stubGlobals() })
    await flushPromises()

    const tabsStub = wrapper.findComponent(lineTabsStub)
    tabsStub.vm.$emit('update:modelValue', 'project')
    await flushPromises()

    expect(listSpy).toHaveBeenLastCalledWith(1, { tab: 'project', keyword: undefined })

    await wrapper.find('.create-button').trigger('click')
    expect(routerPushMock).toHaveBeenCalledWith({ name: 'PerformanceCycleFocusPeopleCreate', params: { cycleId: 1 }, query: { tab: 'project' } })
  })

  it('renders empty illustration state when no rows', async () => {
    vi.spyOn(performanceFocusGroupApi, 'list').mockResolvedValue({ total: 0, items: [] })
    vi.spyOn(performanceFocusGroupApi, 'priorityCheck').mockResolvedValue(true)

    const wrapper = mount(FocusPeopleManagement, { global: stubGlobals() })
    await flushPromises()

    expect(wrapper.find('.empty-illustration').exists()).toBe(true)
    expect(wrapper.text()).toContain('暂无内容')
  })
})
