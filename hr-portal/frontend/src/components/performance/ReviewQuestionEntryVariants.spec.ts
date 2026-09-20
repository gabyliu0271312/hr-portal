import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import DownBoldOutlinedIcon from './DownBoldOutlinedIcon.vue'
import FixedScoreOptionsSummary from './FixedScoreOptionsSummary.vue'
import ReviewQuestionSubQuestionSelect from './ReviewQuestionSubQuestionSelect.vue'
import ReviewQuestionSubQuestionCreateModal from './ReviewQuestionSubQuestionCreateModal.vue'
import ReviewQuestionRuleAdditionalCards from './ReviewQuestionRuleAdditionalCards.vue'
import ReviewQuestionDisplayMethodCard from './ReviewQuestionDisplayMethodCard.vue'
import ReviewRuleConfigRenderer from './ReviewRuleConfigRenderer.vue'
import ScoreMappingSummary from './ScoreMappingSummary.vue'
import ScoreRangeSummary from './ScoreRangeSummary.vue'

const global = {
  stubs: {
    InfoOutlinedIcon: { template: '<svg />' },
    'el-select': { props: ['modelValue', 'loading', 'disabled'], emits: ['update:modelValue'], template: '<div><slot name="label" /><slot /></div>' },
    'el-option': { props: ['label', 'value'], template: '<div><slot /></div>' },
  },
}

