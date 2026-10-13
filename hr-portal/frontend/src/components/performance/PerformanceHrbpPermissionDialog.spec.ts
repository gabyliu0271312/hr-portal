import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, afterEach } from 'vitest'

afterEach(() => {
  document.body.innerHTML = ''
})
import PerformanceHrbpPermissionDialog from './PerformanceHrbpPermissionDialog.vue'
import PerformanceOrganizationTreeSelect from './PerformanceOrganizationTreeSelect.vue'

describe('PerformanceOrganizationTreeSelect', () => {
  it('renders hierarchy and selects an organization node', async () => {
    const nodes = [{ value: '集团', label: '集团', level: 1, children: [{ value: '集团/研发部', label: '研发部', level: 2, children: [] }] }]
    const wrapper = mount(PerformanceOrganizationTreeSelect, { props: { modelValue: [], nodes }, attachTo: document.body })

    await wrapper.get('.performance-organization-tree-select__trigger').trigger('click')
    await flushPromises()
    expect(document.body.querySelectorAll('[role="treeitem"]')).toHaveLength(2)
    document.body.querySelectorAll<HTMLButtonElement>('.performance-organization-tree-node__label')[1].click()
    await flushPromises()
    expect(wrapper.emitted('update:modelValue')?.[0]?.[0]).toEqual(['集团/研发部'])

    await wrapper.setProps({ modelValue: ['集团/研发部'] })
    expect(document.body.querySelector('.performance-select-shell__tag')?.textContent).toContain('研发部')
    document.body.querySelector<HTMLButtonElement>('.performance-select-shell__tag-close')?.click()
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toEqual([])
    expect(document.body.querySelector('.performance-organization-tree-node.is-selected')).not.toBeNull()
  })
  it('keeps a directly matched parent collapsed while allowing manual expansion', async () => {
    const nodes = [{ value: '集团', label: '集团', level: 1, children: [{ value: '集团/研发部', label: '研发部', level: 2, children: [] }] }]
    const wrapper = mount(PerformanceOrganizationTreeSelect, { props: { modelValue: [], nodes }, attachTo: document.body })

    await wrapper.get('.performance-organization-tree-select__trigger').trigger('click')
    await wrapper.get('input[role="combobox"]').setValue('集团')
    await flushPromises()

    const item = document.body.querySelector('[role="treeitem"]')
    expect(item?.getAttribute('aria-expanded')).toBe('false')
    expect(document.body.querySelector('.performance-organization-tree-node__expand')).not.toBeNull()
    document.body.querySelector<HTMLButtonElement>('.performance-organization-tree-node__expand')?.click()
    await flushPromises()
    expect(document.body.querySelector('[role="treeitem"]')?.getAttribute('aria-expanded')).toBe('true')
    expect(document.body.textContent).toContain('研发部')
  })
})

describe('PerformanceHrbpPermissionDialog', () => {
  const options = {
    hrbpOptions: [{ value: 'hrbp-1', label: '张三' }],
    organizationTree: [{ value: '集团/研发部', label: '集团', level: 1, children: [{ value: '集团/研发部', label: '研发部', level: 2, children: [] }] }],
    invisiblePeopleOptions: [{ value: 'person-1', label: '李四' }],
  }

  it('renders the captured modal structure and shared controls', () => {
    const wrapper = mount(PerformanceHrbpPermissionDialog, {
      props: { modelValue: true, ...options },
      attachTo: document.body,
    })

    expect(document.body.textContent).toContain('添加 HRBP')
    expect(document.body.textContent).toContain('HRBP 将拥有其权限范围内成员的数据权限')
    expect(document.body.textContent).toContain('设置「不可见人员」')
    expect(document.body.querySelector('.prompt-notice--multiline')).not.toBeNull()
    expect(document.body.querySelectorAll('.performance-required-label__mark')).toHaveLength(2)
    expect(document.body.querySelectorAll('.performance-search-select__trigger')).toHaveLength(1)
    expect(document.body.querySelector('.performance-organization-tree-select__trigger')).not.toBeNull()
  })

  it('shows invisible people selector after opening the switch', async () => {
    const wrapper = mount(PerformanceHrbpPermissionDialog, {
      props: { modelValue: true, ...options },
      attachTo: document.body,
    })

    expect(document.body.querySelector('.hrbp-permission-dialog__invisible-select')).toBeNull()
    await document.querySelector('#hrbp-invisible-people')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    expect(document.body.querySelector('.hrbp-permission-dialog__invisible-select')).not.toBeNull()
  })

  it('validates required fields and emits the form value', async () => {
    const wrapper = mount(PerformanceHrbpPermissionDialog, {
      props: { modelValue: true, ...options },
      attachTo: document.body,
    })

    await document.querySelector('.hrbp-permission-dialog__button--primary')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    expect(document.body.querySelectorAll('.performance-form-item--invalid')).toHaveLength(2)

    await wrapper.setProps({
      modelValue: false,
      initialValue: { hrbp: 'hrbp-1', scope: ['dept-1'] },
    })
    await wrapper.setProps({ modelValue: true })
    await flushPromises()
    await document.querySelector<HTMLButtonElement>('.hrbp-permission-dialog__button--primary')?.click()
    await flushPromises()

    expect(wrapper.emitted('submit')?.[0]?.[0]).toEqual({
      hrbp: 'hrbp-1',
      scope: ['dept-1'],
      invisiblePeopleEnabled: false,
      invisiblePeople: [],
    })
  })
})
