import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceFilterConditionSettingsDialog from './PerformanceFilterConditionSettingsDialog.vue'
import { createFieldSettingsPreview } from './performanceFieldSettings'

const DialogShellStub = {
  name: 'PerformanceDialogShell',
  props: ['modelValue', 'title', 'width', 'loading', 'dialogClass'],
  template: '<div><slot /><slot name="footer" /></div>',
}

function mountDialog() {
  const value = createFieldSettingsPreview().default_filter_condition.filter_conditions
  return {
    value,
    wrapper: mount(PerformanceFilterConditionSettingsDialog, {
      props: { modelValue: true, value, saving: false },
      global: { stubs: { PerformanceDialogShell: DialogShellStub } },
    }),
  }
}

describe('筛选条件设置弹窗', () => {
  it('renders the measured header and all 32 rows', () => {
    const { wrapper } = mountDialog()
    expect(wrapper.get('.filter-condition-dialog__header').text()).toBe('名称默认条件（7）')
    expect(wrapper.findAll('.filter-condition-row')).toHaveLength(32)
    expect(wrapper.findAll('.filter-condition-row .filter-condition-row__label')[0].text()).toBe('直属上级')
    wrapper.unmount()
  })

  it('disables the six conditions that cannot be default', () => {
    const { wrapper } = mountDialog()
    const disabled = wrapper.findAll('.filter-condition-row input[type="checkbox"]').filter(node => node.attributes('disabled') !== undefined)
    expect(disabled).toHaveLength(6)
    wrapper.unmount()
  })

  it('keeps edits in a draft and emits only keys and defaults', async () => {
    const { wrapper, value } = mountDialog()
    await wrapper.findAll('.filter-condition-row input[type="checkbox"]')[0].setValue(false)
    expect(wrapper.get('.filter-condition-dialog__header').text()).toBe('名称默认条件（6）')
    expect(value[0].default).toBe(true)
    await wrapper.findAll('button').find(node => node.text() === '确定')!.trigger('click')
    const payload = wrapper.emitted('save')![0][0] as { filter_key: string; default: boolean; label?: string }[]
    expect(payload).toHaveLength(32)
    expect(payload[0]).toEqual({ filter_key: 'directLeader', default: false })
    expect(payload[0].label).toBeUndefined()
    wrapper.unmount()
  })

  it('submits the reordered list', async () => {
    const { wrapper } = mountDialog()
    wrapper.findComponent({ name: 'UiSortableList' }).vm.$emit('reorder', 0, 1)
    await wrapper.vm.$nextTick()
    await wrapper.findAll('button').find(node => node.text() === '确定')!.trigger('click')
    const payload = wrapper.emitted('save')![0][0] as { filter_key: string }[]
    expect(payload[0].filter_key).toBe('dottedLeaders')
    expect(payload[1].filter_key).toBe('directLeader')
    wrapper.unmount()
  })

  it('closes without submitting on cancel', async () => {
    const { wrapper } = mountDialog()
    await wrapper.findAll('button').find(node => node.text() === '取消')!.trigger('click')
    expect(wrapper.emitted('save')).toBeUndefined()
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
    wrapper.unmount()
  })
})
