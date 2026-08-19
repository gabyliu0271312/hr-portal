import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PipelineTriggerConfigView from './PipelineTriggerConfigView.vue';
const mocks = vi.hoisted(() => ({
    pipelineTriggers: vi.fn(), systems: vi.fn(), triggerMigrationStatus: vi.fn(), platformEventCatalog: vi.fn(), resources: vi.fn(), resourceObjects: vi.fn(),
    createPipelineTrigger: vi.fn(), updatePipelineTrigger: vi.fn(), enablePipelineTrigger: vi.fn(),
    testPipelineTrigger: vi.fn(), deletePipelineTrigger: vi.fn(), success: vi.fn(), error: vi.fn(),
}));
vi.mock('@/api/ucp', () => ({ ucpApi: mocks }));
vi.mock('element-plus', () => ({ ElMessage: { success: mocks.success, error: mocks.error }, ElMessageBox: { confirm: vi.fn() } }));
vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }) }));
const stubs = {
    'el-alert': { props: ['title'], template: '<div>{{ title }}<slot name="title" /><slot /></div>' },
    'el-button': { props: ['disabled', 'loading'], template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>' },
    'el-table': { props: ['data', 'emptyText'], template: '<div>{{ data.length ? "Rows loaded" : emptyText }}<slot /></div>' },
    'el-table-column': { template: '<div><slot :row="{}" /></div>' },
    'el-tag': { template: '<span><slot /></span>' },
    'el-dialog': { template: '<div><slot /><slot name="footer" /></div>' },
    'el-form': { template: '<form><slot /></form>' }, 'el-form-item': { template: '<div><slot /></div>' },
    'el-input': { props: ['modelValue'], template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' },
    'el-select': { props: ['modelValue'], template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', Number($event.target.value)); $emit(\'change\')"><slot /></select>' },
    'el-option': { props: ['label'], template: '<option>{{ label }}<slot /></option>' }, 'el-switch': { template: '<input type="checkbox" />' },
};
function mountView() { return mount(PipelineTriggerConfigView, { global: { stubs, directives: { loading: {} } } }); }
describe('PipelineTriggerConfigView', () => {
    beforeEach(() => {
        Object.values(mocks).forEach((mock) => mock.mockReset());
        mocks.pipelineTriggers.mockResolvedValue({ items: [] });
        mocks.systems.mockResolvedValue({ items: [{ id: 1, system_name: 'Feishu' }] });
        mocks.triggerMigrationStatus.mockResolvedValue({ legacy_trigger_count: 0, resource_bound_trigger_count: 0, verified_event_object_count: 0, legacy_triggers: [] });
        mocks.platformEventCatalog.mockResolvedValue({ items: [{ category: 'DATA_CHANGE', category_name: '数据变更', event_type: 'datasource_sync_completed', event_name: '入仓同步完成', enabled: true, filter_fields: ['sync_status'] }] });
        mocks.resources.mockResolvedValue({ items: [{ id: 2, system_id: 1, resource_name: 'Webhook' }] });
        mocks.resourceObjects.mockResolvedValue({ items: [{ id: 3, object_name: 'Employee terminated', verification_status: 'VERIFIED', event_definition: { status: 'PUBLISHED', payload_schema: { required: ['employee_id'] } } }] });
    });
    it('renders an empty state after loading triggers', async () => {
        const wrapper = mountView();
        await flushPromises();
        expect(mocks.pipelineTriggers).toHaveBeenCalledOnce();
        expect(wrapper.text()).toContain('No pipeline triggers configured yet.');
    });
    it('shows a permission state rather than a usable create action', async () => {
        mocks.pipelineTriggers.mockRejectedValueOnce({ response: { status: 403 } });
        const wrapper = mountView();
        await flushPromises();
        expect(mocks.error).toHaveBeenCalledWith('Load failed');
        expect(wrapper.get('button').attributes('disabled')).toBeDefined();
    });
    it('filters the source selector to verified, published event objects', async () => {
        const wrapper = mountView();
        await flushPromises();
        await wrapper.get('button').trigger('click');
        const selects = wrapper.findAll('select');
        await selects[1].setValue('1');
        await flushPromises();
        await selects[2].setValue('2');
        await flushPromises();
        expect(mocks.resourceObjects).toHaveBeenCalledWith(2, { object_type: 'EVENT_TYPE', is_active: true });
        expect(wrapper.html()).toContain('Employee terminated');
    });
    it('keeps the trigger list available while showing legacy migration guidance', async () => {
        mocks.pipelineTriggers.mockResolvedValueOnce({ items: [{ trigger_code: 'LEGACY', trigger_name: 'Legacy trigger' }] });
        mocks.triggerMigrationStatus.mockResolvedValueOnce({ legacy_trigger_count: 1, resource_bound_trigger_count: 0, verified_event_object_count: 0, legacy_triggers: [{ trigger_code: 'LEGACY' }] });
        const wrapper = mountView();
        await flushPromises();
        expect(wrapper.text()).toContain('legacy webhook trigger(s) require migration');
        expect(wrapper.text()).toContain('Rows loaded');
    });
});
