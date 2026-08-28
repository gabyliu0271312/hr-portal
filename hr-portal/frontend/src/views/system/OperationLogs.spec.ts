import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import OperationLogs from './OperationLogs.vue'

const mocks = vi.hoisted(() => ({ get: vi.fn() }))

vi.mock('@/api/client', () => ({ api: { get: mocks.get } }))

const reportLog = {
  id: 9,
  category: 'report_access',
  action: 'export_xlsx',
  status: 'success',
  user_id: 3,
  user_display_name: '张三',
  request_summary: '工资汇总表',
  response_summary: null,
  input_hash: 'config-hash',
  output_hash: 'result-hash',
  error: null,
  trace_id: 'trace-001',
  created_at: '2026-08-28T10:20:31Z',
  label: '姓名',
  code: 'employee_name',
  data_type: 'string',
  is_sensitive: true,
  source: 'runtime',
  column: 'id_card',
  op: 'eq',
  value_hmac: 'hmac-only-value',
  metadata_json: {
    actor: { user_id: 3, display_name: '张三' },
    report: { id: 6, name: '工资汇总表', dataset_id: 8, scope_strategy: 'organization' },
    content: {
      field_count: 2,
      sensitive_field_count: 1,
      row_count: 320,
      format: 'xlsx',
      fields: [
        { label: '姓名', code: 'employee_name', data_type: 'string', is_sensitive: true },
        { label: '部门', code: 'department', data_type: 'string', is_sensitive: false },
      ],
      filters: [
        { source: 'runtime', column: 'id_card', op: 'eq', has_value: true, value_hmac: 'hmac-only-value' },
      ],
    },
    client: { ip: '10.0.0.8', user_agent: 'Vitest' },
  },
}

const pageResponse = { data: { items: [reportLog], total: 1, page: 1, page_size: 20 } }

const stubs = {
  ElIcon: { template: '<span><slot /></span>' },
  ElSelect: {
    props: ['modelValue'],
    emits: ['update:modelValue', 'change'],
    template: `<select :value="modelValue" @change="$emit('update:modelValue', $event.target.value); $emit('change', $event.target.value)"><slot /></select>`,
  },
  ElOption: { props: ['value', 'label'], template: '<option :value="value">{{ label }}</option>' },
  ElInput: {
    props: ['modelValue', 'placeholder'],
    emits: ['update:modelValue'],
    template: `<label><input :placeholder="placeholder" :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" /><slot name="prefix" /></label>`,
  },
  ElDatePicker: true,
  ElTooltip: { template: '<span><slot /></span>' },
  ElButton: { template: '<button @click="$emit(\'click\')"><slot /></button>' },
  ElTable: { template: '<div><slot /><slot name="empty" /></div>' },
  ElTableColumn: {
    props: ['label', 'prop'],
    setup: () => ({ row: reportLog }),
    template: '<div class="table-column">{{ label }}{{ prop ? row[prop] : \'\' }}<slot :row="row" /></div>',
  },
  ElTag: { template: '<span><slot /></span>' },
  ElEmpty: { props: ['description'], template: '<div>{{ description }}<slot /></div>' },
  ElPagination: true,
  ElDrawer: {
    props: ['modelValue', 'title'],
    template: '<aside v-if="modelValue"><h2>{{ title }}</h2><slot /></aside>',
  },
  ElDescriptions: { template: '<dl><slot /></dl>' },
  ElDescriptionsItem: { props: ['label'], template: '<div><dt>{{ label }}</dt><dd><slot /></dd></div>' },
}

describe('OperationLogs', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.get.mockReset().mockResolvedValue(pageResponse)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('loads report access logs with server paging and renders auditable details', async () => {
    const wrapper = mount(OperationLogs, {
      global: { stubs, directives: { loading: {} } },
    })
    await flushPromises()

    await wrapper.get('.type-filter').setValue('report_access')
    await flushPromises()

    expect(mocks.get).toHaveBeenLastCalledWith('/system-logs', {
      params: expect.objectContaining({ category: 'report_access', paged: true, page: 1, page_size: 20 }),
    })
    expect(wrapper.text()).toContain('字段数')
    expect(wrapper.text()).toContain('行数')
    expect(wrapper.text()).toContain('格式')
    expect(wrapper.text()).toContain('工资汇总表')

    await wrapper.get('[aria-label="查看日志详情"]').trigger('click')
    expect(wrapper.text()).toContain('字段清单')
    expect(wrapper.text()).toContain('姓名')
    expect(wrapper.text()).toContain('employee_name')
    expect(wrapper.text()).toContain('trace-001')
    expect(wrapper.text()).toContain('hmac-only-v')
    expect(wrapper.text()).not.toContain('110101199001011234')
  })

  it('debounces report keyword filtering for 300ms', async () => {
    const wrapper = mount(OperationLogs, {
      global: { stubs, directives: { loading: {} } },
    })
    await flushPromises()
    await wrapper.get('.type-filter').setValue('report_access')
    await flushPromises()
    await vi.runOnlyPendingTimersAsync()
    await flushPromises()
    mocks.get.mockClear()

    await wrapper.get('.keyword-filter input').setValue('工资')
    await vi.advanceTimersByTimeAsync(299)
    expect(mocks.get).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await flushPromises()

    expect(mocks.get).toHaveBeenCalledTimes(1)
    expect(mocks.get).toHaveBeenLastCalledWith('/system-logs', {
      params: expect.objectContaining({ category: 'report_access', keyword: '工资' }),
    })
  })
})
