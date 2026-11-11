import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { projectManagementApi, type ProjectMatrix } from '@/api/performance'

vi.mock('@/api/performance', async () => {
  const actual = await vi.importActual<typeof import('@/api/performance')>('@/api/performance')
  return { ...actual, projectManagementApi: { ...actual.projectManagementApi, matrix: vi.fn() } }
})

import ProjectPerformanceMatrix from './ProjectPerformanceMatrix.vue'
import matrixSource from './ProjectPerformanceMatrix.vue?raw'
import PerformanceSurfaceCard from './PerformanceSurfaceCard.vue'
import { projectManagementApi as mockedApi } from '@/api/performance'
import MatrixPeopleDialog from './MatrixPeopleDialog.vue'
import UiSurface from '../ui/UiSurface.vue'
import UiFullScreenModal from '../ui/UiFullScreenModal.vue'
import UiTable from '../ui/UiTable.vue'
import PerformanceManagementTable from './PerformanceManagementTable.vue'
import PerformanceListToolbar from './PerformanceListToolbar.vue'

const matrixOf = (overrides: Partial<ProjectMatrix> = {}): ProjectMatrix => ({
  source: 'template_final_result',
  dimension: 'rating',
  display_modes: ['name', 'count'],
  total: 3,
  completed_count: 2,
  pending_count: 1,
  ratings: [{ key: 'one', label: '1星', color: 'rgb(251, 191, 188)' }, { key: 'five', label: '5星', color: '#3370ff' }],
  pending_rows: [{ level: 'J3', total: 1, cells: { pending: { count: 1, people: [{ employee_no: 'E003', display_name: '员工三', employment_status: '离职' }] } } }],
  completed_rows: [{ level: 'J6', total: 2, cells: {
    one: { count: 1, people: [{ employee_no: 'E001', display_name: '员工一', employment_status: '在职' }] },
    five: { count: 1, people: [{ employee_no: 'E002', display_name: '员工二', employment_status: '在职' }] },
  } }],
  ...overrides,
})

