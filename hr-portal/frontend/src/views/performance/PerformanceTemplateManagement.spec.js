import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
const push = vi.fn();
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }));
import PerformanceTemplateManagement from './PerformanceTemplateManagement.vue';
function mountView() {
    return mount(PerformanceTemplateManagement, {
        global: {
            stubs: {
                'el-button': { template: '<button @click="$emit(\'click\')"><slot /></button>' },
                'el-dropdown': { template: '<div><slot /><slot name="dropdown" /></div>' },
                'el-dropdown-menu': { template: '<ul><slot /></ul>' },
                'el-dropdown-item': { props: ['command'], template: '<li @click="$emit(\'click\')"><slot /></li>' },
                'el-input': { props: ['modelValue'], emits: ['update:modelValue'], template: '<label><input :value="modelValue" aria-label="通过名称、备注搜索" @input="$emit(\'update:modelValue\', $event.target.value)" /><slot name="prefix" /></label>' },
                'el-empty': { props: ['description'], template: '<div>{{ description }}</div>' },
                'el-table': { props: ['data'], template: '<table><tr v-for="row in data" :key="row.name"><td>{{ row.name }}</td><td>{{ row.description }}</td><td>{{ row.status === \'active\' ? \'已启用\' : \'待完成配置\' }}</td><td>{{ row.createdAt }}</td></tr><slot /></table>' },
                'el-table-column': { template: '<div />' },
                'el-tag': { template: '<span><slot /></span>' },
                'el-alert': { template: '<div>{{ title }}</div>', props: ['title'] },
                'el-icon': { template: '<span><slot /></span>' },
            },
        },
    });
}
describe('PerformanceTemplateManagement', () => {
    it('matches the reference page structure', () => {
        const wrapper = mountView();
        expect(wrapper.find('.template-title').text()).toBe('绩效模板');
        expect(wrapper.find('.template-content .template-title').exists()).toBe(false);
        expect(wrapper.find('.create-button').text()).toContain('新建');
        expect(wrapper.find('.template-search').exists()).toBe(true);
        expect(wrapper.find('.filter-button').exists()).toBe(true);
        expect(wrapper.text()).toContain('半年度绩效评估（2026模板）');
        expect(wrapper.text()).toContain('已启用');
        expect(wrapper.text()).toContain('待完成配置');
    });
    it('filters templates by keyword', async () => {
        const wrapper = mountView();
        await wrapper.get('input[aria-label="通过名称、备注搜索"]').setValue('项目制');
        expect(wrapper.text()).toContain('没有找到匹配的绩效模板');
        await wrapper.get('input[aria-label="通过名称、备注搜索"]').setValue('半年度');
        expect(wrapper.text()).toContain('半年度绩效评估');
        expect(wrapper.text()).not.toContain('全年度绩效评估');
    });
    it('opens the template creation page', async () => {
        const wrapper = mountView();
        await wrapper.get('.create-button').trigger('click');
        expect(push).toHaveBeenCalledWith({ name: 'PerformanceTemplateCreate' });
    });
});
