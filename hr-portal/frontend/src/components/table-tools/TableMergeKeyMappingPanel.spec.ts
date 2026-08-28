import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TableMergeKeyMappingPanel from './TableMergeKeyMappingPanel.vue'
import type { KeyMapping } from '@/api/tableTools'

const PermissionButtonStub = defineComponent({
  name: 'PermissionButton',
  emits: ['click'],
  template: '<button type="button" @click="$emit(\'click\')"><slot /></button>',
})

const ElInputStub = defineComponent({
  name: 'ElInput',
  props: ['modelValue', 'placeholder'],
  emits: ['update:modelValue'],
  template: '<input :value="modelValue" :placeholder="placeholder" @input="$emit(\'update:modelValue\', $event.target.value)" />',
})

const ElSelectStub = defineComponent({
  name: 'ElSelect',
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><slot /></select>',
})

const ElOptionStub = defineComponent({
  name: 'ElOption',
  props: ['label', 'value'],
  template: '<option :value="value">{{ label }}</option>',
})

const ElPaginationStub = defineComponent({
  name: 'ElPagination',
  props: ['currentPage', 'total'],
  emits: ['update:currentPage'],
  template: '<div class="pagination"><span>共 {{ total }} 条</span><button class="next-page" @click="$emit(\'update:currentPage\', 2)">下一页</button></div>',
})

const ElSwitchStub = defineComponent({
  name: 'ElSwitch',
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: '<button class="draft-switch" @click="$emit(\'update:modelValue\', !modelValue)">{{ modelValue ? \'启用\' : \'停用\' }}</button>',
})

const stubs = {
  PermissionButton: PermissionButtonStub,
  ElInput: ElInputStub,
  ElSelect: ElSelectStub,
  ElOption: ElOptionStub,
  ElPagination: ElPaginationStub,
  ElSwitch: ElSwitchStub,
  ElTooltip: { template: '<span class="tooltip"><slot /></span>' },
  ElIcon: { template: '<i><slot /></i>' },
  ElTag: { template: '<span class="tag"><slot /></span>' },
  ElButton: { emits: ['click'], template: '<button @click="$emit(\'click\')"><slot /></button>' },
  ElEmpty: { props: ['description'], template: '<div class="empty">{{ description }}</div>' },
  ElSkeleton: { template: '<div class="skeleton">加载中</div>' },
}

function mapping(id: number, enabled = true): KeyMapping {
  return {
    id,
    template_id: 1,
    source_key: { 姓名: `原始姓名${id}`, 证件号: `S${id}` },
    canonical_merge_key: { 姓名: `归集姓名${id}`, 证件号: `C${id}` },
    enabled,
  }
}

function mountPanel(overrides: Record<string, unknown> = {}) {
  return mount(TableMergeKeyMappingPanel, {
    props: {
      mergeKeys: ['姓名', '证件号'],
      mappings: [mapping(1), mapping(2, false)],
      draft: null,
      ...overrides,
    },
    global: { stubs },
  })
}

function buttonByText(wrapper: ReturnType<typeof mountPanel>, text: string) {
  return wrapper.findAll('button').find((button) => button.text().trim() === text)
}

