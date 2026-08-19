import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import WorkflowNodeBasicFields from './WorkflowNodeBasicFields.vue';
const node = {
    node_id: 'evaluation-1', node_type: 'evaluation', name: '评估型环节', description: '', order: 1,
    executor_types: ['DIRECT_MANAGER'], executor_label: '实线上级', evaluation_type: 'SINGLE', include_final_result: false, system: false,
};
describe('WorkflowNodeBasicFields', () => {
    it('shares the required name and description field structure', async () => {
        const wrapper = mount(WorkflowNodeBasicFields, { props: { node, locked: () => false } });
        expect(wrapper.get('.form-label').text()).toContain('环节名称');
        expect(wrapper.get('.required-mark').text()).toBe('*');
        expect(wrapper.findAll('.form-control')).toHaveLength(2);
        await wrapper.find('input').setValue('自定义名称');
        await wrapper.find('textarea').setValue('说明');
        expect(node.name).toBe('自定义名称');
        expect(node.description).toBe('说明');
    });
    it('delegates field locking to the parent policy', () => {
        const wrapper = mount(WorkflowNodeBasicFields, { props: { node, locked: (field) => field === 'name' } });
        expect(wrapper.get('input').attributes('disabled')).toBeDefined();
        expect(wrapper.get('textarea').attributes('disabled')).toBeUndefined();
    });
});
