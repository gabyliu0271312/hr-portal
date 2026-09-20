import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const { push, create, update, get } = vi.hoisted(() => ({
    push: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    get: vi.fn(),
}));
const route = { name: 'ReviewRuleCreate', query: {}, params: {} };
vi.mock('vue-router', () => ({
    useRoute: () => route,
    useRouter: () => ({ push }),
}));
vi.mock('@/api/performance', () => ({
    performanceReviewRuleApi: { create, update, get, list: vi.fn() },
}));
import ReviewRuleCreatePage from './ReviewRuleCreatePage.vue';
function mountPage() {
    return mount(ReviewRuleCreatePage, {
        global: {
            stubs: {
                'el-button': {
                    emits: ['click'],
                    template: '<button @click="$emit(\'click\')"><slot /></button>',
                },
            },
        },
    });
}
describe('ReviewRuleCreatePage', () => {
    beforeEach(() => {
        push.mockReset();
        create.mockReset();
        update.mockReset();
        get.mockReset();
        create.mockResolvedValue({});
        route.name = 'ReviewRuleCreate';
        route.query = {};
        route.params = {};
    });
    it('renders the create full-screen shell', () => {
        const wrapper = mountPage();
        expect(wrapper.find('.full-screen-modal').exists()).toBe(true);
        expect(wrapper.get('.full-screen-modal-header-title').text()).toBe('新建评估规则');
        expect(wrapper.find('.review-rule-form').exists()).toBe(true);
        expect(wrapper.find('[aria-label="评估类型"]').exists()).toBe(true);
        expect(wrapper.get('.full-screen-modal-footer').text()).toContain('提交');
        expect(wrapper.get('.full-screen-modal-footer').text()).toContain('预览');
        expect(wrapper.get('.full-screen-modal-footer').text()).toContain('取消');
    });
    it('renders the captured edit title from route context', () => {
        route.name = 'ReviewRuleEdit';
        route.query = { name: '7档绩效等级' };
        const wrapper = mountPage();
        expect(wrapper.get('.full-screen-modal-header-title').text()).toBe('7档绩效等级');
        expect(wrapper.find('[data-mode="edit"]').exists()).toBe(true);
    });
    it('loads authoritative usage state for edit restrictions', async () => {
        route.name = 'ReviewRuleEdit';
        route.params = { id: '7' };
        get.mockResolvedValue({
            id: 7,
            name: '已使用评级',
            review_type: '评级',
            status: 'active',
            created_at: '',
            updated_at: '',
            remark: '',
            creator: 'admin',
            config_summary: {},
            is_used: true,
            deletable: false,
            config: {
                gradeParticipatesInCalculation: true,
                levels: [
                    { id: 'a', color: 'red', code: 'A', name: '优秀', quantifiedScore: '3', value: '30' },
                    { id: 'b', color: 'orange', code: 'B', name: '良好', quantifiedScore: '2', value: '20' },
                ],
            },
        });
        const wrapper = mountPage();
        await flushPromises();
        expect(get).toHaveBeenCalledWith(7);
        expect(wrapper.get('.performance-switch').attributes('disabled')).toBeDefined();
        expect(wrapper.find('.add-level-button').exists()).toBe(false);
    });
    it('saves a new rule when submit is clicked', async () => {
        const wrapper = mountPage();
        await wrapper.get('input[placeholder="请输入名称"]').setValue('测试评级');
        const codeInputs = wrapper.findAll('input[placeholder="请输入「中文」等级代号"]');
        await codeInputs[0].setValue('A');
        await codeInputs[1].setValue('B');
        await codeInputs[2].setValue('C');
        await wrapper.get('.full-screen-modal-footer-button').trigger('click');
        expect(create).toHaveBeenCalledWith(expect.objectContaining({
            name: '测试评级',
            review_type: '评级',
            remark: '',
            config: expect.objectContaining({ gradeParticipatesInCalculation: false }),
        }));
        expect(push).toHaveBeenCalledWith({ name: 'ReviewQuestionManagement', query: { tab: 'rule' } });
    });
});
