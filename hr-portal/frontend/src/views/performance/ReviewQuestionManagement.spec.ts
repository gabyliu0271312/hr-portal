import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { push, replace, route, list, remove, confirm, success, error } = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  route: { query: {} as Record<string, string> },
  list: vi.fn(),
  remove: vi.fn(),
  confirm: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ push, replace }),
}))

vi.mock('@/api/performance', () => ({
  performanceReviewQuestionApi: { list, remove },
  performanceReviewRuleApi: { list: vi.fn().mockResolvedValue([]) },
}))

vi.mock('element-plus', async () => ({
  ...await vi.importActual<any>('element-plus'),
  ElMessageBox: { confirm },
  ElMessage: { success, error },
}))

import ReviewQuestionManagement from './ReviewQuestionManagement.vue'
import reviewQuestionManagementSource from './ReviewQuestionManagement.vue?raw'

function mountView(realRules = false) {
  return mount(ReviewQuestionManagement, {
    global: {
      stubs: {
        PerformanceListPage: {
          props: ['title'],
          template: '<main><h1>{{ title }}</h1><slot name="header" /><slot /></main>',
        },
        PerformanceListToolbar: { template: '<div data-testid="question-toolbar"><slot name="left" /></div>' },
        ReviewQuestionTable: {
          props: ['questions'],
          emits: ['remove'],
          template: '<div data-testid="question-table">评估题表格<button v-for="question in questions" :key="question.id" data-remove @click="$emit(\'remove\', question)">{{ question.name }}</button></div>',
        },
        ReviewRuleManagement: {
          emits: ['create', 'edit'],
          template: '<div data-testid="rule-management">评估规则列表<button data-testid="rule-create" @click="$emit(\'create\')">新建规则</button></div>',
        },
        ReviewQuestionEditModal: { template: '<div />' },
        'el-dropdown': { emits: ['command'], template: '<div><button data-regular @click="$emit(\'command\', \'create\')">普通题</button><button data-sub @click="$emit(\'command\', \'create-sub\')">子题</button><slot /><slot name="dropdown" /></div>' },
        'el-dropdown-menu': { template: '<div><slot /></div>' },
        'el-dropdown-item': { template: '<button><slot /></button>' },
        'el-button': { template: '<button><slot /></button>' },
        ...(realRules ? { PerformanceListPage: false, PerformanceListToolbar: false, ReviewRuleManagement: false, ReviewRuleTable: true } : {}),
      },
    },
  })
}

describe('ReviewQuestionManagement', () => {
  beforeEach(() => {
    push.mockReset()
    replace.mockReset()
    route.query = {}
    list.mockReset().mockResolvedValue([])
    remove.mockReset().mockResolvedValue(undefined)
    confirm.mockReset().mockResolvedValue('confirm')
    success.mockReset()
    error.mockReset()
  })

  it('sends DELETE to the persisted review-question resource', async () => {
    const { performanceReviewQuestionApi } = await vi.importActual<typeof import('@/api/performance')>('@/api/performance')
    const { api } = await import('@/api/client')
    const request = vi.spyOn(api, 'delete').mockResolvedValue({ data: undefined })
    try {
      await performanceReviewQuestionApi.remove(201)
      expect(request).toHaveBeenCalledWith('/performance/review-questions/201')
    } finally {
      request.mockRestore()
    }
  })

  it('removes only after DELETE succeeds and reloads persisted results on reopen', async () => {
    list.mockResolvedValueOnce([{ id: 201, name: '待删除题目', rule: {}, deletable: true }]).mockResolvedValueOnce([])
    let finishDelete!: () => void
    remove.mockImplementationOnce(() => new Promise<void>(resolve => { finishDelete = resolve }))
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('[data-remove]').trigger('click')
    await flushPromises()
    expect(remove).toHaveBeenCalledWith(201)
    expect(wrapper.text()).toContain('待删除题目')
    expect(success).not.toHaveBeenCalled()
    finishDelete()
    await flushPromises()
    expect(wrapper.find('[data-remove]').exists()).toBe(false)
    expect(success).toHaveBeenCalledWith('已删除')
    wrapper.unmount()
    const reopened = mountView()
    await flushPromises()
    expect(reopened.find('[data-remove]').exists()).toBe(false)
    reopened.unmount()
  })

  it.each(['此评估题存在子题，不允许删除', '此评估题已被模板引用，不允许删除', '此评估题已被周期使用，不允许删除'])(
    'keeps the question and shows the rejection: %s', async message => {
      list.mockResolvedValue([{ id: 201, name: '受保护题目', rule: {}, deletable: true }])
      remove.mockRejectedValueOnce({ response: { data: { detail: { message } } } })
      const wrapper = mountView()
      await flushPromises()
      await wrapper.get('[data-remove]').trigger('click')
      await flushPromises()
      expect(wrapper.text()).toContain('受保护题目')
      expect(error).toHaveBeenCalledWith(message)
      expect(success).not.toHaveBeenCalled()
      wrapper.unmount()
    },
  )

  it('does not open confirmation or DELETE for a protected question', async () => {
    list.mockResolvedValue([{ id: 201, name: '评级不参与计算', rule: {}, deletable: false, delete_reason: '此评估题已被模板引用，不允许删除' }])
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('[data-remove]').trigger('click')
    await flushPromises()
    expect(confirm).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('shows interceptor-normalized 409 detail and refreshes disabled state', async () => {
    const reason = '此评估题已被模板引用，不允许删除'
    list.mockResolvedValueOnce([{ id: 201, name: '评级不参与计算', rule: {}, deletable: true }])
      .mockResolvedValueOnce([{ id: 201, name: '评级不参与计算', rule: {}, deletable: false, delete_reason: reason }])
    remove.mockRejectedValueOnce({ response: { status: 409, data: { detail: reason } } })
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('[data-remove]').trigger('click')
    await flushPromises()
    expect(error).toHaveBeenCalledWith(reason)
    expect(list).toHaveBeenCalledTimes(2)
    await wrapper.get('[data-remove]').trigger('click')
    expect(remove).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('does not call DELETE when confirmation is cancelled', async () => {
    list.mockResolvedValue([{ id: 201, name: '保留题目', rule: {}, deletable: true }])
    confirm.mockRejectedValueOnce('cancel')
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('[data-remove]').trigger('click')
    await flushPromises()
    expect(remove).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('保留题目')
    wrapper.unmount()
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

  it('renders the real rule toolbar after switching tabs and returning', async () => {
    const wrapper = mountView(true)
    const tabs = wrapper.findAll('.tab')
    await tabs[1].trigger('click')

    const toolbar = wrapper.get('.review-rule-management .list-toolbar')
    expect(toolbar.get('button.rule-create-button').text()).toContain('新建')
    expect(toolbar.get('input').attributes('placeholder')).toBe('通过名称、备注搜索')
    expect(toolbar.get('button.filter-button').text()).toContain('筛选')
    await toolbar.get('input').setValue('测试规则')
    expect((toolbar.get('input').element as HTMLInputElement).value).toBe('测试规则')
    await toolbar.get('button.rule-create-button').trigger('click')
    expect(push).toHaveBeenCalledWith({ name: 'ReviewRuleCreate' })

    await tabs[0].trigger('click')
    expect(wrapper.find('.review-rule-management').exists()).toBe(false)
    await tabs[1].trigger('click')
    expect(wrapper.find('.review-rule-management button.rule-create-button').exists()).toBe(true)
    wrapper.unmount()
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
