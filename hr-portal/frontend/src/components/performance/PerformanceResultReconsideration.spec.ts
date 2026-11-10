import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { projectManagementApi, type PerformanceReconsiderationStatus } from '@/api/performance'
import Panel from './PerformanceResultReconsideration.vue'
import Menu from './PerformanceResultReconsiderationMenu.vue'

const state = (overrides: Partial<PerformanceReconsiderationStatus> = {}): PerformanceReconsiderationStatus => ({ id: null, version: null, node_id: 'appeal', window_open: true, can_submit: true, can_edit: false, can_withdraw: false, deadline_at: '2099-11-11T10:00:00Z', withdrawn_at: null, prompt: '模板配置提示文案', instruction: '模板配置填写说明', handler_label: 'HRBP', reason: null, submitted_at: null, ...overrides })
const submitted = () => state({ id: 1, version: 2, can_submit: false, can_edit: true, can_withdraw: true, reason: '<p>原理由</p>', submitted_at: '2026-11-10T08:00:00Z' })
const mountPanel = (status = state(), expired = false) => mount(Panel, { props: { projectId: 1, status, expired, loading: false, loadError: '' } })
afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = '' })

describe('employee result reconsideration', () => {
  it('hides the menu after submission and restores it only after withdrawal before deadline', async () => {
    const wrapper = mount(Menu, { props: { status: state(), expired: false } })
    await wrapper.get('.reconsideration-menu').trigger('mouseenter')
    expect(wrapper.get('[role="menu"]').text()).toContain('2099-11-11 18:00（GMT+8）')
    await wrapper.get('[role="menuitem"]').trigger('click')
    expect(wrapper.emitted('start')).toHaveLength(1)
    await wrapper.setProps({ status: submitted() })
    expect(wrapper.find('.reconsideration-menu').exists()).toBe(false)
    await wrapper.setProps({ status: { ...submitted(), submitted_at: null, withdrawn_at: '2026-11-10T09:00:00Z', can_submit: true } })
    expect(wrapper.find('.reconsideration-menu').exists()).toBe(true)
    await wrapper.setProps({ expired: true })
    expect(wrapper.find('button').exists()).toBe(false)
    wrapper.unmount()
  })

  it('uses the captured 12px EditOutlined and RedoOutlined SVGs with inherited colors', () => {
    const wrapper = mountPanel(submitted())
    for (const name of ['EditOutlined', 'RedoOutlined']) {
      const icon = wrapper.get(`.reconsideration-banner__actions svg[data-icon="${name}"]`)
      expect(icon.attributes('width')).toBe('12')
      expect(icon.attributes('height')).toBe('12')
      expect(icon.attributes('viewBox')).toBe('0 0 24 24')
      expect(icon.get('path').attributes('fill')).toBe('currentColor')
      expect(icon.get('path').attributes('d')).toContain(name === 'EditOutlined' ? 'm17.57 7.244' : 'M15.293 2.293')
    }
    expect(wrapper.text()).not.toMatch(/[✎↶]/)
    wrapper.unmount()
  })

  it('submits rich text using the configured prompt and placeholder without changing result data', async () => {
    const submit = vi.spyOn(projectManagementApi, 'submitResultReconsideration').mockResolvedValue(submitted())
    const wrapper = mountPanel()
    wrapper.vm.open()
    await flushPromises()
    expect(document.body.textContent).toContain('模板配置提示文案')
    const input = document.body.querySelector<HTMLElement>('.rich-input')!
    expect(input.dataset.placeholder).toBe('模板配置填写说明')
    expect(document.body.querySelector<HTMLButtonElement>('.reconsideration-footer .performance-button--primary')!.disabled).toBe(true)
    input.innerHTML = '<p><strong>事实依据</strong></p>'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    document.body.querySelector<HTMLButtonElement>('.reconsideration-footer .performance-button--primary')!.click()
    await flushPromises()
    expect(submit).toHaveBeenCalledWith(1, expect.stringMatching(/<strong>.*事实依据.*<\/strong>/), null)
    expect(wrapper.emitted('updated')?.[0]).toEqual([submitted()])
    wrapper.unmount()
  })

  it('edits the existing application without posting a new submission', async () => {
    const edit = vi.spyOn(projectManagementApi, 'editResultReconsideration').mockResolvedValue({ ...submitted(), version: 3 })
    const submit = vi.spyOn(projectManagementApi, 'submitResultReconsideration')
    const wrapper = mountPanel(submitted())
    await wrapper.get('.reconsideration-banner__actions button').trigger('click')
    await flushPromises()
    expect(document.body.querySelector('.rich-input')?.textContent).toContain('原理由')
    document.body.querySelector<HTMLButtonElement>('.reconsideration-footer .performance-button--primary')!.click()
    await flushPromises()
    expect(edit).toHaveBeenCalledWith(1, '<p>原理由</p>', 2)
    expect(submit).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('allows withdrawing after deadline, cancel preserves the banner, success hides it', async () => {
    const withdrawn = state({ id: 1, version: 3, window_open: false, can_submit: false, withdrawn_at: '2026-11-12T08:00:00Z' })
    const withdraw = vi.spyOn(projectManagementApi, 'withdrawResultReconsideration').mockResolvedValue(withdrawn)
    const wrapper = mountPanel({ ...submitted(), window_open: false, can_edit: false }, true)
    expect(wrapper.get('.reconsideration-banner__actions button').attributes('disabled')).toBeDefined()
    await wrapper.get('.reconsideration-banner__actions button:last-child').trigger('click')
    await flushPromises()
    expect(document.body.textContent).toContain('是否确定撤回？')
    document.body.querySelector<HTMLButtonElement>('.performance-confirm-dialog__button--cancel')!.click()
    await flushPromises()
    expect(withdraw).not.toHaveBeenCalled()
    expect(wrapper.find('.reconsideration-banner').exists()).toBe(true)
    await wrapper.get('.reconsideration-banner__actions button:last-child').trigger('click')
    await flushPromises()
    document.body.querySelector<HTMLButtonElement>('.performance-confirm-dialog__button--danger')!.click()
    await flushPromises()
    expect(withdraw).toHaveBeenCalledWith(1, 2)
    await wrapper.setProps({ status: withdrawn })
    expect(wrapper.find('.reconsideration-banner').exists()).toBe(false)
    wrapper.unmount()
  })

  it('preserves input on conflicts, refreshes state, and never silently overwrites the new version', async () => {
    const conflict = { response: { data: { detail: 'VERSION_CONFLICT' }, status: 409 } }
    const edit = vi.spyOn(projectManagementApi, 'editResultReconsideration').mockRejectedValue(conflict)
    vi.spyOn(projectManagementApi, 'resultReconsideration').mockResolvedValue({ ...submitted(), version: 3 })
    const wrapper = mountPanel(submitted())
    wrapper.vm.open(true)
    await flushPromises()
    document.body.querySelector<HTMLButtonElement>('.reconsideration-footer .performance-button--primary')!.click()
    await flushPromises()
    expect(document.body.textContent).toContain('当前输入已保留')
    expect(document.body.querySelector('.rich-input')?.textContent).toContain('原理由')
    expect(edit).toHaveBeenCalledWith(1, '<p>原理由</p>', 2)
    wrapper.unmount()
  })

  it('does not close or lose the banner when withdrawal fails', async () => {
    vi.spyOn(projectManagementApi, 'withdrawResultReconsideration').mockRejectedValue(new Error('offline'))
    vi.spyOn(projectManagementApi, 'resultReconsideration').mockRejectedValue(new Error('offline'))
    const wrapper = mountPanel(submitted())
    await wrapper.get('.reconsideration-banner__actions button:last-child').trigger('click')
    await flushPromises()
    document.body.querySelector<HTMLButtonElement>('.performance-confirm-dialog__button--danger')!.click()
    await flushPromises()
    expect(wrapper.find('.reconsideration-banner').exists()).toBe(true)
    expect(document.body.textContent).toContain('操作失败，请稍后重试')
    wrapper.unmount()
  })

  it('honors backend action permissions even before deadline', async () => {
    const edit = vi.spyOn(projectManagementApi, 'editResultReconsideration')
    const withdraw = vi.spyOn(projectManagementApi, 'withdrawResultReconsideration')
    const wrapper = mountPanel({ ...submitted(), can_edit: false, can_withdraw: false })
    expect(wrapper.findAll('.reconsideration-banner__actions button').every(button => button.attributes('disabled') !== undefined)).toBe(true)
    wrapper.vm.open(true)
    await flushPromises()
    expect(document.body.querySelector('.performance-dialog')).toBeNull()
    expect(edit).not.toHaveBeenCalled()
    expect(withdraw).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('reuses the withdrawn application version when submitting again', async () => {
    const submit = vi.spyOn(projectManagementApi, 'submitResultReconsideration').mockResolvedValue({ ...submitted(), version: 4 })
    const wrapper = mountPanel(state({ id: 1, version: 3, withdrawn_at: '2026-11-10T09:00:00Z' }))
    wrapper.vm.open()
    await flushPromises()
    const input = document.body.querySelector<HTMLElement>('.rich-input')!
    input.textContent = '重新发起的事实依据'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    document.body.querySelector<HTMLButtonElement>('.reconsideration-footer .performance-button--primary')!.click()
    await flushPromises()
    expect(submit).toHaveBeenCalledWith(1, expect.stringContaining('重新发起的事实依据'), 3)
    wrapper.unmount()
  })

  it('shows a retry instead of an actionable entry when status loading fails', async () => {
    const wrapper = mountPanel()
    await wrapper.setProps({ loading: true })
    expect(wrapper.text()).toContain('正在加载复议状态')
    await wrapper.setProps({ loading: false, loadError: '复议状态加载失败，请重试' })
    expect(wrapper.find('.reconsideration-banner').exists()).toBe(false)
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
    wrapper.unmount()
  })

  it('closes the save window even if deadline passes with an editor open', async () => {
    const submit = vi.spyOn(projectManagementApi, 'submitResultReconsideration')
    const wrapper = mountPanel()
    wrapper.vm.open()
    await flushPromises()
    await wrapper.setProps({ expired: true })
    expect(document.body.querySelector<HTMLButtonElement>('.reconsideration-footer .performance-button--primary')!.disabled).toBe(true)
    expect(submit).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
