import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import FocusPeopleGroupCreate from './FocusPeopleGroupCreate.vue'
import FocusGroupManagementDetail from './FocusGroupManagementDetail.vue'
import FocusGroupDetailInfo from '@/components/performance/focus-group/FocusGroupDetailInfo.vue'
import PerformancePersonSelect from '@/components/performance/PerformancePersonSelect.vue'
import PerformanceAudienceRuleEditor from '@/components/performance/PerformanceAudienceRuleEditor.vue'
import { performanceFocusGroupApi } from '@/api/performance'

const routeState = vi.hoisted(() => ({ params: { cycleId: '1', groupId: '' }, query: {} }))
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
  ElPopover: { template: '<div><slot name="reference" /><slot /></div>' },
}))
vi.mock('vue-router', () => ({
  useRoute: () => routeState,
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/api/performance', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/performance')>()
  return {
    ...actual,
    performanceFocusGroupApi: { get: vi.fn(), update: vi.fn(), create: vi.fn(), options: vi.fn(), searchPeople: vi.fn(), resolveScope: vi.fn() },
  }
})

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
  template: '<div class="radio-group" :data-name="name"><template v-for="option in options" :key="option.value"><button :data-value="option.value" @click="$emit(\'update:modelValue\', option.value)">{{ option.label }}</button><slot name="after-option" :option="option" /></template></div>',
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

const mountedPages: ReturnType<typeof mount>[] = []
afterEach(() => {
  mountedPages.splice(0).forEach(wrapper => wrapper.unmount())
  vi.useRealTimers()
})

function mountPage(realPeople = false) {
  const wrapper = mount(FocusPeopleGroupCreate, {
    global: {
      stubs: {
        UiFullScreenModal: fullScreenModalStub,
        UiButton: uiButtonStub,
        PerformanceSurfaceCard: surfaceCardStub,
        PerformanceFormItem: formItemStub,
        PerformanceLocalizedInput: localizedInputStub,
        PerformancePersonSelect: realPeople ? false : personSelectStub,
        PerformanceRadioGroup: radioGroupStub,
        PerformanceAudienceRuleEditor: realPeople ? false : audienceRuleStub,
        Teleport: true,
        ...(realPeople ? { PerformanceScopeCount: { template: '<div><slot :counts="[]" :open="() => {}" /></div>' } } : {}),
        FocusGroupPeopleDialog: { props: ['modelValue', 'title', 'subtitle', 'rows'], template: '<div v-if="modelValue" class="people-dialog-stub">{{ title }} {{ subtitle }} {{ rows.length }}</div>' },
        PerformanceSwitchSettingRow: switchStub,
        PerformanceCheckbox: checkboxStub,
        PerformanceDateTimeField: dateFieldStub,
        UiOptionDetail: { template: '<div class="option-detail"><slot /></div>' },
        UiTagColorField: { props: ['modelValue', 'textColor', 'bgColor'], emits: ['update:modelValue'], template: '<div class="tag-color-field" />' },
        PerformanceTimeField: timeFieldStub,
      },
    },
  })
  mountedPages.push(wrapper)
  return wrapper
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
  routeState.params.groupId = ''
  vi.mocked(performanceFocusGroupApi.options).mockResolvedValue(evaluatorOptions as any)
  vi.mocked(performanceFocusGroupApi.searchPeople).mockResolvedValue([])
  vi.mocked(performanceFocusGroupApi.create).mockResolvedValue({ id: 1 } as any)
})

