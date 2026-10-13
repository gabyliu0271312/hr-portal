import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

const { list, push } = vi.hoisted(() => ({ list: vi.fn(), push: vi.fn() }))
vi.mock('@/api/performance', () => ({ performanceTagFillQuestionApi: { list } }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))

import TagFillQuestionManagement from './TagFillQuestionManagement.vue'

describe('TagFillQuestionManagement', () => {
  it('keeps the title above the white list container and all toolbar controls inside it', async () => {
    list.mockResolvedValue({ items: [], total: 0 })
    push.mockClear()
    const wrapper = mount(TagFillQuestionManagement, {
      global: { stubs: { TagFillQuestionTable: { template: '<div>标签题列表</div>' } } },
    })

    expect(wrapper.get('.list-page-title').text()).toBe('标签型填写题')
    const content = wrapper.get('.list-page-content')
    expect(content.element.contains(wrapper.get('.list-toolbar').element)).toBe(true)
    expect(content.element.contains(wrapper.get('.create-button').element)).toBe(true)
    expect(content.element.contains(wrapper.get('.search-input').element)).toBe(true)
    expect(content.element.contains(wrapper.get('.filter-button').element)).toBe(true)

    await wrapper.get('.create-button').trigger('click')
    expect(push).toHaveBeenCalledWith({ name: 'TaggedFillQuestionCreate' })
    wrapper.unmount()
  })
})
