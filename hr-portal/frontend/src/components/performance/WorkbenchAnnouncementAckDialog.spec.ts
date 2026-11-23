import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import WorkbenchAnnouncementAckDialog from './WorkbenchAnnouncementAckDialog.vue'
import UiDialogShell from '@/components/ui/UiDialogShell.vue'

const announcement = { id: 7, title: '绩效公告', title_en: 'Performance notice', link: '/performance/review?entry=results', link_en: '/en/performance', description: '请认真阅读\n绩效安排', description_en: 'Please read', image_id: null, cycle_label: '所有周期', require_ack: true, acknowledged: false, display_order: 0, updated_at: '2026-11-23T00:00:00Z' }
const wrappers: ReturnType<typeof mount>[] = []
function mountDialog(props = {}) {
  const wrapper = mount(WorkbenchAnnouncementAckDialog, { props: { announcement, ...props }, attachTo: document.body })
  wrappers.push(wrapper)
  return wrapper
}
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); document.body.innerHTML = ''; vi.restoreAllMocks() })
const dialog = () => document.body.querySelector<HTMLElement>('[role="dialog"]')!
const button = (className: string) => document.body.querySelector<HTMLButtonElement>(className)!

describe('WorkbenchAnnouncementAckDialog', () => {
  it('显示正文并以原始链接新开详情，访问详情不等于知悉', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const wrapper = mountDialog()
    await flushPromises()
    expect(dialog().textContent).toContain('绩效公告')
    expect(dialog().textContent).toContain('请认真阅读\n绩效安排')
    button('.announcement-details').click()
    expect(open).toHaveBeenCalledWith(announcement.link, '_blank', 'noopener,noreferrer')
    expect(wrapper.emitted('acknowledge')).toBeUndefined()
    button('.announcement-acknowledge').click()
    expect(wrapper.emitted('acknowledge')).toHaveLength(1)
  })

  it('禁止关闭并将Tab、反向Tab及外部焦点约束在弹窗内', async () => {
    const wrapper = mountDialog()
    await flushPromises()
    const panel = dialog()
    expect(panel.querySelector('[aria-label="关闭"]')).toBeNull()
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    document.body.querySelector('.performance-dialog-overlay')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(dialog()).toBe(panel)
    expect(wrapper.getComponent(UiDialogShell).props('dismissible')).toBe(false)
    expect(wrapper.getComponent(UiDialogShell).emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.getComponent(UiDialogShell).emitted('close')).toBeUndefined()
    const first = button('.announcement-details'), last = button('.announcement-acknowledge')
    last.focus()
    last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
    expect(document.activeElement).toBe(first)
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }))
    expect(document.activeElement).toBe(last)
    const outside = document.createElement('button')
    document.body.append(outside)
    outside.focus()
    expect(document.activeElement).toBe(panel)
  })

  it('提交中禁用操作，失败后保留内容并支持再次确认', async () => {
    const wrapper = mountDialog({ submitting: true })
    await flushPromises()
    expect(button('.announcement-acknowledge').disabled).toBe(true)
    expect(button('.announcement-details').disabled).toBe(true)
    button('.announcement-acknowledge').click()
    expect(wrapper.emitted('acknowledge')).toBeUndefined()
    await wrapper.setProps({ submitting: false, error: '知悉失败，请重试' })
    expect(dialog().querySelector('[role="alert"]')?.textContent).toBe('知悉失败，请重试')
    expect(button('.announcement-acknowledge').textContent).toContain('重试知悉')
    button('.announcement-acknowledge').click()
    expect(wrapper.emitted('acknowledge')).toHaveLength(1)
  })

  it('图片失败显示占位并请求重试，替换图片后恢复', async () => {
    const wrapper = mountDialog({ announcement: { ...announcement, image_id: 2 }, imageUrl: 'blob:notice' })
    await flushPromises()
    dialog().querySelector('img')!.dispatchEvent(new Event('error'))
    await flushPromises()
    expect(dialog().textContent).toContain('图片加载失败')
    dialog().querySelector<HTMLButtonElement>('.announcement-image-placeholder button')!.click()
    expect(wrapper.emitted('retryImage')).toHaveLength(1)
    await wrapper.setProps({ imageUrl: 'blob:retry' })
    expect(dialog().querySelector('img')?.getAttribute('src')).toBe('blob:retry')
  })

  it('支持英文正文和缺省中文回退', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const wrapper = mountDialog({ language: 'en-US' })
    await flushPromises()
    expect(dialog().textContent).toContain('Performance notice')
    expect(dialog().textContent).toContain('Please read')
    button('.announcement-details').click()
    expect(open).toHaveBeenCalledWith('/en/performance', '_blank', 'noopener,noreferrer')
    await wrapper.setProps({ announcement: { ...announcement, title_en: '', description_en: '', link_en: '' } })
    expect(dialog().textContent).toContain('绩效公告')
    button('.announcement-details').click()
    expect(open).toHaveBeenLastCalledWith(announcement.link, '_blank', 'noopener,noreferrer')
  })
})
