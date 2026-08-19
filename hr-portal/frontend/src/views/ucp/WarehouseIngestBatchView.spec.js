import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import WarehouseIngestBatchView from './WarehouseIngestBatchView.vue';
const api = vi.hoisted(() => ({ list: vi.fn(), detail: vi.fn(), replay: vi.fn() }));
vi.mock('@/api/ucp', () => ({ ucpApi: { warehouseIngestBatches: api.list, warehouseIngestBatch: api.detail, replayWarehouseIngestBatch: api.replay } }));
vi.mock('@/stores/user', () => ({ useUserStore: () => ({ hasOp: () => true }) }));
const stubs = {
    'el-button': { template: '<button @click="$emit(\'click\')"><slot /></button>' },
    'el-form': { template: '<form><slot /></form>' }, 'el-form-item': { template: '<div><slot /></div>' },
    'el-input': true, 'el-select': true, 'el-option': true, 'el-table': { template: '<div><slot /></div>' }, 'el-table-column': true,
    'el-tag': true, 'el-empty': true, 'el-pagination': true, 'el-drawer': { template: '<div><slot /></div>' }, 'el-descriptions': true, 'el-descriptions-item': true,
};
describe('WarehouseIngestBatchView', () => {
    it('loads batch rows and exposes failed replay action', async () => {
        api.list.mockResolvedValue({ total: 1, items: [{ batch_id: 'batch-1', resource_code: 'cost-allocation-locked', status: 'DEAD_LETTER', received_rows: 2, written_rows: 0 }] });
        const wrapper = mount(WarehouseIngestBatchView, { global: { stubs, directives: { loading: {} } } });
        await Promise.resolve();
        await Promise.resolve();
        expect(api.list).toHaveBeenCalled();
        expect(wrapper.text()).toContain('入仓批次');
        expect(wrapper.text()).toContain('重放');
    });
});
