import { createPinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it } from 'vitest';
import PerformanceAdminLayout from './PerformanceAdminLayout.vue';
import performanceAdminLayoutSource from './PerformanceAdminLayout.vue?raw';
import performanceAdminExpandableMenuSource from '@/components/performance/PerformanceAdminExpandableMenu.vue?raw';
function mountLayout() {
    const router = createRouter({
        history: createMemoryHistory(),
        routes: [
            { path: '/', component: { template: '<div />' } },
            { path: '/performance/settings/cycles', name: 'PerformanceCycles', component: { template: '<div />' } },
            { path: '/performance/settings/templates', name: 'PerformanceTemplates', component: { template: '<div />' } },
        ],
    });
    return mount(PerformanceAdminLayout, {
        global: {
            plugins: [createPinia(), router],
            stubs: {
                'el-avatar': { template: '<span><slot /></span>' },
                'el-dropdown': { template: '<div><slot /><slot name="dropdown" /></div>' },
                'el-dropdown-menu': { template: '<div><slot /></div>' },
                'el-dropdown-item': { template: '<button><slot /></button>' },
                'router-view': { props: ['section'], template: '<div :data-section="section" />' },
            },
        },
    });
}
describe('PerformanceAdminLayout', () => {
    it('reclaims the stable root scrollbar gutter for the full-viewport admin shell', () => {
        expect(performanceAdminLayoutSource).toContain(':global(html:has(.performance-admin-app)) { scrollbar-gutter: auto; }');
    });
    it('keeps the captured cycles icon at its full 18px render size', () => {
        expect(performanceAdminLayoutSource).toContain(".admin-menu-item :deep(.el-icon svg[data-icon='CyclesProjectsOutlined']), .admin-menu-item :deep(.el-icon svg[data-icon='SeatsOutlined']), .admin-menu-item :deep(.el-icon svg[data-icon='TemplatesOutlined']), .admin-menu-item :deep(.el-icon svg[data-icon='MetricManagementOutlined']), .admin-menu-item :deep(.el-icon svg[data-icon='EvaluationQuestionsOutlined']), .admin-menu-item :deep(.el-icon svg[data-icon='PermissionsOutlined']), .admin-menu-item :deep(.el-icon svg[data-icon='SystemSettingsOutlined']) { width: 18px; height: 18px; }");
    });
    it('keeps expandable-menu SVGs at their full 18px render size', () => {
        expect(performanceAdminExpandableMenuSource).toContain(".admin-menu-item :deep(.el-icon svg[data-icon='EvaluationQuestionsOutlined']), .admin-menu-item :deep(.el-icon svg[data-icon='MetricManagementOutlined']), .admin-menu-item :deep(.el-icon svg[data-icon='PermissionsOutlined']), .admin-menu-item :deep(.el-icon svg[data-icon='SystemSettingsOutlined']) { width: 18px; height: 18px; }");
    });
    it('keeps the evaluation parent expanded without a second active background', () => {
        expect(performanceAdminLayoutSource).toContain("if (section === 'evaluation-questions') evaluationExpanded.value = !evaluationExpanded.value");
        expect(performanceAdminLayoutSource).not.toContain("if (!['ReviewQuestionManagement', 'TaggedFillQuestionManagement'].includes(String(route.name)))");
    });
    it('renders the confirmed standalone shell and switches placeholder sections', async () => {
        const wrapper = mountLayout();
        expect(wrapper.text()).toContain('创梦绩效设置');
        expect(wrapper.get('[aria-current="page"]').text()).toContain('席位管理');
        expect(wrapper.text()).not.toContain('通用设置');
        expect(wrapper.text()).not.toContain('飞书管理后台');
        const templates = wrapper.findAll('button').find((button) => button.text().includes('绩效模板'));
        await templates?.trigger('click');
        expect(wrapper.get('[aria-current="page"]').text()).toContain('绩效模板');
        expect(wrapper.findAll('[data-section="templates"]')).toHaveLength(1);
    });
    it('navigates the template menu to its canonical route', async () => {
        const wrapper = mountLayout();
        const router = wrapper.vm.$router;
        await router.isReady();
        const templates = wrapper.findAll('button').find((button) => button.text().includes('绩效模板'));
        await templates?.trigger('click');
        await new Promise((resolve) => setTimeout(resolve, 0));
        await router.isReady();
        expect(router.currentRoute.value.name).toBe('PerformanceTemplates');
    });
    it('navigates the cycle menu to its canonical route', async () => {
        const wrapper = mountLayout();
        const router = wrapper.vm.$router;
        await router.isReady();
        const cycles = wrapper.findAll('button').find((button) => button.text().includes('周期与项目'));
        await cycles?.trigger('click');
        await new Promise((resolve) => setTimeout(resolve, 0));
        await router.isReady();
        expect(router.currentRoute.value.name).toBe('PerformanceCycles');
    });
});
