import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ElMessage } from 'element-plus'
import { useUserStore } from '@/stores/user'
import OtherSettings from './OtherSettings.vue'
import PerformanceReviewer360TagsDialog from '@/components/performance/PerformanceReviewer360TagsDialog.vue'
import cardSource from '@/components/performance/PerformanceAuthorizationTransferCard.vue?raw'
import routerSource from '@/router/index.ts?raw'

const message = vi.hoisted(() => ({ info: vi.fn(), success: vi.fn(), error: vi.fn() }))
const api = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn() }))
const tagsApi = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn() }))

vi.mock('element-plus', () => ({ ElMessage: message }))
vi.mock('@/api/performance', () => ({ performanceOtherSettingsApi: api, performanceReviewer360TagsApi: tagsApi }))

const defaults = {
  calibration_authorization_outside_direct_reports_enabled: true,
  calibration_import_enabled: true,
  performance_coefficient_enabled: false,
  reviewer_360_tags_enabled: true,
  manual_result_opening_enabled: true,
  overdue_single_submission_enabled: true,
  overdue_voluntary_360_submission_enabled: false,
  cycle_overdue_submission_override_enabled: false,
}
const keys = Object.keys(defaults) as (keyof typeof defaults)[]

function mountPage(canUpdate = true, accessible = true) {
  const pinia = createPinia()
  setActivePinia(pinia)
  useUserStore().menus = accessible ? [{
    id: 1, code: 'performance.admin', label: '绩效后台', parent_id: null, order: 0,
    icon: null, can_create: false, can_update: canUpdate, can_delete: false,
    can_export: false, scope_dimension: 'all',
  }] : []
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/performance/settings/cycles', name: 'PerformanceCycles', component: { template: '<div />' } }] })
  return mount(OtherSettings, { global: { plugins: [pinia, router], stubs: { Teleport: true } } })
}

