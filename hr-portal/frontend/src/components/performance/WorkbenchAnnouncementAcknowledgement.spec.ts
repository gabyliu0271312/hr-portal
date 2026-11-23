import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import WorkbenchAnnouncementAcknowledgement from './WorkbenchAnnouncementAcknowledgement.vue'
import WorkbenchAnnouncementImageUpload from './WorkbenchAnnouncementImageUpload.vue'
import WorkbenchLocalizedField from './WorkbenchLocalizedField.vue'

function configuration(imageEnId: number | null = null) {
  return mount(WorkbenchAnnouncementAcknowledgement, {
    props: { enabled: true, description: '', descriptionEn: '', imageId: null, imageEnId },
    global: { stubs: { WorkbenchAnnouncementExample: true, WorkbenchAnnouncementImageUpload: { props: ['label', 'modelValue'], template: '<div class="image-upload">{{ label }}</div>' } } },
  })
}

describe('WorkbenchAnnouncementAcknowledgement', () => {
  it('uses the captured help and field labels with only Chinese upload initially', () => {
    const wrapper = configuration()
    expect(wrapper.text()).toContain('开启后，公告将在工作台对应展示的周期对可见该公告的人员弹出，直到查看人确认‘已知悉’。')
    expect(wrapper.getComponent(WorkbenchLocalizedField).props('label')).toBe('描述')
    expect(wrapper.get('.announcement-ack__label').text()).toBe('配图')
    expect(wrapper.findAllComponents(WorkbenchAnnouncementImageUpload)).toHaveLength(1)
    expect(wrapper.text()).toContain('添加英文配图')
  })
  it('adds English upload on demand and retains expansion and images when disabled then enabled', async () => {
    const wrapper = configuration()
    await wrapper.findAll('button').find(button => button.text() === '添加英文配图')!.trigger('click')
    expect(wrapper.findAllComponents(WorkbenchAnnouncementImageUpload)).toHaveLength(2)
    expect(wrapper.find('.announcement-ack__add-image').exists()).toBe(false)
    await wrapper.setProps({ enabled: false, imageEnId: 8 })
    await wrapper.setProps({ enabled: true })
    expect(wrapper.findAllComponents(WorkbenchAnnouncementImageUpload)[1].props()).toMatchObject({ modelValue: 8, label: '英文配图' })
  })
  it('reveals persisted English images on edit and disables language addition while saving', async () => {
    const wrapper = configuration(8)
    expect(wrapper.findAllComponents(WorkbenchAnnouncementImageUpload)).toHaveLength(2)
    expect(wrapper.find('.announcement-ack__add-image').exists()).toBe(false)
    wrapper.unmount()
    const empty = configuration()
    await empty.setProps({ disabled: true })
    const add = empty.findAll('button').find(button => button.text() === '添加英文配图')!
    expect(add.attributes('disabled')).toBeDefined()
    await add.trigger('click')
    expect(empty.findAllComponents(WorkbenchAnnouncementImageUpload)).toHaveLength(1)
  })
})
