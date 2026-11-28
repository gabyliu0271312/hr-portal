import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { list, remove, confirm, success, error } = vi.hoisted(() => ({
  list: vi.fn(),
  remove: vi.fn(),
  confirm: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}))

vi.mock('@/api/performance', () => ({ performanceReviewRuleApi: { list, remove }, performanceTemplateApi: { peopleOptions: vi.fn().mockResolvedValue([]) } }))
vi.mock('element-plus', async () => {
  const actual = await vi.importActual<any>('element-plus')
  return { ...actual, ElMessageBox: { confirm }, ElMessage: { success, error } }
})
import ReviewRuleManagement from './ReviewRuleManagement.vue'

function mountView() {
  return mount(ReviewRuleManagement, {
    global: {
      stubs: {
        ReviewRuleTable: {
          props: ['rules'],
          emits: ['remove'],
          template: '<div aria-label="评估规则表格">暂无评估规则<button v-if="rules.length" data-remove @click="$emit(\'remove\', rules[0])">删除</button></div>',
        },
        PerformanceFilterPopover: {
          props: ['visible'],
          template: '<div v-if="visible" class="filter-popover"><slot /><slot name="footer" /></div>',
        },
        PerformanceFilterField: {
          props: ['field', 'modelValue'],
          emits: ['update:modelValue'],
          template: '<button class="filter-field" :data-key="field.key" @click="$emit(\'update:modelValue\', field.key === \'creator\' ? [\'E1\'] : [\'评分\'])">{{ field.label }}</button>',
        },
        PerformanceFilterActions: {
          emits: ['confirm', 'cancel', 'clear'],
          template: '<div class="filter-actions"><button class="confirm" @click="$emit(\'confirm\')">确定</button><button class="cancel" @click="$emit(\'cancel\')">取消</button><button class="clear" @click="$emit(\'clear\')">清除</button></div>',
        },
        'el-button': {
          emits: ['click'],
          template: '<button @click="$emit(\'click\')"><slot /></button>',
        },
        'el-input': {
          props: ['modelValue', 'placeholder'],
          emits: ['update:modelValue'],
          template: '<label><input :value="modelValue" :placeholder="placeholder" @input="$emit(\'update:modelValue\', $event.target.value)" /><slot name="prefix" /></label>',
        },
        'el-icon': { template: '<span><slot /></span>' },
      },
    },
  })
}

describe('ReviewRuleManagement', () => {
  beforeEach(() => {
    list.mockReset()
    remove.mockReset()
    confirm.mockReset()
    success.mockReset()
    error.mockReset()
    list.mockResolvedValue([])
    remove.mockResolvedValue(undefined)
    confirm.mockResolvedValue('confirm')
  })
  it('renders the captured toolbar and table placeholder', () => {
    const wrapper = mountView()
    expect(wrapper.get('.rule-create-button').text()).toContain('新建')
    expect(wrapper.get('input').attributes('placeholder')).toBe('通过名称、备注搜索')
    expect(wrapper.get('.filter-button').text()).toContain('筛选')
    expect(wrapper.get('[aria-label="评估规则表格"]').text()).toBe('暂无评估规则')
  })

  it('opens the filter popover and applies the selected method to the list', async () => {
    const wrapper = mountView()
    await wrapper.get('.rule-create-button').trigger('click')
    expect(wrapper.emitted('create')).toHaveLength(1)

    await wrapper.get('.filter-button').trigger('click')
    expect(wrapper.find('.filter-popover').exists()).toBe(true)
    expect(wrapper.get('.filter-popover').text()).toContain('评估方式')
    expect(wrapper.get('.filter-popover').text()).toContain('创建人')

    await wrapper.get('.filter-field[data-key="method"]').trigger('click')
    await wrapper.get('.filter-actions .confirm').trigger('click')
    await flushPromises()
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ review_type: '评分' }))
    expect(wrapper.get('.filter-button').text()).toContain('筛选 (1)')
    expect(wrapper.find('.filter-popover').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows normalized conflict details and refreshes rule availability', async () => {
    const reason = '此评估规则已被使用，不允许删除'
    list.mockResolvedValue([{ id: 7, name: '评级不参与计算', deletable: true }])
    remove.mockRejectedValueOnce({ response: { status: 409, data: { detail: reason } } })
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('[data-remove]').trigger('click')
    await flushPromises()
    expect(error).toHaveBeenCalledWith(reason)
    expect(success).not.toHaveBeenCalled()
    expect(list).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('soft deletes an unused rule and reloads the list', async () => {
    list.mockResolvedValueOnce([{
      id: 7,
      name: '未使用规则',
      review_type: '评级',
      status: 'active',
      created_at: '',
      updated_at: '',
      remark: '',
      creator: 'admin',
      config_summary: {},
      is_used: false,
      deletable: true,
    }]).mockResolvedValueOnce([])
    const wrapper = mountView()
    await flushPromises()

    await wrapper.get('[data-remove]').trigger('click')
    await flushPromises()

    expect(confirm).toHaveBeenCalled()
    expect(remove).toHaveBeenCalledWith(7)
    expect(success).toHaveBeenCalledWith('评估规则已删除')
    expect(list).toHaveBeenCalledTimes(2)
  })
})
