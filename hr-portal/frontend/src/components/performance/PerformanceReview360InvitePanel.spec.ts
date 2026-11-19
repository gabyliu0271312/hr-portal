import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { ElTable, ElTableColumn } from 'element-plus'
import PerformanceReview360InvitePanel from './PerformanceReview360InvitePanel.vue'
import PerformanceListToolbar from './PerformanceListToolbar.vue'

const api = vi.hoisted(() => ({ list: vi.fn(), candidates: vi.fn(), submit: vi.fn(), revoke: vi.fn() }))
vi.mock('@/api/performance', () => ({ performanceReview360InviteApi: api }))
vi.mock('element-plus', async importOriginal => ({ ...await importOriginal<typeof import('element-plus')>(), ElMessage: { error: vi.fn(), warning: vi.fn() } }))
const reviewer = (employee_no: string, source_type = 'SELF', relationship?: string) => ({
  employee_no, display_name: `成员${employee_no}`, department: null, job_family: null, job_category: null,
  job_sequence: null, position_level: null, status: 'pending' as const, source_label: source_type === 'DEFAULT' ? '系统默认邀请' : '自己邀请',
  source_type, relationship, invited_at: null, due_at: null, can_revoke: false, revoke_disabled_reason: '未开放周期删除授权',
})
function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    project_id: 10, task_id: 101, employee_no: 'target', node_id: 'evaluation-360', version: 'roster-v1',
    items: [reviewer('A', 'DEFAULT', '直属下级'), reviewer('B', 'SELF')], total: 2, count: 1, manual_count: 1,
    minimum_invited_count: 3, maximum_invited_count: 5, maximum_invite_mode: 'LIMIT',
    second_prompt_enabled: false, second_prompt_count: null, second_prompt_mode: 'SUGGESTED',
    exclude_default_invite_from_limit: true, can_invite: true, editable: true, ...overrides,
  }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const wrappers: ReturnType<typeof mount>[] = []
function render(props: Record<string, unknown> = { data: snapshot() }) {
  const wrapper = mount(PerformanceReview360InvitePanel, {
    props: props as any,
    global: {
      components: { ElTableColumn },
      stubs: {
        PerformanceManagementTable: defineComponent({ components: { ElTable }, props: ['rows'], template: '<ElTable :data="rows"><slot /></ElTable>' }),
        UiDrawerShell: { props: ['modelValue'], template: '<div v-if="modelValue" class="test-drawer"><slot /></div>' },
        PerformanceDisabledReason: { props: ['disabled', 'reason'], template: '<span :data-reason="reason"><slot /></span>' },
      },
    },
  })
  wrappers.push(wrapper)
  return wrapper
}
async function selectCandidate(wrapper: ReturnType<typeof mount>) {
  await wrapper.get('button[aria-label="邀请 360° 评估人"]').trigger('click')
  await flushPromises()
  await wrapper.get('input[type="checkbox"]').setValue(true)
}
function confirmButton(wrapper: ReturnType<typeof mount>) { return wrapper.findAll('button').find(button => button.text() === '确认邀请')! }
beforeEach(() => {
  vi.resetAllMocks()
  api.candidates.mockResolvedValue({ items: [{ employee_no: 'C', display_name: '候选成员', department: '研发组' }], total: 1 })
  api.list.mockResolvedValue(snapshot())
})
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); document.body.innerHTML = '' })

