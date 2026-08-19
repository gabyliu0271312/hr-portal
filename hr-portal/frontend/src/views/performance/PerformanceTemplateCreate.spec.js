import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PerformanceTemplateCreate from './PerformanceTemplateCreate.vue';
const push = vi.fn();
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }));
function mountView() {
    return mount(PerformanceTemplateCreate, {
        global: { stubs: { 'el-icon': { template: '<span><slot /></span>' } } },
    });
}
beforeEach(() => {
    push.mockReset();
    localStorage.clear();
});
describe('PerformanceTemplateCreate', () => {
    it('renders the reference header and body order', () => {
        const wrapper = mountView();
        expect(wrapper.find('.full-screen-modal-header-title').text()).toBe('新建绩效模板');
        expect(wrapper.find('.full-screen-modal-header-back').text()).toContain('返回');
        expect(wrapper.find('.full-screen-modal-header-back-icon path').attributes('d')).toContain('M1.293 11.293');
        expect(wrapper.findAll('.basic-info-form > .form-item').map(item => item.find('.field-label').exists() ? item.find('.field-label').text() : item.find('.calculation-heading').text())).toEqual(['模板语言', '名称*', '描述', '配置「计算规则」']);
        expect(wrapper.find('.full-screen-modal-header .step-flow').exists()).toBe(true);
        expect(wrapper.findAll('.language-options > .checkbox-row')).toHaveLength(2);
        expect(wrapper.find('.language-options .fixed-checkbox input').attributes('disabled')).toBeDefined();
        expect(wrapper.find('.language-options .fixed-checkbox .checkbox-label').text()).toBe('中文');
        expect(wrapper.find('.calculation-options').exists()).toBe(false);
    });
    it('validates required and duplicate names', async () => {
        const wrapper = mountView();
        await wrapper.get('.next-button').trigger('click');
        expect(wrapper.text()).toContain('名称为必填');
        await wrapper.get('[aria-label="模板名称"]').setValue('全年度绩效评估');
        await wrapper.get('.next-button').trigger('click');
        expect(wrapper.text()).toContain('该模板名称已存在，请重新输入');
    });
    it('requires a rule after enabling calculation rules', async () => {
        const wrapper = mountView();
        await wrapper.get('[aria-label="模板名称"]').setValue('新的模板');
        await wrapper.get('.switch').trigger('click');
        expect(wrapper.find('.step-flow').text()).toContain('计算规则');
        await wrapper.get('.next-button').trigger('click');
        expect(wrapper.text()).toContain('如果开启计算规则配置，则至少配置一个计算规则');
        await wrapper.get('.option-row input').setValue(true);
        await wrapper.get('.next-button').trigger('click');
        expect(wrapper.find('.placeholder-panel').exists()).toBe(true);
        expect(localStorage.getItem('performance-template-draft')).toContain('新的模板');
    });
});
