import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FocusGroupMemberAddDialog from './FocusGroupMemberAddDialog.vue'
import { performanceFocusGroupApi } from '@/api/performance'

vi.mock('element-plus', () => ({ ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }))
vi.mock('@/api/performance', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/performance')>()
  return {
    ...actual,
    performanceFocusGroupApi: {
      options: vi.fn(), searchPeople: vi.fn(), resolveScope: vi.fn(), updateMembers: vi.fn(),
    },
  }
})

const dialogShellStub = {
  props: ['modelValue', 'title', 'width', 'loading'],
  emits: ['update:modelValue', 'close'],
  template: `
    <div v-if="modelValue" class="dialog-shell-stub" :data-title="title" :data-width="width">
      <slot name="description" />
      <slot />
      <slot name="footer" />
    </div>`,
}
const ruleEditorStub = {
  props: ['modelValue', 'scopeMode', 'allowedFields', 'groupTitlePattern'],
  emits: ['update:modelValue', 'open-options', 'search-people'],
  template: '<div class="rule-editor-stub" data-scope-mode="true"><button class="set-rule" type="button" @click="$emit(\'update:modelValue\', [{ conditions: [{ field: \'department\', operator: \'include\', values: [\'D1\'] }] }])">set</button></div>',
}
const uiButtonStub = {
  props: ['variant', 'loading', 'disabled'],
  emits: ['click'],
  template: '<button class="ui-button" :class="variant" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
}

const evaluatorOptions = {
  organization_tree: [],
  people: [],
  employee_types: [],
  fields: [],
  api_document_url: null,
  communication_enabled: true,
}

function mountDialog() {
  return mount(FocusGroupMemberAddDialog, {
    props: { modelValue: true, cycleId: 1, groupId: 8, currentEmployeeNos: ['E001'] },
    global: { stubs: { PerformanceDialogShell: dialogShellStub, PerformanceAudienceRuleEditor: ruleEditorStub, UiButton: uiButtonStub } },
  })
}

describe('FocusGroupMemberAddDialog', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    vi.mocked(performanceFocusGroupApi.options).mockResolvedValue(evaluatorOptions as any)
    vi.mocked(performanceFocusGroupApi.searchPeople).mockResolvedValue([])
  })

  it('renders 840 dialog shell with title, description, count line and footer buttons', async () => {
    const wrapper = mountDialog()
    await flushPromises()

    const shell = wrapper.find('.dialog-shell-stub')
    expect(shell.attributes('data-title')).toBe('添加人员范围')
    expect(shell.attributes('data-width')).toBe('var(--performance-dialog-md-width)')
    expect(wrapper.text()).toContain('按规则选择用户添加到人员组中，人员范围不支持动态更新。')
    expect(wrapper.text()).toContain('适用范围')
    expect(wrapper.text()).toContain('符合条件的人员，共 -- 人')
    expect(wrapper.find('.ui-button.secondary').exists()).toBe(true)
    expect(wrapper.find('.ui-button.primary').exists()).toBe(true)
  })

  it('resolves scope count when rule becomes complete and updates members with resolved people on submit', async () => {
    vi.useFakeTimers()
    vi.mocked(performanceFocusGroupApi.resolveScope)
      .mockResolvedValueOnce({ task_id: 'task-1', status: 1 } as any)
      .mockResolvedValueOnce({ task_id: 'task-1', status: 2, selected: ['E001', 'E002'] } as any)
      .mockResolvedValueOnce({ task_id: 'task-1', status: 1 } as any)
      .mockResolvedValueOnce({ task_id: 'task-1', status: 2, selected: ['E001', 'E002'] } as any)
    vi.mocked(performanceFocusGroupApi.updateMembers).mockResolvedValue({ group_id: 8, employee_nos: ['E001', 'E002'], people: [] } as any)
    const wrapper = mountDialog()
    await flushPromises()

    // 初始不完整规则 → 确定禁用
    expect((wrapper.find('.ui-button.primary').attributes('disabled') as string | undefined)).toBeDefined()

    // 编辑器填出完整规则 → 计数轮询
    await wrapper.find('.set-rule').trigger('click')
    await nextTick()
    await vi.advanceTimersByTimeAsync(200)
    await flushPromises()
    expect(performanceFocusGroupApi.resolveScope).toHaveBeenCalledWith(1, expect.objectContaining({ user_group_id: '' }), '-1')
    await vi.advanceTimersByTimeAsync(250)
    await flushPromises()
    expect(wrapper.text()).toContain('符合条件的人员，共 2 人')

    // 提交：再次 resolve 取名单 → updateMembers 去重合并
    await wrapper.find('.ui-button.primary').trigger('click')
    await flushPromises()
    expect(performanceFocusGroupApi.updateMembers).toHaveBeenCalledWith(1, 8, ['E001', 'E002'])
  })

  it('keeps button disabled when rule stays incomplete', async () => {
    const wrapper = mountDialog()
    await flushPromises()
    expect((wrapper.find('.ui-button.primary').attributes('disabled') as string | undefined)).toBeDefined()
    await wrapper.find('.ui-button.primary').trigger('click')
    expect(performanceFocusGroupApi.updateMembers).not.toHaveBeenCalled()
  })
})
