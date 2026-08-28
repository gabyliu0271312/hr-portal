import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TableMergeTemplateCard from './TableMergeTemplateCard.vue'
import type { TemplateOut } from '@/api/tableTools'

const item: TemplateOut = {
  id: 7,
  name: '月度社保归集',
  description: '合并多个来源的社保明细',
  merge_keys: ['姓名', '证件号'],
  std_fields: ['单位基本养老保险'],
  output_fields: [],
  aggregate: 'sum',
  result_save_mode: 'input_period',
  result_period_field: null,
  version: 1,
  mapping_count: 3,
  created_by: 1,
}

const PermissionButtonStub = defineComponent({
  name: 'PermissionButton',
  emits: ['click'],
  template: '<button type="button" @click="$emit(\'click\')"><slot /></button>',
})

function mountCard(canModify = true) {
  return mount(TableMergeTemplateCard, {
    props: { template: item, canModify },
    global: {
      stubs: {
        PermissionButton: PermissionButtonStub,
        ElButton: {
          emits: ['click'],
          template: '<button type="button" @click="$emit(\'click\')"><slot /></button>',
        },
        ElIcon: { template: '<i><slot /></i>' },
      },
    },
  })
}

describe('TableMergeTemplateCard', () => {
  it('uses the card body as the edit entry for maintainers', async () => {
    const wrapper = mountCard()

    await wrapper.find('.template-card-body').trigger('click')

    expect(wrapper.emitted('edit')?.[0]?.[0]).toMatchObject({ id: 7 })
    expect(wrapper.emitted('merge')).toBeUndefined()
  })

  it('falls back to merge when the user cannot modify the template', async () => {
    const wrapper = mountCard(false)

    await wrapper.find('.template-card-body').trigger('click')

    expect(wrapper.emitted('merge')?.[0]?.[0]).toMatchObject({ id: 7 })
    expect(wrapper.find('.template-card-actions').text()).toBe('合并')
  })

  it('shows exactly the three requested actions and emits them independently', async () => {
    const wrapper = mountCard()
    const actionButtons = wrapper.findAll('.template-card-actions button')

    expect(actionButtons.map((button) => button.text().trim())).toEqual(['合并', '新增', '删除'])
    await actionButtons[0].trigger('click')
    await actionButtons[1].trigger('click')
    await actionButtons[2].trigger('click')

    expect(wrapper.emitted('merge')?.[0]?.[0]).toMatchObject({ id: 7 })
    expect(wrapper.emitted('add')?.[0]?.[0]).toMatchObject({ id: 7 })
    expect(wrapper.emitted('delete')?.[0]?.[0]).toMatchObject({ id: 7 })
    expect(wrapper.emitted('edit')).toBeUndefined()
  })
})
