import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import PerformanceSegmentedControl from './PerformanceSegmentedControl.vue'
import segmentedSource from './PerformanceSegmentedControl.vue?raw'
import ViewVideoOutlinedIcon from './ViewVideoOutlinedIcon.vue'
import OrganizationOutlinedIcon from './OrganizationOutlinedIcon.vue'

const options = [
  { value: 'by-person', label: '按人查看', icon: ViewVideoOutlinedIcon },
  { value: 'by-org', label: '按组织查看', icon: OrganizationOutlinedIcon },
]

function mountControl(modelValue = 'by-person', props: Record<string, unknown> = {}) {
  return mount(PerformanceSegmentedControl, {
    props: { modelValue, options, ...props },
    attachTo: document.body,
  })
}

describe('PerformanceSegmentedControl', () => {
  it('renders connected segments with first/last radius and checked state', () => {
    const wrapper = mountControl()
    const segments = wrapper.findAll('.segment')
    expect(segments.map(item => item.text())).toEqual(['按人查看', '按组织查看'])
    expect(segments[0].classes()).toContain('checked')
    expect(segments[0].classes()).toContain('first')
    expect(segments[1].classes()).toContain('last')
    expect(segments[0].attributes('aria-checked')).toBe('true')
  })

  it('renders the captured icon inside each segment', () => {
    const wrapper = mountControl()
    expect(wrapper.findAll('.segment-icon').length).toBe(2)
    expect(wrapper.find('[data-icon="ViewVideoOutlined"]').exists()).toBe(true)
    expect(wrapper.find('[data-icon="OrganizationOutlined"]').exists()).toBe(true)
  })

  it('uses the captured hover/active colors (CSSOM evidence)', () => {
    expect(segmentedSource).toMatch(/\.segment:hover\s*\{[^}]*background:\s*#e1eaff;[^}]*border-color:\s*#3370ff;[^}]*color:\s*#3370ff/s)
    expect(segmentedSource).toMatch(/\.segment:active\s*\{[^}]*background:\s*#bacefd;/s)
    expect(segmentedSource).toMatch(/\.segment\.checked\s*\{[^}]*border-color:\s*#3370ff;[^}]*color:\s*#1456f0/s)
  })

  it('applies md and sm captured paddings per size prop', () => {
    expect(segmentedSource).toMatch(/size-md \.segment \{[^}]*padding:\s*4px 20px;/s)
    expect(segmentedSource).toMatch(/size-sm \.segment \{[^}]*padding:\s*2px 8px;[^}]*font-size:\s*12px/s)
    const md = mountControl()
    expect(md.find('.segmented-control').classes()).toContain('size-md')
    const sm = mountControl('opened', { options: [{ value: 'opened', label: '已开通' }, { value: 'reconsidered', label: '已复议' }], size: 'sm' })
    expect(sm.find('.segmented-control').classes()).toContain('size-sm')
    expect(sm.find('.segment-icon').exists()).toBe(false)
  })

  it('emits update:modelValue only when selecting a different segment', async () => {
    const wrapper = mountControl()
    await wrapper.findAll('.segment')[1].trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([['by-org']])
    const again = mountControl('by-org')
    await again.findAll('.segment')[1].trigger('click')
    expect(again.emitted('update:modelValue')).toBeUndefined()
  })
})

vi.mock('./ViewVideoOutlinedIcon.vue', () => ({ default: { name: 'ViewVideoOutlinedIcon', template: '<svg data-icon="ViewVideoOutlined"></svg>' } }))
vi.mock('./OrganizationOutlinedIcon.vue', () => ({ default: { name: 'OrganizationOutlinedIcon', template: '<svg data-icon="OrganizationOutlined"></svg>' } }))
