import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PerformanceReviewer360Preview from '@/components/performance/PerformanceReviewer360Preview.vue'

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
