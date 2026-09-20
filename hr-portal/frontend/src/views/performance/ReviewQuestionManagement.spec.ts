import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { push, replace, route } = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  route: { query: {} as Record<string, string> },
}))

vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ push, replace }),
}))

vi.mock('@/api/performance', () => ({
  performanceReviewQuestionApi: { list: vi.fn().mockResolvedValue([]) },
}))

import ReviewQuestionManagement from './ReviewQuestionManagement.vue'
import reviewQuestionManagementSource from './ReviewQuestionManagement.vue?raw'

function mountView() {
  return mount(ReviewQuestionManagement, {
    global: {
      stubs: {
        PerformanceListPage: {
          props: ['title'],
          template: '<main><h1>{{ title }}</h1><slot name="header" /><slot /></main>',
        },
        PerformanceListToolbar: { template: '<div data-testid="question-toolbar"><slot name="left" /></div>' },
        ReviewQuestionTable: { template: '<div data-testid="question-table">评估题表格</div>' },
        ReviewRuleManagement: {
          emits: ['create', 'edit'],
          template: '<div data-testid="rule-management">评估规则列表<button data-testid="rule-create" @click="$emit(\'create\')">新建规则</button></div>',
        },
        ReviewQuestionEditModal: { template: '<div />' },
        'el-dropdown': { emits: ['command'], template: '<div><button data-regular @click="$emit(\'command\', \'create\')">普通题</button><button data-sub @click="$emit(\'command\', \'create-sub\')">子题</button><slot /><slot name="dropdown" /></div>' },
        'el-dropdown-menu': { template: '<div><slot /></div>' },
        'el-dropdown-item': { template: '<button><slot /></button>' },
        'el-button': { template: '<button><slot /></button>' },
      },
    },
  })
}

describe('ReviewQuestionManagement', () => {
  beforeEach(() => {
    push.mockReset()
    replace.mockReset()
    route.query = {}
  })

  it('does not mount a second filter panel below the toolbar', () => {
    expect(reviewQuestionManagementSource).not.toContain('ReviewQuestionFilterPanel')
  })
  it('switches from the question table to the review-rule list', async () => {
    const wrapper = mountView()
    const tabs = wrapper.findAll('.tab')

    expect(wrapper.get('h1').text()).toBe('评估题')
    expect(tabs[0].classes()).toContain('active')
    expect(wrapper.find('[data-testid="question-table"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="rule-management"]').exists()).toBe(false)

    await tabs[1].trigger('click')

    expect(tabs[1].classes()).toContain('active')
    expect(wrapper.find('[data-testid="question-toolbar"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="question-table"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="rule-management"]').text()).toContain('评估规则列表')
    expect(replace).toHaveBeenCalledWith({ query: { tab: 'rule' } })
  })

  it('opens ordinary and sub-question entries from separate menu commands', async () => {
    const wrapper = mountView()
    await wrapper.get('[data-regular]').trigger('click')
    await wrapper.get('[data-sub]').trigger('click')

    expect(push).toHaveBeenNthCalledWith(1, { name: 'ReviewQuestionCreate' })
    expect(push).toHaveBeenNthCalledWith(2, { name: 'ReviewQuestionCreate', query: { isSub: null } })
  })

  it('restores the rule tab from the route query and opens create', async () => {
    route.query = { tab: 'rule' }
    const wrapper = mountView()
    expect(wrapper.findAll('.tab')[1].classes()).toContain('active')
    await wrapper.get('[data-testid="rule-create"]').trigger('click')
    expect(push).toHaveBeenCalledWith({ name: 'ReviewRuleCreate' })
  })
})