const snapshotOptions = {
  ...evaluatorOptions,
  people: [
    { value: '900162', label: '周期姓名甲', sub_label: '900162 · 技术部' },
    { value: '900163', label: '周期姓名甲', sub_label: '900163 · 运营部' },
    { value: '900164', label: '周期上级' },
  ],
}
const savedGroup = {
  id: 7, cycle_ref: 'cycle-1', name: '关注人员组', en_name: '', description: {},
  followee_user_ids: ['900162'], view_permission: 0, scope_setting_mode: 0,
  show_group_tag: false, is_communicate_time: false, employee_nos: ['900163'], roles_of_managing_scope: [],
  scope: [[
    { key: 'employee', condition: 'eq', value: ['900163'] },
    { key: 'directLeader', condition: 'eq', value: ['900164'] },
    { key: 'superior', condition: 'neq', value: ['900162'] },
  ]],
}
const selectedLabels = (wrapper: ReturnType<typeof mount>) => wrapper.findAllComponents(PerformancePersonSelect)
  .flatMap(select => select.findAll('.performance-select-shell__content .performance-select-shell__tag-content').map(tag => tag.text()))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

function mountDetail() {
  const wrapper = mount(FocusGroupManagementDetail, { global: { stubs: {
    UiFullScreenModal: fullScreenModalStub,
    UiButton: uiButtonStub,
    FocusGroupMembersPanel: true,
    FocusGroupChangeLogPanel: true,
    PerformanceLineTabs: { template: '<div><slot /></div>' },
  } } })
  mountedPages.push(wrapper)
  return wrapper
}

