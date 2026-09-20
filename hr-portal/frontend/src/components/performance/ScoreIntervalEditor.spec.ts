import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ScoreIntervalEditor from './ScoreIntervalEditor.vue'

const intervals = [
  { lower: '', upper: '', code: '', name: '' },
  { lower: '', upper: '', code: '', name: '' },
]

describe('ScoreIntervalEditor', () => {
  it('renders two intervals with the outer boundaries disabled', () => {
    const wrapper = mount(ScoreIntervalEditor, { props: { intervals, rule: 'a ≤ 分数 < b' } })
    const rows = wrapper.findAll('.interval-row')
    expect(rows).toHaveLength(2)
    expect(rows[0].findAll('input')[0].attributes('disabled')).toBeDefined()
    expect(rows[0].findAll('input')[2].attributes('disabled')).toBeUndefined()
    expect(rows[1].findAll('input')[0].attributes('disabled')).toBeUndefined()
    expect(rows[1].findAll('input')[1].attributes('disabled')).toBeDefined()
    expect(rows[0].findAll('.number-stepper')[0].findAll('button').every((button) => button.attributes('disabled') !== undefined)).toBe(true)
    expect(rows[0].findAll('.number-stepper')[1].findAll('button').every((button) => button.attributes('disabled') !== undefined)).toBe(false)
    expect(rows[1].findAll('.number-stepper')[1].findAll('button').every((button) => button.attributes('disabled') !== undefined)).toBe(true)
    expect(wrapper.find('[data-icon="DeleteTrashOutlined"]').exists()).toBe(false)
    expect(wrapper.find('[data-drag-handle]').exists()).toBe(false)
    expect(wrapper.findAll('.interval-operator').map((operator) => operator.findAll('span').map((span) => span.text()))).toEqual([
      ['≤', '分数', '<'],
      ['≤', '分数', '≤'],
    ])
    expect(wrapper.find('.interval-row').classes()).not.toContain('has-delete')
  })

  it('derives readonly boundaries from score bounds and previous upper values', async () => {
    const wrapper = mount(ScoreIntervalEditor, {
      props: {
        intervals: [
          { lower: '', upper: '5', code: '', name: '' },
          { lower: '', upper: '', code: '', name: '' },
        ],
        rule: 'a ≤ 分数 < b',
        lowerBound: '0',
        upperBound: '10',
        precision: 1,
      },
    })
    const rows = wrapper.findAll('.interval-row')
    expect(rows[0].findAll('input')[0].element.value).toBe('0')
    expect(rows[1].findAll('input')[0].element.value).toBe('5')
    expect(rows[1].findAll('input')[1].element.value).toBe('10')
    expect(wrapper.findAll('input[readonly]')).toHaveLength(2)
    expect(wrapper.findAll('[data-step="0.1"]')).toHaveLength(4)

    await rows[0].findAll('input')[1].setValue('6')
    const updated = wrapper.emitted('update:intervals')?.at(-1)?.[0] as Array<{ lower: string; upper: string }>
    expect(updated[1].lower).toBe('6')
    expect(updated[1].upper).toBe('10')
  })

  it('adds an inline interval and changes the operator rule', async () => {
    const wrapper = mount(ScoreIntervalEditor, { props: { intervals, rule: 'a ≤ 分数 < b' } })
    await wrapper.get('.add-interval-button').trigger('click')
    expect(wrapper.emitted('add')).toHaveLength(1)
    const updated = wrapper.emitted('update:intervals')?.at(-1)?.[0] as Array<{ lower: string; upper: string; code: string; name: string }>
    expect(updated).toHaveLength(3)
    await wrapper.setProps({ intervals: updated })
    expect(wrapper.findAll('.interval-row')).toHaveLength(3)
    expect(wrapper.find('.interval-row').classes()).toContain('has-delete')
    expect(wrapper.findAll('.interval-row .performance-icon-button')).toHaveLength(3)

    await wrapper.setProps({ rule: 'a < 分数 ≤ b' })
    const operators = wrapper.findAll('.interval-operator').map((operator) => operator.findAll('span').map((span) => span.text()))
    expect(operators).toEqual([
      ['≤', '分数', '≤'],
      ['<', '分数', '≤'],
      ['<', '分数', '≤'],
    ])
  })
})
