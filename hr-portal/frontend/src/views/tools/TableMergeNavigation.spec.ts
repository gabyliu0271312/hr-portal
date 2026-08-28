import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TableMerge from './TableMerge.vue'

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  listTemplates: vi.fn(),
  getTemplate: vi.fn(),
}))

vi.mock('element-plus', async (importOriginal) => {
  const original = await importOriginal<typeof import('element-plus')>()
  return {
    ...original,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
    ElMessageBox: { confirm: mocks.confirm, prompt: vi.fn() },
  }
})

vi.mock('@/api/tableTools', () => ({
  tableToolsApi: {
    listTemplates: mocks.listTemplates,
    getTemplate: mocks.getTemplate,
    createTemplate: vi.fn(),
    updateTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
    listKeyMappings: vi.fn().mockResolvedValue([]),
    listDwdRelations: vi.fn().mockResolvedValue([]),
    listDwdSources: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock('@/stores/user', () => ({
  useUserStore: () => ({
    isSuperAdmin: true,
    user: { id: 1 },
    hasOp: () => true,
  }),
}))

const template = {
  id: 7,
  name: '月度社保归集',
  description: '合并多个来源的社保明细',
  merge_keys: ['姓名', '证件号'],
  std_fields: ['单位基本养老保险'],
  output_fields: [],
  aggregate: 'sum',
  result_save_mode: 'input_period',
  result_period_field: null,
  version: 1,
  mapping_count: 3,
  created_by: 1,
}

const routes = [
  { path: '/tools/table-merge', name: 'TableMerge', component: TableMerge },
  { path: '/tools/table-merge/new', name: 'TableMergeNew', component: TableMerge },
  { path: '/tools/table-merge/:id/edit', name: 'TableMergeEdit', component: TableMerge },
]

const stubs = {
  PermissionButton: {
    emits: ['click'],
    template: '<button class="permission-button" @click="$emit(\'click\')"><slot /></button>',
  },
  TableMergeTemplateCard: {
    props: ['template'],
    emits: ['edit'],
    template: '<button class="template-card-stub" @click="$emit(\'edit\', template)">{{ template.name }}</button>',
  },
  TableToolFullscreenShell: {
    props: ['title'],
    emits: ['back'],
    template: '<section class="workspace-shell"><button class="workspace-back" @click="$emit(\'back\')">返回</button><h1>{{ title }}</h1><slot name="actions" /><slot /></section>',
  },
  ElCard: { template: '<section class="el-card"><header><slot name="header" /></header><slot /></section>' },
  ElButton: { emits: ['click'], template: '<button @click="$emit(\'click\')"><slot /></button>' },
  ElIcon: { template: '<i><slot /></i>' },
  ElUpload: {
    props: ['onChange'],
    template: '<button class="upload-stub" @click="onChange({ raw: { name: \'sample.xlsx\', size: 10, lastModified: 1 } })">上传</button>',
  },
  ElInput: true,
  ElOption: true,
  ElSelect: true,
  ElRadio: true,
  ElRadioGroup: true,
  ElInputNumber: true,
  ElCheckbox: true,
  ElEmpty: true,
  ElTable: true,
  ElTableColumn: true,
  ElAlert: true,
  OutputFieldsEditor: true,
  TableMergeKeyMappingPanel: true,
}

async function mountAt(path = '/tools/table-merge') {
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push(path)
  await router.isReady()
  const wrapper = mount({ template: '<RouterView />' }, {
    global: { plugins: [router], stubs, directives: { loading: {} } },
  })
  await flushPromises()
  return { router, wrapper }
}

describe('TableMerge navigation', () => {
  beforeEach(() => {
    mocks.confirm.mockReset().mockResolvedValue('confirm')
    mocks.listTemplates.mockReset().mockResolvedValue([template])
    mocks.getTemplate.mockReset().mockResolvedValue({ ...template, mappings: [] })
  })

  it('uses a standard list page and opens editor routes from the page actions', async () => {
    const { router, wrapper } = await mountAt()

    expect(wrapper.find('.template-list-page').exists()).toBe(true)
    expect(wrapper.find('.workspace-shell').exists()).toBe(false)
    expect(wrapper.text()).toContain('表格归集')
    expect(wrapper.text()).toContain('配置归集模板，定期上传多源文件一键合并为标准表格。')
    expect(wrapper.text()).toContain('新建模板')

    await wrapper.get('.template-card-stub').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/tools/table-merge/7/edit')
  })

  it('returns to the template list once and protects an unfinished new-template step', async () => {
    const { router, wrapper } = await mountAt('/tools/table-merge/new')
    expect(wrapper.find('.workspace-shell').exists()).toBe(true)

    await wrapper.get('.upload-stub').trigger('click')
    await wrapper.get('.workspace-back').trigger('click')
    await flushPromises()

    expect(mocks.confirm).toHaveBeenCalledWith(
      '返回后，当前步骤尚未保存的内容将丢失。',
      '确认返回',
      expect.objectContaining({ confirmButtonText: '返回' }),
    )
    expect(router.currentRoute.value.fullPath).toBe('/tools/table-merge')
    expect(wrapper.find('.template-list-page').exists()).toBe(true)
  })

  it('shows an inline retry state when the template list fails to load', async () => {
    mocks.listTemplates.mockRejectedValueOnce({ response: { data: { detail: '模板服务暂不可用' } } })
    const { wrapper } = await mountAt()

    expect(wrapper.get('[role="alert"]').text()).toContain('模板服务暂不可用')
    expect(wrapper.get('[role="alert"]').text()).toContain('重新加载')
  })

  it('shows the empty template state without removing the create entry', async () => {
    mocks.listTemplates.mockResolvedValueOnce([])
    const { wrapper } = await mountAt()

    expect(wrapper.text()).toContain('暂无归集模板')
    expect(wrapper.text()).toContain('创建第一个模板')
  })
})