describe('ProjectPerformanceMatrix', () => {
  beforeEach(() => {
    vi.mocked(mockedApi.matrix).mockReset()
  })

  it('keeps the entire matrix inside one shared white surface across loading and empty states', async () => {
    let resolve!: (value: ProjectMatrix) => void
    vi.mocked(mockedApi.matrix).mockReturnValue(new Promise(value => { resolve = value }))
    const wrapper = mount(ProjectPerformanceMatrix, { props: { projectId: 7 } })
    await wrapper.vm.$nextTick()

    const surface = wrapper.getComponent(PerformanceSurfaceCard)
    expect(surface.element).toBe(wrapper.element)
    expect(wrapper.findAll('.surface-card')).toHaveLength(1)
    expect(surface.find('.matrix-state').exists()).toBe(true)
    expect(surface.find('.section-card-header').exists()).toBe(false)
    // 吸附式 tabs 下，矩阵工具条（全部/筛选）锁定在 Tab 区高度之下（content padding-top 20 已抵消），作为标题完整 stick 不半漏
    expect(matrixSource).toMatch(/\.matrix-toolbar\s*\{[^}]*position:\s*sticky;[^}]*top:\s*calc\(var\(--performance-tab-area-height\) - var\(--performance-review-surface-inset\)\)/)

    resolve(matrixOf({ total: 0, completed_count: 0, pending_count: 0, pending_rows: [], completed_rows: [] }))
    await flushPromises()
    for (const selector of ['.matrix-toolbar', '.pending-block', '.completed-heading', '.completed-table-wrap', '.matrix-empty']) {
      expect(surface.element.contains(wrapper.get(selector).element)).toBe(true)
    }
    expect(wrapper.findAll('.surface-card')).toHaveLength(1)
    wrapper.unmount()
  })

  it('loads final-result groups and renders pending and completed sections', async () => {
    vi.mocked(mockedApi.matrix).mockResolvedValue(matrixOf())
    const wrapper = mount(ProjectPerformanceMatrix, { props: { projectId: 7 } })
    await flushPromises()

    expect(mockedApi.matrix).toHaveBeenCalledWith(7)
    expect(wrapper.text()).toContain('待完成评估')
    expect(wrapper.text()).toContain('（1 人）')
    expect(wrapper.text()).toContain('已完成评估')
    expect(wrapper.text()).toContain('（2 人）')
    expect(wrapper.text()).toContain('员工一')
    expect(wrapper.text()).toContain('员工三')
    expect(wrapper.findAll('.rating-chip').map(item => item.text())).toEqual(['1星', '5星'])
    expect(wrapper.find('.rating-chip').attributes('style')).toContain('--rating-bg: rgb(253, 226, 226)')
    expect(wrapper.findAll('.pending-table tbody .level-cell')).toHaveLength(1)
    expect(wrapper.findAll('.completed-table tbody .level-cell')).toHaveLength(1)
    expect(matrixSource).toMatch(/\.matrix-table tbody \.level-cell\s*\{[^}]*background:\s*#f5f6f7/)
    expect(matrixSource).toMatch(/\.sticky-level\s*\{[^}]*background:\s*#f5f6f7/)
  })

  it('renders names as plain spans in both groups without button chrome or changing display names', async () => {
    const data = matrixOf()
    data.pending_rows[0].cells.pending.people[0].display_name = 'alex.demo示例员工（已离职）'
    vi.mocked(mockedApi.matrix).mockResolvedValue(data)
    const wrapper = mount(ProjectPerformanceMatrix, { props: { projectId: 7 } })
    await flushPromises()

    const names = wrapper.findAll('.matrix-user-block')
    expect(names.map(item => item.element.tagName)).toEqual(['SPAN', 'SPAN', 'SPAN'])
    expect(names.map(item => item.text())).toEqual(['alex.demo示例员工（已离职）', '员工一', '员工二'])
    expect(names[0].attributes('title')).toBe('alex.demo示例员工（已离职）')
    expect(wrapper.find('button.person-name').exists()).toBe(false)
    expect(wrapper.findAll('.pending-table .matrix-user-block')).toHaveLength(1)
    expect(wrapper.findAll('.completed-table .matrix-user-block')).toHaveLength(2)
    expect(matrixSource).toMatch(/\.people-cell :deep\(\.person-name\)[^{]*\{[^}]*color:\s*#1f2329/)
    expect(matrixSource).toMatch(/\.people-cell :deep\(\.person-name:hover\)[^{]*\{[^}]*color:\s*#4e83fd/)
    wrapper.unmount()
  })

  it('keeps expand and collapse controls as buttons while names remain spans', async () => {
    const data = matrixOf()
    const people = Array.from({ length: 8 }, (_, index) => ({ employee_no: `E${index}`, display_name: `示例员工${index}`, employment_status: '在职' }))
    data.completed_rows[0].cells.one = { count: people.length, people }
    vi.mocked(mockedApi.matrix).mockResolvedValue(data)
    const wrapper = mount(ProjectPerformanceMatrix, { props: { projectId: 7 } })
    await flushPromises()

    const cell = wrapper.get('.completed-table .people-cell')
    await cell.get('button[aria-label="展开人员"]').trigger('click')
    expect(cell.classes()).toContain('expanded')
    expect(cell.findAll('span.matrix-user-block')).toHaveLength(8)
    await cell.get('button[aria-label="收起人员"]').trigger('click')
    expect(cell.classes()).not.toContain('expanded')
    wrapper.unmount()
  })

  it('switches completed cells from names to counts', async () => {
    vi.mocked(mockedApi.matrix).mockResolvedValue(matrixOf())
    const wrapper = mount(ProjectPerformanceMatrix, { props: { projectId: 7 } })
    await flushPromises()

    wrapper.getComponent({ name: 'PerformanceSearchSelect' }).vm.$emit('update:modelValue', 'count')
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.count-value').map(item => item.text())).toEqual(['50.0%1', '50.0%1'])
    expect(wrapper.findAll('.completed-table .person-name')).toHaveLength(0)
  })

  it('opens the people drilldown from a non-empty count cell', async () => {
    vi.mocked(mockedApi.matrix).mockResolvedValue(matrixOf())
    const wrapper = mount(ProjectPerformanceMatrix, {
      props: { projectId: 7, cycleName: '2026年半年度绩效评估' },
      global: { stubs: { MatrixPeopleDialog: { props: ['modelValue', 'projectId', 'cycleName', 'level', 'ratingKey', 'ratingLabel'], template: '<div v-if="modelValue" class="matrix-people-dialog-stub">{{ cycleName }} {{ level }} {{ ratingLabel }}</div>' } } },
    })
    await flushPromises()

    wrapper.getComponent({ name: 'PerformanceSearchSelect' }).vm.$emit('update:modelValue', 'count')
    await wrapper.vm.$nextTick()
    await wrapper.get('button[aria-label="查看J61星1人"]').trigger('click')

    expect(wrapper.get('.matrix-people-dialog-stub').text()).toBe('2026年半年度绩效评估 J6 1星')
    expect(wrapper.find('button[aria-label*="0人"]').exists()).toBe(false)
  })

  it('opens the real count drilldown using the shared surface, toolbar and synchronized table', async () => {
    vi.mocked(mockedApi.matrix).mockResolvedValue(matrixOf())
    const member = { employee_no: 'E001', display_name: '钻取员工', department_path: '集团/研发', can_view_detail: true, project_id: 7, root_review_id: 1 }
    const members = vi.spyOn(mockedApi, 'members').mockResolvedValue({ items: [member], total: 101 } as any)
    const wrapper = mount(ProjectPerformanceMatrix, { props: { projectId: 7, cycleName: '2026年半年度绩效评估' } })
    try {
      await flushPromises()
      wrapper.getComponent({ name: 'PerformanceSearchSelect' }).vm.$emit('update:modelValue', 'count')
      await wrapper.vm.$nextTick()
      await wrapper.get('button[aria-label="查看J61星1人"]').trigger('click')
      await flushPromises()
      expect(members).toHaveBeenCalledWith(7, undefined, 1, 50, 'name', 'asc', 'J6', 'one')
      const dialog = wrapper.getComponent(MatrixPeopleDialog)
      const surface = dialog.getComponent(UiSurface)
      expect(surface.props()).toMatchObject({ radius: 'all', minWidth: '0', shadow: true })
      expect(surface.findComponent(PerformanceListToolbar).props('searchFill')).toBe(true)
      expect(dialog.getComponent(UiFullScreenModal).props('contentScroll')).toBe('inner')
      expect(dialog.get('.matrix-people-subtitle').text()).toContain('职级：J6')
      const table = dialog.getComponent(PerformanceManagementTable)
      const uiTable = dialog.getComponent(UiTable)
      expect(uiTable.props('maxHeight')).toBe('max-content')
      expect(uiTable.props('stickyHeaderTop')).toBeUndefined()
      expect(uiTable.findAll('.ui-table__viewport')).toHaveLength(2)
      expect(uiTable.get('thead th.is-fixed-left').attributes('style')).toContain('left: 0px')
      await dialog.get('[aria-label="下一页"]').trigger('click')
      await flushPromises()
      expect(members).toHaveBeenLastCalledWith(7, undefined, 2, 50, 'name', 'asc', 'J6', 'one')
      await dialog.get('.search-input input').setValue('钻取')
      await dialog.get('.search-input input').trigger('keyup.enter')
      await flushPromises()
      expect(members).toHaveBeenLastCalledWith(7, '钻取', 1, 50, 'name', 'asc', 'J6', 'one')
      table.vm.$emit('sort-change', { key: 'position_level', order: 'desc' })
      await flushPromises()
      expect(members).toHaveBeenLastCalledWith(7, '钻取', 1, 50, 'position_level', 'desc', 'J6', 'one')
      table.vm.$emit('page-size-change', 20)
      await flushPromises()
      expect(members).toHaveBeenLastCalledWith(7, '钻取', 1, 20, 'position_level', 'desc', 'J6', 'one')
      members.mockResolvedValueOnce({ items: [{ ...member, can_view_detail: false }], total: 1 } as any)
      table.vm.$emit('page-change', 1)
      await flushPromises()
      await uiTable.get('tbody tr').trigger('click')
      expect(wrapper.emitted('open-member')).toBeUndefined()
      members.mockResolvedValueOnce({ items: [member], total: 1 } as any)
      table.vm.$emit('page-change', 1)
      await flushPromises()
      await uiTable.get('tbody tr').trigger('click')
      expect(wrapper.emitted('open-member')?.at(-1)).toEqual([expect.objectContaining({ employee_no: 'E001', can_view_detail: true })])
      members.mockResolvedValueOnce({ items: [], total: 0 } as any)
      table.vm.$emit('page-change', 1)
      await flushPromises()
      expect(dialog.text()).toContain('暂无人员')
      members.mockRejectedValueOnce(new Error('network'))
      table.vm.$emit('page-change', 1)
      await flushPromises()
      expect(dialog.get('[role="alert"]').text()).toBe('人员列表加载失败，请稍后重试')
      await dialog.get('.full-screen-modal-header-back').trigger('click')
      expect(dialog.emitted('update:modelValue')?.at(-1)).toEqual([false])
    } finally {
      wrapper.unmount()
      members.mockRestore()
    }
  })

  it('tiers count cells by percentage thresholds recovered from the Feishu capture', async () => {
    // 证据反推阈值：27.0% 是 level1、29.7% 是 level2（下限≈30%）、40.0% 是 level2、40.5%+ 是 level3
    vi.mocked(mockedApi.matrix).mockResolvedValue(matrixOf({
      total: 1,
      completed_count: 1,
      pending_count: 0,
      pending_rows: [],
      completed_rows: [
        { level: 'L29', total: 100, cells: { one: { count: 29, people: [{ employee_no: 'E1', display_name: '一', employment_status: '在职' }] } } }, // 29.0% 浅档
        { level: 'L40', total: 100, cells: { one: { count: 40, people: [{ employee_no: 'E2', display_name: '二', employment_status: '在职' }] } } }, // 40.0% 中档
        { level: 'L41', total: 100, cells: { one: { count: 41, people: [{ employee_no: 'E3', display_name: '三', employment_status: '在职' }] } } }, // 41.0% 深档
      ],
    }))
    const wrapper = mount(ProjectPerformanceMatrix, { props: { projectId: 7 } })
    await flushPromises()
    wrapper.getComponent({ name: 'PerformanceSearchSelect' }).vm.$emit('update:modelValue', 'count')
    await wrapper.vm.$nextTick()

    const blocks = wrapper.findAll('.count-value')
    const elements = blocks.map(item => item.element as HTMLElement)
    expect(blocks[0].text()).toBe('29.0%29')
    expect(elements[0].style.getPropertyValue('--count-bg')).toBe('rgb(225, 234, 255)')
    expect(elements[0].style.getPropertyValue('--count-bg-hover')).toBe('rgb(186, 206, 253)')
    expect(blocks[1].text()).toBe('40.0%40')
    expect(elements[1].style.getPropertyValue('--count-bg')).toBe('rgb(186, 206, 253)')
    expect(blocks[2].text()).toBe('41.0%41')
    expect(elements[2].style.getPropertyValue('--count-bg')).toBe('rgb(130, 167, 252)')
    expect(elements[2].style.getPropertyValue('--count-fg')).toBe('rgb(255, 255, 255)')
    wrapper.unmount()
  })

  it('forwards a dialog row click as open-member when the row can view detail', async () => {
    vi.mocked(mockedApi.matrix).mockResolvedValue(matrixOf())
    const DialogStub = { name: 'MatrixPeopleDialog', props: ['modelValue'], emits: ['select-member'], template: '<div v-if="modelValue" class="matrix-people-dialog-stub" />' }
    const wrapper = mount(ProjectPerformanceMatrix, {
      props: { projectId: 7 },
      global: { stubs: { MatrixPeopleDialog: DialogStub } },
    })
    await flushPromises()
    wrapper.getComponent({ name: 'PerformanceSearchSelect' }).vm.$emit('update:modelValue', 'count')
    await wrapper.vm.$nextTick()
    await wrapper.get('button[aria-label="查看J61星1人"]').trigger('click')
    const stub = wrapper.findComponent({ name: 'MatrixPeopleDialog' })
    expect(stub.exists()).toBe(true)
    stub.vm.$emit('select-member', { employee_no: 'E001', project_id: 7, root_review_id: 1, can_view_detail: true })
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('open-member')).toEqual([[{ project_id: 7, employee_no: 'E001', root_review_id: 1, can_view_detail: true }]])
    wrapper.unmount()
  })

  it('emits open-member when a name-mode person with detail access is clicked', async () => {
    const data = matrixOf()
    data.completed_rows[0].cells.one.people = [{ employee_no: 'E001', display_name: '员工一', employment_status: '在职', can_view_detail: true, project_id: 7, root_review_id: 1 }]
    vi.mocked(mockedApi.matrix).mockResolvedValue(data)
    const wrapper = mount(ProjectPerformanceMatrix, { props: { projectId: 7 } })
    await flushPromises()
    await wrapper.get('.completed-table .person-name').trigger('click')
    expect(wrapper.emitted('open-member')).toEqual([[{ project_id: 7, employee_no: 'E001', root_review_id: 1, can_view_detail: true }]])
    wrapper.unmount()
  })

  it('shows retry state when the matrix request fails', async () => {
    vi.mocked(mockedApi.matrix).mockRejectedValueOnce(new Error('network'))
    const wrapper = mount(ProjectPerformanceMatrix, { props: { projectId: 7 } })
    await flushPromises()

    expect(wrapper.text()).toContain('矩阵分析加载失败')
    expect(wrapper.getComponent(PerformanceSurfaceCard).element).toBe(wrapper.element)
    expect(wrapper.get('.surface-card').element.contains(wrapper.get('.matrix-state-error').element)).toBe(true)
    vi.mocked(mockedApi.matrix).mockResolvedValue(matrixOf())
    await wrapper.get('.matrix-state-error button').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('待完成评估')
  })
})