describe('PerformanceReview360InvitePanel', () => {
  it('uses snapshot without GET, excludes default invitations from required count, and filters locally', async () => {
    const wrapper = render()
    await flushPromises()
    expect(api.list).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('通过「搜索」添加 360° 评估人')
    expect(wrapper.text()).toContain('已邀请 2 人，除系统默认邀请外，仍需邀请至少 2 人')
    expect(wrapper.text()).toContain('直属下级（1 人）')
    expect(wrapper.text()).toContain('关系未提供（1 人）')
    wrapper.getComponent(PerformanceListToolbar).vm.$emit('update:keyword', '成员B')
    await flushPromises()
    expect(wrapper.text()).not.toContain('成员A')
    expect(wrapper.text()).toContain('成员B')
    expect(wrapper.text()).toContain('已邀请列表：当前共 2 人')
    expect(api.list).not.toHaveBeenCalled()
    expect(wrapper.emitted('change')).toBeUndefined()
    await wrapper.get('button[role="radio"][aria-checked="false"]').trigger('click')
    expect(wrapper.text()).toContain('自己邀请（1 人）')
  })

  it('uses server count rather than current actor manual count for invitation requirements', () => {
    const wrapper = render({ data: snapshot({ total: 5, count: 3, manual_count: 1 }) })
    expect(wrapper.text()).toContain('已满足最少邀请人数（3 人）')
  })

  it('mutates with task/version, adopts full response and emits change/busy without formal submit', async () => {
    const wrapper = render({ data: snapshot(), projectId: 10, nodeId: 'invite-stage' })
    const pending = deferred<any>()
    api.submit.mockReturnValue(pending.promise)
    await selectCandidate(wrapper)
    expect(api.candidates).toHaveBeenCalledWith(10, undefined, 101)
    await confirmButton(wrapper).trigger('click')
    expect(api.submit).toHaveBeenCalledWith(10, ['C'], 101, 'roster-v1')
    expect(wrapper.emitted('busy')).toEqual([[true]])
    const changed = snapshot({ items: [reviewer('C')], total: 1, version: 'roster-v2' })
    pending.resolve({ reviewer_360: changed, version: 'roster-v2', rejected: [] })
    await flushPromises()
    expect(wrapper.emitted('change')).toEqual([[changed]])
    expect(wrapper.emitted('busy')).toEqual([[true], [false]])
    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(api.list).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('成员C')
    await selectCandidate(wrapper)
    api.submit.mockResolvedValue({ reviewer_360: snapshot({ version: 'roster-v3' }) })
    await confirmButton(wrapper).trigger('click')
    expect(api.submit).toHaveBeenLastCalledWith(10, ['C'], 101, 'roster-v2')
  })

  it.each([
    { readonly: true }, { disabled: true }, { data: snapshot({ can_invite: false }) },
    { data: snapshot({ editable: false }) }, { data: snapshot({ task_id: undefined }) },
    { data: snapshot({ version: undefined }) }, { projectId: 11 },
  ])('denies mutation when task capabilities are missing: %j', async overrides => {
    const wrapper = render({ data: snapshot(), ...overrides })
    const button = wrapper.find('button[aria-label="邀请 360° 评估人"]')
    if (button.exists()) { expect(button.attributes('disabled')).toBeDefined(); await button.trigger('click') }
    expect(api.candidates).not.toHaveBeenCalled()
    expect(api.submit).not.toHaveBeenCalled()
    expect(api.list).not.toHaveBeenCalled()
    if (overrides.readonly) expect(wrapper.find('button[aria-label="撤销邀请"]').exists()).toBe(false)
  })

  it('never fetches in readonly without snapshot and makes legacy list strictly readonly', async () => {
    const readonly = render({ projectId: 10, readonly: true })
    await flushPromises()
    expect(api.list).not.toHaveBeenCalled()
    expect(readonly.find('.test-drawer').exists()).toBe(false)
    const legacy = render({ projectId: 10 })
    await flushPromises()
    expect(api.list).toHaveBeenCalledWith(10, undefined, undefined)
    expect(legacy.text()).toContain('成员A')
    expect(legacy.get('button[aria-label="邀请 360° 评估人"]').attributes('disabled')).toBeDefined()
    expect(api.submit).not.toHaveBeenCalled()
  })

  it('keeps revoke disabled with server reason for pending and completed reviewers', async () => {
    const wrapper = render({ data: snapshot({ items: [reviewer('A'), { ...reviewer('B'), status: 'completed' }] }) })
    await flushPromises()
    expect(wrapper.findAll('button[aria-label="撤销邀请"]')).toHaveLength(2)
    expect(wrapper.findAll('button[aria-label="撤销邀请"]').every(button => button.attributes('disabled') !== undefined)).toBe(true)
    expect(wrapper.findAll('[data-reason]').map(element => element.attributes('data-reason'))).toContain('未开放周期删除授权')
    expect(api.revoke).not.toHaveBeenCalled()
  })

  it('retains roster on mutation error and allows retry', async () => {
    const wrapper = render()
    api.submit.mockRejectedValue({ response: { status: 500 } })
    await selectCandidate(wrapper)
    await confirmButton(wrapper).trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('成员A')
    expect(wrapper.text()).toContain('邀请失败，请稍后重试')
    expect(wrapper.emitted('change')).toBeUndefined()
    expect(wrapper.emitted('busy')).toEqual([[true], [false]])
    expect(confirmButton(wrapper).attributes('disabled')).toBeUndefined()
  })

  it('requires explicit reread after 409 and retains existing roster when reread fails', async () => {
    const wrapper = render()
    api.submit.mockRejectedValue({ response: { status: 409 } })
    await selectCandidate(wrapper)
    await confirmButton(wrapper).trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('名单已变化，请重新读取名单后再操作')
    expect(api.list).not.toHaveBeenCalled()
    expect(api.submit).toHaveBeenCalledTimes(1)
    expect(confirmButton(wrapper).attributes('disabled')).toBeDefined()
    api.list.mockRejectedValue(new Error('offline'))
    await wrapper.findAll('button').find(button => button.text() === '重新读取名单')!.trigger('click')
    await flushPromises()
    expect(api.list).toHaveBeenCalledWith(10, undefined, 101)
    expect(wrapper.text()).toContain('成员A')
    expect(wrapper.text()).toContain('加载失败，请重试')
    expect(wrapper.emitted('change')).toBeUndefined()
    api.list.mockResolvedValue(snapshot({ version: 'latest' }))
    await wrapper.findAll('button').find(button => button.text() === '重新读取名单')!.trigger('click')
    await flushPromises()
    expect(wrapper.emitted('change')?.[0]?.[0]).toMatchObject({ version: 'latest' })
    expect(wrapper.get('button[aria-label="邀请 360° 评估人"]').attributes('disabled')).toBeUndefined()
  })

  it('reports candidate error distinctly from no candidates and supports retry', async () => {
    const wrapper = render()
    api.candidates.mockRejectedValueOnce(new Error('offline'))
    await wrapper.get('button[aria-label="邀请 360° 评估人"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('成员加载失败，请重试')
    expect(wrapper.text()).not.toContain('暂无可以邀请的成员')
    await wrapper.findAll('button').find(button => button.text() === '重试')!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('候选成员')
    expect(api.candidates).toHaveBeenCalledTimes(2)
  })

  it('discards late candidate search results and task changes', async () => {
    const wrapper = render()
    const first = deferred<any>()
    api.candidates.mockReturnValueOnce(first.promise)
    await wrapper.get('button[aria-label="邀请 360° 评估人"]').trigger('click')
    const toolbar = wrapper.findAllComponents(PerformanceListToolbar)[1]
    toolbar.vm.$emit('update:keyword', '新')
    await flushPromises()
    toolbar.vm.$emit('search')
    await flushPromises()
    first.resolve({ items: [{ employee_no: 'old', display_name: '迟到候选' }], total: 1 })
    await flushPromises()
    expect(wrapper.text()).not.toContain('迟到候选')
    expect(wrapper.text()).toContain('候选成员')
    const late = deferred<any>()
    api.candidates.mockReturnValueOnce(late.promise)
    toolbar.vm.$emit('search')
    await wrapper.setProps({ data: snapshot({ task_id: 102, version: 'other', items: [reviewer('Z')] }) })
    late.resolve({ items: [{ employee_no: 'old', display_name: '迟到候选' }], total: 1 })
    await flushPromises()
    expect(wrapper.text()).toContain('成员Z')
    expect(wrapper.text()).not.toContain('迟到候选')
    expect(wrapper.emitted('change')).toBeUndefined()
  })

  it.each([{ data: snapshot({ task_id: 102, version: 'other', items: [reviewer('Z')] }) }, { readonly: true }])('discards pending mutation after context/readonly change: %j', async changedProps => {
    const wrapper = render()
    const pending = deferred<any>()
    api.submit.mockReturnValueOnce(pending.promise)
    await selectCandidate(wrapper)
    await confirmButton(wrapper).trigger('click')
    await wrapper.setProps(changedProps)
    pending.resolve({ reviewer_360: snapshot({ items: [reviewer('LATE')], version: 'late' }) })
    await flushPromises()
    expect(wrapper.text()).not.toContain('成员LATE')
    expect(wrapper.emitted('change')).toBeUndefined()
    expect(wrapper.emitted('busy')).toEqual([[true], [false]])
  })

  it('rejects a mutation response from a different task without replacing the snapshot', async () => {
    const wrapper = render()
    api.submit.mockResolvedValue({ reviewer_360: snapshot({ task_id: 999, items: [reviewer('WRONG')] }) })
    await selectCandidate(wrapper)
    await confirmButton(wrapper).trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('成员A')
    expect(wrapper.text()).not.toContain('成员WRONG')
    expect(wrapper.text()).toContain('请重新读取名单后继续操作')
    expect(wrapper.emitted('change')).toBeUndefined()
    expect(confirmButton(wrapper).attributes('disabled')).toBeDefined()
  })

  it('ignores a late mutation error after task changes', async () => {
    const wrapper = render()
    const pending = deferred<any>()
    api.submit.mockReturnValueOnce(pending.promise)
    await selectCandidate(wrapper)
    await confirmButton(wrapper).trigger('click')
    await wrapper.setProps({ data: snapshot({ task_id: 102, version: 'other', items: [reviewer('Z')] }) })
    pending.reject({ response: { status: 409 } })
    await flushPromises()
    expect(wrapper.text()).toContain('成员Z')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.emitted('change')).toBeUndefined()
    expect(wrapper.get('button[aria-label="邀请 360° 评估人"]').attributes('disabled')).toBeUndefined()
  })

  it('discards a late legacy GET after switching to snapshot readonly context', async () => {
    const pending = deferred<any>()
    api.list.mockReturnValueOnce(pending.promise)
    const wrapper = render({ projectId: 10 })
    await wrapper.setProps({ readonly: true, data: snapshot({ items: [reviewer('Z')] }) })
    pending.resolve(snapshot({ items: [reviewer('LATE')] }))
    await flushPromises()
    expect(wrapper.text()).toContain('成员Z')
    expect(wrapper.text()).not.toContain('成员LATE')
    expect(wrapper.emitted('change')).toBeUndefined()
  })
})
