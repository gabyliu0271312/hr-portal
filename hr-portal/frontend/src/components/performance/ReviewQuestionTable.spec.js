import { defineComponent } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ReviewQuestionTable from './ReviewQuestionTable.vue';
const questions = [{
        id: 'question-1',
        name: '季度目标',
        type: 'okr',
        creator: '管理员',
        createdAt: '2026-08-31 10:00',
        remark: '备注',
        rule_id: 11,
    }];
const ElTableStub = defineComponent({
    props: { data: { type: Array, required: true } },
    provide() { return { tableRows: this.data }; },
    template: '<table><slot /><slot name="empty" /></table>',
});
const ElTableColumnStub = defineComponent({
    inject: ['tableRows'],
    props: ['label', 'minWidth', 'width'],
    template: '<td :data-label="label" :data-min-width="minWidth" :data-width="width"><template v-for="row in tableRows"><slot :row="row" /></template></td>',
});
describe('ReviewQuestionTable', () => {
    function mountTable() {
        return mount(ReviewQuestionTable, {
            props: { questions, loading: false },
            global: {
                stubs: {
                    'el-table': ElTableStub,
                    'el-table-column': ElTableColumnStub,
                    'el-button': { template: '<button @click="$emit(\'click\')"><slot /></button>', emits: ['click'] },
                    'el-select': { template: '<select><slot /></select>' },
                    'el-option': { props: ['label', 'value'], template: '<option :value="value">{{ label }}</option>' },
                    PerformanceDisabledReason: { template: '<span><slot /></span>' },
                },
            },
        });
    }
    it('uses the shared table shell and renders type instead of evaluation method', () => {
        const wrapper = mountTable();
        expect(wrapper.find('[aria-label="评估题表格"]').exists()).toBe(true);
        expect(wrapper.findAll('[data-label]').map((cell) => cell.attributes('data-label'))).toEqual(['名称', '类型', '创建人', '创建时间', '备注', '操作']);
        expect(wrapper.get('[data-label="类型"]').text()).toBe('OKR 评估项');
        expect(wrapper.find('[data-label="评估方式"]').exists()).toBe(false);
    });
    it('keeps shared loading and empty states', () => {
        const wrapper = mount(ReviewQuestionTable, {
            props: { questions: [], loading: true },
            global: { stubs: { 'el-table': ElTableStub, 'el-table-column': ElTableColumnStub, 'el-select': { template: '<select />' }, 'el-option': true } },
        });
        expect(wrapper.text()).toContain('正在加载评估题...');
        expect(wrapper.get('[aria-label="评估题分页"]').text()).toContain('共 0 条');
    });
});
