import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import PerformanceReview360InvitePanel from './PerformanceReview360InvitePanel.vue'
import PerformanceSearchSelect from './PerformanceSearchSelect.vue'
import PerformanceReviewer360InviteBody from './PerformanceReviewer360InviteBody.vue'

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
    props: props as any, attachTo: document.body,
    global: { stubs: { Teleport: true, PerformanceDisabledReason: { props: ['disabled', 'reason'], template: '<span :data-reason="reason"><slot /></span>' } } },
  })
  wrappers.push(wrapper)
  return wrapper
}
async function search(wrapper: ReturnType<typeof mount>, keyword = '候选') {
  await wrapper.get('input[role="combobox"]').setValue(keyword)
  await flushPromises()
}
async function selectCandidate(wrapper: ReturnType<typeof mount>, keyboard = false) {
  await search(wrapper)
  if (keyboard) await wrapper.get('input[role="combobox"]').trigger('keydown', { key: 'Enter' })
  else await wrapper.get('button[role="option"]:not(:disabled)').trigger('click')
}
function reread(wrapper: ReturnType<typeof mount>) { return wrapper.findAll('button').find(button => button.text() === '重新读取名单')! }
beforeEach(() => {
  vi.resetAllMocks()
  api.candidates.mockResolvedValue({ items: [{ employee_no: 'C', display_name: '候选成员', department: '研发组' }], total: 1 })
  api.list.mockResolvedValue(snapshot())
})
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); document.body.innerHTML = '' })

