import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { PerformanceCycleProjectShell } from '@/api/performance'
import PerformanceProjectSettings from './PerformanceProjectSettings.vue'

function project(overrides: Partial<PerformanceCycleProjectShell>): PerformanceCycleProjectShell {
  return {
    id: 1,
    project_ref: 'P1',
    name: '项目一',
    description: null,
    administrators: [],
    status: 'DRAFT',
    evaluated_count: 0,
    configuration_completed: false,
    ...overrides,
  }
}

const stubs = {
  PerformancePermissionButton: { template: '<button><slot /></button>' },
  PerformanceListToolbar: {
    props: ['filterActive', 'filterCount'],
    emits: ['filter'],
    template: '<div><button class="filter-trigger" @click="$emit(\'filter\', $event.currentTarget)">筛选{{ filterActive ? ` (${filterCount})` : \'\' }}</button></div>',
  },
  PerformanceFilterPopover: {
    props: ['visible'],
    template: '<div v-if="visible" class="filter-popover"><slot /><slot name="footer" /></div>',
  },
  PerformanceFilterField: {
    props: ['field', 'modelValue'],
    emits: ['update:modelValue'],
    template: '<button class="field" :data-key="field.key" @click="$emit(\'update:modelValue\', field.key === \'status\' ? [\'enabled\'] : [\'张三\'])">{{ field.label }}</button>',
  },
  PerformanceFilterActions: {
    emits: ['confirm', 'cancel', 'clear'],
    template: '<div><button class="confirm" @click="$emit(\'confirm\')">confirm</button><button class="cancel" @click="$emit(\'cancel\')">cancel</button><button class="clear" @click="$emit(\'clear\')">clear</button></div>',
  },
  PerformanceManagementTable: {
    props: ['rows', 'total'],
    template: '<div><div class="table-rows">{{ rows.map(row => row.name).join(\',\') }}</div><span class="table-total">{{ total }}</span></div>',
  },
}

const projects = [
  project({ id: 1, name: '销售项目', status: 'STARTED', administrators: ['张三'] }),
  project({ id: 2, name: '研发项目', status: 'DRAFT', configuration_completed: true, administrators: ['李四'] }),
  project({ id: 3, name: '财务项目', status: 'ARCHIVED', administrators: ['张三', '李四'] }),
  project({ id: 4, name: '招聘项目', status: 'DRAFT', administrators: [] }),
]

function mountSettings() {
  return mount(PerformanceProjectSettings, {
    props: { projects, projectCount: projects.length, cycleId: 1 },
    global: { stubs },
  })
}

describe('PerformanceProjectSettings filter', () => {
  it('applies status filters only after confirm and counts active fields', async () => {
    const wrapper = mountSettings()
    expect(wrapper.get('.table-rows').text()).toBe('销售项目,研发项目,财务项目,招聘项目')

    await wrapper.get('.filter-trigger').trigger('click')
    await wrapper.get('.field[data-key="status"]').trigger('click')
    expect(wrapper.get('.table-rows').text()).toBe('销售项目,研发项目,财务项目,招聘项目')

    await wrapper.get('.confirm').trigger('click')
    expect(wrapper.get('.table-rows').text()).toBe('销售项目')
    expect(wrapper.get('.filter-trigger').text()).toContain('筛选 (1)')
    expect(wrapper.get('.table-total').text()).toBe('1')
  })

  it('clears only the draft and keeps applied filters until confirm', async () => {
    const wrapper = mountSettings()
    await wrapper.get('.filter-trigger').trigger('click')
    await wrapper.get('.field[data-key="status"]').trigger('click')
    await wrapper.get('.confirm').trigger('click')
    expect(wrapper.get('.table-rows').text()).toBe('销售项目')

    await wrapper.get('.filter-trigger').trigger('click')
    await wrapper.get('.clear').trigger('click')
    expect(wrapper.get('.table-rows').text()).toBe('销售项目')
    expect(wrapper.get('.filter-trigger').text()).toContain('筛选 (1)')

    await wrapper.get('.confirm').trigger('click')
    expect(wrapper.get('.table-rows').text()).toBe('销售项目,研发项目,财务项目,招聘项目')
    expect(wrapper.get('.filter-trigger').text()).not.toContain('(')
  })

  it('filters by administrator name', async () => {
    const wrapper = mountSettings()
    await wrapper.get('.filter-trigger').trigger('click')
    await wrapper.get('.field[data-key="manager"]').trigger('click')
    await wrapper.get('.confirm').trigger('click')
    expect(wrapper.get('.table-rows').text()).toBe('销售项目,财务项目')
  })
})
