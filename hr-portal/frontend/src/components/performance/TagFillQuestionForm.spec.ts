import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import TagFillQuestionForm from './TagFillQuestionForm.vue'
import { TAG_FILL_QUESTION_FIXTURES, cloneTagFillQuestion } from './tagFillQuestionFixtures'

describe('TagFillQuestionForm', () => {
  it('renders the confirmed create fields and supports adding a tag locally', async () => {
    const wrapper = mount(TagFillQuestionForm, {
      props: { modelValue: cloneTagFillQuestion(TAG_FILL_QUESTION_FIXTURES[0]), mode: 'create' },
      global: { stubs: { 'el-button': true } },
    })

    expect(wrapper.text()).toContain('中文')
    expect(wrapper.find('input[placeholder="请输入标签名称"]').exists()).toBe(true)
    expect(wrapper.findAll('.tag-card')).toHaveLength(1)

    await wrapper.get('.add-tag').trigger('click')

    expect(wrapper.findAll('.tag-card')).toHaveLength(2)
    const updates = wrapper.emitted('update:modelValue') || []
    expect((updates.at(-1)?.[0] as { tags: unknown[] }).tags).toHaveLength(2)
  })

  it('syncs asynchronously loaded edit data into the form', async () => {
    const initial = cloneTagFillQuestion(TAG_FILL_QUESTION_FIXTURES[0])
    const loaded = {
      ...initial,
      name: '已保存的评估题',
      description: '已保存描述',
      remark: '已保存备注',
      tags: [{ id: 'saved-tag', name: '已保存标签', description: '标签描述', prompt: '填写提示' }],
    }
    const wrapper = mount(TagFillQuestionForm, {
      props: { modelValue: initial, mode: 'edit' },
      global: { stubs: { 'el-button': true } },
    })

    await wrapper.setProps({ modelValue: loaded })

    expect((wrapper.find('.form-field input').element as HTMLInputElement).value).toBe('已保存的评估题')
    expect(wrapper.find('input[placeholder="请输入标签名称"]').element).toHaveProperty('value', '已保存标签')
    expect(wrapper.find('.tag-card textarea').element).toHaveProperty('value', '标签描述')
  })

  it('emits a valid form payload for real persistence', async () => {
    const wrapper = mount(TagFillQuestionForm, {
      props: { modelValue: cloneTagFillQuestion(TAG_FILL_QUESTION_FIXTURES[0]), mode: 'create' },
      global: { stubs: { 'el-button': true } },
    })

    wrapper.vm.$.exposed?.submit()
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({ name: '价值观', tags: [{ name: '价值观测评语' }] })
  })


  it('exposes empty-form preview validation without emitting a preview payload', async () => {
    const preview = vi.fn()
    const wrapper = mount(TagFillQuestionForm, {
      props: {
        modelValue: {
          ...cloneTagFillQuestion(TAG_FILL_QUESTION_FIXTURES[0]),
          name: '',
          tags: [{ id: 'empty', name: '', description: '', prompt: '' }],
        },
        mode: 'create',
      },
      global: { stubs: { 'el-button': true } },
    })
    wrapper.vm.$.exposed?.preview()
    await wrapper.vm.$nextTick()

    expect(preview).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('名称为必填')
  })
})