describe('Reviewer360TagsDialog', () => {
  const tag = (name: string) => ({ id: crypto.randomUUID(), name_zh: name, name_en: '', description_zh: '', description_en: '' })
  function mountDialog(tags = [tag('同事'), tag('合作伙伴')]) {
    return mount(PerformanceReviewer360TagsDialog, { props: { modelValue: true, tags, version: 3 }, global: { stubs: { Teleport: true } } })
  }

  it('reuses dialog, buttons, fields and sorting; adds/removes draft rows without mutating saved tags', async () => {
    const tags = [tag('同事')]
    const wrapper = mountDialog(tags)
    expect(wrapper.get('[role="dialog"] h2').text()).toBe('编辑 360° 评估人标签')
    expect(wrapper.findAll('[data-drag-handle]')).toHaveLength(0)
    expect(wrapper.findAll('.performance-text-field')).toHaveLength(2)
    await wrapper.get('button[aria-label="添加标签"]').trigger('click')
    expect(wrapper.findAll('[data-drag-handle]')).toHaveLength(2)
    await wrapper.get('input[aria-label="第2个标签中文名称"]').setValue('下属')
    expect(tags).toHaveLength(1)
    await wrapper.get('button[aria-label="删除第1个标签"]').trigger('click')
    expect(wrapper.get<HTMLInputElement>('input').element.value).toBe('下属')
    await wrapper.get('button[aria-label="删除第1个标签"]').trigger('click')
    expect(wrapper.findAll('.reviewer-tag-row')).toHaveLength(0)
    await wrapper.get('.reviewer-tags-actions button:last-child').trigger('click')
    expect(wrapper.emitted('confirm')?.[0]).toEqual([{ tags: [], version: 3 }])
    wrapper.unmount()
  })

  it('keeps stable IDs and commits keyboard sorting, while Escape cancels only the active drag', async () => {
    const tags = [tag('同事'), tag('合作伙伴')]
    const wrapper = mountDialog(tags)
    await wrapper.get('[data-drag-handle]').trigger('keydown', { key: ' ' })
    await wrapper.get('[data-drag-handle]').trigger('keydown', { key: 'ArrowDown' })
    await wrapper.get('[data-drag-handle]').trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    await wrapper.get('[data-drag-handle]').trigger('keydown', { key: ' ' })
    await wrapper.get('[data-drag-handle]').trigger('keydown', { key: 'ArrowDown' })
    await wrapper.get('[data-drag-handle]').trigger('keydown', { key: 'Enter' })
    await wrapper.get('.reviewer-tags-actions button:last-child').trigger('click')
    expect((wrapper.emitted('confirm')![0][0] as { tags: typeof tags }).tags.map(value => value.id)).toEqual([tags[1].id, tags[0].id])
    expect(tags.map(value => value.name_zh)).toEqual(['同事', '合作伙伴'])
    wrapper.unmount()
  })

  it('validates blank/duplicate names, preserves bilingual drafts and trims names only', async () => {
    const wrapper = mountDialog([tag('同事'), tag('同事')])
    await wrapper.get('.reviewer-tags-actions button:last-child').trigger('click')
    expect(wrapper.text()).toContain('中文名称不能重复')
    expect(wrapper.emitted('confirm')).toBeUndefined()
    await wrapper.get('input[aria-label="第2个标签中文名称"]').setValue('  下属  ')
    await wrapper.get('button[aria-label="展开多语言设置"]').trigger('click')
    await wrapper.get('input[aria-label="第2个标签英文名称"]').setValue('  Reports  ')
    await wrapper.get('input[aria-label="第2个标签英文描述"]').setValue(' detail ')
    await wrapper.get('button[aria-label="收起多语言设置"]').trigger('click')
    await wrapper.get('.reviewer-tags-actions button:last-child').trigger('click')
    expect((wrapper.emitted('confirm')![0][0] as any).tags[1]).toMatchObject({ name_zh: '下属', name_en: 'Reports', description_en: ' detail ' })
    wrapper.unmount()
  })

  it('rejects Unicode limits and blank names, allowing boundary values', async () => {
    const wrapper = mountDialog([tag('')])
    const confirm = () => wrapper.get('.reviewer-tags-actions button:last-child').trigger('click')
    await confirm()
    expect(wrapper.text()).toContain('请输入中文名称')
    await wrapper.get('input[aria-label="第1个标签中文名称"]').setValue('😀'.repeat(101))
    await confirm()
    expect(wrapper.text()).toContain('中文名称不能超过100个字符')
    await wrapper.get('input[aria-label="第1个标签中文名称"]').setValue('😀'.repeat(100))
    await wrapper.get('input[aria-label="第1个标签中文描述"]').setValue('字'.repeat(501))
    await confirm()
    expect(wrapper.text()).toContain('中文描述不能超过500个字符')
    await wrapper.get('input[aria-label="第1个标签中文描述"]').setValue('字'.repeat(500))
    await confirm()
    expect(wrapper.emitted('confirm')).toHaveLength(1)
    wrapper.unmount()
  })

  it('locks saving operations and retains failed drafts until cancel/reopen resets them', async () => {
    const original = tag('同事')
    const wrapper = mountDialog([original])
    await wrapper.get('input').setValue('草稿')
    await wrapper.setProps({ saving: true })
    expect(wrapper.findAll<HTMLButtonElement>('button').every(button => button.element.disabled)).toBe(true)
    expect(wrapper.findAll<HTMLInputElement>('input').every(input => input.element.disabled)).toBe(true)
    await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    await wrapper.setProps({ saving: false, saveError: '保存失败' })
    expect(wrapper.get('[role="alert"]').text()).toBe('保存失败')
    expect(wrapper.get<HTMLInputElement>('input').element.value).toBe('草稿')
    await wrapper.get('button[aria-label="关闭"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false])
    await wrapper.setProps({ modelValue: false })
    await wrapper.setProps({ modelValue: true, saveError: '' })
    expect(wrapper.get<HTMLInputElement>('input').element.value).toBe('同事')
    wrapper.unmount()
  })
})

describe('OtherSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    let tagsStored = { tags: [] as { id: string; name_zh: string; name_en: string; description_zh: string; description_en: string }[], version: 0 }
    tagsApi.get.mockImplementation(async () => structuredClone(tagsStored))
    tagsApi.update.mockImplementation(async payload => { tagsStored = { tags: structuredClone(payload.tags), version: tagsStored.version + 1 }; return structuredClone(tagsStored) })
    let stored = { ...defaults }
    api.get.mockImplementation(async () => ({ ...stored }))
    api.update.mockImplementation(async payload => {
      stored = { ...stored, ...payload }
      return { ...stored }
    })
  })

  it('opens tag management and persists only the ordered directory/version, then reloads on remount', async () => {
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.get('button[aria-label="设置 360° 评估人标签"]').trigger('click')
    await wrapper.get('button[aria-label="添加标签"]').trigger('click')
    await wrapper.get('input[aria-label="第1个标签中文名称"]').setValue('同事')
    await wrapper.get('.reviewer-tags-actions button:last-child').trigger('click')
    await flushPromises()
    expect(tagsApi.update).toHaveBeenCalledWith({ tags: [expect.objectContaining({ name_zh: '同事' })], version: 0 })
    expect(api.update).not.toHaveBeenCalled()
    expect(wrapper.get('.settings-360__list').text()).toBe('同事')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    wrapper.unmount()
    const reopened = mountPage()
    await flushPromises()
    await reopened.get('button[aria-label="设置 360° 评估人标签"]').trigger('click')
    expect(reopened.get<HTMLInputElement>('input[aria-label="第1个标签中文名称"]').element.value).toBe('同事')
    reopened.unmount()
  })

  it('keeps tags disabled on load failure and reloads without affecting other settings', async () => {
    tagsApi.get.mockRejectedValueOnce(new Error('offline'))
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.get('.settings-360__error').text()).toContain('标签加载失败')
    expect(wrapper.get<HTMLButtonElement>('button[aria-label="设置 360° 评估人标签"]').element.disabled).toBe(true)
    await wrapper.get('.settings-360__error button').trigger('click')
    await flushPromises()
    expect(wrapper.find('.settings-360__error').exists()).toBe(false)
    expect(wrapper.get<HTMLButtonElement>('button[aria-label="设置 360° 评估人标签"]').element.disabled).toBe(false)
    expect(api.update).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('retains conflicted tag drafts and reloads the latest directory after closing', async () => {
    tagsApi.update.mockRejectedValueOnce({ response: { status: 409 } })
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.get('button[aria-label="设置 360° 评估人标签"]').trigger('click')
    await wrapper.get('button[aria-label="添加标签"]').trigger('click')
    await wrapper.get('input[aria-label="第1个标签中文名称"]').setValue('冲突草稿')
    await wrapper.get('.reviewer-tags-actions button:last-child').trigger('click')
    await flushPromises()
    expect(wrapper.get('.reviewer-tags-error').text()).toContain('关闭并重新打开')
    expect(wrapper.get<HTMLInputElement>('input[aria-label="第1个标签中文名称"]').element.value).toBe('冲突草稿')
    expect(message.success).not.toHaveBeenCalled()
    tagsApi.get.mockResolvedValueOnce({ tags: [{ id: crypto.randomUUID(), name_zh: '最新标签', name_en: '', description_zh: '', description_en: '' }], version: 2 })
    await wrapper.get('button[aria-label="关闭"]').trigger('click')
    await flushPromises()
    await wrapper.get('button[aria-label="设置 360° 评估人标签"]').trigger('click')
    expect(wrapper.get<HTMLInputElement>('input[aria-label="第1个标签中文名称"]').element.value).toBe('最新标签')
    wrapper.unmount()
  })

  it('renders all seven captured cards in order', async () => {
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.get('h1').text()).toBe('其他设置')
    expect(wrapper.findAll('h2').map(title => title.text())).toEqual([
      '授权和转交设置（不含校准）', '授权校准设置', '校准导入设置', '绩效系数设置',
      '360˚ 评估设置', '手动开通绩效结果', '任务逾期限制',
    ])
    expect(wrapper.text()).toContain('暂无 360° 评估人标签')
    expect(wrapper.get('.authorization-transfer-card').text()).toContain('请确保授权对象有所选环节的操作资格，避免错误授权泄露敏感数据。')
    expect(wrapper.get('.authorization-transfer-card').text()).toContain('请确保转交对象有所选环节的操作资格，避免错误授权泄露敏感数据。')
    expect(wrapper.findAll('.other-settings-card')).toHaveLength(7)
  })

  it('keeps the example action pending without saving', async () => {
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.get('.authorization-transfer-card__example-action').trigger('click')
    expect(ElMessage.info).toHaveBeenLastCalledWith('查看示例将在下一步开放')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(api.update).not.toHaveBeenCalled()
  })

  it('edits transfer prompts independently with the reused dialog', async () => {
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.get('button[aria-label="编辑转交提示"]').trigger('click')
    expect(wrapper.get('[role="dialog"] h2').text()).toBe('转交提示')
    expect(wrapper.get<HTMLTextAreaElement>('#transfer-prompt-zh').element.value).toBe('请确保转交对象有所选环节的操作资格，避免错误授权泄露敏感数据。')
    expect(wrapper.get<HTMLTextAreaElement>('#transfer-prompt-en').element.value).toBe('To prevent sensitive data exposure, please ensure that the transferee has permission for the selected steps.')
    await wrapper.get('#transfer-prompt-zh').setValue('独立转交说明')
    await wrapper.get('#transfer-prompt-en').setValue('Independent transfer notice')
    await wrapper.findAll('[role="dialog"] button').at(-1)!.trigger('click')
    await flushPromises()
    expect(api.update).toHaveBeenCalledWith({ transfer_prompt_zh: '独立转交说明', transfer_prompt_en: 'Independent transfer notice' })
    expect(wrapper.get('.authorization-transfer-card').text()).toContain('独立转交说明')
    await wrapper.get('button[aria-label="编辑授权提示"]').trigger('click')
    expect(wrapper.get<HTMLTextAreaElement>('#authorization-prompt-zh').element.value).toBe('请确保授权对象有所选环节的操作资格，避免错误授权泄露敏感数据。')
    await wrapper.get('button[aria-label="关闭"]').trigger('click')
    await wrapper.get('button[aria-label="编辑转交提示"]').trigger('click')
    await wrapper.get('#transfer-prompt-zh').setValue('')
    await wrapper.get('#transfer-prompt-en').setValue(' ')
    api.update.mockResolvedValueOnce({
      ...defaults,
      transfer_prompt_zh: '请确保转交对象有所选环节的操作资格，避免错误授权泄露敏感数据。',
      transfer_prompt_en: 'To prevent sensitive data exposure, please ensure that the transferee has permission for the selected steps.',
    })
    await wrapper.findAll('[role="dialog"] button').at(-1)!.trigger('click')
    await flushPromises()
    expect(wrapper.get('.authorization-transfer-card').text()).toContain('请确保转交对象有所选环节的操作资格，避免错误授权泄露敏感数据。')
  })

  it('edits bilingual prompts in reused controls and persists only the two text fields', async () => {
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.get('button[aria-label="编辑授权提示"]').trigger('click')
    const dialog = wrapper.get('[role="dialog"]')
    expect(dialog.get('h2').text()).toBe('授权提示')
    expect(dialog.findAll('.performance-counted-textarea')).toHaveLength(2)
    expect(dialog.findAll('.performance-counted-textarea__language').map(tag => tag.text())).toEqual(['中文', '英文'])
    expect(dialog.get('button[aria-label="关闭"]').classes()).toContain('performance-button')
    await dialog.get('#authorization-prompt-zh').setValue('新授权说明\n第二行')
    await wrapper.get('#authorization-prompt-en').setValue('New authorization notice')
    expect(api.update).not.toHaveBeenCalled()
    expect(wrapper.get('.authorization-transfer-card').text()).not.toContain('新授权说明')
    await wrapper.findAll('[role="dialog"] button').at(-1)!.trigger('click')
    await flushPromises()
    expect(api.update).toHaveBeenCalledWith({ authorization_prompt_zh: '新授权说明\n第二行', authorization_prompt_en: 'New authorization notice' })
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(wrapper.get('.authorization-transfer-card').text()).toContain('新授权说明')
    expect(message.success).toHaveBeenCalledWith('保存成功')
    wrapper.unmount()
    const reopened = mountPage()
    await flushPromises()
    await reopened.get('button[aria-label="编辑授权提示"]').trigger('click')
    expect(reopened.get<HTMLTextAreaElement>('#authorization-prompt-zh').element.value).toBe('新授权说明\n第二行')
    expect(reopened.get<HTMLTextAreaElement>('#authorization-prompt-en').element.value).toBe('New authorization notice')
    await reopened.get('button[aria-label="关闭"]').trigger('click')
  })

  it.each(['取消', '关闭', 'Esc'])('discards prompt drafts on %s without saving', async action => {
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.get('button[aria-label="编辑授权提示"]').trigger('click')
    await wrapper.get('#authorization-prompt-zh').setValue('未保存内容')
    if (action === 'Esc') await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Escape' })
    else if (action === '关闭') await wrapper.get('button[aria-label="关闭"]').trigger('click')
    else await wrapper.findAll('[role="dialog"] button')[1].trigger('click')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(api.update).not.toHaveBeenCalled()
    await wrapper.get('button[aria-label="编辑授权提示"]').trigger('click')
    expect(wrapper.get<HTMLTextAreaElement>('#authorization-prompt-zh').element.value).toBe('请确保授权对象有所选环节的操作资格，避免错误授权泄露敏感数据。')
    await wrapper.get('button[aria-label="关闭"]').trigger('click')
  })

  it('keeps the prompt draft and summary on failure, blocks close/duplicate submit, and retries', async () => {
    let reject!: (reason: Error) => void
    api.update.mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail }))
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.get('button[aria-label="编辑授权提示"]').trigger('click')
    await wrapper.get('#authorization-prompt-zh').setValue('失败后保留')
    await wrapper.findAll('[role="dialog"] button').at(-1)!.trigger('click')
    expect(wrapper.findAll<HTMLButtonElement>('[role="dialog"] button').every(button => button.element.disabled)).toBe(true)
    expect(wrapper.findAll<HTMLInputElement>('input[type="checkbox"]').every(input => input.element.disabled)).toBe(true)
    await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    expect(api.update).toHaveBeenCalledTimes(1)
    reject(new Error('offline'))
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toBe('授权提示保存失败，请重试')
    expect(wrapper.get<HTMLTextAreaElement>('#authorization-prompt-zh').element.value).toBe('失败后保留')
    expect(wrapper.get('.authorization-transfer-card').text()).not.toContain('失败后保留')
    expect(message.success).not.toHaveBeenCalled()
    await wrapper.findAll('[role="dialog"] button').at(-1)!.trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(wrapper.get('.authorization-transfer-card').text()).toContain('失败后保留')
  })

  it('displays server defaults after submitting empty prompt text', async () => {
    const zh = '请确保授权对象有所选环节的操作资格，避免错误授权泄露敏感数据。'
    const en = 'To prevent sensitive data exposure, please ensure that the authorized individuals has permission for the selected steps.'
    api.update.mockResolvedValueOnce({ ...defaults, authorization_prompt_zh: zh, authorization_prompt_en: en })
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.get('button[aria-label="编辑授权提示"]').trigger('click')
    await wrapper.get('#authorization-prompt-zh').setValue('')
    await wrapper.get('#authorization-prompt-en').setValue(' \n ')
    await wrapper.findAll('[role="dialog"] button').at(-1)!.trigger('click')
    await flushPromises()
    expect(api.update).toHaveBeenCalledWith({ authorization_prompt_zh: '', authorization_prompt_en: ' \n ' })
    await wrapper.get('button[aria-label="编辑授权提示"]').trigger('click')
    expect(wrapper.get<HTMLTextAreaElement>('#authorization-prompt-zh').element.value).toBe(zh)
    expect(wrapper.get<HTMLTextAreaElement>('#authorization-prompt-en').element.value).toBe(en)
    await wrapper.get('button[aria-label="关闭"]').trigger('click')
  })

  it('hides editing actions and disables configuration without update permission', async () => {
    const wrapper = mountPage(false)
    await flushPromises()
    expect(wrapper.findAll('.other-settings-icon-action')).toHaveLength(0)
    expect(wrapper.find('.authorization-transfer-card__example-action').exists()).toBe(true)
    expect(wrapper.findAll<HTMLInputElement>('input').every(input => input.element.disabled)).toBe(true)
    await wrapper.get('.performance-checkbox__label').trigger('click')
    expect(api.update).not.toHaveBeenCalled()
  })

  it('hides all actions without the admin entry permission', () => {
    expect(mountPage(false, false).findAll('button')).toHaveLength(0)
  })

  it('persists each checkbox in both directions using only its own field', async () => {
    const wrapper = mountPage()
    await flushPromises()
    const inputs = wrapper.findAll<HTMLInputElement>('input[type="checkbox"]')
    const values = Object.values(defaults)
    expect(inputs).toHaveLength(8)
    expect(inputs.map(input => input.element.checked)).toEqual(values)
    for (const [index] of inputs.entries()) {
      await wrapper.findAll('input[type="checkbox"]')[index].setValue(!values[index])
      await flushPromises()
      expect(api.update).toHaveBeenLastCalledWith({ [keys[index]]: !values[index] })
      const currentInputs = wrapper.findAll<HTMLInputElement>('input[type="checkbox"]')
      const expected = values.map((value, i) => i === index ? !value : value)
      expect(currentInputs.map(input => input.element.checked)).toEqual(expected[5] ? expected : expected.slice(0, 6))
      await wrapper.findAll('input[type="checkbox"]')[index].setValue(values[index])
      await flushPromises()
      expect(api.update).toHaveBeenLastCalledWith({ [keys[index]]: values[index] })
      expect(wrapper.findAll<HTMLInputElement>('input[type="checkbox"]').map(input => input.element.checked)).toEqual(values)
    }
    expect(message.success).toHaveBeenCalledTimes(16)
  })

  it('hides dependent overdue rows on load and restores their saved values when enabled', async () => {
    api.get.mockResolvedValueOnce({
      ...defaults,
      overdue_single_submission_enabled: false,
      overdue_voluntary_360_submission_enabled: true,
      cycle_overdue_submission_override_enabled: true,
    })
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.findAll('.overdue-setting__item')).toHaveLength(1)
    expect(wrapper.text()).not.toContain('360° 评估截止后，允许添加新的自愿评估任务')
    expect(wrapper.text()).not.toContain('勾选后，可在周期设置关闭逾期任务提交机会')
    expect(api.update).not.toHaveBeenCalled()
    api.update.mockResolvedValueOnce({
      ...defaults,
      overdue_voluntary_360_submission_enabled: true,
      cycle_overdue_submission_override_enabled: true,
    })
    await wrapper.get('.overdue-setting__item input').setValue(true)
    await flushPromises()
    expect(wrapper.findAll('.overdue-setting__item')).toHaveLength(3)
    expect(wrapper.findAll<HTMLInputElement>('.overdue-setting__item input').map(input => input.element.checked)).toEqual([true, true, true])
    expect(api.update).toHaveBeenCalledTimes(1)
    expect(api.update).toHaveBeenLastCalledWith({ overdue_single_submission_enabled: true })
  })

  it('hides overdue rows after disabling and remounting without clearing dependent settings', async () => {
    const wrapper = mountPage()
    await flushPromises()
    for (const index of [1, 2]) {
      await wrapper.findAll('.overdue-setting__item input')[index].setValue(true)
      await flushPromises()
    }
    api.update.mockClear()
    await wrapper.get('.overdue-setting__item input').setValue(false)
    await flushPromises()
    expect(wrapper.findAll('.overdue-setting__item')).toHaveLength(1)
    expect(api.update).toHaveBeenCalledTimes(1)
    expect(api.update).toHaveBeenLastCalledWith({ overdue_single_submission_enabled: false })
    wrapper.unmount()
    const reopened = mountPage()
    await flushPromises()
    expect(reopened.findAll('.overdue-setting__item')).toHaveLength(1)
    await reopened.get('.overdue-setting__item .performance-checkbox__label').trigger('click')
    await flushPromises()
    expect(reopened.findAll<HTMLInputElement>('.overdue-setting__item input').map(input => input.element.checked)).toEqual([true, true, true])
    expect(api.update).toHaveBeenCalledTimes(2)
    expect(api.update).toHaveBeenLastCalledWith({ overdue_single_submission_enabled: true })
  })

  it.each([true, false])('restores overdue row visibility when saving the first option fails (initial %s)', async initial => {
    api.get.mockResolvedValueOnce({ ...defaults, overdue_single_submission_enabled: initial })
    let reject!: (reason: Error) => void
    api.update.mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail }))
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.get('.overdue-setting__item input').setValue(!initial)
    expect(wrapper.findAll('.overdue-setting__item')).toHaveLength(initial ? 1 : 3)
    expect(wrapper.findAll<HTMLInputElement>('input').every(input => input.element.disabled)).toBe(true)
    reject(new Error('offline'))
    await flushPromises()
    expect(wrapper.findAll('.overdue-setting__item')).toHaveLength(initial ? 3 : 1)
    expect(wrapper.get<HTMLInputElement>('.overdue-setting__item input').element.checked).toBe(initial)
    expect(message.error).toHaveBeenCalledWith('其他设置保存失败，请重试')
    expect(message.success).not.toHaveBeenCalled()
  })

  it('toggles a checkbox by its label and reloads the stored value on remount', async () => {
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.get('.performance-checkbox__label').trigger('click')
    await flushPromises()
    wrapper.unmount()
    const reopened = mountPage()
    await flushPromises()
    expect(reopened.findAll<HTMLInputElement>('input')[0].element.checked).toBe(false)
    expect(reopened.findAll<HTMLInputElement>('input')[1].element.checked).toBe(true)
  })

  it('shows complete helper copy and visible action labels', () => {
    const wrapper = mountPage()
    expect(wrapper.get('.authorization-transfer-card__example').text()).toBe('可设置前台授权或转交时显示的提示文案查看示例')
    expect(wrapper.get('button[aria-label="编辑授权提示"]').text()).toBe('编辑')
    expect(wrapper.get('button[aria-label="编辑转交提示"]').text()).toBe('编辑')
    expect(wrapper.get('button[aria-label="设置 360° 评估人标签"]').text()).toBe('管理标签')
    expect(wrapper.findAll('.overdue-setting__helper')[2].text()).toBe('勾选后，可在周期设置关闭逾期任务提交机会')
  })

  it('keeps captured geometry tokenized and replaces only the target placeholder', () => {
    expect(cardSource).toContain('var(--performance-review-readonly-surface)')
    expect(cardSource).toContain('var(--color-line-divider)')
    expect(cardSource).toContain('gap: 36px')
    expect(routerSource).toMatch(/name: 'PerformanceSystemOther',\s+component: \(\) => import\('@\/views\/performance\/OtherSettings.vue'\)/)
    expect(routerSource).toMatch(/name: 'PerformanceSystemCopy',\s+component: \(\) => import\('@\/views\/performance\/Settings.vue'\)/)
  })

  it('disables all fields until the initial GET resolves', async () => {
    let resolve!: (value: typeof defaults) => void
    api.get.mockReturnValueOnce(new Promise(r => { resolve = r }))
    const wrapper = mountPage()
    expect(wrapper.findAll<HTMLInputElement>('input').every(input => input.element.disabled)).toBe(true)
    await wrapper.get('.performance-checkbox__label').trigger('click')
    expect(api.update).not.toHaveBeenCalled()
    resolve({ ...defaults, performance_coefficient_enabled: true })
    await flushPromises()
    expect(wrapper.findAll<HTMLInputElement>('input')[2].element.checked).toBe(true)
    expect(wrapper.findAll<HTMLInputElement>('input').every(input => !input.element.disabled)).toBe(true)
  })

  it('keeps fields disabled after load failure and supports retry', async () => {
    api.get.mockRejectedValueOnce(new Error('offline'))
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('其他设置加载失败')
    expect(wrapper.findAll<HTMLInputElement>('input').every(input => input.element.disabled)).toBe(true)
    await wrapper.get('[role="alert"] button').trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.findAll<HTMLInputElement>('input').every(input => !input.element.disabled)).toBe(true)
  })

  it('blocks additional changes while saving and restores confirmed values after failure', async () => {
    let reject!: (reason: Error) => void
    api.update.mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail }))
    const wrapper = mountPage()
    await flushPromises()
    const inputs = wrapper.findAll<HTMLInputElement>('input')
    await inputs[0].setValue(false)
    expect(inputs.every(input => input.element.disabled)).toBe(true)
    await wrapper.findAll('.performance-checkbox__label')[1].trigger('click')
    expect(api.update).toHaveBeenCalledTimes(1)
    reject(new Error('offline'))
    await flushPromises()
    expect(inputs.map(input => input.element.checked)).toEqual(Object.values(defaults))
    expect(message.error).toHaveBeenCalledWith('其他设置保存失败，请重试')
    expect(message.success).not.toHaveBeenCalled()
    expect(inputs.every(input => !input.element.disabled)).toBe(true)
  })
})
