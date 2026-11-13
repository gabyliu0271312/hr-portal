import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PerformanceReviewer360Preview from '@/components/performance/PerformanceReviewer360Preview.vue'
import PerformanceReferenceContent from '@/components/performance/PerformanceReferenceContent.vue'
import PerformanceTemplateRenderer from '@/components/performance/PerformanceTemplateRenderer.vue'
import type { PerformanceReferenceTab } from '@/api/performance'

const runtimeReviewers: NonNullable<PerformanceReferenceTab['reviewers']> = ['甲', '乙'].map((name, index) => ({
  task_id: index + 1,
  reviewer: { employee_no: `E00${index + 1}`, display_name: `评估人${name}` },
  form_schema: [{ id: 'feedback', name: '360°反馈', fields: [{ id: 'feedback-item', type: 'rich_text', label: '反馈内容', previewValue: '不得进入运行态的示例' }, { id: 'missing', type: 'rich_text', label: '未填字段', previewValue: '不得进入运行态的示例' }] }],
  answers: { 'feedback-item': `反馈${name}` },
}))

const contents = [
  {
    content_id: 'feedback', type: 'custom', name: '360°反馈', description: '反馈描述',
    items: [{ id: 'feedback-item', kind: 'fill', label: '360°反馈内容', questionType: 'text' }],
  },
  {
    content_id: 'comment', type: 'custom', name: '留言', description: '',
    items: [{ id: 'comment-item', kind: 'fill', label: '留言内容', questionType: 'text' }],
  },
] as any
const readonlySections = {
  feedback: [{ id: 'feedback', name: '360°反馈', description: '反馈描述', fields: [{ id: 'feedback-item', type: 'rich_text', label: '360°反馈内容', required: false, readonly: true, previewValue: '这里展示用户填写的内容' }] }],
  comment: [{ id: 'comment', name: '留言', description: '', fields: [{ id: 'comment-item', type: 'rich_text', label: '留言内容', required: false, readonly: true, previewValue: '这里展示用户填写的内容' }] }],
} as any

const mounted: Array<ReturnType<typeof mount>> = []
function mountPreview(props: Record<string, unknown> = {}) {
  const host = document.createElement('div')
  document.body.append(host)
  const wrapper = mount(PerformanceReviewer360Preview, { attachTo: host, props: { contents, readonlySections, ...props } })
  mounted.push(wrapper)
  return wrapper
}
afterEach(() => {
  mounted.splice(0).forEach(wrapper => wrapper.unmount())
  document.body.innerHTML = ''
})

