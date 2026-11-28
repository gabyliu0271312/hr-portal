import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceFieldPreview from './PerformanceFieldPreview.vue'
import previewSource from './PerformanceFieldPreview.vue?raw'

describe('PerformanceFieldPreview', () => {
  it('renders the employee header and the previewed fields in order', () => {
    const wrapper = mount(PerformanceFieldPreview, {
      props: { name: '赵六七', fields: ['部门', '职级', '序列'] },
    })

    expect(wrapper.get('.field-preview__name').text()).toBe('赵六七')
    expect(wrapper.findAll('.field-preview__field').map(field => field.text())).toEqual(['部门', '职级', '序列'])
    expect(wrapper.findAll('.field-preview__dot')).toHaveLength(3)
    expect(wrapper.get('.field-preview__avatar--fallback').text()).toBe('七')
  })

  it('uses the provided avatar image instead of the fallback', () => {
    const wrapper = mount(PerformanceFieldPreview, {
      props: { name: '赵六七', fields: [], avatarUrl: 'https://example.test/avatar.png' },
    })

    expect(wrapper.get('.field-preview__avatar').attributes('src')).toBe('https://example.test/avatar.png')
    expect(wrapper.find('.field-preview__avatar--fallback').exists()).toBe(false)
  })

  it('keeps geometry and colors on the shared tokens', () => {
    expect(previewSource).toContain('var(--performance-preview-border)')
    expect(previewSource).toContain('var(--performance-preview-bar-height)')
    expect(previewSource).toContain('var(--performance-preview-dot-size)')
    expect(previewSource).toContain('var(--performance-preview-avatar-size)')
    expect(previewSource).toContain('var(--performance-preview-divider-color)')
  })
})
