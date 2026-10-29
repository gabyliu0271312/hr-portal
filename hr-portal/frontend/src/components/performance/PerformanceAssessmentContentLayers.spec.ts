import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PerformanceAssessmentContentLayers, { type AssessmentOption, type AssessmentTagOption } from './PerformanceAssessmentContentLayers.vue'
import layersSource from './PerformanceAssessmentContentLayers.vue?raw'
import editorSource from './PerformanceRichTextEditor.vue?raw'
import PerformanceRichTextEditor from './PerformanceRichTextEditor.vue'
import PerformanceTagRichTextInput from './PerformanceTagRichTextInput.vue'
import PerformanceTemplateFieldRenderer from './PerformanceTemplateFieldRenderer.vue'
import PerformanceContentRenderer from './PerformanceContentRenderer.vue'
import PerformanceAssessmentPreviewHeader from './PerformanceAssessmentPreviewHeader.vue'
import optionCardSource from './PerformanceContentOptionCard.vue?raw'
import PerformancePromptForm from './PerformancePromptForm.vue'
import PerformancePromptDisplay from './PerformancePromptDisplay.vue'
import PerformancePromptModal from './PerformancePromptModal.vue'
import PerformanceItemAddMenu from './PerformanceItemAddMenu.vue'
import addMenuSource from './PerformanceItemAddMenu.vue?raw'
import promptFormSource from './PerformancePromptForm.vue?raw'
import promptDisplaySource from './PerformancePromptDisplay.vue?raw'
import promptPopoverSource from './PerformancePromptPopover.vue?raw'
import PerformancePromptNotice, { promptTypeForColor } from './PerformancePromptNotice.vue'

const ratingOptions: AssessmentOption[] = [
  { id: 'duplicate', label: '绩效评级', description: '7档绩效等级', disabled: true, disabledReason: '模板中已存在该评估项', displayMode: '标签样式' },
  { id: 'annual', label: '年度综合评级', displayMode: '标签样式', levels: ['1星', '2星', '3星-', '3星', '3星+', '4星', '5星'] },
  { id: 'dropdown', label: '季度评级', description: '下拉评级规则', displayMode: '下拉样式', levels: ['优秀', '良好', '待改进'] },
]
const tagOptions: AssessmentTagOption[] = [
  { id: 'contribution', label: '价值贡献', description: '基于角色职责预期，评估实际产出和贡献', defaultFields: [{ label: '做得好的', content: '请填写做得好的内容' }, { label: '待改进的', content: '请填写待改进的内容' }] },
]

function mountLayers() {
  return mount(PerformanceAssessmentContentLayers, {
    props: { open: true, ratingOptions, tagOptions },
    global: { stubs: { Teleport: true, Transition: false } },
    attachTo: document.body,
  })
}

async function openType(wrapper: VueWrapper, label: string) {
  await wrapper.get('.create-button').trigger('click')
  const option = wrapper.findAll('.create-menu [role="menuitem"]').find((item) => item.text() === label)
  expect(option).toBeDefined()
  await option!.trigger('click')
}

function modalInputs(wrapper: VueWrapper) {
  return wrapper.findAll('.config-pane input[type="text"], .config-pane input:not([type])')
}

function selectEditorContents(editor: HTMLElement) {
  const range = document.createRange()
  range.selectNodeContents(editor)
  const selection = document.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
  editor.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
}

function placeCaretAtEnd(node: Node, editor: HTMLElement) {
  const range = document.createRange()
  range.selectNodeContents(node)
  range.collapse(false)
  const selection = document.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
  editor.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }))
}

function placeCaretInEmptyLeaf(editor: HTMLElement) {
  editor.focus()
  const leaf = editor.querySelector('[data-enter="true"]')
  expect(leaf).toBeInstanceOf(HTMLElement)
  const range = document.createRange()
  range.selectNodeContents(leaf!)
  range.collapse(false)
  const selection = document.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
  editor.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
}

afterEach(() => { document.body.innerHTML = '' })

