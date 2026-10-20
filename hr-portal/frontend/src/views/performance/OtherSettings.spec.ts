import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ElMessage } from 'element-plus'
import { useUserStore } from '@/stores/user'
import OtherSettings from './OtherSettings.vue'
import cardSource from '@/components/performance/PerformanceAuthorizationTransferCard.vue?raw'
import routerSource from '@/router/index.ts?raw'

const message = vi.hoisted(() => ({ info: vi.fn(), success: vi.fn(), error: vi.fn() }))
const api = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn() }))
vi.mock('element-plus', () => ({ ElMessage: message }))
vi.mock('@/api/performance', () => ({ performanceOtherSettingsApi: api }))

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
  return mount(OtherSettings, { global: { plugins: [pinia] } })
}

describe('OtherSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    let stored = { ...defaults }
    api.get.mockImplementation(async () => ({ ...stored }))
    api.update.mockImplementation(async payload => {
      stored = { ...stored, ...payload }
      return { ...stored }
    })
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

  it('keeps both edits and example actions as next-step feedback without a dialog', async () => {
    const wrapper = mountPage()
    await flushPromises()
    for (const label of ['编辑授权提示', '编辑转交提示']) {
      await wrapper.get(`button[aria-label="${label}"]`).trigger('click')
      expect(ElMessage.info).toHaveBeenLastCalledWith('编辑提示将在下一步开放')
    }
    await wrapper.get('.authorization-transfer-card__example-action').trigger('click')
    expect(ElMessage.info).toHaveBeenLastCalledWith('查看示例将在下一步开放')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(api.update).not.toHaveBeenCalled()
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
