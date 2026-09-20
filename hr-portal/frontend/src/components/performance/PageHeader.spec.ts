import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PageHeader from './PageHeader.vue'

describe('PageHeader', () => {
  it('renders the captured shared header contract', () => {
    const wrapper = mount(PageHeader, {
      props: { title: '新建评估规则' },
      slots: {
        subtitle: '<span data-testid="subtitle">副标题</span>',
        actions: '<button data-testid="action">操作</button>',
      },
    })

    expect(wrapper.find('.full-screen-modal-header').exists()).toBe(true)
    expect(wrapper.get('.full-screen-modal-header-title').text()).toBe('新建评估规则')
    expect(wrapper.get('.full-screen-modal-header-back-text').text()).toBe('返回')
    expect(wrapper.get('.full-screen-modal-header-back-icon path').attributes('d')).toBe('M1.293 11.293a1 1 0 0 0 0 1.414l7 7a1 1 0 0 0 1.414-1.414L4.414 13H21a1 1 0 1 0 0-2H4.414l5.293-5.293a1 1 0 0 0-1.414-1.414l-7 7Z')
    expect(wrapper.find('[data-testid="subtitle"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="action"]').exists()).toBe(true)
  })

  it('emits back from the shared return control', async () => {
    const wrapper = mount(PageHeader, { props: { title: '编辑评估规则' } })
    await wrapper.get('.full-screen-modal-header-back').trigger('click')
    expect(wrapper.emitted('back')).toHaveLength(1)
  })
})
