import { config, flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceTemplateUsageDialog from './PerformanceTemplateUsageDialog.vue'

config.global.stubs = { Teleport: true }

const semesters = [
  { semester_id: 1, semester_name: '2025年全年度绩效考核', activities: [{ project_id: 10, project_name: '新疆项目', status: 'STARTED' }, { project_id: 11, project_name: '海南项目', status: 'ARCHIVED' }] },
  { semester_id: 2, semester_name: '2024年全年度绩效考核', activities: [{ project_id: 12, project_name: '北京项目', status: 'DRAFT' }] },
]

function mountDialog(open = true) {
  return mount(PerformanceTemplateUsageDialog, { props: { modelValue: open, semesters } })
}

describe('PerformanceTemplateUsageDialog', () => {
  it('renders the shell title and defaults to all-expanded semester list', () => {
    const wrapper = mountDialog()
    expect(wrapper.get('.performance-dialog__header h2').text()).toBe('使用该模板的周期与项目')
    expect(wrapper.findAll('.template-usage__semester-head')).toHaveLength(2)
    expect(wrapper.findAll('.template-usage__activity')).toHaveLength(3)
    expect(wrapper.findAll('.template-usage__semester')[0].classes()).toContain('is-expanded')
  })

  it('maps the three statuses to four-state labels with dot classes', () => {
    const wrapper = mountDialog()
    const badges = wrapper.findAll('.template-usage__activity-badge')
    expect(badges.map(badge => badge.text())).toEqual(['已启动', '已结束', '待完成配置'])
    expect(badges[0].classes()).toContain('is-started')
    expect(badges[1].classes()).toContain('is-finished')
    expect(badges[2].classes()).toContain('is-pending')
  })

  it('collapses and expands a semester head', async () => {
    const wrapper = mountDialog()
    const head = wrapper.findAll('.template-usage__semester-head')[0]
    await head.trigger('click')
    expect(wrapper.findAll('.template-usage__activity')).toHaveLength(1)
    expect(wrapper.findAll('.template-usage__semester')[0].classes()).not.toContain('is-expanded')
    await head.trigger('click')
    expect(wrapper.findAll('.template-usage__activity')).toHaveLength(3)
  })

  it('emits close and update:modelValue from the shell close button', async () => {
    const wrapper = mountDialog()
    await wrapper.get('.performance-dialog__close').trigger('click')
    const emitted = wrapper.emitted()
    expect(emitted['close']).toBeTruthy()
    expect(emitted['update:modelValue']).toEqual([[false]])
  })

  it('reopens with all semesters expanded regardless of prior collapse', async () => {
    const wrapper = mountDialog()
    await wrapper.findAll('.template-usage__semester-head')[0].trigger('click')
    expect(wrapper.findAll('.template-usage__activity')).toHaveLength(1)
    await wrapper.setProps({ modelValue: false })
    await flushPromises()
    await wrapper.setProps({ modelValue: true })
    await flushPromises()
    expect(wrapper.findAll('.template-usage__activity')).toHaveLength(3)
  })
})
