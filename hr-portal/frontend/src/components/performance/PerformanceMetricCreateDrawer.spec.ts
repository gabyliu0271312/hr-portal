import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceMetricCreateDrawer from './PerformanceMetricCreateDrawer.vue'

const stubs = {
  PerformanceDrawerShell: {
    props: ['modelValue', 'title'],
    template: '<div v-if="modelValue" class="drawer-shell"><h2>{{ title }}</h2><slot /><slot name="footer" /></div>',
  },
  PerformanceDrawerFooter: {
    emits: ['confirm', 'continue', 'cancel'],
    template: '<footer><button class="confirm" @click="$emit(\'confirm\')">确定</button><button class="continue" @click="$emit(\'continue\')">确定并继续添加</button><button class="cancel" @click="$emit(\'cancel\')">取消</button></footer>',
  },
}

function mountDrawer() {
  return mount(PerformanceMetricCreateDrawer, {
    props: {
      modelValue: true,
      scoringMethodOptions: [{ value: 'score', label: '按完成值评分' }],
    },
    global: { stubs },
  })
}

describe('PerformanceMetricCreateDrawer', () => {
  it('renders the captured sections and three footer actions', () => {
    const wrapper = mountDrawer()

    expect(wrapper.get('h2').text()).toBe('新建指标')
    expect(wrapper.findAll('.metric-section-heading h3').map(item => item.text())).toEqual(['指标类型', '指标设置', '标签', '可用范围'])
    expect(wrapper.get('[aria-label="指标类型"] span').text()).toBe('定量指标')
    expect(wrapper.get('[aria-label="目标值"] span').text()).toBe('被评估人填写')
    expect(wrapper.findAll('footer button')).toHaveLength(3)
    expect(wrapper.get('footer .continue').text()).toBe('确定并继续添加')
  })

  it('shows required errors before confirming and emits a complete draft after filling required fields', async () => {
    const wrapper = mountDrawer()

    await wrapper.get('.confirm').trigger('click')
    expect(wrapper.get('.field-error').text()).toBe('请输入指标名称')
    expect(wrapper.findAll('.field-error')).toHaveLength(2)

    await wrapper.get('input[aria-label="指标"]').setValue('季度销售额')
    await wrapper.get('[aria-label="评分方式"]').trigger('click')
    await wrapper.get('[role="option"]').trigger('click')
    await wrapper.get('.confirm').trigger('click')

    const confirm = wrapper.emitted('confirm')
    expect(confirm).toHaveLength(1)
    expect(confirm?.[0]?.[0]).toMatchObject({
      metric: '季度销售额',
      metricType: 'quantitative',
      targetWriteMode: 'assessed',
      completionWriteMode: 'assessed',
      scoringMethod: 'score',
      usableRange: 'all',
    })
  })

  it('keeps the drawer open and clears the draft for continue adding', async () => {
    const wrapper = mountDrawer()

    await wrapper.get('input[aria-label="指标"]').setValue('季度销售额')
    await wrapper.get('[aria-label="评分方式"]').trigger('click')
    await wrapper.get('[role="option"]').trigger('click')
    await wrapper.get('.continue').trigger('click')

    expect(wrapper.emitted('continue')).toHaveLength(1)
    expect(wrapper.find('.drawer-shell').exists()).toBe(true)
    expect((wrapper.get('input[aria-label="指标"]').element as HTMLInputElement).value).toBe('')
  })
})
