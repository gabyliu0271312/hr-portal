import { flushPromises, mount, shallowMount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import WarehouseModelingVisual from './WarehouseModelingVisual.vue'
import WarehouseModelReadinessPanel from '@/components/warehouse/WarehouseModelReadinessPanel.vue'
import PermissionButton from '@/components/PermissionButton.vue'

const mocks = vi.hoisted(() => ({
  get: vi.fn(), release: vi.fn(), confirm: vi.fn(), refresh: vi.fn(), push: vi.fn(),
  readiness: vi.fn(), conversion: vi.fn(), authorization: vi.fn(),
  contracts: vi.fn(), standardFields: vi.fn(), preview: vi.fn(), previewV2: vi.fn(),
}))
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: mocks.confirm },
}))
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { id: '4' } }), useRouter: () => ({ back: vi.fn(), replace: vi.fn(), push: mocks.push }) }))
const editable = ref(true)
vi.mock('@/stores/user', () => ({ useUserStore: () => ({ menus: [{ code: 'warehouse.assets' }], hasOp: () => editable.value }) }))
vi.mock('@/api/warehouse', () => ({
  getModel: mocks.get, releaseModel: mocks.release, updateModel: vi.fn(), createModel: vi.fn(), saveOutputFields: vi.fn(),
  previewModel: mocks.preview, previewModelV2: mocks.previewV2,
  getReleaseReadiness: mocks.readiness, getConversionReadiness: mocks.conversion,
  getPermissionMappingReadiness: mocks.authorization, listAuthorizationContracts: mocks.contracts, getAuthorizationExecutionReadiness: vi.fn(() => { throw new Error('建模校验不得调用当前用户运行检查') }),
  listModelStandardFields: mocks.standardFields, approveAuthorizationContract: vi.fn(), approveConversion: vi.fn(),
}))
vi.mock('@/api/datasets', () => ({ datasetsApi: { list: vi.fn().mockResolvedValue([]) } }))

const model = { id: 4, name: 'model', label: '验收模型', status: 'draft', version: 3, warehouse_layer: 'DWD', tables: [], relations: [], output_fields: [] }
const wrap = { template: '<div><slot /></div>' }
const stubs = {
  'el-button': { props: ['disabled', 'loading'], emits: ['click'], template: '<button :disabled="disabled || loading" @click="$emit(\'click\')"><slot /></button>' },
  'el-alert': { props: ['title'], template: '<p role="alert">{{ title }}</p>' },
  'el-empty': { props: ['description'], template: '<p>{{ description }}</p>' },
  'el-input': { props: ['modelValue', 'size'], template: '<input :value="modelValue" />' },
  'el-option': true, 'el-select': true, 'el-collapse': true, 'el-collapse-item': true,
  'el-table': true, 'el-table-column': true, 'el-drawer': true, 'el-dialog': true,
  'el-form': true, 'el-form-item': true, 'el-switch': true, 'el-checkbox': true,
  'el-tag': wrap, 'el-icon': wrap, 'el-descriptions': wrap, 'el-descriptions-item': wrap,
  PermissionButton,
}
const readinessStub = {
  emits: ['ready'],
  setup(_: unknown, { expose, emit }: any) { expose({ refresh: mocks.refresh }); emit('ready', false) },
  template: '<p>模型检查结果</p>',
}
function button(wrapper: ReturnType<typeof mount>, text: string) {
  return wrapper.findAll('button').find(item => item.text() === text)!
}
async function page() {
  const wrapper = shallowMount(WarehouseModelingVisual, { global: {
    stubs: { ...stubs, FullScreenModal: { template: '<main><slot name="actions" /><slot /></main>' },
      PerformanceStepFlow: { props: ['steps'], template: '<nav><span v-for="item in steps" :key="item.key">{{ item.label }}</span></nav>' },
      WarehouseModelReadinessPanel: readinessStub },
    directives: { loading: () => {} },
  } })
  await flushPromises()
  for (let index = 0; index < 4; index++) {
    await button(wrapper, '下一步').trigger('click')
    await flushPromises()
  }
  return wrapper
}
function panel() {
  return shallowMount(WarehouseModelReadinessPanel, { props: { modelId: 4, modelVersion: 3, modelName: '验收模型' },
    global: { stubs, directives: { loading: () => {} } } })
}
beforeEach(() => {
  vi.clearAllMocks()
  editable.value = true
  mocks.get.mockResolvedValue({ ...model })
  mocks.release.mockResolvedValue({ eligible: true, dataset_status: 'published' })
  mocks.confirm.mockResolvedValue(undefined)
  mocks.refresh.mockResolvedValue(undefined)
  mocks.preview.mockResolvedValue({ columns: [], items: [], summary: {} })
  mocks.previewV2.mockResolvedValue({ tables: [], joins: [], summary: {} })
  mocks.readiness.mockResolvedValue({ eligible: true, fields_eligible: true, checked_output_count: 1, confirmed_output_count: 1, issues: [], isolation: null })
  mocks.conversion.mockResolvedValue({ eligible: true, issues: [] })
  mocks.authorization.mockResolvedValue({ eligible: true, issues: [] })
  mocks.contracts.mockResolvedValue([])
  mocks.standardFields.mockResolvedValue([])
})

