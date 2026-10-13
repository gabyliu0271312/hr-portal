import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceHrbpScopeSummary from './PerformanceHrbpScopeSummary.vue'

describe('PerformanceHrbpScopeSummary', () => {
  it('renders the captured scope summary and emits settings', async () => {
    const wrapper = mount(PerformanceHrbpScopeSummary, {
      global: { stubs: { PermissionButton: { template: '<button v-bind="$attrs"><slot /></button>' } } },
    })

    expect(wrapper.text()).toContain('HRBP 可管理的绩效数据范围')
    expect(wrapper.text()).toContain('本周期负责的人员和当前负责的人员')
    await wrapper.get('.scope-settings-button').trigger('click')
    expect(wrapper.emitted('settings')).toHaveLength(1)
  })
})
