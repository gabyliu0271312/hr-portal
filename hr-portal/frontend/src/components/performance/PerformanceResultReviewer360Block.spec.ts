import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PerformanceResultReviewer360Block from './PerformanceResultReviewer360Block.vue'

const contents = [
  { task_id: 1, reviewer: { employee_no: 'E001', display_name: '张三' }, form_schema: [{ id: 's1', name: '反馈', description: '', fields: [{ id: 'f1', type: 'rich_text' as const, label: '反馈内容', previewValue: '真实反馈' }] }], answers: { f1: '真实反馈' } },
  { task_id: 2, reviewer: { employee_no: 'E002', display_name: '李四' }, form_schema: [{ id: 's2', name: '反馈', description: '', fields: [{ id: 'f2', type: 'rich_text' as const, label: '反馈内容', previewValue: '另一条反馈' }] }], answers: { f2: '另一条反馈' } },
]

describe('PerformanceResultReviewer360Block', () => {
  it('explains a threshold restriction without rendering any reviewer or answer', () => {
    const wrapper = mount(PerformanceResultReviewer360Block, { props: { contents: [], visibility: 'hidden', detailMode: 'hidden' } })
    expect(wrapper.text()).toContain('已提交评价人数未达到匿名下限')
    expect(wrapper.find('.pr360-reviewer').exists()).toBe(false)
    expect(wrapper.find('.pr360-toggle').exists()).toBe(false)
    wrapper.unmount()
  })

  it('renders each reviewer collapsed with shared identity and no placeholder', () => {
    const wrapper = mount(PerformanceResultReviewer360Block, { props: { contents } })
    expect(wrapper.findAll('.pr360-reviewer')).toHaveLength(2)
    expect(wrapper.findAll('.member-name').map(item => item.text())).toEqual(['张三', '李四'])
    expect(wrapper.findAll('.pr360-items')).toHaveLength(0)
    expect(wrapper.text()).not.toContain('这里展示用户填写的内容')
  })

  it('toggles one reviewer and expands or collapses all from the header', async () => {
    const wrapper = mount(PerformanceResultReviewer360Block, { props: { contents } })
    await wrapper.findAll('.pr360-comment__toggle')[0].trigger('click')
    expect(wrapper.findAll('.pr360-items')).toHaveLength(1)
    expect(wrapper.text()).toContain('真实反馈')
    await wrapper.find('.pr360-toggle').trigger('click')
    expect(wrapper.findAll('.pr360-items')).toHaveLength(2)
    expect(wrapper.find('.pr360-toggle').text()).toContain('收起详情')
    await wrapper.find('.pr360-toggle').trigger('click')
    expect(wrapper.findAll('.pr360-items')).toHaveLength(0)
  })

  it('uses the same renderer for rich text, ratings, tags, prompts and repeatable answers', async () => {
    const wrapper = mount(PerformanceResultReviewer360Block, { props: { contents: [{
      task_id: 3, reviewer: { employee_no: 'E3', display_name: '真实评估人' }, answers: { text: ['<p>第一项</p>', '<script>alert(1)</script><b>第二项</b>'], rating: 'a', tags: { tags: ['good'], notes: { good: '协作事实' } } },
      form_schema: [
        { id: 'summary', name: '内容标题', hide_name: true, description: '可见说明', allow_multiple: true, fields: [{ id: 'text', type: 'rich_text', label: '隐藏题名', hide_name: true }] },
        { id: 'rating', name: '评级', fields: [{ id: 'rating', type: 'rating', label: '绩效评级', options: [{ id: 'a', label: '优秀' }] }] },
        { id: 'tags', name: '标签', fields: [{ id: 'tags', type: 'tag_with_followup', label: '贡献', options: [{ id: 'good', label: '协作' }] }], elements: [{ kind: 'field', id: 'tags' }, { kind: 'prompt', id: 'public', prompt: { title: '说明', content: '公开提示', color: '', scope: 'all' } }, { kind: 'prompt', id: 'private', prompt: { title: '私密', content: '填写提示', color: '', scope: 'all', onlyWhenFilling: true } }] },
      ],
    }] } })
    await wrapper.get('.pr360-toggle').trigger('click')
    for (const value of ['第一项', '第二项', '优秀', '协作', '协作事实', '公开提示', '可见说明']) expect(wrapper.text()).toContain(value)
    for (const hidden of ['内容标题', '隐藏题名', '填写提示']) expect(wrapper.text()).not.toContain(hidden)
    expect(wrapper.find('script').exists()).toBe(false)
    expect(wrapper.find('input, [contenteditable="true"]').exists()).toBe(false)
  })

  it('hides missing real answers instead of using preview values and resets expansion when contents change', async () => {
    const wrapper = mount(PerformanceResultReviewer360Block, { props: { contents: [{ ...contents[0], answers: {} }] } })
    expect(wrapper.find('.pr360-block').exists()).toBe(false)
    await wrapper.setProps({ contents })
    await wrapper.get('.pr360-toggle').trigger('click')
    expect(wrapper.find('.pr360-items').exists()).toBe(true)
    await wrapper.setProps({ contents: [...contents] })
    expect(wrapper.find('.pr360-items').exists()).toBe(false)
    expect(wrapper.get('.pr360-toggle').text()).toBe('展开详情')
    wrapper.unmount()
  })

  it.each([{ contents: [] }, { contents: [{ ...contents[0], form_schema: [] }] }, { contents: [{ ...contents[0], answers: { f1: '<p>​<br></p>' } }] }, { contents: [{ ...contents[0], answers: { f1: '<script>hidden()</script>' } }] }])('omits the whole empty block without a heading or placeholder: %j', ({ contents: emptyContents }) => {
    const wrapper = mount(PerformanceResultReviewer360Block, { props: { contents: emptyContents } })
    expect(wrapper.find('.pr360-block').exists()).toBe(false)
    expect(wrapper.text()).toBe('')
    wrapper.unmount()
  })

  it('shows only reviewers with real visible answers and ignores answers outside the schema', () => {
    const wrapper = mount(PerformanceResultReviewer360Block, { props: { contents: [contents[0], { ...contents[1], answers: { hidden: '不可见内容' } }] } })
    expect(wrapper.findAll('.member-name').map(item => item.text())).toEqual(['张三'])
    expect(wrapper.text()).not.toContain('李四')
    wrapper.unmount()
  })
})