describe('PerformanceReview360InvitePanel', () => {
  it('uses shared two-column body and snapshot without GET, preserves fixed and real relationships/source labels', async () => {
    const wrapper = render({ data: snapshot({ items: [reviewer('A', 'DEFAULT', '直属下级'), reviewer('B', 'SELF', '直属上级'), reviewer('D')] }) })
    expect(wrapper.findComponent(PerformanceReviewer360InviteBody).exists()).toBe(true)
    expect(api.list).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('当前计入邀请额度 1 人，建议至少邀请 3 人（还差 2 人）')
    expect(wrapper.findAll('tr').map(row => row.find('td').text())).toEqual(['不同上级同事', '相同上级同事', '直属下级', '直属上级', '关系未提供'])
    expect(wrapper.find('thead').exists()).toBe(false)
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false)
    expect(wrapper.find('.performance-drawer').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('搜索添加')
    expect(wrapper.text()).not.toContain('确认邀请')
    await wrapper.get('button[role="radio"][aria-checked="false"]').trigger('click')
    expect(wrapper.findAll('tr').map(row => row.find('td').text())).toEqual(['系统默认邀请', '自己邀请', '上级邀请', 'HRBP 或其他人邀请'])
    expect(wrapper.findAll('tr').slice(2).every(row => row.text().includes('暂无人员'))).toBe(true)
    expect(wrapper.emitted('change')).toBeUndefined()
  })

  it('uses server count rather than manual_count for requirements', () => {
    expect(render({ data: snapshot({ total: 5, count: 3, manual_count: 1 }) }).text()).toContain('已满足最少邀请建议（3 人）')
  })

  it.each([false, true])('only searches on input and adds a single explicit candidate with task/version; keyboard=%s', async keyboard => {
    const wrapper = render({ data: snapshot(), projectId: 10, nodeId: 'invite-stage' })
    const pending = deferred<any>()
    api.submit.mockReturnValueOnce(pending.promise)
    await search(wrapper)
    expect(api.candidates).toHaveBeenCalledWith(10, '候选', 101)
    expect(api.submit).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('成员A')
    if (keyboard) await wrapper.get('input[role="combobox"]').trigger('keydown', { key: 'Enter' })
    else await wrapper.get('button[role="option"]').trigger('click')
    expect(api.submit).toHaveBeenCalledWith(10, ['C'], 101, 'roster-v1')
    expect(wrapper.emitted('busy')).toEqual([[true]])
    wrapper.getComponent(PerformanceSearchSelect).vm.$emit('update:modelValue', 'C')
    expect(api.submit).toHaveBeenCalledTimes(1)
    const changed = snapshot({ items: [reviewer('C')], total: 1, version: 'roster-v2' })
    pending.resolve({ reviewer_360: changed, rejected: [] })
    await flushPromises()
    expect(wrapper.emitted('change')).toEqual([[changed]])
    expect(wrapper.emitted('busy')).toEqual([[true], [false]])
    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(wrapper.text()).not.toContain('成员A')
    expect(wrapper.text()).toContain('成员C')
    expect((wrapper.get('input[role="combobox"]').element as HTMLInputElement).value).toBe('')
    api.candidates.mockResolvedValue({ items: [{ employee_no: 'D', display_name: '候选D' }] })
    api.submit.mockResolvedValue({ reviewer_360: snapshot({ version: 'roster-v3' }) })
    await selectCandidate(wrapper)
    expect(api.submit).toHaveBeenLastCalledWith(10, ['D'], 101, 'roster-v2')
  })

  it('cannot add duplicate or arbitrary values and clears stale options on new search', async () => {
    const wrapper = render()
    api.candidates.mockResolvedValue({ items: [{ employee_no: 'A', display_name: '候选A' }] })
    await search(wrapper)
    expect(wrapper.get('button[role="option"]').attributes('disabled')).toBeDefined()
    wrapper.getComponent(PerformanceSearchSelect).vm.$emit('update:modelValue', 'A')
    wrapper.getComponent(PerformanceSearchSelect).vm.$emit('update:modelValue', 'unknown')
    expect(api.submit).not.toHaveBeenCalled()
    const pending = deferred<any>()
    api.candidates.mockReturnValueOnce(pending.promise)
    await wrapper.get('input[role="combobox"]').setValue('新')
    expect(wrapper.find('button[role="option"]').exists()).toBe(false)
    await wrapper.get('input[role="combobox"]').trigger('keydown', { key: 'Enter' })
    expect(api.submit).not.toHaveBeenCalled()
    pending.resolve({ items: [] })
    await flushPromises()
  })

  it.each([
    { readonly: true }, { disabled: true }, { data: snapshot({ can_invite: false }) },
    { data: snapshot({ editable: false }) }, { data: snapshot({ task_id: undefined }) },
    { data: snapshot({ version: undefined }) }, { projectId: 11 },
  ])('denies candidate/write without capabilities: %j', async overrides => {
    const wrapper = render({ data: snapshot(), ...overrides })
    const select = wrapper.findComponent(PerformanceSearchSelect)
    if (select.exists()) {
      expect(select.props('disabled')).toBe(true)
      select.vm.$emit('search', '候选')
      select.vm.$emit('update:modelValue', 'C')
    }
    await flushPromises()
    expect(api.candidates).not.toHaveBeenCalled()
    expect(api.submit).not.toHaveBeenCalled()
    expect(api.list).not.toHaveBeenCalled()
    if (overrides.readonly) expect(wrapper.find('button[aria-label="撤销邀请"]').exists()).toBe(false)
  })

  it('never fetches readonly without snapshot and keeps legacy list readonly', async () => {
    render({ projectId: 10, readonly: true })
    expect(api.list).not.toHaveBeenCalled()
    const legacy = render({ projectId: 10 })
    await flushPromises()
    expect(api.list).toHaveBeenCalledWith(10, undefined, undefined)
    expect(legacy.text()).toContain('成员A')
    expect(legacy.getComponent(PerformanceSearchSelect).props('disabled')).toBe(true)
  })

  it('hides removal for default, completed and other non-revocable reviewers without an operation column', () => {
    const wrapper = render({ data: snapshot({ items: [reviewer('A', 'DEFAULT'), { ...reviewer('B'), status: 'completed' }] }) })
    expect(wrapper.find('button[aria-label^="移除"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('撤销')
    expect(wrapper.findAll('.reviewer-360-content__person').every(person => !person.classes().includes('is-removable'))).toBe(true)
    expect(wrapper.findAll('.reviewer-360-content__person').map(person => person.attributes('title'))).toContain('未开放周期删除授权')
    expect(api.revoke).not.toHaveBeenCalled()
  })

  it('retains roster on mutation error and permits a new explicit selection', async () => {
    const wrapper = render()
    api.submit.mockRejectedValue({ response: { status: 500 } })
    await selectCandidate(wrapper)
    await flushPromises()
    expect(wrapper.text()).toContain('成员A')
    expect(wrapper.text()).toContain('邀请失败，请稍后重试')
    expect(wrapper.emitted('change')).toBeUndefined()
    expect(wrapper.emitted('busy')).toEqual([[true], [false]])
    await selectCandidate(wrapper)
    expect(api.submit).toHaveBeenCalledTimes(2)
  })

  it('requires explicit reread after 409, retaining roster through failed reread', async () => {
    const wrapper = render()
    api.submit.mockRejectedValue({ response: { status: 409 } })
    await selectCandidate(wrapper)
    await flushPromises()
    expect(wrapper.text()).toContain('名单已变化，请重新读取名单后再操作')
    expect(api.list).not.toHaveBeenCalled()
    expect(api.submit).toHaveBeenCalledTimes(1)
    expect(wrapper.getComponent(PerformanceSearchSelect).props('disabled')).toBe(true)
    api.list.mockRejectedValueOnce(new Error('offline'))
    await reread(wrapper).trigger('click')
    await flushPromises()
    expect(api.list).toHaveBeenCalledWith(10, undefined, 101)
    expect(wrapper.text()).toContain('成员A')
    expect(wrapper.text()).toContain('加载失败，请重试')
    api.list.mockResolvedValueOnce(snapshot({ version: 'latest' }))
    await reread(wrapper).trigger('click')
    await flushPromises()
    expect(wrapper.emitted('change')?.[0]?.[0]).toMatchObject({ version: 'latest' })
    expect(wrapper.getComponent(PerformanceSearchSelect).props('disabled')).toBe(false)
  })

  it('distinguishes candidate failure and supports retry', async () => {
    const wrapper = render()
    api.candidates.mockRejectedValueOnce(new Error('offline'))
    await search(wrapper)
    expect(wrapper.text()).toContain('成员加载失败，请重试')
    expect(wrapper.text()).not.toContain('暂无可以邀请的成员')
    await wrapper.findAll('button').find(button => button.text() === '重试')!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('候选成员')
    expect(api.candidates).toHaveBeenCalledTimes(2)
  })

  it('discards late search and closed-popup results', async () => {
    const wrapper = render()
    const first = deferred<any>()
    api.candidates.mockReturnValueOnce(first.promise)
    await search(wrapper)
    await search(wrapper, '新')
    first.resolve({ items: [{ employee_no: 'old', display_name: '迟到候选' }] })
    await flushPromises()
    expect(wrapper.text()).not.toContain('迟到候选')
    const late = deferred<any>()
    api.candidates.mockReturnValueOnce(late.promise)
    await search(wrapper)
    await wrapper.get('input[role="combobox"]').trigger('keydown', { key: 'Escape' })
    late.resolve({ items: [{ employee_no: 'old', display_name: '迟到候选' }] })
    await flushPromises()
    expect(wrapper.getComponent(PerformanceSearchSelect).props('options')).toEqual([])
  })

  it.each([{ data: snapshot({ task_id: 102, version: 'other', items: [reviewer('Z')] }) }, { readonly: true }])('discards candidate and mutation after context change: %j', async changedProps => {
    const wrapper = render()
    const pending = deferred<any>()
    api.submit.mockReturnValueOnce(pending.promise)
    await selectCandidate(wrapper)
    await wrapper.setProps(changedProps)
    pending.resolve({ reviewer_360: snapshot({ items: [reviewer('LATE')], version: 'late' }) })
    await flushPromises()
    expect(wrapper.text()).not.toContain('成员LATE')
    expect(wrapper.emitted('change')).toBeUndefined()
    expect(wrapper.emitted('busy')).toEqual([[true], [false]])
  })

  it('rejects mutation response from a different task', async () => {
    const wrapper = render()
    api.submit.mockResolvedValue({ reviewer_360: snapshot({ task_id: 999, items: [reviewer('WRONG')] }) })
    await selectCandidate(wrapper)
    await flushPromises()
    expect(wrapper.text()).toContain('成员A')
    expect(wrapper.text()).not.toContain('成员WRONG')
    expect(wrapper.text()).toContain('请重新读取名单后继续操作')
    expect(wrapper.emitted('change')).toBeUndefined()
  })

  it('ignores late mutation failure after task switch', async () => {
    const wrapper = render()
    const pending = deferred<any>()
    api.submit.mockReturnValueOnce(pending.promise)
    await selectCandidate(wrapper)
    await wrapper.setProps({ data: snapshot({ task_id: 102, version: 'other', items: [reviewer('Z')] }) })
    pending.reject({ response: { status: 409 } })
    await flushPromises()
    expect(wrapper.text()).toContain('成员Z')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.getComponent(PerformanceSearchSelect).props('disabled')).toBe(false)
  })

  it('maps all manual inviters into the fixed four groups and never invents dotted-manager relationships', async () => {
    const wrapper = render({ data: snapshot({ items: [reviewer('A', 'DEFAULT'), reviewer('B'), { ...reviewer('C', 'MANAGER'), source_label: '直属领导添加', inviter_ref: 'manager' }, { ...reviewer('D', 'MANUAL'), source_label: 'HRBP邀请', inviter_ref: 'hrbp' }] }) })
    expect(wrapper.text()).not.toContain('虚线上级')
    await wrapper.get('button[role="radio"][aria-checked="false"]').trigger('click')
    expect(wrapper.findAll('tr').map(row => row.get('.member-name').text())).toEqual(['成员A', '成员B', '成员C', '成员D'])
  })

  it('accepts the limit-reaching roster even when can_invite becomes false and parent echoes props', async () => {
    const wrapper = render({ data: snapshot({ count: 1, maximum_invited_count: 8, second_prompt_enabled: true, second_prompt_count: 2, second_prompt_mode: 'LIMIT' }) })
    const changed = snapshot({ count: 2, total: 3, maximum_invited_count: 8, second_prompt_enabled: true, second_prompt_count: 2, second_prompt_mode: 'LIMIT', effective_limit: 2, can_invite: false, version: 'limit-v2', items: [reviewer('A', 'DEFAULT'), reviewer('B'), { ...reviewer('C'), can_revoke: true, is_draft: true }] })
    api.submit.mockResolvedValue({ reviewer_360: changed })
    await selectCandidate(wrapper)
    await flushPromises()
    await wrapper.setProps({ data: changed })
    expect(wrapper.emitted('change')).toEqual([[changed]])
    expect(wrapper.getComponent(PerformanceSearchSelect).props('disabled')).toBe(true)
    expect(wrapper.get('[role="alertdialog"]').text()).toContain('已达360°评估人邀请数量上限')
    expect(wrapper.get('[role="alertdialog"]').text()).toContain('最多可邀请 2 位360°评估人')
    expect(wrapper.get('[role="alertdialog"]').text()).toContain('不包含系统默认邀请')
    expect(wrapper.get('[role="alertdialog"]').findAll('button').map(button => button.text())).toEqual(['我知道了'])
    await wrapper.get('[role="alertdialog"] button').trigger('click')
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false)
    expect(wrapper.find('button[aria-label="移除成员C"]').exists()).toBe(true)
  })

  it('blocks already reached hard limits including secondary limits but never blocks SUGGESTED quotas', async () => {
    const limited = render({ data: snapshot({ count: 2, maximum_invited_count: 8, second_prompt_enabled: true, second_prompt_count: 2, second_prompt_mode: 'LIMIT' }) })
    expect(limited.getComponent(PerformanceSearchSelect).props('disabled')).toBe(true)
    expect(limited.text()).toContain('最多可邀请 2 人')
    expect(limited.find('[role="alertdialog"]').exists()).toBe(false)
    const suggested = render({ data: snapshot({ count: 9, maximum_invited_count: 2, maximum_invite_mode: 'SUGGESTED', second_prompt_enabled: true, second_prompt_count: 3, second_prompt_mode: 'SUGGESTED' }) })
    expect(suggested.getComponent(PerformanceSearchSelect).props('disabled')).toBe(false)
    api.submit.mockResolvedValue({ reviewer_360: snapshot({ count: 10, version: 'suggested-v2', maximum_invite_mode: 'SUGGESTED', maximum_invited_count: 2 }) })
    await selectCandidate(suggested)
    await flushPromises()
    expect(api.submit).toHaveBeenCalledTimes(1)
    expect(suggested.find('[role="alertdialog"]').exists()).toBe(false)
  })

  it('removes only a server-authorized tag with task/version and releases a full quota', async () => {
    const row = { ...reviewer('B'), can_revoke: true, is_draft: true }
    const wrapper = render({ data: snapshot({ count: 1, maximum_invited_count: 1, can_invite: false, items: [reviewer('A', 'DEFAULT'), row] }) })
    const changed = snapshot({ count: 0, total: 1, items: [reviewer('A', 'DEFAULT')], version: 'revoke-v2' })
    const pending = deferred<any>()
    api.revoke.mockReturnValue(pending.promise)
    expect(wrapper.findAll('.is-removable')).toHaveLength(1)
    await wrapper.get('button[aria-label="移除成员B"]').trigger('click')
    expect(api.revoke).toHaveBeenCalledWith(10, 'B', 101, 'roster-v1')
    expect(wrapper.emitted('busy')).toEqual([[true]])
    expect(wrapper.get('button[aria-label="移除成员B"]').attributes('disabled')).toBeDefined()
    pending.resolve({ revoked: 'B', reviewer_360: changed })
    await flushPromises()
    expect(wrapper.text()).not.toContain('成员B')
    expect(wrapper.emitted('change')).toEqual([[changed]])
    expect(wrapper.emitted('busy')).toEqual([[true], [false]])
    expect(wrapper.getComponent(PerformanceSearchSelect).props('disabled')).toBe(false)
    expect(api.submit).not.toHaveBeenCalled()
  })

  it.each([409, 500])('keeps the tag after revoke failure %s and requires reread only for conflicts', async status => {
    const wrapper = render({ data: snapshot({ items: [{ ...reviewer('B'), can_revoke: true, is_draft: true }] }) })
    api.revoke.mockRejectedValue({ response: { status } })
    await wrapper.get('button[aria-label="移除成员B"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('成员B')
    expect(wrapper.emitted('change')).toBeUndefined()
    expect(wrapper.getComponent(PerformanceSearchSelect).props('disabled')).toBe(status === 409)
    expect(wrapper.text()).toContain(status === 409 ? '本次操作未自动重试' : '移除失败，请稍后重试')
  })

  it('keeps real search readonly and hides removable controls even when a snapshot has write flags', () => {
    const wrapper = render({ readonly: true, data: snapshot({ items: [{ ...reviewer('B'), can_revoke: true }] }) })
    expect(wrapper.get('input[role="combobox"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.invite-panel__remove').exists()).toBe(false)
    expect(wrapper.find('.is-removable').exists()).toBe(false)
  })

  it('ignores a late revoke after switching task context', async () => {
    const wrapper = render({ data: snapshot({ items: [{ ...reviewer('B'), can_revoke: true }] }) })
    const pending = deferred<any>()
    api.revoke.mockReturnValue(pending.promise)
    await wrapper.get('button[aria-label="移除成员B"]').trigger('click')
    await wrapper.setProps({ data: snapshot({ task_id: 102, items: [reviewer('Z')] }) })
    pending.resolve({ reviewer_360: snapshot({ version: 'late', items: [] }) })
    await flushPromises()
    expect(wrapper.text()).toContain('成员Z')
    expect(wrapper.emitted('change')).toBeUndefined()
    expect(wrapper.emitted('busy')).toEqual([[true], [false]])
  })

  it('discards legacy GET after snapshot/readonly switch', async () => {
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