describe('FocusPeopleGroupCreate', () => {
  it.each(['options-first', 'detail-first'])('重开时%s仍回显关注人及三类人员条件的快照姓名，保存工号不变', async order => {
    const optionsRequest = deferred<any>()
    const detailRequest = deferred<any>()
    vi.mocked(performanceFocusGroupApi.options).mockReturnValue(optionsRequest.promise)
    vi.mocked(performanceFocusGroupApi.get).mockReturnValue(detailRequest.promise)
    vi.mocked(performanceFocusGroupApi.update).mockResolvedValue({ id: 7 } as any)
    routeState.params.groupId = '7'
    const wrapper = mountPage(true)
    if (order === 'options-first') optionsRequest.resolve(snapshotOptions)
    else detailRequest.resolve(savedGroup)
    await flushPromises()
    if (order === 'options-first') detailRequest.resolve(savedGroup)
    else optionsRequest.resolve(snapshotOptions)
    await flushPromises()
    expect(selectedLabels(wrapper)).toEqual(['周期姓名甲', '周期姓名甲', '周期上级', '周期姓名甲'])
    expect(wrapper.text()).not.toContain('人员信息不可用')
    expect(performanceFocusGroupApi.update).not.toHaveBeenCalled()
    const followee = wrapper.findAllComponents(PerformancePersonSelect)[0]
    await followee.get('.performance-select-shell__selector').trigger('click')
    expect(followee.findAll('[role="option"]')).toHaveLength(0)
    expect(performanceFocusGroupApi.searchPeople).not.toHaveBeenCalled()
    await wrapper.get('.ui-button.primary').trigger('click')
    const payload = vi.mocked(performanceFocusGroupApi.update).mock.calls[0][2]
    expect(payload.followee_user_ids).toEqual(['900162'])
    expect(payload.scope?.[0].map(condition => ({ key: condition.key, condition: condition.condition, value: condition.value }))).toEqual(savedGroup.scope[0])
  })

  it('新建选择人员保存后销毁再重开仍显示姓名，搜索替换或失败不丢已选姓名', async () => {
    vi.useFakeTimers()
    vi.mocked(performanceFocusGroupApi.options).mockResolvedValue(snapshotOptions as any)
    vi.mocked(performanceFocusGroupApi.searchPeople).mockResolvedValue(snapshotOptions.people as any)
    const wrapper = mountPage(true)
    await flushPromises()
    await wrapper.findAll('.localized-input')[0].setValue('关注人员组')
    const followee = wrapper.findAllComponents(PerformancePersonSelect)[0]
    await followee.get('input').setValue('900162')
    await vi.advanceTimersByTimeAsync(250)
    await flushPromises()
    await followee.get('[role="option"]').trigger('click')
    wrapper.getComponent(PerformanceAudienceRuleEditor).vm.$emit('update:modelValue', [
      { conditions: [{ field: 'employee', operator: 'include', values: ['900163'] }] },
    ])
    await flushPromises()
    await wrapper.get('.ui-button.primary').trigger('click')
    await flushPromises()
    const payload = vi.mocked(performanceFocusGroupApi.create).mock.calls[0][1]
    expect(payload.followee_user_ids).toEqual(['900162'])
    expect(payload.scope?.[0][0].value).toEqual(['900163'])
    wrapper.unmount()
    routeState.params.groupId = '7'
    vi.mocked(performanceFocusGroupApi.get).mockResolvedValue({ ...savedGroup, ...payload } as any)
    const reopened = mountPage(true)
    await flushPromises()
    expect(selectedLabels(reopened)).toEqual(['周期姓名甲', '周期姓名甲'])
    const reopenedFollowee = reopened.findAllComponents(PerformancePersonSelect)[0]
    vi.mocked(performanceFocusGroupApi.searchPeople).mockResolvedValue([{ value: 'other', label: '其他人' }] as any)
    await reopenedFollowee.get('input').setValue('其他')
    await vi.advanceTimersByTimeAsync(250)
    await flushPromises()
    expect(selectedLabels(reopened)).toEqual(['周期姓名甲', '周期姓名甲'])
    vi.mocked(performanceFocusGroupApi.searchPeople).mockRejectedValue(new Error('搜索失败'))
    await reopenedFollowee.get('input').setValue('失败')
    await vi.advanceTimersByTimeAsync(250)
    await flushPromises()
    expect(selectedLabels(reopened)).toEqual(['周期姓名甲', '周期姓名甲'])
  })

  it('快照缺失人员显示不可用提示，再保存仍保留原工号', async () => {
    routeState.params.groupId = '7'
    vi.mocked(performanceFocusGroupApi.options).mockResolvedValue(snapshotOptions as any)
    vi.mocked(performanceFocusGroupApi.get).mockResolvedValue({ ...savedGroup,
      followee_user_ids: ['missing'], scope: [[{ key: 'employee', condition: 'eq', value: ['missing'] }]],
    } as any)
    const wrapper = mountPage(true)
    await flushPromises()
    expect(selectedLabels(wrapper)).toEqual(['人员信息不可用', '人员信息不可用'])
    await wrapper.get('.ui-button.primary').trigger('click')
    expect(performanceFocusGroupApi.update).toHaveBeenCalledWith(1, 7, expect.objectContaining({
      followee_user_ids: ['missing'], scope: [[expect.objectContaining({ value: ['missing'] })]],
    }))
  })

  it('快照选项加载失败时保留已有关注人及人员规则', async () => {
    routeState.params.groupId = '7'
    vi.mocked(performanceFocusGroupApi.options).mockRejectedValue(new Error('选项失败'))
    vi.mocked(performanceFocusGroupApi.get).mockResolvedValue(savedGroup as any)
    const wrapper = mountPage(true)
    await flushPromises()
    expect(selectedLabels(wrapper)).toEqual(Array(4).fill('人员信息不可用'))
    expect(wrapper.text()).toContain('人员范围选项加载失败')
    await wrapper.get('.ui-button.primary').trigger('click')
    expect(performanceFocusGroupApi.update).toHaveBeenCalledWith(1, 7, expect.objectContaining({ followee_user_ids: ['900162'] }))
  })

  it('详情父页传递周期ID，关注人按周期快照工号显示且缺失时不显示工号', async () => {
    routeState.params.groupId = '7'
    vi.mocked(performanceFocusGroupApi.get).mockResolvedValue({ ...savedGroup, followee_user_ids: ['900162', 'missing'] } as any)
    vi.mocked(performanceFocusGroupApi.options).mockResolvedValue(snapshotOptions as any)
    const wrapper = mountDetail()
    await flushPromises()
    expect(wrapper.getComponent(FocusGroupDetailInfo).props('cycleId')).toBe(1)
    expect(performanceFocusGroupApi.options).toHaveBeenCalledWith(1)
    expect(wrapper.text()).toContain('周期姓名甲、人员信息不可用')
    expect(wrapper.text()).not.toContain('900162')
    expect(wrapper.text()).not.toContain('missing')
  })

  it('详情切换周期时丢弃上一周期延迟姓名响应', async () => {
    const oldOptions = deferred<any>()
    vi.mocked(performanceFocusGroupApi.options).mockReturnValueOnce(oldOptions.promise).mockResolvedValueOnce({
      ...snapshotOptions, people: [{ value: '900162', label: '第二周期姓名' }],
    } as any)
    const wrapper = mount(FocusGroupDetailInfo, { props: { cycleId: 1, group: savedGroup as any, isProject: false } })
    mountedPages.push(wrapper)
    expect(wrapper.text()).not.toContain('人员信息不可用')
    await wrapper.setProps({ cycleId: 2 })
    await flushPromises()
    expect(wrapper.text()).toContain('第二周期姓名')
    oldOptions.resolve(snapshotOptions)
    await flushPromises()
    expect(wrapper.text()).toContain('第二周期姓名')
    expect(wrapper.text()).not.toContain('周期姓名甲')
  })

  it('详情姓名接口失败、空关注人和项目组均不回退到工号', async () => {
    vi.mocked(performanceFocusGroupApi.options).mockRejectedValue(new Error('读取失败'))
    const wrapper = mount(FocusGroupDetailInfo, { props: { cycleId: 1, group: savedGroup as any, isProject: false } })
    mountedPages.push(wrapper)
    await flushPromises()
    expect(wrapper.text()).toContain('人员信息不可用')
    expect(wrapper.text()).not.toContain('900162')
    vi.mocked(performanceFocusGroupApi.options).mockClear()
    await wrapper.setProps({ group: { ...savedGroup, followee_user_ids: [] } as any })
    expect(wrapper.text()).not.toContain('人员信息不可用')
    await wrapper.setProps({ group: savedGroup as any, isProject: true })
    expect(performanceFocusGroupApi.options).not.toHaveBeenCalled()
  })

  it('仅关注人可见提交线上枚举0', async () => {
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.findAll('.localized-input')[0].setValue('关注人员组')
    wrapper.findAllComponents({ name: 'PerformanceRadioGroup' })[0].vm.$emit('update:modelValue', '0')
    await wrapper.find('.set-rule').trigger('click')
    await wrapper.find('.ui-button.primary').trigger('click')
    expect(performanceFocusGroupApi.create).toHaveBeenCalledWith(1, expect.objectContaining({ view_permission: 0 }))
    wrapper.unmount()
  })

  it.each([0, 2])('编辑仅关注人模式%s后保存规范化枚举0', async viewPermission => {
    routeState.params.groupId = '7'
    vi.mocked(performanceFocusGroupApi.get).mockResolvedValue({
      id: 7, name: '历史关注组', en_name: '', description: {}, followee_user_ids: ['E001'], view_permission: viewPermission,
      scope_setting_mode: 1, show_group_tag: false, is_communicate_time: false, employee_nos: [], roles_of_managing_scope: [],
    } as any)
    vi.mocked(performanceFocusGroupApi.update).mockResolvedValue({ id: 7 } as any)
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.findAllComponents({ name: 'PerformanceRadioGroup' })[0].props('modelValue')).toBe('0')
    await wrapper.find('.ui-button.primary').trigger('click')
    expect(performanceFocusGroupApi.update).toHaveBeenCalledWith(1, 7, expect.objectContaining({ view_permission: 0 }))
    wrapper.unmount()
  })

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
    expect(wrapper.text()).toContain('共 3 人')
  })

  it('手动维护模式仅展示 REA 证据中的三个角色', async () => {
    const wrapper = mountPage()
    await flushPromises()
    wrapper.findAllComponents({ name: 'PerformanceRadioGroup' })[1].vm.$emit('update:modelValue', '1')
    await flushPromises()
    expect(wrapper.findAll('.checkbox-stub').map(item => item.text())).toEqual([
      '实线上级',
      'HRBP',
      '项目管理员',
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
      tag_color: 'purple-option',
      text_color: '#2f0080',
      bg_color: 'rgba(141,85,237,0.2)',
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