describe('TableMergeKeyMappingPanel', () => {
  it('renders a compact toolbar and the aligned table headers without repeated title', () => {
    const wrapper = mountPanel()

    expect(wrapper.find('.panel-header').exists()).toBe(false)
    expect(wrapper.find('.list-toolbar').text()).toContain('新增映射')
    expect(wrapper.findAll('th').map((header) => header.text())).toEqual(['原始主键', '归集主键', '状态', '操作'])
    expect(wrapper.text()).not.toContain('整组映射')
    expect(wrapper.text()).not.toContain('源主键组合')
    expect(wrapper.text()).not.toContain('归集统一主键组合')
  })

  it('keeps joint key values in merge key order and renders disabled status', () => {
    const wrapper = mountPanel()
    const rows = wrapper.findAll('tbody tr')

    expect(rows[0].text().indexOf('姓名：原始姓名1')).toBeLessThan(rows[0].text().indexOf('证件号：S1'))
    expect(rows[0].findAll('.key-values .tooltip')).toHaveLength(0)
    expect(rows[1].classes()).toContain('disabled')
    expect(rows[1].text()).toContain('停用')
  })

  it('filters by keyword and status and distinguishes filtered empty state', async () => {
    const wrapper = mountPanel()
    await wrapper.find('input[placeholder="搜索主键值"]').setValue('S2')

    expect(wrapper.findAll('tbody tr')).toHaveLength(1)
    expect(wrapper.text()).toContain('原始姓名2')

    await wrapper.find('select').setValue('enabled')
    expect(wrapper.text()).toContain('没有符合当前筛选条件的主键值映射')
  })

  it('paginates locally after 20 rows', async () => {
    const wrapper = mountPanel({ mappings: Array.from({ length: 21 }, (_, index) => mapping(index + 1)) })

    expect(wrapper.findAll('tbody tr')).toHaveLength(20)
    expect(wrapper.text()).not.toContain('原始姓名21')
    expect(wrapper.find('.pagination').text()).toContain('共 21 条')
    await wrapper.find('.next-page').trigger('click')
    expect(wrapper.findAll('tbody tr')).toHaveLength(1)
    expect(wrapper.text()).toContain('原始姓名21')
  })

  it('renders loading, API error with retry, and the true empty state', async () => {
    const loading = mountPanel({ loading: true })
    expect(loading.find('.skeleton').exists()).toBe(true)

    const failed = mountPanel({ error: '服务暂不可用' })
    expect(failed.text()).toContain('服务暂不可用')
    await buttonByText(failed, '重新加载')?.trigger('click')
    expect(failed.emitted('retry')?.length).toBeGreaterThanOrEqual(1)

    const empty = mountPanel({ mappings: [] })
    expect(empty.text()).toContain('暂无主键值映射，未配置时将沿用原始主键归集')
  })

  it('emits create, edit, delete, toggle and validates the two-column draft editor', async () => {
    const draft = {
      ...mapping(0),
      source_key: { 姓名: '', 证件号: '' },
      canonical_merge_key: { 姓名: '', 证件号: '' },
    }
    const wrapper = mountPanel({ draft })

    await buttonByText(wrapper, '新增映射')?.trigger('click')
    await buttonByText(wrapper, '保存')?.trigger('click')
    expect(wrapper.emitted('create')).toHaveLength(1)
    expect(wrapper.emitted('save')).toBeUndefined()
    expect(wrapper.text()).toContain('请完整填写：姓名、证件号')
    await wrapper.find('input[placeholder="请输入原始值"]').setValue('张三')
    await wrapper.find('.draft-switch').trigger('click')
    await buttonByText(wrapper, '取消')?.trigger('click')
    expect(wrapper.emitted('update:draft')?.[0]?.[0]).toMatchObject({ source_key: { 姓名: '张三' } })
    expect(wrapper.emitted('update:draft')?.[1]?.[0]).toMatchObject({ enabled: false })
    expect(wrapper.emitted('cancel')?.length).toBeGreaterThanOrEqual(1)

    const validDraft = mountPanel({ draft: mapping(0), saveError: '该原始主键已映射到其他归集主键' })
    expect(validDraft.text()).toContain('该原始主键已映射到其他归集主键')
    await buttonByText(validDraft, '保存')?.trigger('click')
    expect(validDraft.emitted('save')?.length).toBeGreaterThanOrEqual(1)

    const plainWrapper = mountPanel()
    const operationButtons = plainWrapper.findAll('.operation-column button')
    await operationButtons[0].trigger('click')
    await operationButtons[1].trigger('click')
    await buttonByText(plainWrapper, '启用')?.trigger('click')
    expect(plainWrapper.emitted('edit')?.[0]?.[0]).toMatchObject({ id: 1 })
    expect(plainWrapper.emitted('delete')?.[0]?.[0]).toMatchObject({ id: 1 })
    expect(plainWrapper.emitted('toggle')?.[0]).toEqual([expect.objectContaining({ id: 1 }), false])
  })
})
