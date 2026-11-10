import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceListToolbar from './PerformanceListToolbar.vue'
import toolbarSource from './PerformanceListToolbar.vue?raw'
import SearchInput from '../common/SearchInput.vue'

function mountToolbar(props = {}, slots = {}) {
  return mount(PerformanceListToolbar, {
    props: { keyword: '项目', searchPlaceholder: '搜索成员', searchAriaLabel: '搜索成员', ...props },
    global: {
      stubs: {
        'el-button': { template: '<button type="button" @click="$emit(\'click\')"><slot /></button>' },
      },
    },
    slots: {
      actions: '<button class="export-button" type="button">导出</button>',
      ...slots,
    },
  })
}

describe('PerformanceListToolbar', () => {
  it('provides a shared search, filter and extension-action boundary', async () => {
    const wrapper = mountToolbar()

    expect(wrapper.find('input').attributes('placeholder')).toBe('搜索成员')
    expect(wrapper.find('.export-button').exists()).toBe(true)
    expect(wrapper.find('.list-toolbar').attributes('style')).toContain('gap: var(--page-gap-toolbar-items)')

    await wrapper.find('.filter-button').trigger('click')
    await wrapper.find('input').setValue('成员')
    await wrapper.find('input').trigger('keyup.enter')

    expect(wrapper.emitted('filter')).toHaveLength(1)
    expect(wrapper.emitted('update:keyword')).toEqual([['成员']])
    expect(wrapper.emitted('search')).toEqual([[]])

    await wrapper.find('button[aria-label="清除搜索"]').trigger('click')
    expect(wrapper.emitted('update:keyword')?.at(-1)).toEqual([''])
    expect(wrapper.emitted('clear')).toEqual([[]])
  })

  it('keeps the admin search fixed-width and reserves flexible space before it', async () => {
    const wrapper = mountToolbar()

    expect(wrapper.find('.toolbar-spacer').exists()).toBe(true)
    expect(wrapper.classes()).not.toContain('is-search-fill')
    expect(wrapper.find('.search-input--fill').exists()).toBe(false)
    expect(wrapper.findComponent(SearchInput).props('width')).toBe('var(--search-input-width)')
    expect(toolbarSource).toMatch(/\.search-input\s*\{\s*flex: 0 0 auto;\s*min-width: 0;/)

    await wrapper.setProps({ searchWidth: 'var(--search-input-width-wide)' })
    expect(wrapper.findComponent(SearchInput).props('width')).toBe('var(--search-input-width-wide)')
    expect(wrapper.find('.search-input').attributes('style')).toContain('width: var(--search-input-width-wide)')
  })

  it('fills remaining member-toolbar space without a competing 100% inline width', async () => {
    const wrapper = mountToolbar({ searchFill: true, searchWidth: '100%' })

    expect(wrapper.classes()).toContain('is-search-fill')
    expect(wrapper.find('.toolbar-spacer').exists()).toBe(false)
    expect(wrapper.find('.search-input--fill').exists()).toBe(true)
    expect(wrapper.findComponent(SearchInput).props('width')).toBe('auto')
    expect(wrapper.find('.search-input').attributes('style')).toContain('width: auto')
    expect(toolbarSource).toMatch(/\.search-input--fill\s*\{\s*flex: 1 1 0;/)

    await wrapper.setProps({ searchFill: false, searchWidth: 'var(--search-input-width)' })
    expect(wrapper.find('.toolbar-spacer').exists()).toBe(true)
    expect(wrapper.find('.search-input--fill').exists()).toBe(false)
  })

  it('groups multiple slot actions with inherited spacing and prevents action shrinking', () => {
    const wrapper = mountToolbar({ searchFill: true }, {
      left: '<button>新建</button><button>导入</button>',
      actions: '<button>导出</button><button>批量操作</button>',
    })

    expect(wrapper.findAll('.toolbar-left > button')).toHaveLength(2)
    expect(wrapper.findAll('.toolbar-actions > button')).toHaveLength(2)
    expect(wrapper.findAll('.toolbar-group')).toHaveLength(2)
    expect(wrapper.find('.toolbar-spacer').exists()).toBe(false)
    expect(toolbarSource).toMatch(/\.toolbar-group\s*\{[^}]*flex: 0 0 auto;[^}]*gap: inherit;/)
    expect(toolbarSource).toMatch(/\.toolbar-group > :deep\(\*\)\s*\{\s*flex-shrink: 0;/)
    expect(toolbarSource).toMatch(/\.filter-button\s*\{\s*flex-shrink: 0;/)
  })

  it.each([
    [12, '12px'],
    [0, '0px'],
    ['var(--spacing-2)', 'var(--spacing-2)'],
  ])('accepts legacy numeric or token gap %s', (gap, expected) => {
    const wrapper = mountToolbar({ gap })
    expect(wrapper.find('.list-toolbar').attributes('style')).toContain(`gap: ${expected}`)
  })

  it('omits unused groups and preserves filter visibility and disabled state', async () => {
    const wrapper = mount(PerformanceListToolbar, { props: { keyword: '', showFilter: false } })

    expect(wrapper.find('.toolbar-group').exists()).toBe(false)
    expect(wrapper.find('.filter-button').exists()).toBe(false)
    expect(wrapper.findComponent(SearchInput).props('width')).toBe('var(--search-input-width)')

    await wrapper.setProps({ showFilter: true, filterDisabled: true })
    expect(wrapper.find('.filter-button').attributes('disabled')).toBeDefined()
  })
})
