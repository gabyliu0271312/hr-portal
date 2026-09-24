import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WorkbenchSettings from './WorkbenchSettings.vue'

const api = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
  listEntries: vi.fn(),
  createEntry: vi.fn(),
  updateEntry: vi.fn(),
  updateEntryStatus: vi.fn(),
  removeEntry: vi.fn(),
  listAnnouncements: vi.fn(),
  createAnnouncement: vi.fn(),
  updateAnnouncement: vi.fn(),
  updateAnnouncementStatus: vi.fn(),
  removeAnnouncement: vi.fn(),
}))

vi.mock('@/api/performance', () => ({ performanceWorkbenchSettingsApi: api }))

const stubs = {
  ElButton: { template: '<button v-bind="$attrs" @click="$emit(\'click\')"><slot /></button>' },
  ElIcon: { template: '<span><slot /></span>' },
  ElSelect: { template: '<select><slot /></select>' },
  ElOption: { template: '<option />' },
  ElTableColumn: { template: '<div><slot :row="{}" /></div>' },
  PerformanceListToolbar: {
    props: ['keyword'],
    emits: ['update:keyword', 'filter', 'search', 'clear'],
    template: '<div class="toolbar"><slot name="left" /><slot name="actions" /><button class="filter" @click="$emit(\'filter\')">筛选</button></div>',
  },
  PerformanceManagementTable: { props: ['rows'], template: '<div class="management-table"><slot /></div>' },
  PerformancePermissionButton: { template: '<button @click="$emit(\'click\')"><slot /></button>' },
  PerformanceSwitch: { props: ['modelValue'], emits: ['update:modelValue'], template: '<button role="switch" :aria-checked="modelValue" @click="$emit(\'update:modelValue\', !modelValue)">switch</button>' },
  WorkbenchSettingEditor: { template: '<div class="editor" />' },
  PerformanceConfirmDialog: { template: '<div class="confirm" />' },
}

function mountPage() {
  return mount(WorkbenchSettings, { global: { stubs } })
}

describe('WorkbenchSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ announcement_enabled: true })
    api.listEntries.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 10 })
    api.listAnnouncements.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 10 })
    api.update.mockResolvedValue({ announcement_enabled: false })
  })

  it('renders both configured sections and reuses shared controls', async () => {
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.text()).toContain('更多入口')
    expect(wrapper.text()).toContain('入口列表')
    expect(wrapper.text()).toContain('公告功能')
    expect(wrapper.text()).toContain('公告列表')
    expect(wrapper.findAll('.toolbar')).toHaveLength(2)
    expect(wrapper.findAll('.management-table')).toHaveLength(2)
    expect(wrapper.find('[role="switch"]').exists()).toBe(true)
    expect(api.listEntries).toHaveBeenCalledWith('', undefined, 1, 10)
    expect(api.listAnnouncements).toHaveBeenCalledWith('', undefined, 1, 10)
  })

  it('persists announcement switch changes through the settings api', async () => {
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.find('[role="switch"]').trigger('click')
    await flushPromises()

    expect(api.update).toHaveBeenCalledWith({ announcement_enabled: false })
  })

  it('opens the shared editor from both create buttons', async () => {
    const wrapper = mountPage()
    await flushPromises()
    const createButtons = wrapper.findAll('button').filter(button => button.text().includes('新建'))

    expect(createButtons).toHaveLength(2)
    await createButtons[0].trigger('click')
    expect(wrapper.find('.editor').exists()).toBe(true)
  })
})
