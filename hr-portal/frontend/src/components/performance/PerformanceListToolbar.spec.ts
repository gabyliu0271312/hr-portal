import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceListToolbar from './PerformanceListToolbar.vue'

function mountToolbar() {
  return mount(PerformanceListToolbar, {
    props: { keyword: '项目', searchPlaceholder: '搜索成员', searchAriaLabel: '搜索成员' },
    global: {
      stubs: {
        'el-button': { template: '<button type="button" @click="$emit(\'click\')"><slot /></button>' },
      },
    },
    slots: {
      actions: '<button class="export-button" type="button">导出</button>',
    },
  })
}

describe('PerformanceListToolbar', () => {
  it('provides a shared search, filter and extension-action boundary', async () => {
    const wrapper = mountToolbar()

    expect(wrapper.find('input').attributes('placeholder')).toBe('搜索成员')
    expect(wrapper.find('.export-button').exists()).toBe(true)

    await wrapper.find('.filter-button').trigger('click')
    await wrapper.find('input').setValue('成员')
    await wrapper.find('input').trigger('keyup.enter')

    expect(wrapper.emitted('filter')).toHaveLength(2)
    expect(wrapper.emitted('update:keyword')).toEqual([['成员']])
    expect(wrapper.emitted('search')).toEqual([[]])
  })
})
