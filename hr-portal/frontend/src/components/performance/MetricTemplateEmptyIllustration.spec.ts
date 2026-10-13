import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import MetricTemplateEmptyIllustration from './MetricTemplateEmptyIllustration.vue'

describe('MetricTemplateEmptyIllustration', () => {
  it('keeps the captured SVG contract', () => {
    const wrapper = mount(MetricTemplateEmptyIllustration)
    const svg = wrapper.get('svg')

    expect(svg.attributes('width')).toBe('250')
    expect(svg.attributes('height')).toBe('125')
    expect(svg.attributes('viewBox')).toBeUndefined()
  })
})
