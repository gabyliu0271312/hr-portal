import { describe, expect, it } from 'vitest'
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

describe('PerformanceReviewer360Preview', () => {
  it('renders the REA shell and real readonly source roots', () => {
    const wrapper = mount(PerformanceReviewer360Preview, { props: { contents, readonlySections } })
    expect(wrapper.text()).toContain('已评估')
    expect(wrapper.text()).toContain('评估维度')
    expect(wrapper.findAll('.r360-form__item')).toHaveLength(2)
    expect(wrapper.findAll('.r360-form__root-title').map(item => item.text())).toEqual(['360°反馈', '留言'])
    expect(wrapper.findAll('.template-field-label').map(item => item.text())).toEqual(['360°反馈内容', '留言内容'])
    expect(wrapper.findAll('.readonly-answer')).toHaveLength(2)
    expect(wrapper.find('[contenteditable="true"]').exists()).toBe(false)
  })

  it('uses employee relation independently from the reference root name', () => {
    const wrapper = mount(PerformanceReviewer360Preview, { props: { relationLabel: '直属上级', contents, readonlySections } })
    expect(wrapper.get('.r360-card__title').text()).toBe('直属上级')
    expect(wrapper.findAll('.r360-form__root-title').map(item => item.text())).toContain('360°反馈')
  })
})
