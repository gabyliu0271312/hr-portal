import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import performanceManagementTableSource from './PerformanceManagementTable.vue?raw'
import reviewRuleTableSource from './ReviewRuleTable.vue?raw'
import ReviewRuleTable from './ReviewRuleTable.vue'
import type { ReviewRule } from './reviewRuleTypes'

const rules: ReviewRule[] = [{
  id: 'rule-1',
  name: '7档绩效等级',
  method: 'rating',
  creator: 'alice.xiao',
  createdAt: '2022-06-21 18:20',
  remark: '--',
  deletable: false,
}]

const ElTableStub = defineComponent({
  props: { data: { type: Array, required: true }, maxHeight: { type: [String, Number], default: undefined } },
  provide() {
    return { tableRows: this.data }
  },
  template: '<table :data-max-height="maxHeight"><slot /><slot v-if="data.length === 0" name="empty" /></table>',
})

const ElTableColumnStub = defineComponent({
  inject: ['tableRows'],
  props: ['label', 'width', 'minWidth'],
  template: '<td :data-label="label" :data-width="width" :data-min-width="minWidth"><template v-for="row in tableRows"><slot :row="row" /></template></td>',
})

function mountTable(props: { rules?: ReviewRule[]; loading?: boolean; page?: number; pageSize?: number; total?: number } = {}) {
  return mount(ReviewRuleTable, {
    props: {
      rules: props.rules ?? rules,
      loading: props.loading ?? false,
      page: props.page ?? 1,
      pageSize: props.pageSize ?? 10,
      total: props.total ?? props.rules?.length ?? rules.length,
    },
    global: {
      stubs: {
        PerformanceDisabledReason: {
          props: ['disabled', 'reason'],
          template: '<span data-disabled-wrapper :data-disabled="disabled" :data-reason="reason"><slot /></span>',
        },
        'el-table': ElTableStub,
        'el-table-column': ElTableColumnStub,
        'el-button': {
          props: ['disabled'],
          emits: ['click'],
          template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
        },
        'el-select': {
          props: ['modelValue'],
          emits: ['change'],
          template: '<select aria-label="每页条数" :value="modelValue" @change="$emit(\'change\', Number($event.target.value))"><slot /></select>',
        },
        'el-option': {
          props: ['label', 'value'],
          template: '<option :value="value">{{ label }}</option>',
        },
      },
    },
  })
}

describe('ReviewRuleTable', () => {
  it('renders the captured six-column contract', () => {
    const wrapper = mountTable()
    const columns = wrapper.findAll('[data-label]')
    expect(columns.map((column) => column.attributes('data-label'))).toEqual(['名称', '评估方式', '创建人', '创建时间', '备注', '操作'])
    expect(columns.map((column) => column.attributes('data-width'))).toEqual([undefined, undefined, undefined, undefined, undefined, undefined])
    expect(columns.map((column) => column.attributes('data-min-width'))).toEqual(['120', '120', '160', '160', '240', '128'])
    expect(wrapper.get('table').attributes('data-max-height')).toBeUndefined()
  })

  it('pins the rendered colgroup to the captured header geometry', () => {
    expect(reviewRuleTableSource).toContain('colgroup col:nth-child(1)) { width: 12.9325%')
    expect(reviewRuleTableSource).toContain('colgroup col:nth-child(2)) { width: 12.9325%')
    expect(reviewRuleTableSource).toContain('colgroup col:nth-child(3)) { width: 17.231375%')
    expect(reviewRuleTableSource).toContain('colgroup col:nth-child(4)) { width: 17.243125%')
    expect(reviewRuleTableSource).toContain('colgroup col:nth-child(5)) { width: 25.865%')
    expect(reviewRuleTableSource).toContain('colgroup col:nth-child(6)) { width: 13.794875%')
  })

  it('keeps horizontal scrolling in the shared table single-owner', () => {
    expect(performanceManagementTableSource).toContain('.table-scroll { overflow: visible; }')
    expect(performanceManagementTableSource).not.toContain('colgroup col:nth-child(1))')
  })

  it('keeps a single 12px padding source for header titles', () => {
    expect(performanceManagementTableSource).toContain('th.el-table__cell > .cell)')
    expect(performanceManagementTableSource).toContain('padding: 0;')
    expect(performanceManagementTableSource).toContain('font-size: 14px;')
    expect(performanceManagementTableSource).toContain('line-height: 22px;')
  })

  it('keeps target icon names on pagination controls', () => {
    expect(performanceManagementTableSource).toContain('data-icon="LeftBoldOutlined"')
    expect(performanceManagementTableSource).toContain('data-icon="RightBoldOutlined"')
    expect(performanceManagementTableSource).toContain(':suffix-icon="DownBoldOutlinedIcon"')
  })

  it('emits edit and keeps captured delete disabled', async () => {
    const wrapper = mountTable()
    const buttons = wrapper.findAll('button')
    await buttons.find((button) => button.text() === '编辑')!.trigger('click')
    await buttons.find((button) => button.text() === '删除')!.trigger('click')
    expect(wrapper.emitted('edit')).toEqual([[rules[0]]])
    expect(wrapper.emitted('remove')).toBeUndefined()
    expect(buttons.find((button) => button.text() === '删除')!.attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-disabled-wrapper]').attributes('data-reason')).toBe('此评估规则已被使用，不允许删除')
  })

  it('emits remove for an unused rule', async () => {
    const unused = { ...rules[0], id: 'rule-2', deletable: true, isUsed: false }
    const wrapper = mountTable({ rules: [unused] })
    await wrapper.findAll('button').find((button) => button.text() === '删除')!.trigger('click')
    expect(wrapper.emitted('remove')).toEqual([[unused]])
    expect(wrapper.get('[data-disabled-wrapper]').attributes('data-disabled')).toBe('false')
  })

  it('keeps the six-column header visible in loading and empty states', () => {
    const loading = mountTable({ loading: true, rules: [] })
    const empty = mountTable({ rules: [] })
    expect(loading.text()).toContain('正在加载评估规则...')
    expect(empty.text()).toContain('暂无评估规则')
    expect(loading.findAll('[data-label]')).toHaveLength(6)
    expect(empty.findAll('[data-label]')).toHaveLength(6)
    expect(empty.get('[aria-label="评估规则分页"]').text()).toContain('共 0 条')
    expect(empty.get('.page-current').text()).toBe('1')
    expect(empty.findAll('.pagination-arrow').every((button) => button.attributes('disabled') !== undefined)).toBe(true)
    expect((empty.get('[aria-label="每页条数"]').element as HTMLSelectElement).value).toBe('10')
  })

  it('forwards pagination changes', async () => {
    const wrapper = mountTable({ page: 2, total: 30 })
    const arrows = wrapper.findAll('.pagination-arrow')
    await arrows[0].trigger('click')
    await arrows[1].trigger('click')
    await wrapper.get('[aria-label="每页条数"]').setValue('20')
    expect(wrapper.emitted('page-change')).toEqual([[1], [3]])
    expect(wrapper.emitted('page-size-change')).toEqual([[20]])
  })
})
