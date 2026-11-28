import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import PerformanceDetailFieldDialog from './PerformanceDetailFieldDialog.vue'
import { detailFieldOptions } from './performanceFieldSettings'

const defaults = ['department', 'level', 'category', 'directLeader', 'joinDate']

function mountDialog(value = defaults, saving = false) {
  return mount(PerformanceDetailFieldDialog, {
    props: { modelValue: true, value, options: detailFieldOptions, saving },
    attachTo: document.body,
  })
}

function checkboxes() {
  return Array.from(document.body.querySelectorAll<HTMLInputElement>('.ui-checkbox input'))
}

function confirmButton() {
  return document.body.querySelector<HTMLButtonElement>('.performance-dialog__footer .performance-button--primary')!
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('PerformanceDetailFieldDialog', () => {
  it('renders the captured preview and every option with the server-side disabled state', () => {
    const wrapper = mountDialog()

    expect(document.body.querySelector('.field-preview__name')?.textContent).toBe('赵六七')
    expect(document.body.querySelector('.field-preview__fields')?.textContent).toBe('部门职级序列直属上级2021-01-01入职日期')
    const boxes = checkboxes()
    expect(boxes).toHaveLength(detailFieldOptions.length)
    expect(boxes.map(box => box.checked)).toEqual([true, true, true, true, false, true, false, false])
    expect(boxes[0].disabled).toBe(true)
    wrapper.unmount()
  })

  it('updates the preview while toggling and saves in catalog order', async () => {
    const wrapper = mountDialog()
    checkboxes()[6].click()
    await wrapper.vm.$nextTick()

    expect(document.body.querySelector('.field-preview__fields')?.textContent).toBe('部门职级序列直属上级2021-01-01入职日期职务')

    confirmButton().click()
    expect(wrapper.emitted('save')).toEqual([[['department', 'level', 'category', 'directLeader', 'joinDate', 'jobTitle']]])
    wrapper.unmount()
  })

  it('locks every control while saving', () => {
    const wrapper = mountDialog(defaults, true)

    expect(checkboxes().every(box => box.disabled)).toBe(true)
    expect(confirmButton().disabled).toBe(true)
    wrapper.unmount()
  })

  it('surfaces the save error inside the body', () => {
    const wrapper = mount(PerformanceDetailFieldDialog, {
      props: { modelValue: true, value: defaults, options: detailFieldOptions, saving: false, error: '保存或回读失败' },
      attachTo: document.body,
    })

    expect(document.body.querySelector('[role="alert"]')?.textContent).toBe('保存或回读失败')
    wrapper.unmount()
  })
})
