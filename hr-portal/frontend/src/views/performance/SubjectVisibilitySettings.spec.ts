import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import pageSource from './SubjectVisibilitySettings.vue?raw'
import SubjectVisibilitySettings from './SubjectVisibilitySettings.vue'

const api = vi.hoisted(() => ({ list: vi.fn(), update: vi.fn() }))
vi.mock('@/api/performance', () => ({ performanceSubjectVisibilityApi: api }))

const page = {
  items: [{ role_key: 'reviewee', role_name: '被评估人', visible_labels: [], visible_fields: ['department', 'position_level'] }],
  total: 10,
  page: 1,
  page_size: 10,
  field_options: [{ key: 'department', label: '部门' }, { key: 'position_level', label: '职级' }],
}

const stubs = {
  PerformanceManagementTable: {
    props: ['rows', 'page', 'pageSize', 'total', 'loading'],
    template: '<div class="shared-table" :data-total="total"><slot /></div>',
  },
  PerformancePermissionButton: { template: '<button><slot /></button>' },
  PerformanceSubjectVisibilityEditor: { props: ['modelValue', 'role', 'fieldOptions', 'saving'], template: '<div class="shared-editor" />' },
  ElTableColumn: { props: ['label'], template: '<div class="table-column">{{ label }}</div>' },
}

describe('SubjectVisibilitySettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.list.mockResolvedValue(page)
  })

  it('loads captured role rows through the shared management table', async () => {
    const wrapper = mount(SubjectVisibilitySettings, { global: { stubs } })
    await flushPromises()

    expect(api.list).toHaveBeenCalledWith(1, 10)
    expect(wrapper.get('h1').text()).toBe('被评估人信息可见性设置')
    expect(wrapper.text()).toContain('配置不同角色可见的被评估人信息字段')
    expect(wrapper.find('.shared-table').attributes('data-total')).toBe('10')
    expect(wrapper.findAll('.table-column').map(column => column.text())).toEqual(expect.arrayContaining(['角色名称', '可见标签信息', '可见字段', '操作']))
    expect(wrapper.find('.shared-editor').exists()).toBe(true)
    expect(pageSource).toContain('<PerformancePermissionButton class="subject-visibility-action"')
    expect(pageSource).toContain('font-family:var(--font-sans);font-size:14px;font-weight:400;line-height:18px')
  })

  it('shows the shared reload state when loading fails', async () => {
    api.list.mockRejectedValueOnce(new Error('failed'))
    const wrapper = mount(SubjectVisibilitySettings, { global: { stubs } })
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain('被评估人信息可见性设置加载失败')
    expect(wrapper.get('[role="alert"] button').text()).toBe('重新加载')
  })
})
