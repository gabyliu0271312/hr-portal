import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FocusPeopleGroupCreate from './FocusPeopleGroupCreate.vue'
import { performanceFocusGroupApi } from '@/api/performance'

vi.mock('element-plus', () => ({ ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { cycleId: '1' }, query: {} }),
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/api/performance', () => ({
  performanceFocusGroupApi: { create: vi.fn(), options: vi.fn(), searchPeople: vi.fn(), resolveScope: vi.fn() },
}))

const uiButtonStub = {
  props: ['variant', 'loading'],
  emits: ['click'],
  template: '<button class="ui-button" :class="variant" @click="$emit(\'click\')"><slot /></button>',
}
const fullScreenModalStub = {
  props: ['title', 'submitting', 'showFooter'],
  emits: ['submit', 'cancel', 'back'],
  template: '<div class="modal-stub"><slot /><slot name="footer" /></div>',
}
const surfaceCardStub = {
  props: ['title'],
  template: '<div class="surface-card-stub"><h3 v-if="title">{{ title }}</h3><slot /></div>',
}
const formItemStub = {
  props: ['label', 'required'],
  template: '<div class="form-item-stub"><label>{{ label }}</label><slot name="description" /><slot /></div>',
}
const localizedInputStub = {
  name: 'PerformanceLocalizedInput',
  props: ['modelValue', 'label', 'placeholder', 'required'],
  emits: ['update:modelValue', 'add-language'],
  template: '<input class="localized-input" :placeholder="placeholder" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
}
const personSelectStub = {
  name: 'PerformancePersonSelect',
  props: ['modelValue', 'options', 'placeholder', 'multiple'],
  emits: ['update:modelValue', 'search'],
  template: '<button class="person-select" @click="$emit(\'update:modelValue\', [\'E001\'])">{{ options.map(option => option.label).join(\',\') }}</button>',
}
const radioGroupStub = {
  name: 'PerformanceRadioGroup',
  props: ['modelValue', 'options', 'name'],
  emits: ['update:modelValue'],
  template: '<div class="radio-group" :data-name="name"><button v-for="option in options" :key="option.value" :data-value="option.value" @click="$emit(\'update:modelValue\', option.value)">{{ option.label }}</button></div>',
}
const audienceRuleStub = {
  name: 'PerformanceAudienceRuleEditor',
  props: ['modelValue', 'personOptions'],
  emits: ['update:modelValue', 'search-people'],
  template: '<div class="audience-rule"><button class="set-rule" @click="$emit(\'update:modelValue\', [{ conditions: [{ field: \'department\', operator: \'include\', values: [\'D1\'] }] }])">设置规则</button></div>',
}
const switchStub = {
  name: 'PerformanceSwitchSettingRow',
  props: ['modelValue', 'label'],
  emits: ['update:modelValue'],
  template: '<button class="switch-setting" :data-label="label" @click="$emit(\'update:modelValue\', !modelValue)">{{ label }}</button>',
}
const checkboxStub = {
  props: ['modelValue', 'label'],
  emits: ['update:modelValue'],
  template: '<label class="checkbox-stub"><input type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)" />{{ label }}</label>',
}
const dateFieldStub = {
  name: 'PerformanceDateTimeField',
  props: ['modelValue', 'dateOnly', 'ariaLabel'],
  emits: ['update:modelValue'],
  template: '<input class="date-field" :aria-label="ariaLabel" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
}
const timeFieldStub = {
  name: 'PerformanceTimeField',
  props: ['modelValue', 'ariaLabel'],
  emits: ['update:modelValue'],
  template: '<input class="time-field" :aria-label="ariaLabel" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
}

function mountPage() {
  return mount(FocusPeopleGroupCreate, {
    global: {
      stubs: {
        UiFullScreenModal: fullScreenModalStub,
        UiButton: uiButtonStub,
        PerformanceSurfaceCard: surfaceCardStub,
        PerformanceFormItem: formItemStub,
        PerformanceLocalizedInput: localizedInputStub,
        PerformancePersonSelect: personSelectStub,
        PerformanceRadioGroup: radioGroupStub,
        PerformanceAudienceRuleEditor: audienceRuleStub,
        PerformanceSwitchSettingRow: switchStub,
        PerformanceCheckbox: checkboxStub,
        PerformanceDateTimeField: dateFieldStub,
        PerformanceTimeField: timeFieldStub,
      },
    },
  })
}

const evaluatorOptions = {
  organization_tree: [],
  people: [],
  employee_types: [],
  fields: [],
  api_document_url: 'https://example.test/api',
  communication_enabled: true,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
  vi.mocked(performanceFocusGroupApi.options).mockResolvedValue(evaluatorOptions as any)
  vi.mocked(performanceFocusGroupApi.searchPeople).mockResolvedValue([])
  vi.mocked(performanceFocusGroupApi.create).mockResolvedValue({ id: 1 } as any)
})

