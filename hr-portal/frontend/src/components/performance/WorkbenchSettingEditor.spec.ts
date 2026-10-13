import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import WorkbenchSettingEditor from './WorkbenchSettingEditor.vue'

const stubs = {
  PerformanceDialogShell: {
    props: ['modelValue', 'title'],
    emits: ['update:modelValue', 'close'],
    template: '<section class="dialog"><h2>{{ title }}</h2><slot /><footer><slot name="footer" /></footer></section>',
  },
  PerformanceRequiredLabel: { props: ['label'], template: '<label>{{ label }}*</label>' },
  PerformanceTextField: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<input class="text-field" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
  PerformanceRadioGroup: {
    props: ['modelValue', 'options'],
    emits: ['update:modelValue'],
    template: '<div class="radio-group"><button v-for="option in options" :key="option.value" type="button" @click="$emit(\'update:modelValue\', option.value)">{{ option.label }}</button></div>',
  },
  PerformanceSearchSelect: {
    props: ['ariaLabel'],
    emits: ['update:modelValue', 'open'],
    template: '<button class="search-select" type="button" @click="$emit(\'update:modelValue\', ariaLabel === \'指定周期\' ? \'cycle:1\' : \'HRBP\')">选择框</button>',
  },
  PerformanceSwitch: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<button class="switch" type="button" @click="$emit(\'update:modelValue\', !modelValue)">switch</button>',
  },
  AddOutlinedIcon: { template: '<svg />' },
}

describe('WorkbenchSettingEditor', () => {
  it('renders the captured announcement form in the shared dialog shell', () => {
    const wrapper = mount(WorkbenchSettingEditor, {
      props: { modelValue: true, kind: 'announcement' },
      global: { stubs },
    })

    expect(wrapper.text()).toContain('新建公告')
    expect(wrapper.text()).toContain('公告标题')
    expect(wrapper.text()).toContain('跳转链接')
    expect(wrapper.text()).toContain('添加英文')
    expect(wrapper.text()).toContain('展示周期')
    expect(wrapper.text()).toContain('所有周期')
    expect(wrapper.text()).toContain('指定周期')
    expect(wrapper.text()).toContain('可见范围')
    expect(wrapper.text()).toContain('指定人员')
    expect(wrapper.text()).toContain('弹窗并要求查看人确认知悉')
    expect(wrapper.text()).toContain('取消')
    expect(wrapper.text()).toContain('保存')
    expect(wrapper.text()).toContain('启用')
  })

  it('emits captured scope values and acknowledgement state', async () => {
    const wrapper = mount(WorkbenchSettingEditor, {
      props: { modelValue: true, kind: 'announcement' },
      global: { stubs },
    })
    const inputs = wrapper.findAll('input.text-field')
    await inputs[0].setValue('公告标题')
    await inputs[1].setValue('/announcement')
    await wrapper.findAll('.radio-group')[0].findAll('button')[1].trigger('click')
    await wrapper.findAll('.radio-group')[1].findAll('button')[1].trigger('click')
    expect(wrapper.findAll('.search-select')).toHaveLength(2)
    await wrapper.findAll('.search-select')[0].trigger('click')
    await wrapper.findAll('.search-select')[1].trigger('click')
    await wrapper.find('.switch').trigger('click')
    await wrapper.findAll('button').find(button => button.text() === '启用')?.trigger('click')

    expect(wrapper.emitted('save')?.[0]?.[0]).toEqual({
      title: '公告标题',
      link: '/announcement',
      cycle_label: '指定周期',
      cycle_ref: 'cycle:1',
      visibility: '指定人员',
      visibility_role: 'HRBP',
      require_ack: true,
      status: 'active',
    })
  })

  it('uses the same shell with entry-specific fields', () => {
    const wrapper = mount(WorkbenchSettingEditor, {
      props: { modelValue: true, kind: 'entry' },
      global: { stubs },
    })

    expect(wrapper.text()).toContain('新建更多入口')
    expect(wrapper.text()).toContain('入口标题')
    expect(wrapper.text()).toContain('图标')
    expect(wrapper.text()).not.toContain('展示周期')
    expect(wrapper.findAll('.dialog')).toHaveLength(1)
  })
})
