import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FocusPeopleGroupProjectCreate from './FocusPeopleGroupProjectCreate.vue'
import { performanceFocusGroupApi, performanceProjectApi } from '@/api/performance'

vi.mock('element-plus', () => ({ ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { cycleId: '1' }, query: {} }),
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/api/performance', () => ({
  performanceFocusGroupApi: { create: vi.fn() },
  performanceProjectApi: { list: vi.fn() },
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
const searchSelectStub = {
  name: 'PerformanceSearchSelect',
  props: ['modelValue', 'options', 'placeholder', 'multiple', 'remoteSearch'],
  emits: ['update:modelValue'],
  template: '<button class="search-select" @click="$emit(\'update:modelValue\', [\'1\'])">{{ options.map(option => option.label).join(\',\') }}</button>',
}
const checkboxStub = {
  props: ['modelValue', 'label'],
  emits: ['update:modelValue'],
  template: '<label class="checkbox-stub"><input type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)" />{{ label }}</label>',
}

function mountPage() {
  return mount(FocusPeopleGroupProjectCreate, {
    global: {
      stubs: {
        UiFullScreenModal: fullScreenModalStub,
        UiButton: uiButtonStub,
        PerformanceSurfaceCard: surfaceCardStub,
        PerformanceFormItem: formItemStub,
        PerformanceLocalizedInput: localizedInputStub,
        PerformanceSearchSelect: searchSelectStub,
        PerformanceCheckbox: checkboxStub,
      },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(performanceFocusGroupApi.create).mockResolvedValue({ id: 1 } as any)
  vi.mocked(performanceProjectApi.list).mockResolvedValue({
    items: [{ id: 1, project_ref: 'project:one', name: '核心研发团队', description: null, administrators: [], status: 'DRAFT' }],
    total: 1,
    page: 1,
    page_size: 100,
  } as any)
})

describe('FocusPeopleGroupProjectCreate', () => {
  it('挂载时一次性拉取有权限的评估项目作为下拉选项（点击即弹，不按需搜索）', async () => {
    const wrapper = mountPage()
    await flushPromises()
    expect(performanceProjectApi.list).toHaveBeenCalledTimes(1)
    expect(performanceProjectApi.list).toHaveBeenCalledWith(1, '', 1, 100)
    // 已移除 remote-search：组件不再向下拉传递该 prop（点击即弹，非按需搜索）
    expect(wrapper.getComponent({ name: 'PerformanceSearchSelect' }).props('remoteSearch')).toBeUndefined()
    expect(wrapper.getComponent({ name: 'PerformanceSearchSelect' }).props('options')).toEqual([
      { value: '1', label: '核心研发团队' },
    ])
  })

  it('默认勾选实线上级并级联显示仅组内成员的实线上级子项', async () => {
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.findAll('.checkbox-stub').map(item => item.text())).toEqual([
      '关联评估项目的被评估人的实线上级',
      '仅组内成员的实线上级',
      '关联评估项目的被评估人的 HRBP',
      '关联评估项目的项目管理员',
    ])
    expect(wrapper.findAll('.checkbox-stub')[0].find('input').element.checked).toBe(true)
    expect(wrapper.findAll('.checkbox-stub')[1].find('input').element.checked).toBe(false)
  })

  it('取消实线上级后隐藏仅组内成员子项', async () => {
    const wrapper = mountPage()
    await flushPromises()
    const first = wrapper.findAll('.checkbox-stub')[0].find('input')
    await first.setValue(false)
    await flushPromises()
    expect(wrapper.findAll('.checkbox-stub').map(item => item.text())).toEqual([
      '关联评估项目的被评估人的实线上级',
      '关联评估项目的被评估人的 HRBP',
      '关联评估项目的项目管理员',
    ])
  })

  it('提交项目版 payload：关联评估项目与角色', async () => {
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.findAll('.localized-input')[0].setValue('核心研发团队')
    await wrapper.getComponent({ name: 'PerformanceSearchSelect' }).vm.$emit('update:modelValue', ['1'])
    await wrapper.find('.ui-button.primary').trigger('click')
    expect(performanceFocusGroupApi.create).toHaveBeenCalledWith(1, {
      name: '核心研发团队',
      en_name: '',
      tab: 'project',
      description: { 'zh-CN': '', 'en-US': '' },
      employee_nos: [],
      scope_mode: 'manual',
      scope_setting_mode: 1,
      activity_ids: ['1'],
      roles_of_managing_scope: ['leader'],
    })
  })

  it('勾选 HRBP 后提交 payload 包含 hrbp', async () => {
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.findAll('.localized-input')[0].setValue('核心研发团队')
    await wrapper.getComponent({ name: 'PerformanceSearchSelect' }).vm.$emit('update:modelValue', ['1'])
    const hrbp = wrapper.findAll('.checkbox-stub')[2].find('input')
    await hrbp.setValue(true)
    await flushPromises()
    await wrapper.find('.ui-button.primary').trigger('click')
    expect(performanceFocusGroupApi.create).toHaveBeenCalledWith(1, expect.objectContaining({
      tab: 'project',
      roles_of_managing_scope: ['leader', 'hrbp'],
    }))
  })

  it('名称为空或未选项目时不能提交', async () => {
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.find('.ui-button.primary').trigger('click')
    expect(performanceFocusGroupApi.create).not.toHaveBeenCalled()
  })
})
