import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import PerformanceCycleSettingsMenu from './PerformanceCycleSettingsMenu.vue'

let wrapper: VueWrapper | undefined

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.innerHTML = ''
})

describe('PerformanceCycleSettingsMenu', () => {
  it('renders all five confirmed settings with one shared item structure', async () => {
    wrapper = mount(PerformanceCycleSettingsMenu, { attachTo: document.body })
    const trigger = wrapper.get('[aria-label="设置周期"]')
    expect(trigger.attributes('aria-expanded')).toBe('false')

    await trigger.trigger('click')

    expect(trigger.attributes('aria-expanded')).toBe('true')
    const items = Array.from(document.body.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
    expect(items).toHaveLength(5)
    expect(items.map(item => ({
      title: item.querySelector('.cycle-settings-menu__title')?.textContent,
      description: item.querySelector('.cycle-settings-menu__description')?.textContent,
    }))).toEqual([
      { title: 'HRBP 权限管理', description: '可管理该周期内角色成员的数据权限' },
      { title: '人员组管理', description: '可管理周期内的人员组' },
      { title: '自定义聚合维度', description: '可自定义该周期内的人员聚合维度' },
      { title: '报表配置', description: '可配置该周期内的报表内容' },
      { title: '评估关系管理', description: '可管理该周期内各成员之间的评估关系' },
    ])
    expect(items.every(item => item.classList.contains('cycle-settings-menu__item'))).toBe(true)
  })

  it('emits a stable key and closes without owning navigation', async () => {
    wrapper = mount(PerformanceCycleSettingsMenu, { attachTo: document.body })
    await wrapper.get('[aria-label="设置周期"]').trigger('click')
    document.body.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')[3].click()
    await nextTick()

    expect(wrapper.emitted('select')).toEqual([['report']])
    expect(document.body.querySelector('[role="menu"]')).toBeNull()
    expect(wrapper.get('[aria-label="设置周期"]').attributes('aria-expanded')).toBe('false')
  })

  it('closes on outside pointer input', async () => {
    wrapper = mount(PerformanceCycleSettingsMenu, { attachTo: document.body })
    await wrapper.get('[aria-label="设置周期"]').trigger('click')
    expect(document.body.querySelector('[role="menu"]')).not.toBeNull()

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await nextTick()

    expect(document.body.querySelector('[role="menu"]')).toBeNull()
  })

  it('supports keyboard opening, navigation, and escape focus restoration', async () => {
    wrapper = mount(PerformanceCycleSettingsMenu, { attachTo: document.body })
    const trigger = wrapper.get<HTMLButtonElement>('[aria-label="设置周期"]')
    await trigger.trigger('keydown', { key: 'ArrowDown' })
    await nextTick()

    const items = Array.from(document.body.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
    expect(document.activeElement).toBe(items[0])
    items[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    await nextTick()
    expect(document.activeElement).toBe(items[1])

    items[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await nextTick()
    expect(document.body.querySelector('[role="menu"]')).toBeNull()
    expect(document.activeElement).toBe(trigger.element)
  })
})
