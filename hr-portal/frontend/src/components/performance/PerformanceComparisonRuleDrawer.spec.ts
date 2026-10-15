import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceComparisonRuleDrawer from './PerformanceComparisonRuleDrawer.vue'

const stubs = {
  PerformanceDrawerShell: {
    props: ['modelValue', 'title'],
    template: '<div v-if="modelValue" class="drawer-shell"><h2>{{ title }}</h2><slot /><slot name="footer" /></div>',
  },
  PerformanceDrawerFooter: {
    emits: ['confirm', 'cancel'],
    template: '<footer><button class="confirm" @click="$emit(\'confirm\')">提交</button><button class="cancel" @click="$emit(\'cancel\')">取消</button></footer>',
  },
}

const stages = [{ id: 'self', label: '员工自评' }, { id: 'manager', label: '上级评价' }]
const items = [{ id: 'rating', label: '绩效等级' }]

function mountDrawer() {
  return mount(PerformanceComparisonRuleDrawer, {
    props: { modelValue: true, stageOptions: stages, itemOptions: items },
    global: { stubs },
  })
}

async function select(wrapper: ReturnType<typeof mountDrawer>, label: string, option: string) {
  await wrapper.get(`[aria-label="${label}"]`).trigger('click')
  const buttons = wrapper.findAll('[role="option"]')
  await buttons.find(button => button.text() === option)!.trigger('click')
}

describe('PerformanceComparisonRuleDrawer', () => {
  it('uses the shared drawer and renders the captured sections', () => {
    const wrapper = mountDrawer()
    expect(wrapper.get('.drawer-shell h2').text()).toBe('添加需对比的环节')
    expect(wrapper.findAll('.comparison-rule-section__title').map(item => item.text())).toEqual([
      '需对比的评估环节', '评估项差异规则', '发生差异时的提示方式',
    ])
    expect(wrapper.findAll('.comparison-prompt-row')).toHaveLength(3)
    expect(wrapper.findAll('[role="option"]')).toHaveLength(0)
    expect((wrapper.get('[aria-label="删除第1条差异规则"]').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('validates incomplete rules and submits the filled draft', async () => {
    const wrapper = mountDrawer()
    await wrapper.get('.confirm').trigger('click')
    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(wrapper.findAll('.comparison-rule-error')).toHaveLength(3)

    await select(wrapper, '第一个评估环节', '员工自评')
    await select(wrapper, '第二个评估环节', '上级评价')
    await select(wrapper, '评估项', '绩效等级')
    await wrapper.get('[aria-label="差异阈值"]').setValue('2')
    await wrapper.findAll('.comparison-prompt-row input[type="checkbox"]')[0].setValue(true)
    await wrapper.get('.confirm').trigger('click')

    expect(wrapper.emitted('submit')?.[0]?.[0]).toEqual({
      firstStageId: 'self', secondStageId: 'manager',
      rules: [{ itemId: 'rating', differenceType: 'EQ', threshold: '2' }],
      promptModes: ['DURING_EVALUATION'],
    })
  })

  it('keeps a required rule row and resets unsubmitted changes when reopened', async () => {
    const wrapper = mountDrawer()
    await wrapper.get('.comparison-condition-add').trigger('click')
    expect(wrapper.findAll('.comparison-condition-row')).toHaveLength(2)
    await wrapper.get('[aria-label="删除第2条差异规则"]').trigger('click')
    expect(wrapper.findAll('.comparison-condition-row')).toHaveLength(1)
    await wrapper.get('.comparison-condition-add').trigger('click')
    await wrapper.get('.cancel').trigger('click')
    await wrapper.setProps({ modelValue: false })
    await wrapper.setProps({ modelValue: true })
    expect(wrapper.findAll('.comparison-condition-row')).toHaveLength(1)
  })
})
