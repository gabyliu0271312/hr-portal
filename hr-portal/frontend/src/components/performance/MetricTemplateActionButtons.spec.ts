import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import MetricTemplateActionButtons from './MetricTemplateActionButtons.vue'

const stubs = {
  PerformancePermissionButton: {
    emits: ['click'],
    template: '<button class="permission-button" @click="$emit(\'click\')"><slot /></button>',
  },
  AddOutlinedIcon: { template: '<svg data-icon="AddOutlined" />' },
  PerformanceImportIcon: { template: '<svg data-icon="PaPeopledownloadOutlined" />' },
}

describe('MetricTemplateActionButtons', () => {
  it('keeps complete labels while supporting toolbar and empty placements', async () => {
    const wrapper = mount(MetricTemplateActionButtons, { global: { stubs } })

    expect(wrapper.find('.metric-template-actions--toolbar').exists()).toBe(true)
    expect(wrapper.text()).toContain('新建模板')
    expect(wrapper.text()).toContain('通过导入新建')

    await wrapper.setProps({ placement: 'empty' })
    expect(wrapper.find('.metric-template-actions--empty').exists()).toBe(true)
  })
})
