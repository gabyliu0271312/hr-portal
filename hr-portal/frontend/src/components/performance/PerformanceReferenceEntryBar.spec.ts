import { mount } from '@vue/test-utils'
import { beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import PerformanceReferenceEntryBar from './PerformanceReferenceEntryBar.vue'

const componentSource = readFileSync(resolve(__dirname, 'PerformanceReferenceEntryBar.vue'), 'utf8')

function assertCss(css: string, declarations: string[]) {
  declarations.forEach((declaration) => {
    expect(css.replace(/\s+/g, ' ')).toContain(declaration.replace(/\s+/g, ' '))
  })
}

describe('PerformanceReferenceEntryBar', () => {
  beforeAll(() => {
    expect(componentSource).not.toBe('')
  })

  it('renders the captured sticky bar element and button structure', () => {
    const wrapper = mount(PerformanceReferenceEntryBar)
    const bar = wrapper.get('.reference-entry-bar')
    const button = wrapper.get('button')
    expect(button.element.parentElement).toBe(bar.element)
    expect(button.text()).toBe('选择参考内容')
    const iconInline = button.get('.reference-entry-bar__icon-inline')
    expect(iconInline.attributes('aria-hidden')).toBe('true')
    expect(iconInline.find('.reference-entry-bar__icon svg').exists()).toBe(true)
    const bareTextNodes = [...button.element.childNodes].filter(
      (node) => node.nodeType === Node.TEXT_NODE && (node.textContent || '').trim() === '选择参考内容',
    )
    expect(bareTextNodes).toHaveLength(1)
  })

  it('renders the captured AddEntryOutlined SVG with original paths and currentColor', () => {
    const wrapper = mount(PerformanceReferenceEntryBar)
    const svg = wrapper.get('svg[data-icon="AddEntryOutlined"]')
    expect(svg.element.getAttribute('viewBox')).toBe('0 0 24 24')
    expect(svg.element.getAttribute('fill')).toBe('none')
    const paths = svg.findAll('path')
    expect(paths).toHaveLength(2)
    paths.forEach((path) => expect(path.element.getAttribute('fill')).toBe('currentColor'))
    expect(paths[0].element.getAttribute('d')).toContain('M5 3h14v10h2V3a2 2 0 0 0-2-2H5')
    expect(paths[1].element.getAttribute('d')).toContain('M7 8a1 1 0 0 1 1-1h3a1 1 0 1 1 0 2H8')
  })

  it('encodes the captured sticky bar and text-primary button CSS contract', () => {
    const css = componentSource
    assertCss(css, [
      'display: flex; position: sticky; bottom: 8px; z-index: 20;',
      'height: 54px; margin-bottom: 24px;',
      'background-color: var(--color-bg-card); border-radius: var(--performance-button-radius);',
      'padding: 2px 4px;',
      'border-radius: var(--performance-button-radius); font: var(--performance-button-font-weight) var(--performance-button-font-size)/18px',
      'white-space: nowrap; color: var(--performance-button-text-color);',
      'transition: color var(--duration-fast) var(--ease-standard), background-color var(--duration-fast) var(--ease-standard), border-color var(--duration-fast) var(--ease-standard), width var(--duration-base) var(--ease-standard)',
      '.reference-entry-bar__button:hover { background-color: var(--performance-button-text-hover-background); }',
      '.reference-entry-bar__icon-inline { display: block; margin-right: 4px;',
      '.reference-entry-bar__icon svg { display: inline-block; overflow: hidden; width: 14px; height: 14px;',
    ])
  })

  it('emits select once per click', async () => {
    const wrapper = mount(PerformanceReferenceEntryBar)
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('select')).toHaveLength(1)
  })
})
