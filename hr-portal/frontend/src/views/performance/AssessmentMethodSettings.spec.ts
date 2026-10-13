import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import AssessmentMethodSettings from './AssessmentMethodSettings.vue'
import { performanceAssessmentMethodSettingsApi } from '@/api/performance'
import { performanceMetricAssessmentEnabled } from '@/utils/performanceAdminNavigation'

describe('AssessmentMethodSettings', () => {
  beforeEach(() => {
    performanceMetricAssessmentEnabled.value = false
    vi.spyOn(performanceAssessmentMethodSettingsApi, 'get').mockResolvedValue({ metric_assessment_enabled: false })
    vi.spyOn(performanceAssessmentMethodSettingsApi, 'update').mockImplementation(async (payload) => payload)
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })
  it('renders the captured assessment method sections', () => {
    const wrapper = mount(AssessmentMethodSettings)

    expect(wrapper.get('h1').text()).toBe('考核方式设置')
    expect(wrapper.text()).toContain('关键指标考核')
    expect(wrapper.text()).toContain('在项目中让各成员制定并确认关键指标，并在绩效评估时考核指标完成情况；适用于 KPI（关键业绩指标）、PBC（个人绩效承诺） 等考核场景。')
    expect(wrapper.text()).toContain('项目制考核')
    expect(wrapper.text()).toContain('可在模板中设置由项目上级评估的环节，并在周期中导入各成员间的业务项目合作关系')
    expect(wrapper.text()).toContain('项目合作关系来源')
    expect(wrapper.text()).toContain('管理员在周期中手动导入')
    expect(wrapper.text()).toContain('导入时可选的项目角色')
    expect(wrapper.text()).toContain('项目上级可查看「项目团队绩效结果」')
    expect(wrapper.text()).not.toContain('新建')
    expect(wrapper.findAll('.assessment-method-card').length).toBe(1)
    expect(wrapper.findAll('.assessment-project-card').length).toBe(1)
    expect(wrapper.findAllComponents({ name: 'PerformanceSwitch' })).toHaveLength(2)
    expect(wrapper.find('.assessment-project-card__secondary-source').exists()).toBe(false)
    expect(wrapper.find('.assessment-project-card__visibility-row > .assessment-project-card__visibility-checkbox').exists()).toBe(true)
    expect(wrapper.find('.assessment-project-card__visibility-row > .assessment-project-card__visibility-copy').text()).toContain('项目上级可查看「项目团队绩效结果」')
    expect(wrapper.text()).toContain('开启后，项目上级可在「查看项目团队绩效结果」中汇总查看所负责的各级项目下级的绩效数据，具体内容以模板配置为准')
    expect(wrapper.get('.assessment-project-card__edit').text()).toBe('编辑')
  })

  it('keeps the two assessment switches independent', async () => {
    const wrapper = mount(AssessmentMethodSettings)
    await nextTick()
    await nextTick()
    const switches = wrapper.findAll('.performance-switch')

    expect(switches[0].classes()).not.toContain('on')
    expect(switches[1].classes()).toContain('on')

    await switches[0].trigger('click')

    expect(switches[0].classes()).toContain('on')
    expect(switches[1].classes()).toContain('on')
    expect(performanceAssessmentMethodSettingsApi.update).toHaveBeenCalledWith({ metric_assessment_enabled: true })
  })

  it('keeps metric loading controls isolated from project switch presentation', async () => {
    const wrapper = mount(AssessmentMethodSettings)
    await nextTick()
    const switches = wrapper.findAll('.performance-switch')

    expect(switches[0].classes()).toContain('no-transition')
    expect((switches[0].element as HTMLButtonElement).disabled).toBe(false)
    expect(switches[1].classes()).not.toContain('no-transition')
    expect((switches[1].element as HTMLButtonElement).disabled).toBe(false)
  })
  it('keeps the saved metric state when the page is remounted', () => {
    performanceMetricAssessmentEnabled.value = true
    vi.mocked(performanceAssessmentMethodSettingsApi.get).mockResolvedValue({ metric_assessment_enabled: true })

    const wrapper = mount(AssessmentMethodSettings)

    expect(wrapper.findAll('.performance-switch')[0].classes()).toContain('on')
  })

  it('hides project settings when project assessment is disabled', async () => {
    const wrapper = mount(AssessmentMethodSettings)
    const projectSwitch = wrapper.findAll('.performance-switch')[1]

    await projectSwitch.trigger('click')

    expect(wrapper.text()).toContain('项目制考核')
    expect(wrapper.text()).toContain('可在模板中设置由项目上级评估的环节，并在周期中导入各成员间的业务项目合作关系')
    expect(wrapper.text()).not.toContain('项目合作关系来源')
    expect(wrapper.text()).not.toContain('查看项目团队绩效结果的入口可见性设置')
    expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(0)
  })

  it('keeps manual project import checked and disabled', () => {
    const wrapper = mount(AssessmentMethodSettings)
    const checkboxes = wrapper.findAll('input[type="checkbox"]')

    const manualImport = checkboxes[0].element as HTMLInputElement
    const resultVisibility = checkboxes[1].element as HTMLInputElement

    expect(manualImport.checked).toBe(true)
    expect(manualImport.disabled).toBe(true)
    expect(resultVisibility.checked).toBe(false)
    expect(resultVisibility.disabled).toBe(false)
  })

  it('toggles project result visibility locally', async () => {
    const wrapper = mount(AssessmentMethodSettings)
    const resultCheckbox = wrapper.findAll('input[type="checkbox"]')[1]

    await resultCheckbox.setValue(true)

    expect((resultCheckbox.element as HTMLInputElement).checked).toBe(true)
  })

  it('opens the project role dialog from the edit entry', async () => {
    const wrapper = mount(AssessmentMethodSettings)

    await wrapper.get('.assessment-project-card__edit').trigger('click')

    const dialog = document.body.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog).not.toBeNull()
    expect(dialog.querySelector('h2')?.textContent).toBe('设置项目角色')
    expect(dialog.textContent).toContain('在后台模板配置、前台筛选中选择「项目角色」时，角色顺序将与当前的顺序保持一致。')
    expect(dialog.querySelector('[data-icon="AddOutlined"]')).not.toBeNull()
    expect(dialog.querySelector('.project-role-dialog__add')?.getAttribute('aria-label')).toBe('添加角色')
    expect(dialog.querySelector('.project-role-dialog__add')?.textContent).toContain('添加角色')
    expect(dialog.querySelector('[data-icon="LanguageOutlined"]')).not.toBeNull()
    expect(dialog.querySelector('.project-role-dialog__confirm')?.textContent).toBe('确定')
    expect(dialog.querySelector('.project-role-dialog__cancel')?.textContent).toBe('取消')

    ;(dialog.querySelector('.project-role-dialog__cancel') as HTMLButtonElement).click()
    await nextTick()
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
  })

  it('adds a shared workbench-style role input above the add button', async () => {
    const wrapper = mount(AssessmentMethodSettings)

    await wrapper.get('.assessment-project-card__edit').trigger('click')
    const dialog = document.body.querySelector('[role="dialog"]') as HTMLElement
    const addButton = dialog.querySelector('.project-role-dialog__add') as HTMLButtonElement

    expect(dialog.querySelector('.project-role-dialog__role-row')).toBeNull()
    addButton.click()
    await nextTick()

    const roleRow = dialog.querySelector('.project-role-dialog__role-row') as HTMLElement
    const input = dialog.querySelector('.project-role-dialog__role-field .native-input') as HTMLInputElement
    expect(roleRow).not.toBeNull()
    expect(input).not.toBeNull()
    expect(dialog.querySelector('.feishu-input-placeholder')?.textContent).toBe('请输入中文角色名称')
    expect(dialog.querySelector('.project-role-dialog__language-tag')?.textContent).toBe('中文')
    expect(roleRow.compareDocumentPosition(addButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    input.value = '项目负责人'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    expect(input.value).toBe('项目负责人')
    addButton.click()
    await nextTick()
    expect(dialog.querySelectorAll('[data-drag-handle]')).toHaveLength(2)
    expect(dialog.querySelectorAll('[data-sortable-index]')).toHaveLength(2)
    expect(dialog.querySelectorAll('.performance-icon-button')).toHaveLength(2)
    ;(dialog.querySelector('.performance-dialog__close') as HTMLButtonElement).click()
    await nextTick()
  })

  it('closes the project role dialog with confirm or close', async () => {
    const wrapper = mount(AssessmentMethodSettings)

    await wrapper.get('.assessment-project-card__edit').trigger('click')
    let dialog = document.body.querySelector('[role="dialog"]') as HTMLElement
    ;(dialog.querySelector('.project-role-dialog__confirm') as HTMLButtonElement).click()
    await nextTick()
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()

    await wrapper.get('.assessment-project-card__edit').trigger('click')
    dialog = document.body.querySelector('[role="dialog"]') as HTMLElement
    ;(dialog.querySelector('.performance-dialog__close') as HTMLButtonElement).click()
    await nextTick()
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
  })
})
