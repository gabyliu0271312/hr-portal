import { mount } from '@vue/test-utils'
import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import PerformanceReferenceContentDrawer from './PerformanceReferenceContentDrawer.vue'

const componentSource = readFileSync(resolve(__dirname, 'PerformanceReferenceContentDrawer.vue'), 'utf8')

const nodeCandidates = [
  { value: 'n1', label: '工作总结环节' },
  { value: 'n4', label: '评估型环节' },
]
const moreOptions = [
  { value: 'okr', label: 'OKR', description: '支持展示 OKR 内容、OKR 日志、OKR 异常完成情况等信息' },
  { value: 'more_reference', label: '更多参考', description: '支持展示绩效信息、异动信息、补充信息等其他信息' },
  { value: 'team_stats', label: '团队统计', description: '有对应权限的用户可查看被评估人下级同周期的绩效结果分布（如被评估人无下级，则不展示此参考内容）' },
]

function mountDrawer(props: Partial<InstanceType<typeof PerformanceReferenceContentDrawer>['$props']> = {}) {
  return mount(PerformanceReferenceContentDrawer, {
    props: {
      open: true,
      nodeCandidates,
      moreOptions,
      selected: [],
      ...props,
    },
    attachTo: document.body,
  })
}

describe('PerformanceReferenceContentDrawer', () => {
  beforeEach(() => { document.body.innerHTML = '' })
  afterEach(() => { document.body.innerHTML = '' })

  it('renders the captured drawer structure: header, two groups, fixed more options, footer order', () => {
    mountDrawer()
    const drawer = document.body.querySelector('.reference-drawer')
    expect(drawer).not.toBeNull()
    expect(drawer?.getAttribute('role')).toBe('dialog')
    expect(drawer?.querySelector('.reference-drawer__title-text')?.textContent).toBe('选择参考内容')
    expect([...document.body.querySelectorAll('.reference-drawer__group-title')].map((n) => n.textContent)).toEqual(['评估环节内容', '更多参考内容'])
    expect([...document.body.querySelectorAll('.reference-drawer__group:nth-of-type(2) .reference-option-card__text')].map((n) => n.textContent)).toEqual(['OKR', '更多参考', '团队统计'])
    const footerButtons = [...document.body.querySelectorAll('.reference-drawer__footer button')].map((n) => n.textContent)
    expect(footerButtons).toEqual(['确认', '取消'])
    expect(document.body.querySelector('.reference-drawer__close-button svg[data-icon="CloseOutlined"]')).not.toBeNull()
  })

  it('renders node candidates excluding none by default and marks multiline cards with descriptions', () => {
    mountDrawer()
    const nodeTexts = [...document.body.querySelectorAll('.reference-drawer__group:nth-of-type(1) .reference-option-card__text')].map((n) => n.textContent)
    expect(nodeTexts).toEqual(['工作总结环节', '评估型环节'])
    const descriptions = [...document.body.querySelectorAll('.reference-drawer__group:nth-of-type(2) .reference-option-card__description')].map((n) => n.textContent)
    expect(descriptions).toEqual(moreOptions.map((o) => o.description))
  })

  it('toggles selection with the captured checked visual contract and emits confirm with selection', async () => {
    const wrapper = mountDrawer({ selected: ['n1'] })
    const wallpapers = [...document.body.querySelectorAll('.reference-drawer__group:nth-of-type(1) .reference-option-card__wallpaper')] as HTMLElement[]
    expect(wallpapers[0].classList.contains('reference-option-card__wallpaper--checked')).toBe(true)
    expect(wallpapers[1].classList.contains('reference-option-card__wallpaper--checked')).toBe(false)
    expect(wallpapers[0].querySelector('.reference-option-card__checked-svg')).not.toBeNull()
    expect(wallpapers[1].querySelector('.reference-option-card__checked-svg')).toBeNull()

    const inputs = [...document.body.querySelectorAll('.reference-drawer__group:nth-of-type(1) .reference-option-card__input')] as HTMLInputElement[]
    inputs[1].click()
    await wrapper.vm.$nextTick()
    expect(wallpapers[1].classList.contains('reference-option-card__wallpaper--checked')).toBe(true)

    ;([...document.body.querySelectorAll('.reference-drawer__footer button')].find((n) => n.textContent === '确认') as HTMLButtonElement).click()
    const confirmEvents = wrapper.emitted('confirm')
    expect(confirmEvents).toHaveLength(1)
    expect(confirmEvents![0]).toEqual([['n1', 'n4']])
    expect(wrapper.emitted('update:open')).toBeUndefined()
  })

  it('cancel and close button close without emitting confirm; Escape keypress does not close', async () => {
    const wrapper = mountDrawer()
    const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    document.body.querySelector('.reference-drawer')?.dispatchEvent(escapeEvent)
    await wrapper.vm.$nextTick()
    expect(wrapper.props('open')).toBe(true)
    expect(wrapper.emitted('update:open')).toBeUndefined()

    ;([...document.body.querySelectorAll('.reference-drawer__footer button')].find((n) => n.textContent === '取消') as HTMLButtonElement).click()
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    expect(wrapper.emitted('update:open')?.at(-1)).toEqual([false])
    expect(wrapper.emitted('confirm')).toBeUndefined()
  })

  it('encodes the captured CSS contract for panel, cards, checkbox and footer buttons', () => {
    expect(componentSource).not.toBe('')
    const css = componentSource.replace(/\s+/g, ' ')
    const expectations = [
      'width: 680px;',
      'padding: 16px 24px;',
      'border-bottom: 1px solid rgba(31, 35, 41, 0.15);',
      'margin: -2px -4px;',
      'width: 20px; height: 20px;',
      'min-height: 54px;',
      'padding-top: 12px; padding-bottom: 12px;',
      'border: 1px solid #dee0e3;',
      'gap: 12px;',
      '.reference-option-card:hover { border-color: #3370ff; }',
      'border: 1px solid #8f959e;',
      'border-radius: 4px;',
      '.reference-option-card__wallpaper--checked { border-color: transparent; background: #1456f0; }',
      'margin-left: 12px;',
      'color: #646a73;',
      'height: 62px; padding: 10px 0 20px 24px;',
      'min-width: 80px;',
      'border: 1px solid #1456f0;',
      'margin-right: 12px;',
      'border: 1px solid #d0d3d6;',
      '.reference-drawer__confirm:active { background: #0442d2;',
      '.reference-drawer__cancel:hover { background: #eff0f1; }',
    ]
    expectations.forEach((declaration) => { expect(css).toContain(declaration) })
  })
})