describe('PerformanceAssessmentContentLayers', () => {
  it('shares prompt fields, isolates radio groups and discards modal edits on cancel', async () => {
    const value = { title: '原标题', content: '原内容', color: '#3B82F6', scope: 'all' as const }
    const inline = mount(PerformancePromptForm, { props: { modelValue: value, variant: 'inline' } })
    const other = mount(PerformancePromptForm, { props: { modelValue: value } })
    expect(inline.findAll('input[type="radio"]').map(input => input.attributes('name'))).not.toContain(other.get('input[type="radio"]').attributes('name'))
    const modal = mount(PerformancePromptModal, { props: { open: true, initialValue: value }, global: { stubs: { Teleport: true } } })
    expect(modal.findComponent(PerformancePromptForm).exists()).toBe(true)
    await modal.get('input[type="text"]').setValue('未保存标题')
    await modal.findAll('.prompt-modal__footer button')[1].trigger('click')
    expect(modal.emitted('save')).toBeUndefined()
    expect(value.title).toBe('原标题')
    await modal.setProps({ open: false })
    await modal.setProps({ open: true })
    expect((modal.get('input[type="text"]').element as HTMLInputElement).value).toBe('原标题')
    expect(promptFormSource).toContain('width: 100%')
    inline.unmount(); other.unmount(); modal.unmount()
  })

  it('uses selected prompt color, optional icon, matching text styles, and modal-safe popover layering', async () => {
    const value = { title: '提示标题', content: '提示内容', color: '#F97316', scope: 'all' as const, showIcon: false }
    const form = mount(PerformancePromptForm, { props: { modelValue: value } })
    const iconToggle = form.get('input[aria-label="显示icon"]')
    expect((iconToggle.element as HTMLInputElement).checked).toBe(false)
    await iconToggle.setValue(true)
    expect(form.emitted('update:modelValue')?.at(-1)).toEqual([{ ...value, showIcon: true }])

    const display = mount(PerformancePromptDisplay, { props: { value: { ...value, showIcon: true } } })
    expect(display.find('.performance-prompt-display__icon').exists()).toBe(true)
    expect(display.attributes('style')).toContain('background-color: rgb(255, 243, 229)')
    expect(display.get('.performance-prompt-display__icon').attributes('style')).toContain('color: rgb(249, 115, 22)')
    expect(promptDisplaySource).toContain('width: 100%')
    expect(promptDisplaySource).not.toContain('border-left:')
    expect(promptDisplaySource).toContain('font: 600 16px/24px')
    expect(promptDisplaySource).toContain('font: 400 14px/22px')
    expect(promptPopoverSource).toContain('z-index:var(--performance-popover-z-index)')
    expect(promptPopoverSource).not.toContain('z-index:1030')
    form.unmount()
    display.unmount()
  })

  it.each(['#3B82F6', '#F97316', '#EF4444', '#10B981'])('shares the hover notice background and icon shape for %s', async color => {
    const value = { title: '标题', content: '内容', color, scope: 'all' as const, showIcon: true }
    const notice = mount(PerformancePromptNotice, { props: { type: promptTypeForColor(color) } })
    const display = mount(PerformancePromptDisplay, { props: { value } })
    expect(display.element.style.backgroundColor).toBe(notice.element.style.backgroundColor)
    expect(display.findAll('path').map(path => path.attributes('d'))).toEqual(notice.findAll('path').map(path => path.attributes('d')))
    await display.setProps({ value: { ...value, showIcon: false } })
    expect(display.find('.performance-prompt-display__icon').exists()).toBe(false)
    notice.unmount(); display.unmount()
  })

  it.each([false, true])('shows the unavailable marker inside the prompt independently of showIcon=%s', async showIcon => {
    const value = { title: '提示标题', content: '提示内容', color: '#F97316', scope: 'all' as const, showIcon }
    const display = mount(PerformancePromptDisplay, { props: { value } })
    expect(display.find('.performance-prompt-display__hidden-icon').exists()).toBe(false)
    await display.setProps({ value: { ...value, allowView: false } })
    const marker = display.get('.performance-prompt-display__hidden-icon')
    expect(marker.element.parentElement).toBe(display.element)
    expect(marker.find('[data-icon="VisibleLockOutlined"]').exists()).toBe(true)
    expect(marker.attributes('tabindex')).toBe('-1')
    expect(display.find('.performance-prompt-display__icon').exists()).toBe(showIcon)
    await display.setProps({ value: { ...value, allowView: true } })
    expect(display.find('.performance-prompt-display__hidden-icon').exists()).toBe(false)
    display.unmount()
  })

  it('uses token-based menu states and supports Escape, arrows and outside dismissal', async () => {
    const menu = mount(PerformanceItemAddMenu, { global: { stubs: { Teleport: true } }, attachTo: document.body })
    const trigger = menu.get('button')
    await trigger.trigger('click')
    expect(menu.findAll('[role="menuitem"]').map(item => item.text())).toEqual(['填写项', '提示项'])
    ;(menu.get('[role="menuitem"]').element as HTMLButtonElement).focus()
    await menu.get('[role="menuitem"]').trigger('keydown', { key: 'ArrowDown' })
    expect(document.activeElement).toBe(menu.findAll('[role="menuitem"]')[1].element)
    await menu.get('[role="menu"]').trigger('keydown', { key: 'Escape' })
    expect(menu.find('[role="menu"]').exists()).toBe(false)
    expect(document.activeElement).toBe(trigger.element)
    await trigger.trigger('click')
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await menu.vm.$nextTick()
    expect(menu.find('[role="menu"]').exists()).toBe(false)
    expect(addMenuSource).toContain('background: transparent')
    expect(addMenuSource).toContain('var(--performance-menu-item-hover-background)')
    expect(addMenuSource).toContain('<Teleport to="body">')
    menu.unmount()
  })

  it.each(['自定义', '评分评级'])('adds shared fill and prompt items to %s and preserves mixed order on edit', async label => {
    const wrapper = mountLayers()
    await openType(wrapper, label)
    await modalInputs(wrapper)[0].setValue('混合内容')
    if (label === '评分评级') {
      await wrapper.get('.select-shell > button').trigger('click')
      await wrapper.findAll('.option-menu [role="option"]')[1].trigger('click')
    } else {
      await wrapper.get('.repeatable-fill-item-list input[placeholder="请输入"]').setValue('原填写题')
    }
    const add = async (kind: '填写项' | '提示项') => {
      await wrapper.get('.performance-item-add-menu__trigger').trigger('click')
      expect(wrapper.findAll('.performance-item-add-menu__menu button').map(button => button.text())).toEqual(['填写项', '提示项'])
      await wrapper.findAll('.performance-item-add-menu__menu button').find(button => button.text() === kind)!.trigger('click')
    }
    await add('填写项')
    const fills = wrapper.findAll('.repeatable-fill-item-list input[placeholder="请输入"]')
    await fills.at(-1)!.setValue('新增自定义填写题')
    expect(wrapper.findAll('.question-type-option input[value="tag"]').length).toBeGreaterThan(0)
    await add('提示项')
    expect(wrapper.get('.performance-prompt-form').classes()).toContain('performance-prompt-form--inline')
    await wrapper.get('.performance-prompt-form input[type="text"]').setValue('共同提示')
    await wrapper.get('.performance-prompt-form textarea').setValue('请如实填写')
    const sortable = wrapper.getComponent({ name: 'PerformanceSortableList' })
    sortable.vm.$emit('reorder', 2, 0)
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.preview-pane .prompt-preview')).toHaveLength(1)
    expect(wrapper.findAll('.saved-item .item-card__title').map(title => title.text())).toEqual(['提示', label === '评分评级' ? '评估项' : '填写项', '填写项'])
    await wrapper.get('.modal-footer .button--primary').trigger('click')
    await wrapper.get('.drawer-footer .button--primary').trigger('click')
    const saved = (wrapper.emitted('confirm')![0][0] as any[])[0]
    expect(saved.items.map((item: any) => item.kind)).toEqual(['prompt', label === '评分评级' ? 'rating' : 'fill', 'fill'])
    expect(saved.items[0].prompt).toMatchObject({ title: '共同提示', content: '请如实填写', scope: 'all' })
    if (label === '评分评级') expect(saved.ratingOptionId).toBe('annual')
    wrapper.unmount()
    const reopened = mount(PerformanceAssessmentContentLayers, { props: { open: true, initialContents: [saved], ratingOptions, tagOptions }, global: { stubs: { Teleport: true } } })
    ;(reopened.vm as any).openEditor(saved)
    await reopened.vm.$nextTick()
    expect(reopened.findAll('.saved-item .item-card__title').map(title => title.text())).toEqual(['提示', label === '评分评级' ? '评估项' : '填写项', '填写项'])
    expect((reopened.get('.performance-prompt-form textarea').element as HTMLTextAreaElement).value).toBe('请如实填写')
    await reopened.get('.modal-footer .button--primary').trigger('click')
    await reopened.get('.drawer-footer .button--primary').trigger('click')
    expect((reopened.emitted('confirm')![0][0] as any[])[0].items.map((item: any) => item.id)).toEqual(saved.items.map((item: any) => item.id))
    reopened.unmount()
  })

  it('keeps unavailable contents disabled with the shared reason popover and blocks forged changes', async () => {
    const content = { id: 'allowed', content_id: 'allowed', type: 'custom' as const, name: '终评内容', description: '', items: [{ id: 'i', label: '意见', hint: '' }] }
    const reason = '仅可选择终评环节执行人「直属上级」填写的内容'
    const wrapper = mount(PerformanceAssessmentContentLayers, {
      props: { open: true, availableContents: [content, { ...content, id: 'other', content_id: 'other', name: '其他内容' }], selectableContentIds: ['allowed'], selectionRestriction: reason },
      global: { stubs: { Teleport: true } }, attachTo: document.body,
    })
    const rows = wrapper.findAll('.created-item')
    expect(rows).toHaveLength(2)
    expect(rows[1].get('input').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.content-selection-restriction').exists()).toBe(false)
    expect(wrapper.get('.create-button').element).toBeTruthy()
    expect(wrapper.find('.created-item__edit').element).toBeTruthy()
    await rows[1].get('input').trigger('change')
    await rows[0].get('input').setValue(true)
    expect(rows[1].find('.performance-info-popover__anchor').exists()).toBe(true)
    expect(wrapper.find('.content-selection-restriction').exists()).toBe(false)
    await wrapper.get('.drawer-footer .button--primary').trigger('click')
    expect(wrapper.emitted('confirm')?.[0][0]).toEqual([expect.objectContaining({ content_id: 'allowed' })])
    wrapper.unmount()
  })

  it('renders the measured drawer and reveals the three types only from the create menu', async () => {
    const wrapper = mountLayers()
    expect(wrapper.get('.assessment-drawer').attributes('role')).toBe('dialog')
    expect(wrapper.get('#assessment-drawer-title').text()).toBe('选择评估内容')
    expect(wrapper.get('.visibility-row').text()).toContain('评估内容分人群可见')
    expect(wrapper.find('.create-menu').exists()).toBe(false)
    await wrapper.get('.create-button').trigger('click')
    expect(wrapper.findAll('.create-menu [role="menuitem"]').map((item) => item.text())).toEqual(['工作总结', '评分评级', '自定义'])
    expect(wrapper.find('.content-modal').exists()).toBe(false)
  })

  it('toggles group settings without removing the drawer empty state', async () => {
    const wrapper = mountLayers()
    const toggle = wrapper.get('[role="switch"][aria-label="评估内容分人群可见"]')
    expect(toggle.attributes('aria-checked')).toBe('true')
    await toggle.trigger('click')
    expect(wrapper.get('[role="switch"][aria-label="评估内容分人群可见"]').attributes('aria-checked')).toBe('false')
    expect(wrapper.text()).not.toContain('设置分组')
    expect(wrapper.get('.empty-state').text()).toContain('暂无内容')
  })

  it.each([
    ['工作总结', '新建工作总结', '650px'],
    ['评分评级', '新建评分评级', '559px'],
    ['自定义', '新建自定义', '722px'],
  ])('opens the %s 1080px two-column modal', async (label, title, height) => {
    const wrapper = mountLayers()
    await openType(wrapper, label)
    expect(wrapper.get('.modal-header h2').text()).toBe(title)
    expect(wrapper.get('.modal-body').findAll(':scope > div')).toHaveLength(2)
    expect(wrapper.get('.content-modal').classes()).toContain(`content-modal--${label === '工作总结' ? 'work_summary' : label === '评分评级' ? 'rating' : 'custom'}`)
    expect(wrapper.get('.content-modal').attributes('role')).toBe('dialog')
    expect(wrapper.getComponent(PerformanceAssessmentPreviewHeader).props()).toMatchObject({ name: '未命名名称', description: '', headingTag: 'h3' })
    expect(wrapper.get('.preview-root-header h3').text()).toBe('未命名名称')
    expect(height).toMatch(/px$/)
  })

  it('preserves mixed custom question types, local options and settings when editing a reused block', async () => {
    const content = { id: 'local', content_id: 'local', type: 'custom' as const, name: '局部内容', description: '局部说明', settings: { hideDescription: true }, items: [
      { id: 'text', label: '局部文本', hint: '局部提示', questionType: 'text' as const, settings: { required: false, hideName: true } },
      { id: 'tag', label: '局部标签', hint: '', questionType: 'tag' as const, tagOptionId: 'contribution', defaultAll: true, options: [{ id: 'local-tag', label: '局部选项', placeholder: '局部选项提示' }], settings: { required: true } },
    ] }
    const wrapper = mount(PerformanceAssessmentContentLayers, { props: { open: true, initialContents: [content], tagOptions }, global: { stubs: { Teleport: true, Transition: false } }, attachTo: document.body })
    ;(wrapper.vm as any).openEditor(content)
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.question-type-option input:checked').map(input => input.attributes('value'))).toEqual(['text', 'tag'])
    await modalInputs(wrapper)[0].setValue('更新局部内容')
    await wrapper.get('.modal-footer .button--primary').trigger('click')
    await wrapper.get('.drawer-footer .button--primary').trigger('click')
    const saved = (wrapper.emitted('confirm')![0][0] as any[])[0]
    expect(saved.name).toBe('更新局部内容')
    expect(saved.content_id).toBe('local')
    expect(saved.settings).toEqual(content.settings)
    expect(saved.items[0]).toEqual(expect.objectContaining(content.items[0]))
    expect(saved.items[1]).toEqual(expect.objectContaining(content.items[1]))
    expect(content.name).toBe('局部内容')
    wrapper.unmount()
  })

  it('preserves rating level rule settings when editing an existing rating block', async () => {
    const content = { id: 'rating-local', content_id: 'rating-local', type: 'rating' as const, name: '评级内容', description: '', ratingOptionId: 'annual', items: [{ id: 'annual', label: '本地评级', hint: '', settings: { levelRulesEnabled: true, required: false } }] }
    const wrapper = mount(PerformanceAssessmentContentLayers, { props: { open: true, initialContents: [content], ratingOptions: [{ id: 'annual', label: '年度评级', levels: ['A', 'B'] }] }, global: { stubs: { Teleport: true, Transition: false } }, attachTo: document.body })
    ;(wrapper.vm as any).openEditor(content)
    await wrapper.vm.$nextTick()
    await modalInputs(wrapper)[0].setValue('更新评级内容')
    await wrapper.get('.modal-footer .button--primary').trigger('click')
    await wrapper.get('.drawer-footer .button--primary').trigger('click')
    const saved = (wrapper.emitted('confirm')![0][0] as any[])[0]
    expect(saved.items[0].settings).toEqual(content.items[0].settings)
    expect(saved.name).toBe('更新评级内容')
    wrapper.unmount()
  })

  it('keeps confirm enabled and shows inline errors only after an invalid submit', async () => {
    const wrapper = mountLayers()
    await openType(wrapper, '工作总结')
    const confirm = wrapper.get('.modal-footer .button--primary')
    expect(confirm.attributes('disabled')).toBeUndefined()
    expect(wrapper.findAll('.field-error')).toHaveLength(0)
    await confirm.trigger('click')
    expect(wrapper.findAll('.field-error').map((item) => item.text())).toEqual(['此项为必填', '此项为必填'])
    expect(wrapper.find('.success-toast').exists()).toBe(false)
  })

  it('captures duplicate rating disabled state and recovers through an enabled option', async () => {
    const wrapper = mountLayers()
    await openType(wrapper, '评分评级')
    await modalInputs(wrapper)[0].setValue('评级内容')
    await wrapper.get('.select-shell > button').trigger('click')
    const options = wrapper.findAll('.option-menu [role="option"]')
    expect(options[0].attributes('disabled')).toBeDefined()
    expect(options[0].attributes('title')).toBe('模板中已存在该评估项')
    await options[0].trigger('click')
    expect(wrapper.get('.select-shell > button').text()).toContain('请选择')
    await options[1].trigger('click')
    expect(wrapper.get('.select-shell > button').text()).toContain('年度综合评级')
    await wrapper.get('.select-shell > button').trigger('click')
    expect(wrapper.findAll('.option-menu [role="option"]')[1].classes()).toContain('selected')
    expect(wrapper.findAll('.option-menu [role="option"]')[1].find('.option-check').exists()).toBe(true)
    expect(wrapper.findAll('.rating-preview .performance-rating-control__option').map((item) => item.text())).toEqual(['1星', '2星', '3星-', '3星', '3星+', '4星', '5星'])
  })

  it('replaces the previous rating selection and persists only the final rule snapshot', async () => {
    const wrapper = mountLayers()
    await openType(wrapper, '评分评级')
    await modalInputs(wrapper)[0].setValue('评级内容')
    await wrapper.get('.select-shell > button').trigger('click')
    await wrapper.findAll('.option-menu [role="option"]')[1].trigger('click')
    expect(wrapper.get('.select-shell > button').text()).toContain('年度综合评级')

    await wrapper.get('.select-shell > button').trigger('click')
    await wrapper.findAll('.option-menu [role="option"]')[2].trigger('click')
    await wrapper.get('.modal-footer .button--primary').trigger('click')
    await wrapper.get('.drawer-footer .button--primary').trigger('click')

    const contents = wrapper.emitted('confirm')?.[0]?.[0] as Array<{ ratingOptionId?: string; ratingDisplayMode?: string; items: Array<{ id: string; label: string }>; options?: Array<{ label: string }> }>
    expect(contents[0].ratingOptionId).toBe('dropdown')
    expect(contents[0].ratingDisplayMode).toBe('下拉样式')
    expect(contents[0].items).toHaveLength(1)
    expect(contents[0].items[0]).toMatchObject({ kind: 'rating', ratingOptionId: 'dropdown', label: '季度评级', hint: '' })
    expect(contents[0].options?.map(option => option.label)).toEqual(['优秀', '良好', '待改进'])
  })

  it('renders rating preview according to the selected option display mode', async () => {
    const wrapper = mountLayers()
    await openType(wrapper, '评分评级')
    await modalInputs(wrapper)[0].setValue('季度评级内容')
    await wrapper.get('.select-shell > button').trigger('click')
    await wrapper.findAll('.option-menu [role="option"]')[2].trigger('click')

    expect(wrapper.find('.rating-select-preview').exists()).toBe(true)
    expect(wrapper.find('.rating-select-preview').text()).toContain('请选择等级')
    expect(wrapper.find('.rating-preview .performance-rating-control__labels').exists()).toBe(false)
  })

  it('adds, deletes and reorders work-summary items', async () => {
    const wrapper = mountLayers()
    await openType(wrapper, '工作总结')
    expect(wrapper.findAll('.saved-item')).toHaveLength(1)
    expect(wrapper.find('.saved-item .drag-icon').exists()).toBe(false)
    expect(wrapper.find('.saved-item .item-card__actions button').exists()).toBe(false)

    await wrapper.get('.add-button').trigger('click')
    expect(wrapper.findAll('.saved-item')).toHaveLength(2)
    expect(wrapper.findAll('.field-error')).toHaveLength(0)
    expect(wrapper.findAll('.text-preview > strong').map((item) => item.text())).toEqual(['未命名填写题', '未命名填写题'])

    await wrapper.findAll('.saved-item')[0].get('input[placeholder="请输入"]').setValue('First item')
    await wrapper.findAll('.saved-item')[1].get('input[placeholder="请输入"]').setValue('Second item')
    expect(wrapper.findAll('.saved-item input[placeholder="请输入"]').map((item) => (item.element as HTMLInputElement).value)).toEqual(['First item', 'Second item'])
    const firstHeading = wrapper.findAll('.saved-item .config-box__heading')[0]
    expect(firstHeading.attributes('data-drag-enabled')).toBe('true')
    expect(firstHeading.attributes('data-rbd-drag-handle-draggable-id')).toBe('form-array-list-draggable-default.entries.assessment-content-1')
    expect(firstHeading.get('svg').attributes('data-icon')).toBe('DragOutlined')
    const sortable = wrapper.findComponent({ name: 'PerformanceSortableList' })
    sortable.vm.$emit('reorder', 0, 1)
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.saved-item input[placeholder="请输入"]').map((item) => (item.element as HTMLInputElement).value)).toEqual(['Second item', 'First item'])
    expect(wrapper.findAll('.text-preview > strong').map((item) => item.text())).toEqual(['Second item', 'First item'])

    await wrapper.findAll('.saved-item .item-card__actions button')[1].trigger('click')
    expect(wrapper.findAll('.saved-item')).toHaveLength(1)
    expect(wrapper.find('.saved-item .drag-icon').exists()).toBe(false)
    expect(wrapper.find('.saved-item .item-card__actions button').exists()).toBe(false)
  })

  it.each(['工作总结', '评分评级', '自定义文本型填写题', '自定义标签型填写题'])('keeps multi-item delete actions in the right grid column for %s', async label => {
    const wrapper = mount(PerformanceAssessmentContentLayers, {
      props: { open: true, horizontalHandle: true, ratingOptions, tagOptions },
      global: { stubs: { Teleport: true, Transition: false } },
    })
    await openType(wrapper, label === '工作总结' || label === '评分评级' ? label : '自定义')
    if (label === '工作总结') await wrapper.get('.add-area .add-button').trigger('click')
    else {
      await wrapper.get('.performance-item-add-menu__trigger').trigger('click')
      await wrapper.findAll('.performance-item-add-menu__menu button')[0].trigger('click')
    }

    const cards = wrapper.findAll('.repeatable-fill-item-list .saved-item')
    expect(cards).toHaveLength(2)
    if (label === '自定义标签型填写题') await cards[1].get('input[value="tag"]').setValue()
    cards.forEach(card => {
      expect(card.classes()).toContain('has-horizontal-handle')
      expect(card.get('.config-box__heading .performance-horizontal-drag-handle').element).toBeTruthy()
      expect(card.get('.config-box__heading').element.lastElementChild?.classList.contains('item-card__actions')).toBe(true)
      expect(card.get('.item-card__actions button').element).toBeTruthy()
    })
    expect(layersSource).toMatch(/\.modal-layer \.item-card__actions\{grid-column:3;/)
    wrapper.unmount()
  })

  it('renders tag fixtures and default-all fields without product hardcoding', async () => {
    const wrapper = mountLayers()
    await openType(wrapper, '自定义')
    await modalInputs(wrapper)[0].setValue('自定义内容')
    const customItem = wrapper.get('.repeatable-fill-item-list .saved-item')
    await customItem.get('input[type="radio"][value="tag"]').setValue()
    await wrapper.vm.$nextTick()
    const tagItem = wrapper.get('.repeatable-fill-item-list .saved-item')
    await tagItem.get('.select-shell > button').trigger('click')
    await tagItem.get('.option-menu [role="option"]').trigger('click')
    expect(wrapper.get('.tag-preview').text()).toContain('基于角色职责预期，评估实际产出和贡献')
    const fieldRenderer = wrapper.getComponent(PerformanceTemplateFieldRenderer)
    expect(fieldRenderer.props()).toMatchObject({ mode: 'edit', editable: true, field: { id: expect.any(String), type: 'tag_with_followup', label: '价值贡献', description: tagOptions[0].description, required: false } })
    expect(wrapper.get('.tag-preview').findComponent(PerformanceTemplateFieldRenderer).exists()).toBe(true)
    expect(layersSource).not.toContain('PerformanceTagRichTextInput')
    expect(layersSource).not.toContain('.tag-checks')
    expect(layersSource).not.toContain('.tag-preview > strong')
    expect(wrapper.findAll('.tag-checks input:checked')).toHaveLength(0)
    expect(wrapper.get('.tag-preview__hint').element.parentElement?.classList.contains('tag-preview__editor')).toBe(true)
    expect(wrapper.find('.tag-preview .performance-rich-text-box.is-readonly').exists()).toBe(false)
    const tagCheckboxes = wrapper.findAll('.tag-checks input')
    await tagCheckboxes[0].setValue(true)
    expect(wrapper.get('.tag-preview__selected-tag').text()).toContain('做得好的')
    expect(wrapper.get('.tag-preview__selected-group').text()).toContain('做得好的')
    expect(wrapper.get('.tag-preview__selected-group .rich-placeholder').text()).toBe('请填写做得好的内容')
    expect(wrapper.find('.tag-preview__selected-group .tag-preview__prompt').exists()).toBe(false)
    expect(wrapper.get('.tag-preview__editor > [role="toolbar"] button').attributes('aria-label')).toBe('粗体')
    const tagEditor = wrapper.get('.tag-preview__selected-group [contenteditable="true"]')
    tagEditor.element.innerHTML = '配置时补充说明'
    await tagEditor.trigger('input')
    expect(tagEditor.text()).toContain('配置时补充说明')
    await wrapper.get('.tag-preview__selected-tag button').trigger('click')
    expect(wrapper.find('.tag-preview__selected-tag').exists()).toBe(false)
    expect((wrapper.find('.tag-checks input').element as HTMLInputElement).checked).toBe(false)
    const toggle = wrapper.get('[role="switch"][aria-label="默认全部填写"]')
    await toggle.trigger('click')
    expect(wrapper.findAll('.tag-checks input:checked')).toHaveLength(2)
    expect(wrapper.findAll('.tag-preview__selected-tag')).toHaveLength(2)
    expect(wrapper.findAll('.tag-preview__selected-tag').map(item => item.text()).join(' ')).toContain('待改进的')
    await wrapper.get('.modal-footer .button--primary').trigger('click')
    await wrapper.get('.drawer-footer .button--primary').trigger('click')
    const contents = wrapper.emitted('confirm')?.[0]?.[0] as Array<{ items: Array<{ options?: Array<{ label: string; placeholder?: string }> }> }>
    expect(contents[0].items[0].options).toEqual([
      { id: 'contribution-0', label: '做得好的', placeholder: '请填写做得好的内容' },
      { id: 'contribution-1', label: '待改进的', placeholder: '请填写待改进的内容' },
    ])
  })

  it('copies the maintained tag description and prompts into the local item and reopens without the catalog', async () => {
    const wrapper = mountLayers()
    await openType(wrapper, '自定义')
    await modalInputs(wrapper)[0].setValue('自定义内容')
    await wrapper.get('.saved-item input[value="tag"]').setValue()
    await wrapper.get('.saved-item .select-shell > button').trigger('click')
    await wrapper.get('.saved-item .option-menu [role="option"]').trigger('click')
    expect(wrapper.get('.tag-preview__description').text()).toBe(tagOptions[0].description)
    await wrapper.get('[aria-label="默认全部填写"]').trigger('click')
    expect(wrapper.findAll('.tag-preview .rich-placeholder').map(node => node.text())).toEqual(['请填写做得好的内容', '请填写待改进的内容'])
    expect(wrapper.findAll('.tag-preview [contenteditable="true"]').map(node => node.attributes('data-placeholder'))).toEqual(['请填写做得好的内容', '请填写待改进的内容'])
    await wrapper.get('.modal-footer .button--primary').trigger('click')
    await wrapper.get('.drawer-footer .button--primary').trigger('click')
    const saved = (wrapper.emitted('confirm')![0][0] as any[])[0]
    expect(saved.items[0]).toMatchObject({ label: '价值贡献', hint: tagOptions[0].description, options: [
      { label: '做得好的', placeholder: '请填写做得好的内容' }, { label: '待改进的', placeholder: '请填写待改进的内容' },
    ] })
    await wrapper.setProps({ tagOptions: [] })
    wrapper.vm.openEditor(saved)
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.tag-preview .template-field-label strong').text()).toBe('价值贡献')
    expect(wrapper.get('.tag-preview__description').text()).toBe(tagOptions[0].description)
    expect(wrapper.findAll('.tag-preview .rich-placeholder').map(node => node.text())).toEqual(['请填写做得好的内容', '请填写待改进的内容'])
    wrapper.unmount()
  })

  it.each([undefined, null])('fills missing legacy tag data and catalog prompts when hint is %s', async hint => {
    const content = { id: 'legacy', type: 'custom' as const, name: '旧标签内容', description: '', items: [
      { id: 'tags', label: '', hint: hint as any, questionType: 'tag' as const, tagOptionId: 'contribution', defaultAll: true, settings: { required: true, localRule: 'keep' }, options: [
        { id: 'improve', label: '待改进的' }, { id: 'good', label: '做得好的', placeholder: '当前环节提示' }, { id: 'empty', label: '无提示', placeholder: '' },
      ] },
    ] }
    const wrapper = mountLayers()
    wrapper.vm.openEditor(content)
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.tag-preview__description').text()).toBe(tagOptions[0].description)
    expect(wrapper.findAll('.tag-preview .rich-placeholder').map(node => node.text())).toEqual(['请填写待改进的内容', '当前环节提示', '请输入补充说明'])
    const editor = wrapper.get('.tag-preview [contenteditable="true"]')
    editor.element.innerHTML = '<div class="ace-line"><span>真实试填</span></div>'
    await editor.trigger('input')
    expect(wrapper.findAll('.tag-preview .rich-placeholder').map(node => node.text())).toEqual(['当前环节提示', '请输入补充说明'])
    expect(wrapper.get('.tag-preview [contenteditable="true"]').text()).toContain('真实试填')
    await wrapper.get('.modal-footer .button--primary').trigger('click')
    await wrapper.get('.drawer-footer .button--primary').trigger('click')
    const saved = (wrapper.emitted('confirm')![0][0] as any[])[0]
    expect(saved.items[0]).toMatchObject({ label: '价值贡献', hint: tagOptions[0].description, settings: { required: true, localRule: 'keep' }, options: [
      { id: 'improve', label: '待改进的', placeholder: '请填写待改进的内容' },
      { id: 'good', label: '做得好的', placeholder: '当前环节提示' },
      { id: 'empty', label: '无提示', placeholder: '' },
    ] })
    expect(content.items[0].label).toBe('')
    expect(content.items[0].hint).toBe(hint)
    expect(content.items[0].options[0]).not.toHaveProperty('placeholder')
    const preview = mount(PerformanceContentRenderer, { props: { content: saved } })
    expect(preview.findComponent(PerformanceTemplateFieldRenderer).exists()).toBe(true)
    expect(preview.get('.template-field-label strong').text()).toBe('价值贡献')
    expect(preview.get('.template-field-description').text()).toBe(tagOptions[0].description)
    expect(preview.findAll('[data-placeholder]').map(node => node.attributes('data-placeholder'))).toEqual(['请填写待改进的内容', '当前环节提示', '请输入补充说明'])
    preview.unmount()
    wrapper.unmount()
  })

  it('preserves explicit empty tag hints and prompts, local option ids and unknown settings', async () => {
    const content = { id: 'local-empty', content_id: 'local-empty', type: 'custom' as const, name: '局部标签', description: '', settings: { hideDescription: true, localSetting: 'retain' }, items: [
      { id: 'tags', label: '局部题名', hint: '', questionType: 'tag' as const, tagOptionId: 'contribution', defaultAll: true, settings: { required: false, localRule: 'retain' }, options: [{ id: 'local-good', label: '做得好的', placeholder: '' }, { id: 'local-only', label: '局部选项', placeholder: '局部提示', color: '#ffffff' }] },
    ] }
    const wrapper = mount(PerformanceAssessmentContentLayers, { props: { open: true, initialContents: [content], tagOptions }, global: { stubs: { Teleport: true, Transition: false } }, attachTo: document.body })
    wrapper.vm.openEditor(content)
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.tag-preview .template-field-label strong').text()).toBe('局部题名')
    expect(wrapper.find('.tag-preview__description').exists()).toBe(false)
    expect(wrapper.findAll('.tag-preview [data-placeholder]').map(node => node.attributes('data-placeholder'))).toEqual(['请输入补充说明', '局部提示'])
    await wrapper.get('.modal-footer .button--primary').trigger('click')
    await wrapper.get('.drawer-footer .button--primary').trigger('click')
    const saved = (wrapper.emitted('confirm')![0][0] as any[])[0]
    expect(saved).toMatchObject({ content_id: content.content_id, settings: content.settings, items: [content.items[0]] })
    wrapper.unmount()
  })

  it('keeps tag preview editors independent and excludes their trial answers from saved content', async () => {
    const content = { id: 'tags', type: 'custom' as const, name: '标签内容', description: '', items: [
      { id: 'first', label: '标签题一', hint: '', questionType: 'tag' as const, tagOptionId: 'contribution', defaultAll: true },
      { id: 'second', label: '标签题二', hint: '', questionType: 'tag' as const, tagOptionId: 'contribution', defaultAll: true },
    ] }
    const wrapper = mount(PerformanceAssessmentContentLayers, { props: { open: true, initialContents: [content], tagOptions }, global: { stubs: { Teleport: true, Transition: false } }, attachTo: document.body })
    wrapper.vm.openEditor(content)
    await wrapper.vm.$nextTick()
    const editors = wrapper.findAll('.tag-preview [contenteditable="true"]')
    expect(editors).toHaveLength(4)
    expect(wrapper.findAllComponents(PerformanceTagRichTextInput)).toHaveLength(2)
    expect(wrapper.findAllComponents(PerformanceRichTextEditor)).toHaveLength(4)
    expect(wrapper.findAll('.tag-preview [role="toolbar"]')).toHaveLength(2)
    editors[0].element.innerHTML = '<div class="ace-line"><span>仅第一题亮点试填</span></div>'
    await editors[0].trigger('input')
    const secondEditor = wrapper.findAll('.tag-preview [contenteditable="true"]')[1]
    secondEditor.element.innerHTML = '<div class="ace-line"><span>仅第一题改进试填</span></div>'
    await secondEditor.trigger('input')
    expect(wrapper.findAll('.tag-preview [contenteditable="true"]')[2].text()).not.toContain('试填')
    expect(wrapper.findAll('.tag-preview [contenteditable="true"]')[3].text()).not.toContain('试填')
    const firstPreview = () => wrapper.findAll('.tag-preview')[0]
    await firstPreview().findAll('.tag-checks input')[0].setValue(false)
    expect(firstPreview().findAll('[contenteditable="true"]')).toHaveLength(1)
    await firstPreview().findAll('.tag-checks input')[0].setValue(true)
    expect(firstPreview().findAll('[contenteditable="true"]')[0].text()).toContain('仅第一题亮点试填')
    expect(firstPreview().findAll('[contenteditable="true"]')[1].text()).toContain('仅第一题改进试填')
    await wrapper.get('.modal-footer .button--primary').trigger('click')
    await wrapper.get('.drawer-footer .button--primary').trigger('click')
    expect(JSON.stringify(wrapper.emitted('confirm'))).not.toContain('试填')
    wrapper.vm.openEditor(content)
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.tag-preview [contenteditable="true"]').every(editor => !editor.text().includes('试填'))).toBe(true)
    wrapper.unmount()
  })

  it('uses the work-summary formatting commands in a selected tag preview', async () => {
    const content = { id: 'tags', type: 'custom' as const, name: '标签内容', description: '', items: [
      { id: 'tag', label: '标签题', hint: '', questionType: 'tag' as const, tagOptionId: 'contribution', defaultAll: true },
    ] }
    const wrapper = mount(PerformanceAssessmentContentLayers, { props: { open: true, initialContents: [content], tagOptions }, global: { stubs: { Teleport: true, Transition: false } }, attachTo: document.body })
    wrapper.vm.openEditor(content)
    await wrapper.vm.$nextTick()
    const group = () => wrapper.findAll('.tag-preview__selected-group')[0]
    const editor = () => group().get('[contenteditable="true"]').element as HTMLElement
    editor().innerHTML = '<div class="ace-line"><span>标签试填内容</span></div>'
    editor().dispatchEvent(new InputEvent('input', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.tag-preview')[0].findAll('[role="toolbar"] button').map(button => button.attributes('aria-label'))).toEqual(['粗体', '斜体', '下划线', '有序列表', '无序列表', '超链接'])
    for (const [label, tag] of [['粗体', 'strong'], ['斜体', 'em'], ['下划线', 'u']]) {
      selectEditorContents(editor())
      await wrapper.get('.tag-preview__editor > [role="toolbar"]').get(`[aria-label="${label}"]`).trigger('click')
      expect(editor().querySelector(tag)?.textContent).toBe('标签试填内容')
    }
    for (const [label, tag] of [['有序列表', 'ol'], ['无序列表', 'ul']]) {
      selectEditorContents(editor())
      await wrapper.get('.tag-preview__editor > [role="toolbar"]').get(`[aria-label="${label}"]`).trigger('click')
      expect(editor().querySelector(`${tag} li`)?.textContent).toContain('标签试填内容')
    }
    selectEditorContents(editor())
    await wrapper.get('.tag-preview__editor > [role="toolbar"]').get('[aria-label="超链接"]').trigger('click')
    await group().get('.link-popover input').setValue('https://example.com')
    await group().get('.link-popover button').trigger('click')
    expect(editor().querySelector('a')?.getAttribute('href')).toBe('https://example.com')
    expect(wrapper.findAll('.tag-preview__selected-group')[1].get('[contenteditable="true"]').text()).not.toContain('标签试填内容')
    wrapper.unmount()
  })

  it('uses the shared repeatable fill-item component for custom text items', async () => {
    const wrapper = mountLayers()
    await openType(wrapper, '自定义')
    await modalInputs(wrapper)[0].setValue('自定义内容')
    const list = wrapper.get('.repeatable-fill-item-list')
    expect(list.findAll('.saved-item')).toHaveLength(1)
    await list.find('input[placeholder="请输入"]').setValue('第一个填写项')
    await wrapper.get('.performance-item-add-menu__trigger').trigger('click')
    await wrapper.get('.performance-item-add-menu__menu button').trigger('click')

    expect(wrapper.findAll('.repeatable-fill-item-list .saved-item')).toHaveLength(2)
    expect(wrapper.findAll('.repeatable-fill-item-list .performance-drag-handle')).toHaveLength(2)
    expect(wrapper.findAll('.repeatable-fill-item-list .item-card__actions button')).toHaveLength(2)
    expect(wrapper.findAll('.repeatable-fill-item-list input[placeholder="请输入"]').map(item => (item.element as HTMLInputElement).value)).toEqual(['第一个填写项', ''])

    const sortable = wrapper.findComponent({ name: 'PerformanceSortableList' })
    sortable.vm.$emit('reorder', 0, 1)
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.repeatable-fill-item-list input[placeholder="请输入"]').map(item => (item.element as HTMLInputElement).value)).toEqual(['', '第一个填写项'])
    await wrapper.findAll('.repeatable-fill-item-list .item-card__actions button')[1].trigger('click')
    expect(wrapper.findAll('.repeatable-fill-item-list .saved-item')).toHaveLength(1)
  })
  it('renders a fill-item hint in the empty rich-text preview', async () => {
    const wrapper = mountLayers()
    await openType(wrapper, '自定义')
    await wrapper.get('.repeatable-fill-item-list textarea[placeholder="请输入填写提示"]').setValue('请说明本周完成事项及结果')

    expect(wrapper.get('.preview-pane .rich-placeholder').text()).toBe('请说明本周完成事项及结果')
    expect(wrapper.find('.preview-pane .next-remix-rich-text-editor').exists()).toBe(true)
    expect(wrapper.findAll('.preview-pane .rich-placeholder')).toHaveLength(1)
    expect(layersSource).not.toContain('.rich-input:empty:before')
  })

  it('grows the empty rich-text preview to fit a multi-line hint', async () => {
    const wrapper = mountLayers()
    await openType(wrapper, '自定义')
    const hint = wrapper.get('.repeatable-fill-item-list textarea[placeholder="请输入填写提示"]')
    await hint.setValue('第一行提示')
    const placeholder = wrapper.get('.preview-pane .rich-placeholder')
    Object.defineProperty(placeholder.element, 'scrollHeight', { configurable: true, value: 176 })
    await hint.setValue('第一行提示\n第二行提示')
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()

    expect(wrapper.get('.preview-pane .rich-placeholder').text()).toContain('第一行提示')
    expect(editorSource).toContain('display:grid')
    expect(editorSource).toContain('grid-area:1 / 1')
  })

  it('removes the long hint from the sizing grid after rich-text input begins', async () => {
    const wrapper = mount(PerformanceAssessmentContentLayers, { props: { open: true, ratingOptions, tagOptions }, global: { stubs: { Teleport: false, Transition: false } }, attachTo: document.body })
    const create = document.querySelector<HTMLButtonElement>('.create-button')!
    create.click()
    await wrapper.vm.$nextTick()
    Array.from(document.querySelectorAll<HTMLButtonElement>('.create-menu button')).find(button => button.textContent === '自定义')!.click()
    await wrapper.vm.$nextTick()
    const hint = document.querySelector<HTMLTextAreaElement>('.repeatable-fill-item-list textarea[placeholder="请输入填写提示"]')!
    hint.value = '这是一段很长的提示，用于验证预览高度不会在实际输入后保留提示文本占用的空白区域。'
    hint.dispatchEvent(new Event('input', { bubbles: true }))
    await wrapper.vm.$nextTick()
    const editor = document.querySelector<HTMLElement>('.preview-pane [contenteditable="true"]')!
    const previousNodes = ['.assessment-drawer', '.performance-editor-modal-layer', '.content-modal', '.preview-pane', '.text-preview', '.rich-editor-host', '.performance-rich-text-box', '.next-remix-rich-text-editor-content'].map(selector => [selector, document.querySelector(selector)] as const)
    expect(document.querySelector('.preview-pane .rich-placeholder')).not.toBeNull()
    editor.innerHTML = '<div class="ace-line" data-node="true"><span data-string="true" data-leaf="true">实际填写内容</span></div>'
    editor.dispatchEvent(new InputEvent('input', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(document.querySelector('.preview-pane .rich-placeholder')).toBeNull()
    for (const [selector, node] of previousNodes) expect(document.querySelector(selector), selector).toBe(node)
    expect(document.querySelector('.preview-pane [contenteditable="true"]')).toBe(editor)
    wrapper.unmount()
  })

  it('keeps the question type inside each custom fill item', async () => {
    const wrapper = mountLayers()
    await openType(wrapper, '自定义')
    const list = wrapper.get('.repeatable-fill-item-list')
    const customItem = list.get('.saved-item')
    await customItem.get('input[type="radio"][value="tag"]').setValue()
    await wrapper.vm.$nextTick()
    const tagList = wrapper.get('.repeatable-fill-item-list')
    await tagList.get('.select-shell > button').trigger('click')
    await tagList.get('.option-menu [role="option"]').trigger('click')
    await wrapper.get('.performance-item-add-menu__trigger').trigger('click')
    await wrapper.get('.performance-item-add-menu__menu button').trigger('click')

    const items = wrapper.findAll('.repeatable-fill-item-list .saved-item')
    expect(items).toHaveLength(2)
    expect(items[0].find('.select-shell').exists()).toBe(true)
    expect(items[1].find('input[type="radio"][value="text"]').element).toHaveProperty('checked', true)
    expect(items[1].find('input[placeholder="请输入"]').exists()).toBe(true)
  })

  it('supports rich-text toolbar states and link popover', async () => {
    const wrapper = mountLayers()
    await openType(wrapper, '工作总结')
    const toolbar = wrapper.get('[role="toolbar"]')
    expect(toolbar.findAll('button').map((button) => button.attributes('aria-label'))).toEqual(['粗体', '斜体', '下划线', '有序列表', '无序列表', '超链接'])
    const editor = wrapper.get('[contenteditable="true"]').element as HTMLElement
    placeCaretInEmptyLeaf(editor)
    await toolbar.findAll('button')[0].trigger('click')
    expect(toolbar.findAll('button')[0].classes()).toContain('active')
    await toolbar.findAll('button')[5].trigger('click')
    expect(wrapper.find('.link-popover').exists()).toBe(true)
  })

  it('renders captured toolbar tooltip copy in a fixed overlay above its button', async () => {
    const wrapper = mountLayers()
    await openType(wrapper, '工作总结')
    const buttons = wrapper.get('[role="toolbar"]').findAll('button')
    vi.spyOn(buttons[0].element, 'getBoundingClientRect').mockReturnValue({ top: 411, left: 990, width: 24, height: 24, right: 1014, bottom: 435, x: 990, y: 411, toJSON: () => ({}) })
    await buttons[0].trigger('mouseenter')
    let tooltip = wrapper.get('.rich-toolbar-tooltip')
    expect(tooltip.text()).toContain('粗体(Ctrl+B)')
    expect(tooltip.text()).toContain('Markdown: **文本** 空格')
    expect(tooltip.attributes('style')).toContain('left: 1002px')
    expect(tooltip.attributes('style')).toContain('top: 401px')
    expect(buttons[0].attributes('title')).toBeUndefined()
    expect(buttons[0].attributes('data-tooltip')).toBeUndefined()

    await buttons[0].trigger('mouseleave')
    vi.spyOn(buttons[4].element, 'getBoundingClientRect').mockReturnValue({ top: 411, left: 1118, width: 24, height: 24, right: 1142, bottom: 435, x: 1118, y: 411, toJSON: () => ({}) })
    await buttons[4].trigger('mouseenter')
    tooltip = wrapper.get('.rich-toolbar-tooltip')
    expect(tooltip.text()).toContain('无序列表(Ctrl+Shift+8)')
    expect(tooltip.text()).toContain('Markdown: - 空格')
  })

  it.each([
    ['粗体', 'fontWeight', 'bold'],
    ['斜体', 'fontStyle', 'italic'],
    ['下划线', 'textDecoration', 'underline'],
  ])('applies pending %s formatting when typing into an empty editor', async (label, styleProperty, expectedStyle) => {
    const wrapper = mountLayers()
    await openType(wrapper, '工作总结')
    const editor = wrapper.get('[contenteditable="true"]').element as HTMLElement
    placeCaretInEmptyLeaf(editor)
    const button = wrapper.get(`[aria-label="${label}"]`)
    await button.trigger('click')
    expect(button.classes()).toContain('active')
    editor.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: 'Probe' }))
    await wrapper.vm.$nextTick()
    const leaf = editor.querySelector('.ace-line > span:not([data-enter])') as HTMLElement
    expect(leaf.textContent).toBe('Probe')
    expect(leaf.style[styleProperty as 'fontWeight']).toBe(expectedStyle)
    if (expectedStyle === 'underline') expect(leaf.classList).toContain('underline')
    expect(editor.querySelectorAll('[data-enter="true"]')).toHaveLength(1)
    expect(wrapper.get(`[aria-label="${label}"]`).classes()).toContain('active')
  })

  it.each([
    ['有序列表', 'ol.list-number1.r-list-number'],
    ['无序列表', 'ul.list-bullet1.r-list-bullet'],
  ])('keeps first input inside the captured empty %s DOM', async (label, selector) => {
    const wrapper = mountLayers()
    await openType(wrapper, '工作总结')
    let editor = wrapper.get('[contenteditable="true"]').element as HTMLElement
    placeCaretInEmptyLeaf(editor)
    const button = wrapper.get(`[aria-label="${label}"]`)
    await button.trigger('click')
    editor = wrapper.get('[contenteditable="true"]').element as HTMLElement
    const item = editor.querySelector(`.ace-line.list-div > ${selector} > li`) as HTMLElement
    expect(item).not.toBeNull()
    const endLeaf = item.querySelector(':scope > span[data-enter="true"]') as HTMLElement
    expect(editor.querySelectorAll('li > [data-enter="true"]')).toHaveLength(1)
    expect(editor.querySelector('br')).toBeNull()
    placeCaretInEmptyLeaf(editor)
    expect(document.getSelection()?.rangeCount).toBe(1)

    const firstInput = new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: 'Probe' })
    editor.dispatchEvent(firstInput)
    await wrapper.vm.$nextTick()
    expect(firstInput.defaultPrevented).toBe(true)
    expect(item.querySelector(':scope > span:not([data-enter])')?.textContent).toBe('Probe')
    expect(endLeaf.textContent).toBe('\u200b')
    expect(item.querySelectorAll(':scope > span')).toHaveLength(2)
    expect(editor.querySelectorAll(':scope > .ace-line')).toHaveLength(1)
    expect(wrapper.get(`[aria-label="${label}"]`).classes()).toContain('active')
  })

  it('applies toolbar formats to every selected line and keeps list types mutually exclusive', async () => {
    const wrapper = mountLayers()
    await openType(wrapper, '工作总结')
    let editor = wrapper.get('[contenteditable="true"]').element as HTMLElement
    editor.innerHTML = [
      '<div class="ace-line" data-node="true" dir="auto"><span data-string="true" data-leaf="true">Alpha line</span></div>',
      '<div class="ace-line" data-node="true" dir="auto"><span data-string="true" data-leaf="true">Beta line</span></div>',
      '<div class="ace-line" data-node="true" dir="auto"><span data-string="true" data-leaf="true">Gamma line</span></div>',
    ].join('')
    editor.dispatchEvent(new InputEvent('input', { bubbles: true }))
    await wrapper.vm.$nextTick()
    editor = wrapper.get('[contenteditable="true"]').element as HTMLElement
    selectEditorContents(editor)

    const buttons = () => wrapper.get('[role="toolbar"]').findAll('button')
    await buttons()[0].trigger('click')
    editor = wrapper.get('[contenteditable="true"]').element as HTMLElement
    selectEditorContents(editor)
    await buttons()[1].trigger('click')
    editor = wrapper.get('[contenteditable="true"]').element as HTMLElement
    selectEditorContents(editor)
    await buttons()[2].trigger('click')
    editor = wrapper.get('[contenteditable="true"]').element as HTMLElement
    selectEditorContents(editor)
    await wrapper.vm.$nextTick()
    expect({
      html: editor.innerHTML,
      strong: editor.querySelectorAll('strong').length,
      em: editor.querySelectorAll('em').length,
      underline: editor.querySelectorAll('u').length,
    }).toMatchObject({ strong: 3, em: 3, underline: 3 })
    expect(buttons().slice(0, 3).map((button) => button.classes().includes('active'))).toEqual([true, true, true])

    selectEditorContents(editor)
    await buttons()[3].trigger('click')
    editor = wrapper.get('[contenteditable="true"]').element as HTMLElement
    selectEditorContents(editor)
    await wrapper.vm.$nextTick()
    expect(editor.querySelectorAll(':scope > .ace-line.list-div > ol.r-list-number')).toHaveLength(3)
    expect(Array.from(editor.querySelectorAll('ol')).map((list) => list.getAttribute('start'))).toEqual(['1', '2', '3'])
    expect(buttons()[3].classes()).toContain('active')
    expect(buttons()[4].classes()).not.toContain('active')

    selectEditorContents(editor)
    await buttons()[4].trigger('click')
    editor = wrapper.get('[contenteditable="true"]').element as HTMLElement
    selectEditorContents(editor)
    await wrapper.vm.$nextTick()
    const unorderedLists = editor.querySelectorAll(':scope > .ace-line.list-div > ul.r-list-bullet')
    expect(unorderedLists).toHaveLength(3)
    expect(Array.from(unorderedLists).every((list) => list.querySelectorAll(':scope > li').length === 1)).toBe(true)
    expect(editor.querySelectorAll('ol')).toHaveLength(0)
    expect(buttons()[3].classes()).not.toContain('active')
    expect(buttons()[4].classes()).toContain('active')
    expect(buttons()[4].get('svg').attributes('data-icon')).toBe('DisorderListOutlined')

    selectEditorContents(editor)
    await buttons()[5].trigger('click')
    expect(wrapper.find('.link-popover').exists()).toBe(true)
  })

  it('continues the active list type when Enter creates a new line', async () => {
    const wrapper = mountLayers()
    await openType(wrapper, '工作总结')
    let editor = wrapper.get('[contenteditable="true"]').element as HTMLElement
    editor.innerHTML = '<div class="ace-line" data-node="true" dir="auto"><span data-string="true" data-leaf="true">First line</span></div>'
    editor.dispatchEvent(new InputEvent('input', { bubbles: true }))
    await wrapper.vm.$nextTick()
    editor = wrapper.get('[contenteditable="true"]').element as HTMLElement
    selectEditorContents(editor)
    await wrapper.get('[aria-label="无序列表"]').trigger('click')
    editor = wrapper.get('[contenteditable="true"]').element as HTMLElement
    const firstItem = editor.querySelector('ul > li') as HTMLElement
    placeCaretAtEnd(firstItem, editor)
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    await wrapper.vm.$nextTick()
    editor = wrapper.get('[contenteditable="true"]').element as HTMLElement
    placeCaretAtEnd(editor.querySelector('ul:last-child > li') as HTMLElement, editor)
    await wrapper.vm.$nextTick()
    expect({ html: editor.innerHTML, count: editor.querySelectorAll(':scope > .ace-line.list-div > ul.r-list-bullet').length }).toMatchObject({ count: 2 })
    expect(editor.querySelectorAll(':scope > .ace-line.list-div > ul.r-list-bullet > li')).toHaveLength(2)
    expect(wrapper.get('[aria-label="无序列表"]').classes()).toContain('active')
  })

  it('discards a cancelled draft, ignores mask clicks and returns focus to the drawer', async () => {
    const wrapper = mountLayers()
    await openType(wrapper, '工作总结')
    await modalInputs(wrapper)[0].setValue('临时名称')
    await wrapper.get('.modal-layer').trigger('mousedown')
    expect(wrapper.find('.content-modal').exists()).toBe(true)
    await wrapper.get('.modal-footer .button--secondary').trigger('click')
    expect(wrapper.find('.content-modal').exists()).toBe(false)
    expect(document.activeElement).toBe(wrapper.get('.assessment-drawer').element)
    await openType(wrapper, '工作总结')
    expect((modalInputs(wrapper)[0].element as HTMLInputElement).value).toBe('')
  })

  it('traps focus, handles Escape, creates a session item and emits only on drawer confirm', async () => {
    const wrapper = mountLayers()
    await openType(wrapper, '工作总结')
    const close = wrapper.get('.modal-header .icon-button').element as HTMLButtonElement
    const confirm = wrapper.get('.modal-footer .button--primary').element as HTMLButtonElement
    confirm.focus()
    await wrapper.get('.content-modal').trigger('keydown', { key: 'Tab' })
    expect(document.activeElement).toBe(close)
    await wrapper.get('.content-modal').trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('.content-modal').exists()).toBe(false)

    await openType(wrapper, '工作总结')
    await wrapper.get('input[placeholder="请输入名称"]').setValue('补采-确认回填')
    await wrapper.get('input[placeholder="请输入"]').setValue('本周工作产出')
    await wrapper.get('.modal-footer .button--primary').trigger('click')
    expect(wrapper.get('.success-toast').text()).toContain('新建成功')
    expect(wrapper.get('.created-item').text()).toContain('补采-确认回填')
    expect(wrapper.emitted('confirm')).toBeUndefined()
    await wrapper.get('.drawer-footer .button--primary').trigger('click')
    expect(wrapper.emitted('confirm')?.[0]?.[0]).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'work_summary', name: '补采-确认回填' })]))
  })

  it('shows shared library content as selectable in another stage', async () => {
    const wrapper = mount(PerformanceAssessmentContentLayers, {
      props: {
        open: true,
        availableContents: [{ id: 'shared-work', type: 'work_summary', name: '共享工作总结', description: '', items: [{ id: 'shared-item', label: '共享填写项', hint: '' }] }],
        initialContents: [],
      },
      global: { stubs: { Teleport: true, Transition: false } },
      attachTo: document.body,
    })
    const checkbox = wrapper.get('.created-item input[type="checkbox"]')
    expect((checkbox.element as HTMLInputElement).checked).toBe(false)
    expect(checkbox.attributes('disabled')).toBeUndefined()
    await checkbox.setValue(true)
    expect((checkbox.element as HTMLInputElement).checked).toBe(true)
    expect(checkbox.attributes('disabled')).toBeUndefined()
    expect(wrapper.get('.created-item').text()).toContain('共享工作总结')
  })
  it('edits available-only content into a local selection without changing the shared library', async () => {
    const shared = { id: 'library-row', content_id: 'shared-tag', type: 'custom' as const, name: '共享标签', description: '共享说明', settings: { hideDescription: false, localSetting: 'keep' }, items: [
      { id: 'shared-item', label: '', hint: undefined as any, questionType: 'tag' as const, tagOptionId: 'contribution', defaultAll: true, settings: { required: true, localRule: 'keep' } },
    ] }
    const wrapper = mount(PerformanceAssessmentContentLayers, { props: { open: true, availableContents: [shared], tagOptions }, global: { stubs: { Teleport: true, Transition: false } }, attachTo: document.body })
    expect((wrapper.get('.created-item input').element as HTMLInputElement).checked).toBe(false)
    await wrapper.get('.created-item__edit').trigger('click')
    await modalInputs(wrapper)[0].setValue('当前节点标签')
    expect(wrapper.get('.tag-preview .template-field-label strong').text()).toBe('价值贡献')
    await wrapper.get('.modal-footer .button--primary').trigger('click')
    expect(wrapper.findAll('.created-item')).toHaveLength(1)
    expect(wrapper.get('.created-item').text()).toContain('当前节点标签')
    await wrapper.get('.drawer-footer .button--primary').trigger('click')
    const saved = (wrapper.emitted('confirm')![0][0] as any[])[0]
    expect(saved).toMatchObject({ id: 'shared-tag', content_id: 'shared-tag', name: '当前节点标签', settings: shared.settings, items: [
      { id: 'shared-item', label: '价值贡献', hint: tagOptions[0].description, settings: shared.items[0].settings, options: [
        { id: 'contribution-0', label: '做得好的', placeholder: '请填写做得好的内容' }, { id: 'contribution-1', label: '待改进的', placeholder: '请填写待改进的内容' },
      ] },
    ] })
    expect(shared.name).toBe('共享标签')
    expect(shared.items[0].label).toBe('')
    expect(shared.items[0]).not.toHaveProperty('options')
    await wrapper.setProps({ tagOptions: [] })
    wrapper.vm.openEditor(saved)
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.tag-preview .template-field-label strong').text()).toBe('价值贡献')
    expect(wrapper.get('.tag-preview__description').text()).toBe(tagOptions[0].description)
    expect(wrapper.findAll('.tag-preview .rich-placeholder').map(node => node.text())).toEqual(['请填写做得好的内容', '请填写待改进的内容'])
    wrapper.unmount()
  })

  it('deduplicates shared content by content id and allows selecting an unbound item', async () => {
    const shared = { id: 'content-1', content_id: 'content-1', type: 'work_summary' as const, name: '共享工作总结', description: '', items: [{ id: 'item-1', label: '填写项', hint: '' }] }
    const wrapper = mount(PerformanceAssessmentContentLayers, {
      props: { open: true, initialContents: [{ ...shared, id: 'local-id' }], availableContents: [shared] },
      global: { stubs: { Teleport: true, Transition: false } },
      attachTo: document.body,
    })
    expect(wrapper.findAll('.created-item')).toHaveLength(1)
    const checked = wrapper.get('.created-item input[type="checkbox"]')
    expect(checked.attributes('disabled')).toBeDefined()

    const unbound = mount(PerformanceAssessmentContentLayers, {
      props: { open: true, initialContents: [], availableContents: [shared] },
      global: { stubs: { Teleport: true, Transition: false } },
      attachTo: document.body,
    })
    const checkbox = unbound.get('.created-item input[type="checkbox"]')
    expect(checkbox.attributes('disabled')).toBeUndefined()
    await checkbox.trigger('click')
    expect(unbound.emitted('confirm')).toBeUndefined()
    await unbound.get('.drawer-footer .button--primary').trigger('click')
    expect(unbound.emitted('confirm')?.[0]?.[0]).toEqual([expect.objectContaining({ content_id: 'content-1', name: '共享工作总结' })])
  })
  it('keeps multiple same-name work summaries with unique content ids', async () => {
    const wrapper = mountLayers()
    for (let index = 0; index < 2; index += 1) {
      await openType(wrapper, '工作总结')
      await wrapper.get('input[placeholder="请输入名称"]').setValue('同名工作总结')
      await wrapper.get('input[placeholder="请输入"]').setValue('同名填写项')
      await wrapper.get('.modal-footer .button--primary').trigger('click')
    }
    expect(wrapper.findAll('.created-item')).toHaveLength(2)
    await wrapper.get('.drawer-footer .button--primary').trigger('click')
    const contents = wrapper.emitted('confirm')?.[0]?.[0] as Array<{ content_id: string; name: string }>
    expect(contents.map((content) => content.name)).toEqual(['同名工作总结', '同名工作总结'])
    expect(new Set(contents.map((content) => content.content_id)).size).toBe(2)
  })

  it('supports editing a created item and toggling drawer expansion states', async () => {
    const probe = mountLayers()
    await probe.get('.create-button').trigger('click')
    await probe.findAll('.create-menu [role="menuitem"]')[0].trigger('click')
    await probe.findAll('.config-pane input')[0].setValue('summary')
    await probe.findAll('.saved-item input')[0].setValue('item')
    await probe.get('.modal-footer .button--primary').trigger('click')
    expect(probe.get('.created-item input').attributes('disabled')).toBeDefined()
    expect(probe.findAll('.expand-all-button')).toHaveLength(1)
    expect(probe.get('.created-item .performance-expand-button').attributes('aria-expanded')).toBe('false')
    await probe.get('.created-item .performance-expand-button').trigger('click')
    expect(probe.get('.created-item .performance-expand-button').attributes('aria-expanded')).toBe('true')
    expect(probe.get('.created-item__details').text()).toContain('item')
    await probe.get('.created-item__edit').trigger('click')
    expect((probe.findAll('.config-pane input')[0].element as HTMLInputElement).value).toBe('summary')
  })
  it('captures edit and expansion state without relying on localized labels', async () => {
    const wrapper = mountLayers()
    await wrapper.get('.create-button').trigger('click')
    await wrapper.findAll('.create-menu [role="menuitem"]')[0].trigger('click')
    await wrapper.findAll('.config-pane input')[0].setValue('summary')
    await wrapper.findAll('.saved-item input')[0].setValue('item')
    await wrapper.get('.modal-footer .button--primary').trigger('click')
    expect(wrapper.get('.created-item input').attributes('disabled')).toBeDefined()
    await wrapper.get('.created-item .performance-expand-button').trigger('click')
    expect(wrapper.get('.created-item__details').text()).toContain('item')
    await wrapper.get('.created-item__edit').trigger('click')
    expect((wrapper.findAll('.config-pane input')[0].element as HTMLInputElement).value).toBe('summary')
  })

  it('matches the reference-card layout for created assessment contents while keeping actions available', () => {
    expect(optionCardSource.replace(/\s+/g, ' ')).toContain('grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; min-height: var(--performance-content-option-card-min-height);')
    expect(layersSource).toContain('PerformanceContentOptionCard')
    expect(layersSource).toContain('.created-item__actions')
    expect(layersSource).toContain('created-item__edit')
    expect(layersSource).toContain('全部收起')
    expect(layersSource).toContain('全部展开')
  })
})