describe('review question entry-mode variants', () => {
  it('uses the read-only option navigator for sub-question ratings', () => {
    const wrapper = mount(ReviewRuleConfigRenderer, {
      props: { entryMode: 'sub_question', ruleType: '评级', config: { levels: [{ code: 'A' }, { code: '等级B' }, { code: '很长的等级代号C' }] } },
    })
    const navigator = wrapper.get('.performance-option-navigator')
    expect(wrapper.find('[aria-label="评级档位"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="配置等级描述"]').exists()).toBe(false)
    expect(navigator.classes()).toContain('is-fluid')
    expect(navigator.classes()).toContain('is-readonly')
    expect(navigator.classes()).toContain('is-sub-question-rating')
    expect(navigator.findAll('.performance-option-navigator__option')).toHaveLength(3)
    expect(navigator.findAll('.performance-option-navigator__connector')).toHaveLength(2)
    expect(navigator.find('.performance-option-navigator__option').attributes('role')).toBeUndefined()
  })

  it('clips long rating tiers behind a non-operable right indicator', async () => {
    const levels = Array.from({ length: 20 }, (_, index) => ({ code: `${index + 1}`.repeat(16) }))
    const wrapper = mount(ReviewRuleConfigRenderer, {
      props: { entryMode: 'sub_question', ruleType: '评级', config: { levels } },
    })
    const navigator = wrapper.get('.performance-option-navigator')
    const track = navigator.get('.performance-option-navigator__track')
    const next = navigator.get('[aria-label="下一组选项"]')

    expect(navigator.classes()).toContain('is-overflow')
    expect(navigator.findAll('.performance-option-navigator__option')).toHaveLength(20)
    expect(navigator.findAll('.performance-option-navigator__connector')).toHaveLength(19)
    expect(next.attributes('disabled')).toBeDefined()
    expect(next.attributes('aria-disabled')).toBe('true')
    expect(navigator.find('[data-icon="LeftOutlined"]').exists()).toBe(false)
    expect(track.attributes('style')).toContain('translateX(0px)')
    await next.trigger('click')
    expect(track.attributes('style')).toContain('translateX(0px)')
  })

  it('keeps ordinary rating details in the shared renderer', () => {
    const wrapper = mount(ReviewRuleConfigRenderer, {
      props: { entryMode: 'regular_question', ruleType: '评级', config: { levels: [{ code: 'A', name: '优秀', quantifiedScore: 5 }] } },
    })
    expect(wrapper.find('[aria-label="配置等级描述"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="评级档位"]').exists()).toBe(false)
  })

  it('maps rating colors and preserves long-code and empty-name semantics', () => {
    const wrapper = mount(ReviewRuleConfigRenderer, {
      props: {
        entryMode: 'regular_question',
        ruleType: '评级',
        config: {
          levels: [
            { code: 'A', name: '', color: 'rgb(251, 191, 188)' },
            { code: '111222222222222222222222', name: null, color: 'rgb(183,237,177)' },
          ],
        },
      },
    })
    const pills = wrapper.findAll('.level-code-pill')
    expect(pills[0].attributes('style')).toContain('background-color: rgb(253, 226, 226)')
    expect(pills[1].attributes('style')).toContain('background-color: rgb(217, 245, 214)')
    expect(pills[1].get('.level-code-text').text()).toBe('111222222222222222222222')
    expect(wrapper.findAll('.level-name').map((name) => name.text())).toEqual(['--', '--'])
  })

  it('follows the rating calculation flag instead of level field presence', () => {
    const off = mount(ReviewRuleConfigRenderer, {
      props: { entryMode: 'regular_question', ruleType: '评级', config: { grade_participates_in_calculation: false, levels: [{ code: 'A', name: '优秀', quantifiedScore: 5 }] } },
    })
    const on = mount(ReviewRuleConfigRenderer, {
      props: { entryMode: 'regular_question', ruleType: '评级', config: { gradeParticipatesInCalculation: true, levels: [{ code: 'A', name: '优秀', quantifiedScore: 5 }] } },
    })

    expect(off.find('.level-grid.quantified').exists()).toBe(false)
    expect(off.text()).not.toContain('量化分')
    expect(on.find('.level-grid.quantified').exists()).toBe(true)
    expect(on.text()).toContain('量化分')
  })

  it('loads the hidden quantified-score setting from the selected rating rule', async () => {
    const off = mount(ReviewQuestionRuleAdditionalCards, {
      props: { entryMode: 'regular_question', ruleType: '评级', config: { grade_participates_in_calculation: false, hide_grade_quantified_score: true, levels: [{ code: 'A' }] } },
      global,
    })
    const on = mount(ReviewQuestionRuleAdditionalCards, {
      props: { entryMode: 'regular_question', ruleType: '评级', config: { grade_participates_in_calculation: true, hide_grade_quantified_score: true, levels: [{ code: 'A' }, { code: 'B' }] } },
      global,
    })

    expect(off.find('[aria-label="展示方式"]').exists()).toBe(true)
    expect(off.find('.hide-score-option').exists()).toBe(false)
    expect(on.find('.hide-score-option').exists()).toBe(true)
    const heading = on.get('.hide-score-heading')
    expect(heading.element.firstElementChild?.tagName).toBe('STRONG')
    const toggle = on.get('[role="switch"]')
    expect(toggle.attributes('aria-checked')).toBe('true')
    expect(on.find('.hide-score-option input[type="checkbox"]').exists()).toBe(false)
    expect(on.find('.display-method-card').classes()).toContain('is-quantified')
    await toggle.trigger('click')
    expect(on.get('[role="switch"]').attributes('aria-checked')).toBe('false')
  })

  it('renders vertical evaluation and preview card structures', async () => {
    const wrapper = mount(ReviewQuestionRuleAdditionalCards, {
      props: { entryMode: 'regular_question', ruleType: '评级', config: { gradeParticipatesInCalculation: true, levels: [{ code: 'C' }, { code: 'B' }, { code: 'A' }, { code: 'S' }] } },
      global,
    })

    expect(wrapper.get('.evaluation-method-card .additional-form-row').classes()).toContain('additional-form-row')
    expect(wrapper.get('.radio-options').attributes('style')).toBeUndefined()
    expect(wrapper.findAll('.evaluation-method-card .info-icon')).toHaveLength(1)
    expect(wrapper.findAll('.display-option')).toHaveLength(2)
    expect(wrapper.findAll('.display-option-choice')).toHaveLength(2)
    expect(wrapper.findAll('.display-option-preview')).toHaveLength(2)
    expect(wrapper.findAll('.display-option-divider')).toHaveLength(2)
    expect(window.getComputedStyle(wrapper.findAll('.display-option')[0].element).cursor).toBe('pointer')
    expect((wrapper.findAll('.display-option-divider')[0].element as HTMLElement).style.backgroundColor).toBe('rgb(240, 244, 255)')
    expect((wrapper.findAll('.display-option-divider')[1].element as HTMLElement).style.backgroundColor).toBe('rgb(222, 224, 227)')
    expect(wrapper.find('[aria-label="标签样式预览"] svg').exists()).toBe(true)
    expect(wrapper.find('.select-preview').exists()).toBe(true)
    const previewArrow = wrapper.get('.select-preview-arrow')
    expect(previewArrow.element.tagName).toBe('svg')
    expect(previewArrow.attributes('data-icon')).toBe('DownBoldOutlined')
    expect(previewArrow.attributes('width')).toBe('12')
    expect(previewArrow.attributes('height')).toBe('12')
    expect(previewArrow.get('path').attributes('d')).toBe('m3.414 7.086-.707.707a1 1 0 0 0 0 1.414l7.778 7.778a2 2 0 0 0 2.829 0l7.778-7.778a1 1 0 0 0 0-1.414l-.707-.707a1 1 0 0 0-1.415 0l-7.07 7.07-7.072-7.07a1 1 0 0 0-1.414 0Z')
    expect(wrapper.text()).not.toContain('⌄')
    expect(wrapper.findAll('.preview-tag')).toHaveLength(0)
    expect(wrapper.findAll('.display-option input[type="radio"]').every((input) => input.attributes('tabindex') === '-1')).toBe(true)
    expect(wrapper.findAll('.display-option').every((option) => option.attributes('role') === 'radio')).toBe(true)
    await wrapper.findAll('.display-option')[1].trigger('click')
    expect(wrapper.findAll('.display-option')[0].classes()).not.toContain('selected')
    expect(wrapper.findAll('.display-option')[1].classes()).toContain('selected')
    expect(wrapper.findAll('.display-option')[1].attributes('aria-checked')).toBe('true')
    expect((wrapper.findAll('.display-option-divider')[0].element as HTMLElement).style.backgroundColor).toBe('rgb(222, 224, 227)')
    expect((wrapper.findAll('.display-option-divider')[1].element as HTMLElement).style.backgroundColor).toBe('rgb(240, 244, 255)')
  })

  it('keeps the shared bold-down icon default size backward compatible', () => {
    const wrapper = mount(DownBoldOutlinedIcon)
    expect(wrapper.attributes('width')).toBe('10')
    expect(wrapper.attributes('height')).toBe('10')
    expect(wrapper.attributes('data-icon')).toBe('DownBoldOutlined')
  })

  it('uses one display-method component for ratings and fixed scoring', () => {
    const rating = mount(ReviewQuestionRuleAdditionalCards, {
      props: { entryMode: 'regular_question', ruleType: '评级', config: { gradeParticipatesInCalculation: false, levels: [{ code: 'X' }] } },
      global,
    })
    const fixed = mount(ReviewQuestionRuleAdditionalCards, {
      props: { entryMode: 'regular_question', ruleType: '评分', config: { score: { method: '在固定分值选项内选择评分', fixedOptions: [{ id: '1', value: '99' }] } } },
      global,
    })

    expect(rating.findComponent(ReviewQuestionDisplayMethodCard).exists()).toBe(true)
    expect(fixed.findComponent(ReviewQuestionDisplayMethodCard).exists()).toBe(true)
    expect(rating.findAllComponents(ReviewQuestionDisplayMethodCard)).toHaveLength(1)
    expect(fixed.findAllComponents(ReviewQuestionDisplayMethodCard)).toHaveLength(1)
    expect(fixed.find('.preview-tag').exists()).toBe(false)
    expect(fixed.get('.label-style-preview').html()).toBe(rating.get('.label-style-preview').html())
  })
  it('hides all additional cards for sub-questions', () => {
    const wrapper = mount(ReviewQuestionRuleAdditionalCards, {
      props: { entryMode: 'sub_question', ruleType: '评分', config: { score: { method: '在固定分值选项内选择评分' } } }, global,
    })
    expect(wrapper.find('[aria-label="评估方式"]').exists()).toBe(false)
    expect(wrapper.find('[aria-label="展示方式"]').exists()).toBe(false)
  })

  it('uses one score-range component for regular and sub-questions', () => {
    const config = {
      method: '在分数上下限内输入评分',
      min: '333.00',
      max: '2222222222222222.00',
      precision: '保留 2 位小数',
    }
    const regular = mount(ReviewRuleConfigRenderer, {
      props: { entryMode: 'regular_question', ruleType: '评分', config },
    })
    const sub = mount(ReviewRuleConfigRenderer, {
      props: { entryMode: 'sub_question', ruleType: '评分', config },
    })

    expect(regular.findComponent(ScoreRangeSummary).exists()).toBe(true)
    expect(sub.findComponent(ScoreRangeSummary).exists()).toBe(true)
    expect(regular.get('[data-component="score-range-summary"]').html()).toBe(sub.get('[data-component="score-range-summary"]').html())
    expect(sub.get('[aria-label="评分上下限摘要"]').text()).toContain('333.00-2222222222222222.00，保留 2 位小数')
    expect(regular.findAll('.score-config-row')).toHaveLength(0)
    expect(regular.text()).not.toContain('评分方式')
    expect(regular.text()).not.toContain('精度')
  })

  it('renders only fixed score options for sub-questions', () => {
    const wrapper = mount(ReviewRuleConfigRenderer, {
      props: {
        entryMode: 'sub_question',
        ruleType: '评分',
        config: {
          score: {
            method: '在固定分值选项内选择评分',
            fixedOptions: [
              { id: 'short', value: '1' },
              { id: 'long', value: '1111...1111' },
            ],
            precision: '不保留小数',
          },
        },
      },
    })

    expect(wrapper.find('[aria-label="分值选项"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="评分配置"]').exists()).toBe(false)
    expect(wrapper.get('.sub-fixed-option-list').findAll('.sub-fixed-option')).toHaveLength(2)
    expect(wrapper.text()).toContain('分值选项')
    expect(wrapper.text()).not.toContain('评分配置')
    expect(wrapper.text()).not.toContain('评分方式')
    expect(wrapper.text()).not.toContain('精度')
  })

  it('uses one fixed-score component for regular and sub-questions', () => {
    const config = { score: { method: '在固定分值选项内选择评分', fixedOptions: [{ id: '1', value: '1' }, { id: '2', value: '2222...2222' }], precision: '不保留小数' } }
    const regular = mount(ReviewRuleConfigRenderer, {
      props: { entryMode: 'regular_question', ruleType: '评分', config },
    })
    const sub = mount(ReviewRuleConfigRenderer, {
      props: { entryMode: 'sub_question', ruleType: '评分', config },
    })

    expect(regular.findComponent(FixedScoreOptionsSummary).exists()).toBe(true)
    expect(sub.findComponent(FixedScoreOptionsSummary).exists()).toBe(true)
    expect(regular.get('[data-component="fixed-score-options-summary"]').html()).toBe(sub.get('[data-component="fixed-score-options-summary"]').html())
    expect(regular.find('[aria-label="评分配置"]').exists()).toBe(false)
    expect(regular.text()).not.toContain('评分方式')
    expect(regular.text()).not.toContain('精度')
  })

  it('renders every sub-question fixed score value without truncating the option list', () => {
    const options = Array.from({ length: 20 }, (_, index) => ({ id: String(index), value: `${index + 1}${index + 1}${index + 1}${index + 1}...${index + 1}${index + 1}${index + 1}${index + 1}` }))
    const wrapper = mount(ReviewRuleConfigRenderer, {
      props: { entryMode: 'sub_question', ruleType: '评分', config: { score: { method: '在固定分值选项内选择评分', fixedOptions: options } } },
    })

    expect(wrapper.get('.sub-fixed-option-list').findAll('.sub-fixed-option')).toHaveLength(20)
    expect(wrapper.text()).toContain('1111...1111')
    expect(wrapper.text()).toContain('2020...2020')
  })
  it('shows ordinary range scoring evaluation method without display method', () => {
    const wrapper = mount(ReviewQuestionRuleAdditionalCards, {
      props: { entryMode: 'regular_question', ruleType: '评分', config: { score: { method: '在分数上下限内输入评分' } } }, global,
    })
    expect(wrapper.find('[aria-label="评估方式"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="展示方式"]').exists()).toBe(false)
    expect(wrapper.get('[data-component="review-question-method-selector"] .method-selector-label').text()).toBe('评分方式*')
    expect(wrapper.findAll('.scoring-method-card .performance-radio-option')).toHaveLength(3)
    expect(wrapper.findAll('.scoring-method-card .info-icon')).toHaveLength(3)
    expect(wrapper.findAll('.scoring-method-card .performance-radio-option').every((option) => option.classes().includes('performance-radio-option'))).toBe(true)
  })

  it('shows ordinary fixed scoring evaluation and display methods', () => {
    const wrapper = mount(ReviewQuestionRuleAdditionalCards, {
      props: { entryMode: 'regular_question', ruleType: '评分', config: { score: { method: '在固定分值选项内选择评分' } } }, global,
    })
    expect(wrapper.find('[aria-label="评估方式"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="展示方式"]').exists()).toBe(true)
    expect(wrapper.findAll('.scoring-method-card .performance-radio-option')).toHaveLength(1)
    expect(wrapper.get('.scoring-method-card .performance-radio-option').text()).toContain('直接评分')
    expect(wrapper.findAll('.scoring-method-card .info-icon')).toHaveLength(1)
  })

  it('renders score mapping as a four-column summary with shared range footer', () => {
    const wrapper = mount(ReviewRuleConfigRenderer, {
      props: {
        entryMode: 'regular_question',
        ruleType: '评分映射等级型',
        config: {
          mapping: {
            min: '1',
            max: '10',
            rule: 'a ≤ 分数 < b',
            precision: '不保留小数',
            intervals: [
              { id: 'a', upper: '2', code: '等级A', name: '' },
              { id: 'b', upper: '4', code: '等级B', name: null },
              { id: 'c', upper: '6', code: '等级C', name: '' },
              { id: 'd', upper: '10', code: '等级D', name: undefined },
            ],
          },
        },
      },
    })

    expect(wrapper.findComponent(ScoreMappingSummary).exists()).toBe(true)
    expect(wrapper.findComponent(ScoreRangeSummary).exists()).toBe(true)
    expect(wrapper.get('.mapping-header').text()).toContain('评分上下限等级代号等级名称等级描述')
    expect(wrapper.findAll('.mapping-row')).toHaveLength(4)
    expect(wrapper.findAll('.mapping-range').map((item) => item.text())).toEqual([
      '1 ≤ 分数 < 2',
      '2 ≤ 分数 < 4',
      '4 ≤ 分数 < 6',
      '6 ≤ 分数 ≤ 10',
    ])
    expect(wrapper.findAll('.mapping-name').map((item) => item.text())).toEqual(['--', '--', '--', '--'])
    expect(wrapper.findAll('.mapping-description-input')).toHaveLength(4)
    expect(wrapper.get('[aria-label="评分上下限摘要"]').text()).toContain('1-10，不保留小数')
    expect(wrapper.text()).not.toContain('区间关系')
    expect(wrapper.find('.mapping-interval-row').exists()).toBe(false)
    expect(wrapper.find('.score-config-row').exists()).toBe(false)
  })

  it('shows ordinary mapping evaluation method without display method', () => {
    const wrapper = mount(ReviewQuestionRuleAdditionalCards, {
      props: { entryMode: 'regular_question', ruleType: '评分映射等级型', config: {} }, global,
    })
    expect(wrapper.find('[aria-label="评估方式"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="展示方式"]').exists()).toBe(false)
    expect(wrapper.get('[data-component="review-question-method-selector"] .method-selector-label').text()).toBe('评分方式*')
    expect(wrapper.findAll('.scoring-method-card .performance-radio-option')).toHaveLength(3)
    expect(wrapper.findAll('.scoring-method-card .info-icon')).toHaveLength(3)
    expect(wrapper.text()).toContain('直接评分')
    expect(wrapper.text()).toContain('按子评估项评分')
    expect(wrapper.text()).toContain('作为总分项计算评分')
    expect(wrapper.text()).not.toContain('直接映射')
  })

  it('loads rating-method branches from local selection state', async () => {
    const wrapper = mount(ReviewQuestionRuleAdditionalCards, {
      props: { entryMode: 'regular_question', ruleType: '评级', config: { gradeParticipatesInCalculation: true, levels: [{ code: 'A' }] } },
      global,
    })

    expect(wrapper.find('[data-component="review-question-calculation-rule"]').exists()).toBe(false)
    expect(wrapper.get('.rating-method-section').classes()).not.toContain('has-sub-items')
    await wrapper.get('input[value="sub_items"]').setValue()
    expect(wrapper.get('.rating-method-section').classes()).toContain('has-sub-items')
    expect(wrapper.find('[data-component="review-question-calculation-rule"]').exists()).toBe(true)
    expect(wrapper.find('[data-component="review-question-sub-question-list"]').exists()).toBe(true)
    expect(wrapper.find('[data-component="review-question-order-section"]').exists()).toBe(true)

    await wrapper.get('input[value="total_score"]').setValue()
    expect(wrapper.find('[data-component="review-question-calculation-rule"]').exists()).toBe(false)
    expect(wrapper.find('[data-component="review-question-sub-question-list"]').exists()).toBe(false)
    expect(wrapper.find('.display-option-grid').exists()).toBe(false)
    expect(wrapper.find('.hide-score-option').exists()).toBe(true)
  })

  it('switches calculation rules only inside the sub-item rating branch', async () => {
    const wrapper = mount(ReviewQuestionRuleAdditionalCards, {
      props: { entryMode: 'regular_question', ruleType: '评级', config: { grade_participates_in_calculation: true, levels: [{ code: 'A' }] } },
      global,
    })

    await wrapper.get('input[value="sub_items"]').setValue()
    expect((wrapper.get('input[value="none"]').element as HTMLInputElement).checked).toBe(true)
    expect(wrapper.find('.performance-sortable-list').exists()).toBe(true)
    expect(wrapper.findAll('[data-drag-handle]')).toHaveLength(2)
    expect(wrapper.findAll('[aria-label="评分上下限"]')).toHaveLength(2)
    expect(wrapper.findAll('svg[data-icon="DeleteTrashOutlined"]')).toHaveLength(2)
    expect(wrapper.find('[data-action="new-sub-question"]').exists()).toBe(true)

    await wrapper.get('input[value="condition"]').setValue()
    expect((wrapper.get('input[value="condition"]').element as HTMLInputElement).checked).toBe(true)
    expect(wrapper.find('.condition-editor').exists()).toBe(false)
    expect(wrapper.find('.performance-sortable-list').exists()).toBe(false)
    expect(wrapper.find('[data-drag-handle]').exists()).toBe(false)
    expect(wrapper.find('[aria-label="评分上下限"]').exists()).toBe(false)
    expect(wrapper.find('svg[data-icon="DeleteTrashOutlined"]').exists()).toBe(false)
    expect(wrapper.find('[data-action="new-sub-question"]').exists()).toBe(false)
    expect(wrapper.findAll('.sub-question-row.condition-grid')).toHaveLength(2)
  })

  it('loads candidate questions and derives rule name and score bounds', async () => {
    const rating = { id: 1, name: '评级子题', rule_id: 11, rule_name: '五级评级', review_type: '评级' as const, grade_participates_in_calculation: true, score_min: 1, score_max: 5 }
    const score = { id: 2, name: '评分子题', rule_id: 12, rule_name: '百分制评分', review_type: '评分' as const, grade_participates_in_calculation: false, score_min: 0, score_max: 100 }
    const wrapper = mount(ReviewQuestionRuleAdditionalCards, {
      props: {
        entryMode: 'regular_question',
        ruleType: '评级',
        config: { grade_participates_in_calculation: true, levels: [{ code: 'A' }] },
        subQuestionOptions: { none: [rating, score], condition: [rating] },
      },
      global,
    })

    await wrapper.get('input[value="sub_items"]').setValue()
    const selects = wrapper.findAllComponents(ReviewQuestionSubQuestionSelect)
    expect(selects[0].props('options')).toHaveLength(2)
    selects[0].vm.$emit('update:modelValue', 2)
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.derived-cell.rule-column').text()).toBe('百分制评分')
    expect(wrapper.get('.derived-cell.bounds-column').text()).toBe('0 - 100')

    await wrapper.get('input[value="condition"]').setValue()
    await wrapper.vm.$nextTick()
    const conditionSelect = wrapper.findAllComponents(ReviewQuestionSubQuestionSelect)[0]
    expect(conditionSelect.props('options')).toEqual([rating])
    expect(conditionSelect.props('modelValue')).toBeNull()
    expect(wrapper.find('.bounds-column').exists()).toBe(false)
  })

  it('renders sub-question options as name plus review type', () => {
    const wrapper = mount(ReviewQuestionSubQuestionSelect, {
      props: {
        modelValue: 1,
        options: [{ id: 1, name: '评级子题', rule_id: 11, rule_name: '五级评级', review_type: '评级', grade_participates_in_calculation: true, score_min: 1, score_max: 5 }],
      },
      global: {
        stubs: {
          'el-select': { template: '<div><slot name="label" /><slot /></div>' },
          'el-option': { template: '<div><slot /></div>' },
        },
      },
    })
    expect(wrapper.text()).toContain('评级子题')
    expect(wrapper.text()).toContain('评级')
    expect(wrapper.get('.selected-question-name').text()).toBe('评级子题')
  })

  it('keeps the existing display component and adds order controls for sub-item ratings', async () => {
    const wrapper = mount(ReviewQuestionRuleAdditionalCards, {
      props: { entryMode: 'regular_question', ruleType: '评级', config: { grade_participates_in_calculation: true, levels: [{ code: 'A' }] } },
      global,
    })

    await wrapper.get('input[value="sub_items"]').setValue()
    const displayCard = wrapper.getComponent(ReviewQuestionDisplayMethodCard)
    expect(displayCard.props('showOrder')).toBe(true)
    expect(wrapper.find('[role="radiogroup"][aria-label="填写顺序"]').exists()).toBe(true)
    expect(wrapper.find('[role="radiogroup"][aria-label="查看顺序"]').exists()).toBe(true)
    expect(wrapper.get('.order-section-title').text()).toBe('评估项的填写和查看顺序')
    expect(wrapper.get('.order-column:first-child .order-label').text()).toBe('填写顺序')
    expect(wrapper.get('.order-column:last-child .order-label').text()).toBe('查看顺序')
    expect(wrapper.findAll('[role="radiogroup"][aria-label="填写顺序"] .order-option')).toHaveLength(2)
    expect(wrapper.findAll('[role="radiogroup"][aria-label="查看顺序"] .order-option')).toHaveLength(2)
    expect(wrapper.findAll('.order-preview-svg')).toHaveLength(4)
    expect(wrapper.findAll('.order-preview-primary').every((rect) => rect.attributes('width') === '138' && rect.attributes('height') === '20')).toBe(true)
    expect(wrapper.findAll('.order-preview-secondary').every((rect) => rect.attributes('width') === '100' && rect.attributes('height') === '12')).toBe(true)
    expect(wrapper.findAll('.order-option-seam')).toHaveLength(4)
    expect((wrapper.findAll('.order-option-seam')[0].element as HTMLElement).style.backgroundColor).toBe('rgb(240, 244, 255)')
    expect((wrapper.findAll('.order-option-seam')[1].element as HTMLElement).style.backgroundColor).toBe('rgb(222, 224, 227)')
    expect((wrapper.findAll('.order-option-seam')[2].element as HTMLElement).style.backgroundColor).toBe('rgb(240, 244, 255)')
    expect((wrapper.findAll('.order-option-seam')[3].element as HTMLElement).style.backgroundColor).toBe('rgb(222, 224, 227)')

    await wrapper.findAll('[role="radiogroup"][aria-label="填写顺序"] .order-option')[1].trigger('click')
    expect((wrapper.findAll('.order-option-seam')[0].element as HTMLElement).style.backgroundColor).toBe('rgb(222, 224, 227)')
    expect((wrapper.findAll('.order-option-seam')[1].element as HTMLElement).style.backgroundColor).toBe('rgb(240, 244, 255)')
    expect(wrapper.findAll('[role="radiogroup"][aria-label="填写顺序"] .order-option')[1].attributes('aria-checked')).toBe('true')
  })

  it('renders score-range sub-question calculation variants and existing display order', async () => {
    const option = { id: '7680531263614094288', name: '子评估题--评分（在分数上下限内输入评分）', rule_id: 7680421437210954714, rule_name: '评估规则--拼分（在分数上下限内输入评分）', review_type: '评分' as const, grade_participates_in_calculation: false, score_min: 1, score_max: 10 }
    const wrapper = mount(ReviewQuestionRuleAdditionalCards, {
      props: {
        entryMode: 'regular_question',
        ruleType: '评分',
        config: { evaluationMethod: '按子评估项评分', score: { method: '在分数上下限内输入评分' } },
        subQuestionOptions: { none: [option], condition: [] },
      },
      global,
    })

    expect(wrapper.findAll('[data-component="review-question-calculation-rule"] input[type="radio"]')).toHaveLength(4)
    expect(wrapper.find('[data-component="review-question-sub-question-list"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="展示方式"]').exists()).toBe(true)
    expect(wrapper.find('.display-option-grid').exists()).toBe(false)
    expect(wrapper.find('[data-component="review-question-order-section"]').exists()).toBe(true)

    await wrapper.get('[data-action="new-sub-question"]').trigger('click')
    expect(wrapper.find('[role="listbox"]').exists()).toBe(true)
    await wrapper.get('[data-cy="7680531263614094288"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.sub-question-row')).toHaveLength(1)
    expect(wrapper.get('.derived-cell.rule-column').text()).toBe('评估规则--拼分（在分数上下限内输入评分）')
    expect(wrapper.get('.derived-cell.bounds-column').text()).toBe('1 - 10')
    expect(wrapper.get('[data-action="new-sub-question"]').attributes('aria-expanded')).toBe('true')
  })

  it('exposes the sub-question create modal from the candidate picker', async () => {
    const wrapper = mount(ReviewQuestionRuleAdditionalCards, {
      props: { entryMode: 'regular_question', ruleType: '评分', config: { evaluationMethod: '按子评估项评分', score: { method: '在分数上下限内输入评分' } } },
      global,
    })

    await wrapper.get('[data-action="new-sub-question"]').trigger('click')
    await wrapper.get('.sub-question-picker-create').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[role="dialog"][aria-labelledby="sub-question-create-title"]').exists()).toBe(true)
    expect(wrapper.get('#sub-question-create-title').text()).toBe('新建子评估题')
    expect(wrapper.find('input[placeholder="请输入名称"]').exists()).toBe(true)
    expect(wrapper.find('textarea').exists()).toBe(true)
    expect(wrapper.find('.sub-question-modal-button.primary').text()).toBe('提交')
  })
})
