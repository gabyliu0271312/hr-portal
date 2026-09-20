import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceOptionNavigator from './PerformanceOptionNavigator.vue'
import FixedScorePreviewNavigator from './FixedScorePreviewNavigator.vue'

type PreviewOption = { id: string; label: string }

const options: PreviewOption[] = Array.from({ length: 20 }, (_, index) => ({ id: `option-${index + 1}`, label: String(index + 1) }))

describe('PerformanceOptionNavigator', () => {
  it('renders twenty options in the first window with the verified arrows', () => {
    const wrapper = mount(PerformanceOptionNavigator, { props: { options } })

    expect(wrapper.findAll('.performance-option-navigator__option')).toHaveLength(20)
    expect(wrapper.find('[data-icon="RightOutlined"] path').attributes('d')).toContain('M7.707 21.707')
    expect(wrapper.find('[data-icon="LeftOutlined"]').exists()).toBe(false)
  })

  it('maps fixed-score values through the performance standard component', () => {
    const wrapper = mount(FixedScorePreviewNavigator, { props: { options: [{ id: 'one', value: '20' }] } })

    expect(wrapper.find('.performance-option-navigator').classes()).toContain('is-score-preview')
    expect(wrapper.find('.performance-option-navigator__option').text()).toBe('20')
  })


  it('uses natural, distributed, and overflow layouts at the captured count boundaries', () => {
    const cases = [
      { count: 5, mode: 'natural', arrows: 0 },
      { count: 6, mode: 'distributed', arrows: 0 },
      { count: 10, mode: 'distributed', arrows: 0 },
      { count: 11, mode: 'overflow', arrows: 1 },
    ]

    for (const item of cases) {
      const wrapper = mount(PerformanceOptionNavigator, { props: { options: options.slice(0, item.count) } })
      expect(wrapper.classes()).toContain(`is-${item.mode}`)
      expect(wrapper.findAll('.performance-option-navigator__connector')).toHaveLength(item.count - 1)
      expect(wrapper.findAll('.performance-option-navigator__arrow')).toHaveLength(item.arrows)
      wrapper.unmount()
    }
  })

  it('renders masking rails so arrows do not expose the adjacent option', async () => {
    const wrapper = mount(PerformanceOptionNavigator, { props: { options } })

    expect(wrapper.find('.performance-option-navigator__mask--next').exists()).toBe(true)
    await wrapper.find('[aria-label="下一组选项"]').trigger('click')
    expect(wrapper.find('.performance-option-navigator__mask--previous').exists()).toBe(true)
    expect(wrapper.find('.performance-option-navigator__mask--next').exists()).toBe(false)
  })

  it('moves through intermediate pages and keeps both arrows in the middle', async () => {
    const thirty = Array.from({ length: 30 }, (_, index) => ({ id: `long-${index + 1}`, label: String(index + 1) }))
    const wrapper = mount(PerformanceOptionNavigator, { props: { options: thirty } })
    const track = wrapper.find('.performance-option-navigator__track')

    await wrapper.find('[aria-label="下一组选项"]').trigger('click')
    expect(track.attributes('style')).toContain('translateX(-552px)')
    expect(wrapper.find('[data-icon="LeftOutlined"]').exists()).toBe(true)
    expect(wrapper.find('[data-icon="RightOutlined"]').exists()).toBe(true)

    await wrapper.find('[aria-label="下一组选项"]').trigger('click')
    expect(track.attributes('style')).toContain('translateX(-1056px)')
    expect(wrapper.find('[data-icon="LeftOutlined"]').exists()).toBe(true)
    expect(wrapper.find('[data-icon="RightOutlined"]').exists()).toBe(false)

    await wrapper.find('[aria-label="上一组选项"]').trigger('click')
    expect(track.attributes('style')).toContain('translateX(-552px)')
    expect(wrapper.find('[data-icon="LeftOutlined"]').exists()).toBe(true)
    expect(wrapper.find('[data-icon="RightOutlined"]').exists()).toBe(true)
  })

  it('applies the same hover state to options before the overflow boundary', async () => {
    const wrapper = mount(PerformanceOptionNavigator, { props: { options: options.slice(0, 5) } })

    await wrapper.findAll('.performance-option-navigator__option')[4].trigger('mouseenter')
    expect(wrapper.findAll('.performance-option-navigator__option')[4].classes()).toContain('is-hovered')
  })

  it('preserves hover states and edge offsets across both windows', async () => {
    const wrapper = mount(PerformanceOptionNavigator, { props: { options } })
    const chips = wrapper.findAll('.performance-option-navigator__option')
    const track = wrapper.find('.performance-option-navigator__track')

    await chips[4].trigger('mouseenter')
    expect(chips[4].classes()).toContain('is-hovered')
    expect(track.attributes('style')).toContain('translateX(0px)')

    await chips[9].trigger('mouseenter')
    expect(track.attributes('style')).toContain('translateX(0px)')
    expect(wrapper.find('[data-icon="LeftOutlined"]').exists()).toBe(false)
    expect(wrapper.find('[data-icon="RightOutlined"]').exists()).toBe(true)

    await wrapper.find('[aria-label="下一组选项"]').trigger('click')
    expect(track.attributes('style')).toContain('translateX(-516px)')
    expect(wrapper.find('[data-icon="LeftOutlined"]').exists()).toBe(true)
    expect(wrapper.find('[data-icon="RightOutlined"]').exists()).toBe(false)

    await chips[14].trigger('mouseenter')
    expect(chips[14].classes()).toContain('is-hovered')
    await chips[10].trigger('mouseenter')
    expect(track.attributes('style')).toContain('translateX(-516px)')
    expect(wrapper.find('[data-icon="LeftOutlined"]').exists()).toBe(true)
    expect(wrapper.find('[data-icon="RightOutlined"]').exists()).toBe(false)

    await wrapper.find('[aria-label="上一组选项"]').trigger('click')
    expect(track.attributes('style')).toContain('translateX(0px)')
    expect(wrapper.find('[data-icon="LeftOutlined"]').exists()).toBe(false)
    expect(wrapper.find('[data-icon="RightOutlined"]').exists()).toBe(true)
  })
})
