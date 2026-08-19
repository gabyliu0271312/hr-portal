import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CycleManagement from './CycleManagement.vue';
const mocks = vi.hoisted(() => ({
    getAccessContext: vi.fn(),
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    listPeople: vi.fn(),
    refreshPeople: vi.fn(),
    updatePerson: vi.fn(),
    remove: vi.fn(),
}));
vi.mock('@/api/performance', () => ({
    performanceApi: { getAccessContext: mocks.getAccessContext },
    performanceCycleApi: {
        list: mocks.list,
        get: mocks.get,
        create: mocks.create,
        update: mocks.update,
        listPeople: mocks.listPeople,
        refreshPeople: mocks.refreshPeople,
        updatePerson: mocks.updatePerson,
        remove: mocks.remove,
    },
}));
const cycle = {
    id: 1,
    cycle_ref: 'cycle:1',
    name: '2026 年度考核',
    language: 'zh-CN',
    period_year: 2026,
    period_type: 'YEAR',
    start_at: '2026-01-01T01:00:00.000Z',
    end_at: '2026-12-31T15:59:00.000Z',
    lock_rule: 'IMMEDIATE',
    lock_at: null,
    pre_lock_sync_mode: 'MANUAL',
    leaver_enabled: false,
    leaver_start_date: null,
    leaver_end_date: null,
    leaver_participation_mode: 'CREATE_TASK',
    status: 'LOCKED',
    people_count: 2,
    department_count: 1,
    project_count: 0,
    projects: [],
};
async function mountView(path = '/performance/settings/cycles') {
    const router = createRouter({
        history: createMemoryHistory(),
        routes: [
            { path: '/performance/settings/cycles', name: 'PerformanceCycles', component: CycleManagement },
            { path: '/performance/settings/cycles/new', name: 'PerformanceCycleCreate', component: CycleManagement },
            { path: '/performance/settings/cycles/:id/edit', name: 'PerformanceCycleEdit', component: CycleManagement },
        ],
    });
    await router.push(path);
    await router.isReady();
    const wrapper = mount({ template: '<router-view />' }, { global: { plugins: [router] } });
    await flushPromises();
    return wrapper.getComponent(CycleManagement);
}
describe('CycleManagement', () => {
    beforeEach(() => {
        Object.values(mocks).forEach(mock => mock.mockReset());
        mocks.getAccessContext.mockResolvedValue({ permission_codes: ['performance.cycles.manage'] });
        mocks.list.mockResolvedValue({ items: [cycle], total: 1, page: 1, page_size: 20 });
        mocks.get.mockResolvedValue(cycle);
        mocks.listPeople.mockResolvedValue([]);
    });
    it('keeps the desktop cycle workspace proportions and renders the detail structure', async () => {
        const wrapper = await mountView();
        expect(wrapper.find('.cycle-workspace').exists()).toBe(true);
        expect(wrapper.find('.cycle-list-panel').exists()).toBe(true);
        expect(wrapper.find('.cycle-detail-panel').exists()).toBe(true);
        expect(wrapper.find('.detail-content').exists()).toBe(true);
        expect(wrapper.find('.project-heading').text()).toContain('项目设置');
        expect(wrapper.find('.project-tools .primary-button').text()).toContain('新建');
        expect(wrapper.find('.project-table-wrap').exists()).toBe(true);
        expect(wrapper.find('.project-table-wrap table').exists()).toBe(true);
        expect(wrapper.find('.project-table-wrap .fixed-operation').exists()).toBe(true);
    });
    it('hides cycle management actions without cycle permission', async () => {
        mocks.getAccessContext.mockResolvedValueOnce({ permission_codes: ['performance.projects.manage'] });
        const wrapper = await mountView();
        expect(wrapper.findAll('[aria-label="新建周期"]')).toHaveLength(0);
        expect(wrapper.findAll('.people-card')).toHaveLength(0);
    });
    it('renders form validation relationships and the paged year panel', async () => {
        const wrapper = await mountView('/performance/settings/cycles/new');
        expect(wrapper.get('#cycle-name').attributes('maxlength')).toBe('128');
        expect(wrapper.get('#cycle-year').text()).toContain('请选择年份');
        expect(wrapper.get('#cycle-year').text()).not.toContain('2026');
        await wrapper.get('#cycle-year').trigger('click');
        expect(wrapper.get('[aria-label="年份选择器"]').findAll('.year-options button')).toHaveLength(20);
        await wrapper.get('#cycle-start').setValue('2026-01-01T10:00');
        await wrapper.get('#cycle-end').setValue('2026-01-01T09:00');
        expect(wrapper.get('#cycle-start').attributes('aria-describedby')).toBe('cycle-date-error');
        expect(wrapper.get('#cycle-end').attributes('aria-invalid')).toBe('true');
    });
    it('closes year and period pickers when clicking outside', async () => {
        const wrapper = await mountView('/performance/settings/cycles/new');
        await wrapper.get('#cycle-year').trigger('click');
        expect(wrapper.find('[aria-label="年份选择器"]').exists()).toBe(true);
        document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        await wrapper.vm.$nextTick();
        expect(wrapper.find('[aria-label="年份选择器"]').exists()).toBe(false);
        await wrapper.get('#cycle-type').trigger('click');
        expect(wrapper.find('[aria-label="周期类型选择器"]').exists()).toBe(true);
        document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        await wrapper.vm.$nextTick();
        expect(wrapper.find('[aria-label="周期类型选择器"]').exists()).toBe(false);
    });
    it('keeps picker open when clicking inside it', async () => {
        const wrapper = await mountView('/performance/settings/cycles/new');
        await wrapper.get('#cycle-type').trigger('click');
        await wrapper.get('[aria-label="周期类型选择器"] .period-group-label').trigger('pointerdown');
        expect(wrapper.find('[aria-label="周期类型选择器"]').exists()).toBe(true);
    });
    it('keeps the cycle name and period controls aligned to the SnapSpec geometry', async () => {
        const wrapper = await mountView('/performance/settings/cycles/new');
        expect(wrapper.get('.cycle-info-period-row').classes()).toContain('cycle-info-period-row');
        expect(wrapper.get('#cycle-name').classes()).toContain('wide-input');
        expect(wrapper.get('#cycle-year').classes()).toContain('selector-control');
        expect(wrapper.get('#cycle-type').classes()).toContain('selector-control');
    });
    it('renders grouped period options and derives subtype dates', async () => {
        const wrapper = await mountView('/performance/settings/cycles/new');
        await wrapper.get('#cycle-year').trigger('click');
        await wrapper.get('[aria-label="年份选择器"]').findAll('.year-options button').find(item => item.text() === '2026').trigger('click');
        await wrapper.get('#cycle-type').trigger('click');
        expect(wrapper.findAll('.period-group-label').map(item => item.text())).toEqual(['年/半年度', '季度', '双月', '月度', '非标准周期']);
        expect(wrapper.get('[aria-label="周期类型选择器"]').findAll('[role="option"]')).toHaveLength(26);
        const quarterTwo = wrapper.get('[aria-label="周期类型选择器"]').findAll('[role="option"]').find(item => item.text() === '第 2 季度');
        await quarterTwo.trigger('click');
        expect(wrapper.get('#cycle-type').element.textContent).toContain('第 2 季度');
        expect(wrapper.get('#cycle-start').element.value).toBe('2026-04-01T00:00');
        expect(wrapper.get('#cycle-end').element.value).toBe('2026-06-30T23:59');
    });
    it('keeps the delete dialog keyboard-trapped and restores focus on close', async () => {
        const wrapper = await mountView();
        const deleteButton = wrapper.findAll('button').find(button => button.text() === '删除');
        await deleteButton.trigger('click');
        expect(wrapper.findAll('[role="dialog"]')).toHaveLength(1);
        await wrapper.get('[role="dialog"] button.outline-button').trigger('click');
        await wrapper.vm.$nextTick();
        expect(wrapper.findAll('[role="dialog"]')).toHaveLength(0);
    });
    it('keeps the desktop cycle workspace proportions and full detail surface', async () => {
        const wrapper = await mountView();
        wrapper.get('.cycle-workspace');
        wrapper.get('.cycle-list-panel');
        wrapper.get('.cycle-detail-panel');
        expect(wrapper.get('.detail-content').text()).toContain('基本信息');
        expect(wrapper.get('.project-tools .primary-button').text()).toContain('新建');
        wrapper.get('.project-table-wrap');
        wrapper.get('.project-table-wrap table');
        wrapper.get('.project-table-wrap .fixed-operation');
    });
    it('shows a save success status after creating a cycle', async () => {
        mocks.create.mockResolvedValueOnce(cycle);
        const wrapper = await mountView('/performance/settings/cycles/new');
        await wrapper.get('#cycle-year').trigger('click');
        await wrapper.get('[aria-label="年份选择器"]').findAll('.year-options button').find(item => item.text() === '2026').trigger('click');
        await wrapper.get('#cycle-name').setValue('新周期');
        await wrapper.get('#cycle-start').setValue('2026-01-01T09:00');
        await wrapper.get('#cycle-end').setValue('2026-12-31T18:00');
        await wrapper.get('form').trigger('submit');
        await flushPromises();
        expect(mocks.create).toHaveBeenCalledOnce();
        expect(wrapper.findAll('[role="status"]').some(item => item.text().includes('周期已保存'))).toBe(true);
    });
    it('prevents submission when the leaver date range is invalid', async () => {
        const wrapper = await mountView('/performance/settings/cycles/new');
        await wrapper.get('#cycle-name').setValue('新周期');
        await wrapper.get('#cycle-start').setValue('2026-01-01T09:00');
        await wrapper.get('#cycle-end').setValue('2026-12-31T18:00');
        await wrapper.get('#leaver-enabled').setValue(true);
        await wrapper.get('#leaver-start').setValue('2026-02-01');
        await wrapper.get('#leaver-end').setValue('2026-01-01');
        await wrapper.get('form').trigger('submit');
        expect(mocks.create).not.toHaveBeenCalled();
        expect(wrapper.get('#leaver-date-error').text()).toContain('日期范围不合法');
        expect(wrapper.get('#leaver-start').element.value).toBe('2026-02-01');
    });
    it('converts Beijing local times before creating a cycle', async () => {
        mocks.create.mockResolvedValueOnce(cycle);
        const wrapper = await mountView('/performance/settings/cycles/new');
        await wrapper.get('#cycle-year').trigger('click');
        await wrapper.get('[aria-label="年份选择器"]').findAll('.year-options button').find(item => item.text() === '2026').trigger('click');
        await wrapper.get('#cycle-name').setValue('新周期');
        await wrapper.get('#cycle-start').setValue('2026-01-01T09:00');
        await wrapper.get('#cycle-end').setValue('2026-12-31T18:00');
        await wrapper.get('form').trigger('submit');
        await flushPromises();
        expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
            start_at: '2026-01-01T01:00:00.000Z',
            end_at: '2026-12-31T10:00:00.000Z',
        }));
    });
    it('keeps form input after a save failure', async () => {
        mocks.create.mockRejectedValueOnce({ response: { data: { detail: '保存失败' } } });
        const wrapper = await mountView('/performance/settings/cycles/new');
        await wrapper.get('#cycle-year').trigger('click');
        await wrapper.get('[aria-label="年份选择器"]').findAll('.year-options button').find(item => item.text() === '2026').trigger('click');
        await wrapper.get('#cycle-name').setValue('保留的周期');
        await wrapper.get('#cycle-start').setValue('2026-01-01T09:00');
        await wrapper.get('#cycle-end').setValue('2026-12-31T18:00');
        await wrapper.get('form').trigger('submit');
        await flushPromises();
        expect(wrapper.get('#cycle-name').element.value).toBe('保留的周期');
        expect(wrapper.get('[role="alert"]').text()).toContain('保存失败');
        expect(wrapper.get('button.primary-button').text()).toBe('保存');
    });
    it('shows a retryable error when loading fails', async () => {
        mocks.list.mockRejectedValue({ response: { data: { detail: '加载失败' } } });
        const wrapper = await mountView();
        expect(wrapper.get('[role="alert"]').text()).toContain('加载失败');
        expect(wrapper.get('[role="alert"] button').text()).toBe('重试');
    });
});
