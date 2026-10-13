import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import ReviewQuestionRuleAdditionalCards from './ReviewQuestionRuleAdditionalCards.vue';
import ReviewQuestionSubQuestionList from './ReviewQuestionSubQuestionList.vue';
const option = {
    id: '7680531263614094288',
    name: '子评估题--评分（在分数上下限内输入评分）',
    rule_id: 7680421437210954714,
    rule_name: '评估规则--拼分（在分数上下限内输入评分）',
    review_type: '评分',
    grade_participates_in_calculation: false,
    score_min: 1,
    score_max: 10,
};
const global = {
    stubs: {
        'el-select': { props: ['modelValue', 'loading', 'disabled'], emits: ['update:modelValue'], template: '<div><slot name="label" /><slot /></div>' },
        'el-option': { template: '<div><slot /></div>' },
    },
};
afterEach(() => {
    document.body.innerHTML = '';
});
describe('ReviewQuestionSubQuestionList', () => {
    it('toggles an existing candidate instead of adding a duplicate row', async () => {
        const wrapper = mount(ReviewQuestionSubQuestionList, {
            props: { modelValue: [], calculationRule: 'none', options: [option] },
            global,
        });
        await wrapper.get('[data-action="new-sub-question"]').trigger('click');
        await wrapper.get(`[data-cy="${option.id}"]`).trigger('click');
        await wrapper.setProps({ modelValue: wrapper.emitted('update:modelValue')?.at(-1)?.[0] });
        await wrapper.vm.$nextTick();
        expect(wrapper.findAll('.sub-question-row')).toHaveLength(1);
        await wrapper.get(`[data-cy="${option.id}"]`).trigger('click');
        await wrapper.setProps({ modelValue: wrapper.emitted('update:modelValue')?.at(-1)?.[0] });
        await wrapper.vm.$nextTick();
        expect(wrapper.findAll('.sub-question-row')).toHaveLength(0);
        expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[]]);
    });
    it('closes the candidate picker when clicking outside the component', async () => {
        const wrapper = mount(ReviewQuestionSubQuestionList, {
            props: { modelValue: [], calculationRule: 'none', options: [option] },
            global,
        });
        await wrapper.get('[data-action="new-sub-question"]').trigger('click');
        expect(wrapper.find('.sub-question-picker').exists()).toBe(true);
        document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await wrapper.vm.$nextTick();
        expect(wrapper.find('.sub-question-picker').exists()).toBe(false);
    });
    it('uses 子评估题 as the first column header', () => {
        const wrapper = mount(ReviewQuestionSubQuestionList, {
            props: { modelValue: [], calculationRule: 'none', options: [option] },
            global,
        });
        expect(wrapper.get('.sub-question-header .name-column').text()).toBe('子评估题');
    });
    it('binds score-mapping scoring methods to the same dynamic child sections', async () => {
        const wrapper = mount(ReviewQuestionRuleAdditionalCards, {
            props: {
                entryMode: 'regular_question',
                ruleType: '评分映射等级型',
                config: { evaluation_method: '按子评估项评分', mapping: { min: 1, max: 10 } },
                subQuestionOptions: { none: [option], condition: [] },
            },
            global,
        });
        expect(wrapper.find('[data-component="review-question-calculation-rule"]').exists()).toBe(true);
        expect(wrapper.find('[data-component="review-question-sub-question-list"]').exists()).toBe(true);
        expect(wrapper.find('[aria-label="展示方式"]').exists()).toBe(true);
        await wrapper.get('input[value="total_score"]').setValue();
        expect(wrapper.find('[data-component="review-question-calculation-rule"]').exists()).toBe(false);
        expect(wrapper.find('[data-component="review-question-sub-question-list"]').exists()).toBe(false);
    });
});
