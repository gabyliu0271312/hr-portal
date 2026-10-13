import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { route, create, update, getQuestion, getRule, listRules, listSubQuestionOptions } = vi.hoisted(() => ({
  route: { name: 'ReviewQuestionCreate', query: {}, params: {} },
  create: vi.fn(),
  update: vi.fn(),
  getQuestion: vi.fn(),
  getRule: vi.fn(),
  listRules: vi.fn(),
  listSubQuestionOptions: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('element-plus', () => ({
  ElMessage: { warning: vi.fn(), success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))
vi.mock('@/api/performance', () => ({
  performanceReviewRuleApi: { list: listRules, get: getRule },
  performanceReviewQuestionApi: { create, get: getQuestion, update, listSubQuestionOptions },
}))

import ReviewQuestionCreatePage from './ReviewQuestionCreatePage.vue'

function mountPage() {
  return mount(ReviewQuestionCreatePage, {
    global: {
      stubs: {
        FullScreenModal: { props: ['title'], emits: ['submit'], template: '<div><h1>{{ title }}</h1><slot /><button data-submit @click="$emit(\'submit\')" /></div>' },
        ReviewQuestionFormBasic: { template: '<div />' },
        ReviewQuestionFormType: {
          props: ['modelValue'],
          emits: ['update:modelValue'],
          template: '<button data-type-change @click="$emit(\'update:modelValue\', modelValue === \'regular\' ? \'bonus\' : \'regular\')">类型</button>',
        },
        PerformanceTextField: { template: '<textarea />' },
        PerformanceRequiredLabel: { props: ['label'], template: '<span>{{ label }}</span>' },
        'el-form': { template: '<form><slot /></form>' },
        'el-form-item': { template: '<div><slot /><slot name="label" /></div>' },
        'el-select': {
          props: ['modelValue', 'loading', 'disabled'],
          emits: ['update:modelValue'],
          template: '<select :value="modelValue ?? \'\'" :disabled="disabled" @change="$emit(\'update:modelValue\', Number($event.target.value))"><slot /></select>',
        },
        'el-option': { props: ['label', 'value'], template: '<option :value="value">{{ label }}</option>' },
      },
    },
  })
}

describe('ReviewQuestionCreatePage rule relationship', () => {
  beforeEach(() => {
    route.name = 'ReviewQuestionCreate'
    route.query = {}
    route.params = {}
    create.mockReset()
    update.mockReset()
    getQuestion.mockReset()
    getRule.mockReset()
    listRules.mockReset()
    listSubQuestionOptions.mockReset()
    listSubQuestionOptions.mockResolvedValue([])
  })

  it('loads API rules and submits the selected rule_id', async () => {
    listRules.mockResolvedValue([{ id: 11, name: '测试评级', review_type: '评级', status: 'active', updated_at: '', config_summary: {} }])
    getRule.mockResolvedValue({ id: 11, name: '测试评级', review_type: '评级', status: 'active', updated_at: '', config_summary: {}, config: { grade_participates_in_calculation: false, levels: [] } })
    create.mockResolvedValue({})
    route.query = { name: '题目' }
    const wrapper = mountPage()
    await flushPromises()
    expect(listSubQuestionOptions).toHaveBeenCalledWith('none')
    expect(listSubQuestionOptions).toHaveBeenCalledWith('condition')

    await wrapper.get('select').setValue('11')
    await flushPromises()
    await wrapper.get('[data-submit]').trigger('click')

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      rule_id: 11,
      is_sub_question: false,
      parent_question_id: null,
    }))
    expect(create.mock.calls[0][0]).not.toHaveProperty('hide_grade_quantified_score')
    expect(create.mock.calls[0][0]).not.toHaveProperty('hideGradeQuantifiedScore')
    expect(wrapper.find('[aria-label="配置等级描述"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="评估方式"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="展示方式"]').exists()).toBe(true)
  })

  it('persists the selected display mode on the current question', async () => {
    listRules.mockResolvedValue([{ id: 11, name: '测试评级', review_type: '评级', status: 'active', updated_at: '', config_summary: {} }])
    getRule.mockResolvedValue({ id: 11, name: '测试评级', review_type: '评级', status: 'active', updated_at: '', config_summary: {}, config: { displayMode: '标签样式', levels: [{ code: 'A' }] } })
    create.mockResolvedValue({})
    route.query = { name: '题目' }
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.get('select').setValue('11')
    await flushPromises()

    await wrapper.findAll('[aria-label="展示方式"] [role="radio"]')[1].trigger('click')
    await wrapper.get('[data-submit]').trigger('click')

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ rule_id: 11, display_mode: '下拉样式' }))
  })

  it('rehydrates and updates dropdown display mode without resetting it', async () => {
    route.name = 'ReviewQuestionEdit'
    route.params = { id: '2' }
    listRules.mockResolvedValue([{ id: 11, name: '测试评级', review_type: '评级', status: 'active', updated_at: '', config_summary: {} }])
    getRule.mockResolvedValue({ id: 11, name: '测试评级', review_type: '评级', status: 'active', updated_at: '', config_summary: {}, config: { levels: [{ code: 'A' }] } })
    getQuestion.mockResolvedValue({ id: 2, language: 'zh-CN', name: '下拉题目', description: '', type: 'regular', rule_id: 11, display_mode: '下拉样式', remark: '', is_sub_question: false, parent_question_id: null })
    update.mockResolvedValue({})
    const wrapper = mountPage()
    await flushPromises()

    const modes = wrapper.findAll('[aria-label="展示方式"] [role="radio"]')
    expect(modes[1].attributes('aria-checked')).toBe('true')
    await wrapper.get('[data-submit]').trigger('click')
    expect(update).toHaveBeenCalledWith(2, expect.objectContaining({ display_mode: '下拉样式' }))
  })

  it('blocks score-range sub-item submission when no sub-question is selected', async () => {
    listRules.mockResolvedValue([{ id: 11, name: '评估规则--拼分（在分数上下限内输入评分）', review_type: '评分', status: 'active', updated_at: '', config_summary: {} }])
    getRule.mockResolvedValue({
      id: 11,
      name: '评估规则--拼分（在分数上下限内输入评分）',
      review_type: '评分',
      status: 'active',
      updated_at: '',
      config_summary: {},
      config: { evaluation_method: '按子评估项评分', score: { method: '在分数上下限内输入评分' } },
    })
    route.query = { name: '题目' }
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.get('select').setValue('11')
    await flushPromises()
    await wrapper.get('[data-submit]').trigger('click')

    expect(create).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('该字段是必填字段')
  })

  it('clears the selected rule when the regular question type changes', async () => {
    listRules.mockResolvedValue([{ id: 11, name: '测试评级', review_type: '评级', status: 'active', updated_at: '', config_summary: {} }])
    getRule.mockResolvedValue({ id: 11, name: '测试评级', review_type: '评级', status: 'active', updated_at: '', config_summary: {}, config: { levels: [{ code: 'A' }] } })
    route.query = { name: '题目' }
    const wrapper = mountPage()
    await flushPromises()

    await wrapper.get('select').setValue('11')
    await flushPromises()
    expect(wrapper.find('[aria-label="配置等级描述"]').exists()).toBe(true)

    await wrapper.get('[data-type-change]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[aria-label="配置等级描述"]').exists()).toBe(false)
    expect(wrapper.find('[aria-label="评级档位"]').exists()).toBe(false)
    expect((wrapper.get('select').element as HTMLSelectElement).value).toBe('')
  })

  it('clears the selected rule when the sub-question type changes', async () => {
    listRules.mockResolvedValue([{ id: 11, name: '测试评级', review_type: '评级', status: 'active', updated_at: '', config_summary: {} }])
    getRule.mockResolvedValue({ id: 11, name: '测试评级', review_type: '评级', status: 'active', updated_at: '', config_summary: {}, config: { levels: [{ code: '等级A' }] } })
    route.query = { isSub: '1', name: '子问题' }
    const wrapper = mountPage()
    await flushPromises()

    await wrapper.get('select').setValue('11')
    await flushPromises()
    expect(wrapper.find('[aria-label="评级档位"]').exists()).toBe(true)

    await wrapper.get('[data-type-change]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[aria-label="评级档位"]').exists()).toBe(false)
    expect(wrapper.find('[aria-label="配置等级描述"]').exists()).toBe(false)
    expect((wrapper.get('select').element as HTMLSelectElement).value).toBe('')
  })


  it('treats isSub=1 as the sub-question fixed-score variant', async () => {
    listRules.mockResolvedValue([{ id: 11, name: '测试评分', review_type: '评分', status: 'active', updated_at: '', config_summary: {} }])
    getRule.mockResolvedValue({
      id: 11,
      name: '测试评分',
      review_type: '评分',
      status: 'active',
      updated_at: '',
      config_summary: {},
      config: { score: { method: '在固定分值选项内选择评分', fixed_options: [{ id: '1', value: '1' }, { id: '2', value: '2222...2222' }], precision: '不保留小数' } },
    })
    route.query = { isSub: '1', name: '子问题' }
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.get('h1').text()).toBe('新建子评估题')
    await wrapper.get('select').setValue('11')
    await flushPromises()

    expect(wrapper.find('[aria-label="分值选项"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="评分配置"]').exists()).toBe(false)
    expect(wrapper.findAll('.sub-fixed-option')).toHaveLength(2)
  })
  it('renders the shared rating component as the sub-question tier variant', async () => {
    listRules.mockResolvedValue([{ id: 11, name: '任意名称的评级规则', review_type: '评级', status: 'active', updated_at: '', config_summary: {} }])
    getRule.mockResolvedValue({ id: 11, name: '任意名称的评级规则', review_type: '评级', status: 'active', updated_at: '', config_summary: {}, config: { levels: [{ code: '等级A', color: '#fbd0cd' }, { code: '等级B', color: '#fee0bd' }] } })
    route.query = { isSub: null, name: '子问题' }
    create.mockResolvedValue({})
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.get('h1').text()).toBe('新建子评估题')
    await wrapper.get('select').setValue('11')
    await flushPromises()

    expect(wrapper.find('[aria-label="评级档位"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="配置等级描述"]').exists()).toBe(false)
    expect(wrapper.find('[aria-label="评估方式"]').exists()).toBe(false)
    expect(wrapper.find('[aria-label="展示方式"]').exists()).toBe(false)
    await wrapper.get('[data-submit]').trigger('click')
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ is_sub_question: true, parent_question_id: null, rule_id: 11 }))
  })
})
