import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceRoleFormDialog from './PerformanceRoleFormDialog.vue'

const stubDialog = {
  props: ['modelValue', 'title', 'loading'],
  emits: ['update:modelValue', 'close'],
  template: '<div v-if="modelValue" class="form-shell" :data-title="title"><slot /><slot name="footer" /></div>',
}

const emptyForm = { name: { zh: '', en: '' }, description: { zh: '', en: '' } }

describe('PerformanceRoleFormDialog', () => {
  it('renders the title with bilingual name and description fields', () => {
    const wrapper = mount(PerformanceRoleFormDialog, {
      props: { modelValue: true, title: '添加评估角色', initial: emptyForm },
      global: { stubs: { PerformanceDialogShell: stubDialog } },
    })
    expect(wrapper.get('.form-shell').attributes('data-title')).toBe('添加评估角色')
    expect(wrapper.text()).toContain('名称')
    expect(wrapper.text()).toContain('描述')
    expect(wrapper.text()).toContain('添加英文')
  })

  it('prefills the initial chinese name and english description rows', () => {
    const wrapper = mount(PerformanceRoleFormDialog, {
      props: { modelValue: true, title: '编辑评估角色', initial: { name: { zh: '旧角色', en: 'Old' }, description: { zh: '旧描述', en: 'Old Desc' } } },
      global: { stubs: { PerformanceDialogShell: stubDialog } },
    })
    expect(wrapper.find('input').element.value).toBe('旧角色')
    expect(wrapper.findAll('input')[1].element.value).toBe('Old')
  })

  it('disables the confirm button while the name is empty', () => {
    const wrapper = mount(PerformanceRoleFormDialog, {
      props: { modelValue: true, title: '添加评估角色', initial: emptyForm },
      global: { stubs: { PerformanceDialogShell: stubDialog } },
    })
    const submit = wrapper.findAll('button').find(b => b.text() === '确定')
    expect(submit?.attributes('disabled')).toBeDefined()
  })

  it('emits submit with trimmed values after filling the name', async () => {
    const wrapper = mount(PerformanceRoleFormDialog, {
      props: { modelValue: true, title: '添加评估角色', initial: emptyForm },
      global: { stubs: { PerformanceDialogShell: stubDialog } },
    })
    await wrapper.find('input').setValue('  新评估角色  ')
    await wrapper.findAll('button').find(b => b.text() === '确定')!.trigger('click')
    await flushPromises()
    expect(wrapper.emitted('submit')?.at(-1)).toEqual([{ name: { zh: '新评估角色', en: '' }, description: { zh: '', en: '' } }])
  })

  it('cancels by emitting update:modelValue false', async () => {
    const wrapper = mount(PerformanceRoleFormDialog, {
      props: { modelValue: true, title: '添加评估角色', initial: emptyForm },
      global: { stubs: { PerformanceDialogShell: stubDialog } },
    })
    await wrapper.findAll('button').find(b => b.text() === '取消')!.trigger('click')
    await flushPromises()
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false])
  })
})
