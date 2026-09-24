import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OtherPermissionSettings from './OtherPermissionSettings.vue'

const api = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
}))

vi.mock('@/api/performance', () => ({ performanceOtherPermissionSettingsApi: api }))

const stubs = {
  PerformanceSwitch: {
    props: ['modelValue', 'disabled'],
    emits: ['update:modelValue'],
    template: '<button role="switch" :aria-checked="modelValue" :disabled="disabled" @click="$emit(\'update:modelValue\', !modelValue)">switch</button>',
  },
  PerformancePermissionButton: {
    emits: ['click'],
    template: '<button class="permission-button" @click="$emit(\'click\')"><slot /></button>',
  },
  PerformancePersonSelect: {
    props: ['modelValue', 'options'],
    emits: ['update:modelValue'],
    template: '<select class="person-select" multiple @change="$emit(\'update:modelValue\', options.map(option => option.value))"><option v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</option></select>',
  },
  PerformanceSearchSelect: {
    props: ['modelValue', 'options'],
    emits: ['update:modelValue'],
    template: '<select class="reminder-select" multiple @change="$emit(\'update:modelValue\', options.map(option => option.value))"><option v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</option></select>',
  },
  PerformanceHrbpPermissionDialog: {
    props: ['modelValue', 'mode', 'initialValue'],
    emits: ['submit', 'update:modelValue'],
    template: '<div v-if="modelValue" class="hrbp-dialog"><button class="hrbp-dialog-save" @click="$emit(\'submit\', { hrbp: initialValue?.hrbp || \'E001\', scope: initialValue?.scope || [], invisiblePeopleEnabled: true, invisiblePeople: [\'E001\'] })">确定</button></div>',
  },
  PerformanceFormItem: { template: '<div class="form-item"><slot /></div>' },
  PerformanceDialogShell: {
    props: ['modelValue', 'loading'],
    template: '<div v-if="modelValue" class="dialog"><slot /><slot name="footer" /></div>',
  },
}

function response(overrides = {}) {
  return {
    hrbp_invisible_scope_enabled: false,
    hrbp_invisible_people: [],
    people_options: [{ employee_no: 'E001', display_name: '张娜' }],
    hrbp_permissions: [],
    organization_tree: [],
    manager_reminder_enabled: true,
    manager_reminder_node_types: ['work_summary', 'evaluation', 'result_communication', 'result_view'],
    ...overrides,
  }
}

function mountPage() {
  return mount(OtherPermissionSettings, { global: { stubs } })
}

describe('OtherPermissionSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue(response())
    api.update.mockResolvedValue(response({ hrbp_invisible_scope_enabled: true }))
  })

  it('renders the captured card and composes shared switch and permission button', async () => {
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.text()).toContain('HRBP不可见范围')
    expect(wrapper.text()).toContain('通用规则：不可查看对应部门负责人的绩效详情')
    expect(wrapper.text()).toContain('特定范围')
    expect(wrapper.find('[role="switch"]').exists()).toBe(true)
    expect(wrapper.find('.permission-button').exists()).toBe(true)
    expect(wrapper.findAll('.permission-button').filter(button => button.text() === '编辑')).toHaveLength(2)
  })

  it('keeps rendering when an older backend omits manager reminder fields', async () => {
    api.get.mockResolvedValue({
      hrbp_invisible_scope_enabled: false,
      hrbp_invisible_people: [],
      people_options: [],
    })

    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.text()).toContain('工作总结环节、评估型环节、结果沟通环节、查看绩效结果')
    expect(wrapper.findAll('[role="switch"]')).toHaveLength(2)
  })

  it('renders the manager permission container and persists its shared switch', async () => {
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.text()).toContain('管理者权限')
    expect(wrapper.text()).toContain('管理者可催办任务')
    expect(wrapper.text()).toContain('可催办的环节类型')
    expect(wrapper.text()).toContain('工作总结环节、评估型环节、结果沟通环节、查看绩效结果')
    expect(wrapper.findAll('[role="switch"]')).toHaveLength(2)

    await wrapper.findAll('[role="switch"]')[1].trigger('click')
    await flushPromises()
    expect(api.update).toHaveBeenCalledWith({
      hrbp_invisible_scope_enabled: false,
      hrbp_invisible_people: [],
      manager_reminder_enabled: false,
      manager_reminder_node_types: ['work_summary', 'evaluation', 'result_communication', 'result_view'],
    })
  })

  it('persists the HRBP switch and rolls back on failure', async () => {
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.findAll('[role="switch"]')[0].trigger('click')
    await flushPromises()

    expect(api.update).toHaveBeenCalledWith({
      hrbp_invisible_scope_enabled: true,
      hrbp_invisible_people: [],
      manager_reminder_enabled: true,
      manager_reminder_node_types: ['work_summary', 'evaluation', 'result_communication', 'result_view'],
    })

    api.update.mockRejectedValueOnce(new Error('failed'))
    await wrapper.findAll('[role="switch"]')[0].trigger('click')
    await flushPromises()
    expect(wrapper.findAll('[role="switch"]')[0].attributes('aria-checked')).toBe('true')
  })

  it('opens the reminder node type editor from the second shared permission button', async () => {
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.findAll('.permission-button')[1].trigger('click')
    expect(wrapper.findAll('.dialog')).toHaveLength(1)
    await wrapper.get('.dialog button.permission-settings-editor__button--primary').trigger('click')
    await flushPromises()

    expect(api.update).toHaveBeenCalledWith({
      hrbp_invisible_scope_enabled: false,
      hrbp_invisible_people: [],
      manager_reminder_enabled: true,
      manager_reminder_node_types: ['work_summary', 'evaluation', 'result_communication', 'result_view'],
    })
  })

  it('opens the HRBP range editor and saves selected people', async () => {
    api.get.mockResolvedValue(response({
      hrbp_invisible_scope_enabled: true,
      hrbp_invisible_people: [{ employee_no: 'E001', display_name: '张娜' }],
    }))
    api.update.mockResolvedValue(response({
      hrbp_invisible_scope_enabled: true,
      hrbp_invisible_people: [{ employee_no: 'E001', display_name: '张娜' }],
    }))

    const wrapper = mountPage()
    await flushPromises()
    await wrapper.findAll('.permission-button')[0].trigger('click')
    expect(wrapper.find('.hrbp-dialog').exists()).toBe(true)
    await wrapper.get('.hrbp-dialog-save').trigger('click')
    await flushPromises()

    expect(api.update).toHaveBeenCalledWith(expect.objectContaining({
      hrbp_permissions: [{ hrbp: 'E001', scope: [], invisible_people: ['E001'] }],
    }))
  })
})
