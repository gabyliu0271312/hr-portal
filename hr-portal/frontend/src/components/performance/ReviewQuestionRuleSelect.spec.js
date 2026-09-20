import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ReviewQuestionRuleSelect from './ReviewQuestionRuleSelect.vue';
const options = [
    { id: 11, name: '测试评级--评级可参与计算开关关闭', review_type: '评级', status: 'active', updated_at: '', config_summary: {} },
    { id: 12, name: '测试评级--评级可参与计算开关打开', review_type: '评级', status: 'active', updated_at: '', config_summary: {} },
];
describe('ReviewQuestionRuleSelect', () => {
    it('renders API rule names and keeps rule IDs as option values', () => {
        const wrapper = mount(ReviewQuestionRuleSelect, {
            props: { modelValue: null, options },
            global: {
                stubs: {
                    'el-select': { template: '<select><slot /></select>' },
                    'el-option': { props: ['label', 'value'], template: '<option :value="value">{{ label }}</option>' },
                },
            },
        });
        expect(wrapper.findAll('option').map((option) => option.text())).toEqual([
            '测试评级--评级可参与计算开关关闭',
            '测试评级--评级可参与计算开关打开',
        ]);
        expect(wrapper.findAll('option').map((option) => option.attributes('value'))).toEqual(['11', '12']);
    });
    it('keeps the selected trigger single-line while options retain summaries', () => {
        const wrapper = mount(ReviewQuestionRuleSelect, {
            props: { modelValue: 12, options },
            global: {
                stubs: {
                    'el-select': { template: '<div><slot name="label" /><slot /></div>' },
                    'el-option': { props: ['label', 'value'], template: '<div><slot /></div>' },
                },
            },
        });
        expect(wrapper.get('.selected-rule-name').text()).toBe('测试评级--评级可参与计算开关打开');
        expect(wrapper.find('.selected-rule-summary').exists()).toBe(false);
        expect(wrapper.findAll('.rule-option-summary')).toHaveLength(2);
    });
    it('shows rule loading and error states', () => {
        const wrapper = mount(ReviewQuestionRuleSelect, {
            props: { modelValue: null, options: [], loading: true, error: '规则加载失败' },
            global: { stubs: { 'el-select': { template: '<select />' }, 'el-option': { template: '<option />' } } },
        });
        expect(wrapper.find('select').attributes('disabled')).toBeDefined();
        expect(wrapper.get('[role="alert"]').text()).toBe('规则加载失败');
    });
});