describe('R17 model validation and direct publishing', () => {
  it('keeps a validation step and publishes without a child publish method or a passing client snapshot', async () => {
    const wrapper = await page()
    expect(wrapper.text()).toContain('建模校验')
    expect(wrapper.text()).not.toContain('模型准入')
    expect(wrapper.text()).toContain('需检查')
    expect(button(wrapper, '发布').attributes('disabled')).toBeUndefined()
    mocks.get.mockResolvedValueOnce({ ...model, version: 7 }).mockResolvedValue({ ...model, version: 7, status: 'published' })
    await button(wrapper, '发布').trigger('click')
    await flushPromises()
    expect(mocks.release).toHaveBeenCalledTimes(1)
    expect(mocks.release).toHaveBeenCalledWith(4, 7)
    expect(mocks.refresh).toHaveBeenCalledOnce()
    expect(button(wrapper, '重新发布').exists()).toBe(true)
    expect(ElMessage.success).toHaveBeenCalledTimes(1)
    expect(ElMessage.success).toHaveBeenCalledWith('发布成功')
    wrapper.unmount()
  })

  it.each([403, 409, 422])('displays server rejection and issues without success or retry (%s)', async status => {
    const wrapper = await page()
    mocks.release.mockRejectedValueOnce({ response: { status, data: { detail: { message: '发布检查未通过', issues: [{ code: 'output_binding_missing', message: '请在来源映射中确认输出字段' }] } } } })
    await button(wrapper, '发布').trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toContain('发布检查未通过')
    expect(wrapper.find('[aria-label="发布检查问题"]').text()).toContain('请在来源映射中确认输出字段')
    expect(ElMessage.success).not.toHaveBeenCalled()
    expect(mocks.release).toHaveBeenCalledOnce()
    expect(button(wrapper, '发布').attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })

  it('decodes the structured rejection serialized by the shared API interceptor', async () => {
    const wrapper = await page()
    mocks.release.mockRejectedValueOnce({ response: { status: 409, data: { detail: JSON.stringify({
      message: '当前模型未通过检查', issues: [{ code: 'authorization_org_tree_unhealthy', message: '权限树健康检查未通过' }],
    }) } } })
    await button(wrapper, '发布').trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toBe('当前模型未通过检查')
    expect(wrapper.find('[aria-label="发布检查问题"]').text()).toContain('权限树健康检查未通过')
    expect(ElMessage.success).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('does not publish or show success without update permission', async () => {
    const wrapper = await page()
    editable.value = false
    await flushPromises()
    expect(button(wrapper, '发布').attributes('disabled')).toBeDefined()
    await button(wrapper, '发布').trigger('click')
    expect(mocks.release).not.toHaveBeenCalled()
    expect(mocks.confirm).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('cancels without requesting publication', async () => {
    const wrapper = await page()
    mocks.confirm.mockRejectedValueOnce('cancel')
    await button(wrapper, '发布').trigger('click')
    await flushPromises()
    expect(mocks.release).not.toHaveBeenCalled()
    expect(ElMessage.success).not.toHaveBeenCalled()
    expect(button(wrapper, '发布').attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })

  it('prevents duplicate publication while awaiting confirmation', async () => {
    const wrapper = await page()
    let confirm!: () => void
    mocks.confirm.mockReturnValueOnce(new Promise<void>(resolve => { confirm = resolve }))
    await button(wrapper, '发布').trigger('click')
    await button(wrapper, '发布').trigger('click')
    expect(mocks.confirm).toHaveBeenCalledOnce()
    confirm()
    await flushPromises()
    expect(mocks.release).toHaveBeenCalledOnce()
    wrapper.unmount()
  })
})

describe('R17 model checks remain read-only until an explicit governance action', () => {
  it('loads useful checks without approving, publishing or selecting an execution version', async () => {
    const wrapper = panel()
    await flushPromises()
    expect(mocks.readiness).toHaveBeenCalledTimes(1)
    expect(mocks.readiness).toHaveBeenCalledWith(4)
    expect(mocks.conversion).toHaveBeenCalledTimes(1)
    expect(mocks.conversion).toHaveBeenCalledWith(4)
    expect(mocks.authorization).toHaveBeenCalledTimes(1)
    expect(mocks.authorization).toHaveBeenCalledWith(4)
    expect(wrapper.text()).toContain('字段与结构')
    expect(wrapper.text()).toContain('来源转换证据')
    expect(wrapper.text()).toContain('权限字段与关联路径校验')
    expect(wrapper.text()).toContain('事实与权限用途声明')
    expect(wrapper.text()).toContain('变更影响分析')
    expect(wrapper.text()).not.toContain('批准转换')
    expect(wrapper.text()).not.toContain('授权合同状态')
    expect(mocks.release).not.toHaveBeenCalled()
    expect((wrapper.vm as any).publish).toBeUndefined()
    wrapper.unmount()
  })

  it('shows the affected output field and offers existing repair entries', async () => {
    mocks.readiness.mockResolvedValueOnce({ eligible: false, fields_eligible: false, checked_output_count: 2, confirmed_output_count: 1,
      issues: [{ code: 'output_binding_missing', target_kind: 'dataset_output_field', target_id: 9, target_code: 'employee_no', message: '输出字段没有标准字段确认绑定' }], isolation: null })
    const wrapper = panel()
    await flushPromises()
    expect(wrapper.text()).toContain('employee_no：输出字段没有标准字段确认绑定')
    expect(wrapper.text()).toContain('前往输出字段')
    expect(wrapper.text()).toContain('前往标准字段目录')
    expect(wrapper.text()).toContain('前往数据清洗')
    expect(wrapper.text()).toContain('返回数据建模')
    await button(wrapper, '前往标准字段目录').trigger('click')
    expect(mocks.push).toHaveBeenCalledWith('/people/settings/field-settings')
    wrapper.unmount()
  })

  it('keeps conversion evidence read-only even when the server still requires evidence approval', async () => {
    mocks.conversion.mockResolvedValueOnce({ eligible: false, issues: [{ code: 'conversion_approval_missing', message: '最新转换证据尚未批准' }] })
    const wrapper = panel()
    await flushPromises()
    expect(wrapper.text()).toContain('最新转换证据尚未批准')
    expect(wrapper.text()).toContain('这里只展示当前证据')
    expect(wrapper.text()).not.toContain('批准转换')
    expect(wrapper.findAll('input').some(input => input.attributes('placeholder')?.includes('批准原因'))).toBe(false)
    wrapper.unmount()
  })

  it('labels an active declaration as blocked when its model snapshot drifted', async () => {
    mocks.contracts.mockResolvedValueOnce([{ id: 7, dataset_id: 4, contract_version: 2, revision: 1, status: 'active', approved_by: 1,
      approved_at: '2026-10-28T00:00:00Z', approval_reason: 'reviewed', created_by: 1, runtime_enabled: false, schema_version: 3,
      facts: [{ alias: 'fact', table_name: 'dwd_fact', fact_key: 'fact_id', employee_key: 'employee_no', cost_center_key: null,
        allow_cost_center_summary: false, role: 'person_fact' }], output_fields: [], dimensions: [], measures: [], internal_fields: [] }])
    mocks.authorization.mockResolvedValueOnce({ eligible: false, runtime_enabled: false,
      issues: [{ code: 'authorization_contract_drift', message: '数据集来源、关联或输出结构已偏离批准快照' }] })
    const wrapper = panel()
    await flushPromises()
    expect(wrapper.text()).toContain('已失效：模型结构已变化')
    wrapper.unmount()
  })

  it('shows missing permission anchors even when field and conversion checks pass', async () => {
    mocks.authorization.mockResolvedValueOnce({ eligible: false,
      issues: [{ code: 'permission_anchor_binding_missing', message: '人员字段 fact.employee_no 缺少唯一标准字段映射，请到来源映射确认' }] })
    const wrapper = panel()
    await flushPromises()
    expect(wrapper.text()).toContain('人员字段 fact.employee_no 缺少唯一标准字段映射')
    expect(wrapper.text()).not.toContain('权限字段与关联路径检查通过')
    expect(wrapper.emitted('ready')?.at(-1)).toEqual([false])
    wrapper.unmount()
  })

  it('does not show a successful mapping check when the server rejects without issues', async () => {
    mocks.authorization.mockResolvedValueOnce({ eligible: false, issues: [] })
    const wrapper = panel()
    await flushPromises()
    expect(wrapper.text()).toContain('权限字段与关联路径尚未通过检查，请重新检查。')
    expect(wrapper.text()).not.toContain('权限字段与关联路径检查通过')
    expect(wrapper.emitted('ready')?.at(-1)).toEqual([false])
    wrapper.unmount()
  })

  it('clears previous results and never reports an empty successful check after refresh fails', async () => {
    const wrapper = panel()
    await flushPromises()
    expect(wrapper.emitted('ready')?.at(-1)).toEqual([true])
    mocks.readiness.mockRejectedValueOnce({ response: { status: 403 } })
    await button(wrapper, '重新检查').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('无权查看建模校验结果')
    expect(wrapper.text()).toContain('尚未取得字段检查结果')
    expect(wrapper.text()).not.toContain('权限字段与关联路径检查通过')
    expect(wrapper.emitted('ready')?.at(-1)).toEqual([false])
    wrapper.unmount()
  })
})
