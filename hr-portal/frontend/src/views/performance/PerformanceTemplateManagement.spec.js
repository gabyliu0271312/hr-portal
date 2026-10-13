import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { performanceTemplateApi } from '@/api/performance';
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
beforeEach(() => {
    push.mockReset();
    vi.restoreAllMocks();
    vi.spyOn(performanceTemplateApi, 'list').mockImplementation(() => new Promise(() => { }));
    vi.spyOn(performanceTemplateApi, 'remove').mockResolvedValue();
});
afterEach(() => {
    document.body.innerHTML = '';
    document.body.style.overflow = '';
});
describe('PerformanceTemplateManagement', () => {
    it('matches the reference page structure', () => {
        const wrapper = mountView();
        expect(wrapper.find('.list-page-title').text()).toBe('绩效模板');
        expect(wrapper.find('.list-page-content .list-page-title').exists()).toBe(false);
        expect(wrapper.find('.create-button').text()).toContain('新建');
        expect(wrapper.find('.search-input').exists()).toBe(true);
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
    it('opens a persisted template in edit mode with its real id', async () => {
        vi.mocked(performanceTemplateApi.list).mockResolvedValueOnce([{
                template_id: 42,
                name: '真实模板',
                description: '真实描述',
                status: 'DRAFT',
                created_at: '2026-08-31T10:00:00Z',
            }]);
        const wrapper = mountView();
        await flushPromises();
        const setupState = wrapper.vm.$.setupState;
        const row = setupState.templates[0];
        setupState.openEditPage(row);
        expect(push).toHaveBeenCalledWith({
            name: 'PerformanceTemplateCreate',
            query: { template_id: '42' },
        });
    });
    it('opens the captured confirmation and keeps the template when cancelled', async () => {
        vi.mocked(performanceTemplateApi.list).mockResolvedValueOnce([{
                template_id: 42,
                name: '待删除模板',
                description: '',
                status: 'DRAFT',
                created_at: '2026-08-31T10:00:00Z',
            }]);
        const wrapper = mountView();
        await flushPromises();
        const setupState = wrapper.vm.$.setupState;
        setupState.handleTemplateAction('删除', setupState.templates[0]);
        await flushPromises();
        expect(document.querySelector('.performance-confirm-dialog__title-content')?.textContent).toBe('后续配置项目将无法使用该模板，确定删除吗？');
        document.querySelector('.performance-confirm-dialog__button--cancel').click();
        await flushPromises();
        expect(performanceTemplateApi.remove).not.toHaveBeenCalled();
        expect(document.querySelector('.performance-confirm-dialog')).toBeNull();
    });
    it('deletes the real template and refreshes the persisted list after confirmation', async () => {
        vi.mocked(performanceTemplateApi.list)
            .mockResolvedValueOnce([{
                template_id: 42,
                name: '待删除模板',
                description: '',
                status: 'DRAFT',
                created_at: '2026-08-31T10:00:00Z',
            }])
            .mockResolvedValueOnce([]);
        const wrapper = mountView();
        await flushPromises();
        const setupState = wrapper.vm.$.setupState;
        setupState.handleTemplateAction('删除', setupState.templates[0]);
        await flushPromises();
        document.querySelector('.performance-confirm-dialog__button--danger').click();
        await flushPromises();
        expect(performanceTemplateApi.remove).toHaveBeenCalledWith(42);
        expect(performanceTemplateApi.list).toHaveBeenCalledTimes(2);
        expect(setupState.templates).toEqual([]);
        expect(document.querySelector('.performance-confirm-dialog')).toBeNull();
        expect(wrapper.text()).toContain('模板已删除');
    });
    it('keeps the confirmation open when the delete API fails', async () => {
        vi.mocked(performanceTemplateApi.list).mockResolvedValueOnce([{
                template_id: 42,
                name: '待删除模板',
                description: '',
                status: 'DRAFT',
                created_at: '2026-08-31T10:00:00Z',
            }]);
        vi.mocked(performanceTemplateApi.remove).mockRejectedValueOnce({ response: { data: { detail: '模板删除失败' } } });
        const wrapper = mountView();
        await flushPromises();
        const setupState = wrapper.vm.$.setupState;
        setupState.handleTemplateAction('删除', setupState.templates[0]);
        await flushPromises();
        document.querySelector('.performance-confirm-dialog__button--danger').click();
        await flushPromises();
        expect(document.querySelector('.performance-confirm-dialog')).not.toBeNull();
        expect(wrapper.text()).toContain('模板删除失败');
    });
});