describe('FocusPeopleGroupCreate', () => {
  it('加载人员组专用选项并保持关注人远程搜索候选为空', async () => {
    const wrapper = mountPage()
    await flushPromises()
    expect(performanceFocusGroupApi.options).toHaveBeenCalledWith(1)
    expect(wrapper.getComponent({ name: 'PerformancePersonSelect' }).props('options')).toEqual([])
  })

  it('关注人输入后调用人员组搜索接口并更新候选项', async () => {
    vi.useFakeTimers()
    vi.mocked(performanceFocusGroupApi.searchPeople).mockResolvedValue([
      { value: 'E001', label: '张三', sub_label: '技术中台', department: '技术中台', email: 'zhangsan@example.test' },
    ] as any)
    const wrapper = mountPage()
    await flushPromises()
    wrapper.getComponent({ name: 'PerformancePersonSelect' }).vm.$emit('search', '张')
    await vi.advanceTimersByTimeAsync(250)
    await flushPromises()
    expect(performanceFocusGroupApi.searchPeople).toHaveBeenCalledWith(1, '张')
    expect(wrapper.getComponent({ name: 'PerformancePersonSelect' }).props('options')).toEqual([
      { value: 'E001', label: '张三', subLabel: '技术中台' },
    ])
  })

  it('范围规则变化后创建并轮询异步统计任务', async () => {
    vi.useFakeTimers()
    vi.mocked(performanceFocusGroupApi.resolveScope)
      .mockResolvedValueOnce({ task_id: 'task-1', status: 1 } as any)
      .mockResolvedValueOnce({ task_id: 'task-1', status: 2, selected_count: 3 } as any)
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.find('.set-rule').trigger('click')
    await vi.advanceTimersByTimeAsync(200)
    await flushPromises()
    expect(performanceFocusGroupApi.resolveScope).toHaveBeenNthCalledWith(1, 1, expect.objectContaining({ user_group_id: '' }), '-1')
    await vi.advanceTimersByTimeAsync(250)
    await flushPromises()
    expect(performanceFocusGroupApi.resolveScope).toHaveBeenNthCalledWith(2, 1, expect.any(Object), 'task-1')
    expect(wrapper.text()).toContain('共计 3 人')
  })

  it('手动维护模式仅展示 REA 证据中的三个角色', async () => {
    const wrapper = mountPage()
    await flushPromises()
    wrapper.findAllComponents({ name: 'PerformanceRadioGroup' })[1].vm.$emit('update:modelValue', '1')
    await flushPromises()
    expect(wrapper.findAll('.checkbox-stub').map(item => item.text())).toEqual([
      '关联评估项目的被评估人的实线上级',
      '关联评估项目的被评估人的 HRBP',
      '关联评估项目的项目管理员',
    ])
    expect(wrapper.text()).not.toContain('仅组内成员的实线上级')
  })

  it('结果沟通时间按日期和时间分列并提交周期级完整 payload', async () => {
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.findAll('.localized-input')[0].setValue('核心研发团队')
    await wrapper.getComponent({ name: 'PerformancePersonSelect' }).vm.$emit('update:modelValue', ['E001'])
    await wrapper.find('.set-rule').trigger('click')
    await wrapper.find('[data-label="展示该人员组标签"]').trigger('click')
    await wrapper.find('[data-label="设置独立的结果沟通时间"]').trigger('click')
    await wrapper.find('[aria-label="开始日期"]').setValue('2026-11-01')
    await wrapper.find('[aria-label="开始时间"]').setValue('09:00')
    await wrapper.find('[aria-label="截止日期"]').setValue('2026-11-30')
    await wrapper.find('[aria-label="截止时间"]').setValue('18:00')
    await wrapper.find('.ui-button.primary').trigger('click')
    expect(performanceFocusGroupApi.create).toHaveBeenCalledWith(1, {
      name: '核心研发团队',
      en_name: '',
      tab: 'semester',
      description: { 'zh-CN': '', 'en-US': '' },
      followee_user_ids: ['E001'],
      view_permission: 1,
      scope_setting_mode: 0,
      scope: [[{
        key: 'department', condition: 'eq', value: ['D1'], id: '1', fe_extra: '', __id__: 'condition_1',
      }]],
      show_group_tag: true,
      is_communicate_time: true,
      start_time: '2026-11-01T09:00',
      end_time: '2026-11-30T18:00',
      employee_nos: [],
      scope_mode: 'rule',
      roles_of_managing_scope: [],
    })
  })

  it('标签开关位于基本信息的可见范围下方，不依赖结果沟通环节', async () => {
    vi.mocked(performanceFocusGroupApi.options).mockResolvedValue({ ...evaluatorOptions, communication_enabled: false } as any)
    const wrapper = mountPage()
    await flushPromises()
    const cards = wrapper.findAll('.surface-card-stub')
    expect(cards).toHaveLength(2)
    const basic = cards[0]
    expect(basic.text()).toContain('展示该人员组标签')
    expect(basic.text().indexOf('该人员组对谁可见')).toBeLessThan(basic.text().indexOf('展示该人员组标签'))
    expect(cards[1].text()).not.toContain('展示该人员组标签')
    expect(wrapper.find('[data-label="设置独立的结果沟通时间"]').exists()).toBe(false)
  })

  it('名称为空时不能提交', async () => {
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.find('.ui-button.primary').trigger('click')
    expect(performanceFocusGroupApi.create).not.toHaveBeenCalled()
  })
})
