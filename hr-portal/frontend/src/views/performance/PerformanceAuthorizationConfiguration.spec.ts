import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PerformanceAuthorizationConfiguration from './PerformanceAuthorizationConfiguration.vue'
import PerformanceCreateButton from '@/components/performance/PerformanceCreateButton.vue'
import PerformanceListToolbar from '@/components/performance/PerformanceListToolbar.vue'
import PerformanceManagementTable from '@/components/performance/PerformanceManagementTable.vue'
import pageSource from './PerformanceAuthorizationConfiguration.vue?raw'
import routerSource from '@/router/index.ts?raw'

const messages = vi.hoisted(() => ({ info: vi.fn() }))
vi.mock('element-plus', async (importOriginal) => ({
  ...await importOriginal<typeof import('element-plus')>(),
  ElMessage: messages,
}))

function mountPage() {
  return mount(PerformanceAuthorizationConfiguration, {
    global: {
      stubs: {
        PerformanceManagementTable: {
          props: ['rows', 'emptyText', 'total'],
          template: '<div class="management-table"><slot /><p>{{ emptyText }}</p></div>',
        },
        ElTableColumn: { props: ['label'], template: '<div class="column">{{ label }}<slot /></div>' },
        PerformancePermissionButton: {
          props: ['ariaLabel'],
          emits: ['click'],
          template: '<button :aria-label="ariaLabel" @click="$emit(\'click\')"><slot /></button>',
        },
        PerformanceAuthorizationDialog: {
          props: ['modelValue', 'mode'],
          emits: ['update:modelValue'],
          template: '<div v-if="modelValue" role="dialog">{{ mode }}</div>',
        },
      },
    },
  })
}

function labels(wrapper: ReturnType<typeof mountPage>) {
  return wrapper.findAll('.column').map(column => column.element.firstChild?.textContent?.trim())
}

describe('PerformanceAuthorizationConfiguration', () => {
  beforeEach(() => vi.clearAllMocks())

  it('defaults to user authorizations and reuses the shared toolbar, buttons and table', () => {
    const wrapper = mountPage()
    expect(wrapper.get('h1').text()).toBe('授权配置')
    expect(wrapper.findAll('[role="tab"]').map(tab => tab.text())).toEqual(['指定用户授权', '按规则授权'])
    expect(wrapper.get('[role="tab"][aria-selected="true"]').text()).toBe('指定用户授权')
    expect(wrapper.findComponent(PerformanceCreateButton).props('label')).toBe('添加授权')
    expect(wrapper.findComponent(PerformanceListToolbar).props('showFilter')).toBe(false)
    expect(labels(wrapper)).toEqual(['选择用户', '授权角色', '更新人', '最近更新时间', '操作'])
    expect(wrapper.findComponent(PerformanceManagementTable).props('rows')).toEqual([])
    expect(wrapper.text()).toContain('暂无用户授权')
    expect(wrapper.find('[aria-label="编辑授权"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="删除规则"]').exists()).toBe(false)
  })

  it('switches to rule authorizations with edit and delete actions', async () => {
    const wrapper = mountPage()
    await wrapper.findAll('[role="tab"]')[1].trigger('click')
    expect(wrapper.findComponent(PerformanceCreateButton).props('label')).toBe('添加规则')
    expect(labels(wrapper)).toEqual(['用户范围', '授权角色', '更新人', '最近更新时间', '操作'])
    expect(wrapper.text()).toContain('暂无授权规则')
    expect(wrapper.find('[aria-label="编辑规则"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="删除规则"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="导出"]').exists()).toBe(true)
  })

  it('keeps tab searches separate and does not fabricate matching rows', async () => {
    const wrapper = mountPage()
    wrapper.findComponent(PerformanceListToolbar).vm.$emit('update:keyword', '管理员')
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('暂无匹配结果')
    await wrapper.findAll('[role="tab"]')[1].trigger('click')
    expect(wrapper.findComponent(PerformanceListToolbar).props('keyword')).toBe('')
    await wrapper.findAll('[role="tab"]')[0].trigger('click')
    expect(wrapper.findComponent(PerformanceListToolbar).props('keyword')).toBe('管理员')
  })

  it('opens the matching add dialog shell for each tab', async () => {
    const wrapper = mountPage()
    await wrapper.findComponent(PerformanceCreateButton).trigger('click')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    expect(wrapper.get('[role="dialog"]').text()).toContain('users')
    await wrapper.findAll('[role="tab"]')[1].trigger('click')
    await wrapper.findComponent(PerformanceCreateButton).trigger('click')
    expect(wrapper.get('[role="dialog"]').text()).toContain('rules')
  })

  it('keeps mutations for the next step and uses the shared token boundary', async () => {
    const wrapper = mountPage()
    await wrapper.findAll('[role="tab"]')[1].trigger('click')
    await wrapper.get('[aria-label="删除规则"]').trigger('click')
    expect(messages.info).toHaveBeenLastCalledWith('删除规则功能将在后续任务接入')
    await wrapper.get('[aria-label="导出"]').trigger('click')
    expect(messages.info).toHaveBeenLastCalledWith('导出功能将在后续任务接入')
    expect(pageSource).not.toMatch(/#[\da-fA-F]{3,8}\b|rgba?\(/)
    expect(routerSource).toContain("import('@/views/performance/PerformanceAuthorizationConfiguration.vue')")
  })
})
