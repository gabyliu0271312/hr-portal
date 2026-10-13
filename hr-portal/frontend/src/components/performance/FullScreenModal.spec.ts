import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import FullScreenModal from './FullScreenModal.vue'

function mountModal(showFooter = true) {
  return mount(FullScreenModal, {
    props: { title: '新建评估规则', showFooter },
    slots: { default: '<section data-testid="content">内容</section>' },
    global: {
      stubs: {
        'el-button': {
          emits: ['click'],
          template: '<button @click="$emit(\'click\')"><slot /></button>',
        },
      },
    },
  })
}

describe('FullScreenModal', () => {
  it('assembles the shared header, scroll content and 48px action bar', () => {
    const wrapper = mountModal()
    expect(wrapper.get('.full-screen-modal-header-title').text()).toBe('新建评估规则')
    expect(wrapper.get('.full-screen-modal-content [data-testid="content"]').text()).toBe('内容')
    expect(wrapper.get('.full-screen-modal-footer').text()).toContain('提交')
    expect(wrapper.get('.full-screen-modal-footer').text()).toContain('预览')
    expect(wrapper.get('.full-screen-modal-footer').text()).toContain('取消')
  })

  it('forwards header and footer events', async () => {
    const wrapper = mountModal()
    await wrapper.get('.full-screen-modal-header-back').trigger('click')
    const buttons = wrapper.findAll('.full-screen-modal-footer button')
    await buttons[0].trigger('click')
    await buttons[1].trigger('click')
    await buttons[2].trigger('click')
    expect(wrapper.emitted('back')).toHaveLength(1)
    expect(wrapper.emitted('submit')).toHaveLength(1)
    expect(wrapper.emitted('preview')).toHaveLength(1)
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })

  it('supports pages without a footer', () => {
    const wrapper = mountModal(false)
    expect(wrapper.find('.full-screen-modal-footer').exists()).toBe(false)
  })
})
