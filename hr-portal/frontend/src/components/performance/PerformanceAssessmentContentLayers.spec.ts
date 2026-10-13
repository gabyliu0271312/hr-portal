import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PerformanceAssessmentContentLayers, { type AssessmentOption, type AssessmentTagOption } from './PerformanceAssessmentContentLayers.vue'
import layersSource from './PerformanceAssessmentContentLayers.vue?raw'

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
    expect(height).toMatch(/px$/)
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
    await wrapper.get('.add-button').trigger('click')
    expect(wrapper.get('.select-shell > button').text()).toContain('年度综合评级')

    await wrapper.get('.select-shell > button').trigger('click')
    await wrapper.findAll('.option-menu [role="option"]')[2].trigger('click')
    await wrapper.get('.modal-footer .button--primary').trigger('click')
    await wrapper.get('.drawer-footer .button--primary').trigger('click')

    const contents = wrapper.emitted('confirm')?.[0]?.[0] as Array<{ ratingOptionId?: string; ratingDisplayMode?: string; items: Array<{ id: string; label: string }>; options?: Array<{ label: string }> }>
    expect(contents[0].ratingOptionId).toBe('dropdown')
    expect(contents[0].ratingDisplayMode).toBe('下拉样式')
    expect(contents[0].items).toEqual([{ id: 'dropdown', label: '季度评级', hint: '' }])
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
    expect(wrapper.get('.tag-preview').text()).toContain('价值贡献')
    expect(wrapper.findAll('.tag-checks input:checked')).toHaveLength(0)
    expect(layersSource).toContain('width: max-content !important')
    expect(layersSource).toContain('min-width: max-content')
    expect(wrapper.get('.tag-preview__hint').element.parentElement?.classList.contains('tag-preview__editor')).toBe(true)
    expect(wrapper.find('.tag-preview .performance-rich-text-box.is-readonly').exists()).toBe(false)
    const tagCheckboxes = wrapper.findAll('.tag-checks input')
    await tagCheckboxes[0].setValue(true)
    expect(wrapper.get('.tag-preview__selected-tag').text()).toContain('做得好的')
    expect(wrapper.get('.tag-preview__selected-group').text()).toContain('做得好的')
    expect(wrapper.get('.tag-preview__selected-group .tag-preview__prompt').text()).toBe('请填写做得好的内容')
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

  it('uses the shared repeatable fill-item component for custom text items', async () => {
    const wrapper = mountLayers()
    await openType(wrapper, '自定义')
    await modalInputs(wrapper)[0].setValue('自定义内容')
    const list = wrapper.get('.repeatable-fill-item-list')
    expect(list.findAll('.saved-item')).toHaveLength(1)
    await list.find('input[placeholder="请输入"]').setValue('第一个填写项')
    await wrapper.get('.add-button').trigger('click')

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
    expect(layersSource).toContain('display: grid')
    expect(layersSource).toContain('grid-area: 1 / 1')
  })

  it('removes the long hint from the sizing grid after rich-text input begins', async () => {
    const wrapper = mountLayers()
    await openType(wrapper, '自定义')
    await wrapper.get('.repeatable-fill-item-list textarea[placeholder="请输入填写提示"]').setValue('这是一段很长的提示，用于验证预览高度不会在实际输入后保留提示文本占用的空白区域。')
    const editor = wrapper.get('.preview-pane [contenteditable="true"]').element as HTMLElement
    expect(wrapper.find('.preview-pane .rich-placeholder').exists()).toBe(true)
    editor.innerHTML = '<div class="ace-line" data-node="true"><span data-string="true" data-leaf="true">实际填写内容</span></div>'
    editor.dispatchEvent(new InputEvent('input', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.preview-pane .rich-placeholder').exists()).toBe(false)
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
    await wrapper.get('.add-button').trigger('click')

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
})