describe('PerformanceReviewer360Preview', () => {
  it('isolates runtime reviewer answers, strips preview values and keeps each renderer readonly', async () => {
    const wrapper = mountPreview({ reviewers: runtimeReviewers, expectedCount: 3 })
    expect(wrapper.get('.r360-info').text()).toBe('已评估2/3')
    const cards = wrapper.findAll('.r360-runtime-card')
    expect(cards).toHaveLength(2)
    cards.forEach((card, index) => {
      const renderer = card.getComponent(PerformanceTemplateRenderer)
      expect(card.text()).toContain(runtimeReviewers[index].reviewer.display_name)
      expect(card.text()).toContain(runtimeReviewers[index].answers['feedback-item'])
      expect(card.text()).not.toContain(runtimeReviewers[1 - index].answers['feedback-item'])
      expect(renderer.props('mode')).toBe('readonly')
      expect(renderer.props('answers')).toEqual(runtimeReviewers[index].answers)
      expect(renderer.props('sections')[0].fields.every(field => field.previewValue === undefined)).toBe(true)
    })
    expect(wrapper.text()).not.toMatch(/不得进入运行态的示例|直属上级|所属部门|系统默认邀请/)
    expect(wrapper.find('[contenteditable="true"], input, textarea').exists()).toBe(false)
    expect(runtimeReviewers[0].form_schema[0].fields[0].previewValue).toBe('不得进入运行态的示例')
    await cards[0].get('.r360-card__toggle').trigger('click')
    expect(cards[0].get('.r360-runtime-card__details').isVisible()).toBe(false)
    expect(cards[1].get('.r360-runtime-card__details').isVisible()).toBe(true)
    await wrapper.get('.r360-tools__btn--collapse').trigger('click')
    expect(cards.every(card => card.get('.r360-runtime-card__details').isVisible())).toBe(true)
    await wrapper.get('.r360-tools__btn--collapse').trigger('click')
    expect(cards.every(card => !card.get('.r360-runtime-card__details').isVisible())).toBe(true)
  })

  it('switches runtime reviewers between detail and table views without sharing their answers', async () => {
    const wrapper = mountPreview({ reviewers: runtimeReviewers, expectedCount: 2 })
    await wrapper.get('.r360-tools__btn--view').trigger('click')
    await wrapper.findAll('.r360-view-menu__item')[1].trigger('click')
    expect(wrapper.findAll('.r360-table__row').map(row => row.text())).toEqual(['评估人甲', '评估人乙'])
    const details = wrapper.findAll('.r360-table__details')
    expect(details.every(detail => !detail.isVisible())).toBe(true)
    await wrapper.findAll('.r360-table__expand-btn')[1].trigger('click')
    expect(details[0].isVisible()).toBe(false)
    expect(details[1].isVisible()).toBe(true)
    expect(details[1].text()).toContain('反馈乙')
    expect(details[1].text()).not.toContain('反馈甲')
    expect(wrapper.findAllComponents(PerformanceTemplateRenderer).every(renderer => renderer.props('mode') === 'readonly')).toBe(true)
    expect(wrapper.text()).not.toContain('不得进入运行态的示例')
    await wrapper.get('.r360-tools__btn--view').trigger('click')
    await wrapper.findAll('.r360-view-menu__item')[0].trigger('click')
    expect(wrapper.findAll('.r360-runtime-card')).toHaveLength(2)
    expect(wrapper.find('.r360-table').exists()).toBe(false)
    expect(wrapper.get('.r360-runtime-card__details').isVisible()).toBe(true)
  })

  it.each(['pending', 'completed'] as const)('uses the runtime branch for a %s reference and never invents an empty reviewer', async status => {
    const reference: PerformanceReferenceTab = { key: 'feedback', kind: 'reviewer_360', node_id: 'feedback', node_name: '360°反馈', employee_no: 'E001', status, form_schema: [], answers: {}, can_remind: false, reviewers: runtimeReviewers.slice(0, 1), expected_count: 3 }
    const wrapper = mount(PerformanceReferenceContent, { props: { reference } })
    mounted.push(wrapper)
    expect(wrapper.text()).toContain('已评估1/3')
    expect(wrapper.text()).toContain('反馈甲')
    expect(wrapper.text()).not.toContain('暂未提交')
    await wrapper.setProps({ reference: { ...reference, reviewers: [], expected_count: undefined } })
    expect(wrapper.text()).toContain('暂无可查看内容')
    expect(wrapper.text()).not.toContain('评估人甲')
    expect(wrapper.text()).not.toMatch(/直属上级|所属部门|系统默认邀请|1\/1/)
    expect(wrapper.findComponent(PerformanceTemplateRenderer).exists()).toBe(false)
    expect(wrapper.find('.r360-card').exists()).toBe(false)
    expect(wrapper.find('.r360-runtime-card').exists()).toBe(false)
  })

  it('renders the REA shell and real readonly source roots', () => {
    const wrapper = mountPreview()
    expect(wrapper.text()).toContain('已评估')
    expect(wrapper.text()).toContain('评估维度')
    expect(wrapper.findAll('.r360-form__item')).toHaveLength(2)
    expect(wrapper.findAll('.r360-form__root-title').map(item => item.text())).toEqual(['360°反馈', '留言'])
    expect(wrapper.findAll('.template-field-label').map(item => item.text())).toEqual(['360°反馈内容', '留言内容'])
    expect(wrapper.findAll('.readonly-answer')).toHaveLength(2)
    expect(wrapper.find('[contenteditable="true"]').exists()).toBe(false)
  })

  it('keeps the three detail controls on one expanded state', async () => {
    const wrapper = mountPreview()
    const top = wrapper.get('.r360-tools__btn--collapse')
    const triangle = wrapper.get('.r360-card__toggle')
    const body = wrapper.get('.r360-card__body')
    expect(top.text()).toContain('收起详情')
    expect(top.attributes('aria-expanded')).toBe('true')
    expect(triangle.attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('.r360-form').isVisible()).toBe(true)

    await triangle.trigger('click')
    expect(top.text()).toContain('展开详情')
    expect(top.attributes('aria-expanded')).toBe('false')
    expect(triangle.attributes('aria-expanded')).toBe('false')
    expect(triangle.get('path').attributes('d')).toContain('M18.627 11.22')
    expect(wrapper.get('.r360-form').isVisible()).toBe(false)

    await body.trigger('click')
    expect(top.text()).toContain('收起详情')
    expect(triangle.get('path').attributes('d')).toContain('M11.22 18.46')
    expect(wrapper.get('.r360-form').isVisible()).toBe(true)

    await top.trigger('click')
    expect(top.text()).toContain('展开详情')
    expect(top.get('path').attributes('d')).toContain('M17.468 11')
    await body.trigger('keydown', { key: 'Enter' })
    expect(top.text()).toContain('收起详情')
  })

  it('renders the avatar and description without an extra relation title', () => {
    const wrapper = mountPreview({ relationLabel: '直属上级' })
    expect(wrapper.find('.r360-card__title').exists()).toBe(false)
    expect(wrapper.find('.r360-card__first .r360-avatar').exists()).toBe(true)
    expect(wrapper.get('.r360-card__desc').text()).toBe('直属上级 | 所属部门 | 系统默认邀请')
    expect(wrapper.findAll('.r360-form__root-title').map(item => item.text())).toContain('360°反馈')
  })

  it('uses neutral filter defaults and opens only one checked all-menu', async () => {
    const wrapper = mountPreview()
    const filters = wrapper.findAll('.r360-head__filter')
    expect(filters).toHaveLength(3)
    expect(filters.map(filter => filter.classes('is-open'))).toEqual([false, false, false])
    expect(filters.map(filter => filter.attributes('aria-expanded'))).toEqual(['false', 'false', 'false'])

    await filters[0].trigger('click')
    expect(filters[0].classes()).toContain('is-open')
    expect(filters[0].attributes('aria-expanded')).toBe('true')
    expect(wrapper.findAll('.r360-head__menu')).toHaveLength(1)
    expect(wrapper.get('.r360-head__option').text()).toContain('全部')
    expect(wrapper.get('.r360-head__option').attributes('aria-selected')).toBe('true')

    await filters[1].trigger('click')
    expect(filters[0].attributes('aria-expanded')).toBe('false')
    expect(filters[1].attributes('aria-expanded')).toBe('true')
    expect(wrapper.findAll('.r360-head__menu')).toHaveLength(1)
    await wrapper.get('.r360-head__option').trigger('click')
    expect(filters[1].attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('.r360-head__menu').exists()).toBe(false)
  })

  it('matches the REA table view icon, geometry contract and shared expansion state', async () => {
    const reviewers = [{ name: '评估人', sub: '直属上级  |  所属部门  |  系统默认邀请' }]
    const wrapper = mountPreview({ tableRows: reviewers })
    const viewButton = wrapper.get('.r360-tools__btn--view')
    await viewButton.trigger('click')
    const menuItems = wrapper.findAll('.r360-view-menu__item')
    expect(menuItems).toHaveLength(2)
    expect(menuItems[0].findAll('svg')).toHaveLength(2)
    expect(menuItems[1].findAll('svg')).toHaveLength(1)
    expect(menuItems[1].get('path').attributes('d')).toContain('Zm-2 4v-4H4v4h3.5')
    await menuItems[1].trigger('click')

    expect(viewButton.text()).toContain('表格视图')
    expect(viewButton.get('path').attributes('d')).toContain('Zm-2 4v-4H4v4h3.5')
    expect(wrapper.get('.r360-tools__btn--collapse').text()).toContain('展开详情')
    expect(wrapper.get('.r360-table__expand-btn').attributes('aria-expanded')).toBe('false')
    expect(wrapper.get('.r360-table__expand-btn path').attributes('d')).toContain('M18.627 11.22')
    expect(wrapper.get('.r360-table__expanded-row').classes()).not.toContain('is-expanded')
    expect(wrapper.get('.r360-table__details').isVisible()).toBe(false)

    await wrapper.get('.r360-table__expand-btn').trigger('click')
    expect(wrapper.get('.r360-tools__btn--collapse').text()).toContain('收起详情')
    expect(wrapper.get('.r360-table__expand-btn').attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('.r360-table__expand-btn path').attributes('d')).toContain('M11.22 18.46')
    expect(wrapper.get('.r360-table__expanded-row').classes()).toContain('is-expanded')
    expect(wrapper.get('.r360-table__details').isVisible()).toBe(true)
    expect(wrapper.findAll('.r360-table__details .r360-form__root-title').map(item => item.text())).toEqual(['360°反馈', '留言'])
    expect(wrapper.findAll('.r360-table__details .readonly-answer')).toHaveLength(2)

    await wrapper.get('.r360-tools__btn--collapse').trigger('click')
    expect(wrapper.get('.r360-table__details').isVisible()).toBe(false)
    await wrapper.get('.r360-table__cell').trigger('click')
    expect(wrapper.get('.r360-table__details').isVisible()).toBe(true)
    await wrapper.get('.r360-table__row').trigger('keydown', { key: 'Enter' })
    expect(wrapper.get('.r360-table__details').isVisible()).toBe(false)
  })

  it('renders exact statistics order and separate hover popovers', async () => {
    const reviewers = [{ name: '评估人甲', sub: '直属上级 | 所属部门 | 系统默认邀请' }]
    const wrapper = mountPreview({ evaluatedCount: 1, expectedCount: 3, relationTotal: 1, tableRows: reviewers })
    expect(wrapper.get('.r360-info').text()).toBe('已评估1/3：直属上级1')
    const numbers = wrapper.findAll('.r360-info__num')
    expect(numbers.map(item => item.text())).toEqual(['1/3', '1'])

    await numbers[0].trigger('mouseenter')
    expect(document.body.querySelector('.r360-evaluated-tooltip')?.textContent).toContain('已评估: 1')
    expect(document.body.querySelector('.r360-evaluated-tooltip .r360-avatar')).not.toBeNull()
    expect(document.body.querySelector('.r360-relation-tooltip')).toBeNull()
    await numbers[0].trigger('mouseleave')

    await numbers[1].trigger('mouseenter')
    expect(document.body.querySelector('.r360-relation-tooltip')).not.toBeNull()
    expect(document.body.querySelector('.r360-relation-tooltip .r360-avatar')).not.toBeNull()
    expect(document.body.querySelector('.r360-evaluated-tooltip')).toBeNull()
  })
})
