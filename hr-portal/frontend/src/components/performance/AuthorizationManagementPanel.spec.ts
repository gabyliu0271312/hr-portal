import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AuthorizationManagementPanel from './AuthorizationManagementPanel.vue'
import authSource from './AuthorizationManagementPanel.vue?raw'
import surfaceCardSource from './PerformanceSurfaceCard.vue?raw'
import gridCardSource from './PerformanceGridCard.vue?raw'
import textButtonSource from './PerformanceTextButton.vue?raw'

const authorizations = [
  { key: 'evaluation-transfer', title: '评估任务授权及转交', description: '查看和管理评估任务授权转交记录' },
  { key: 'calibration-auth', title: '校准任务授权', description: '可协助校准人将任务授权他人校准' },
]

describe('AuthorizationManagementPanel', () => {
  it('renders the captured title and both authorization cards with 查看 buttons', () => {
    const wrapper = mount(AuthorizationManagementPanel, { props: { authorizations } })
    expect(wrapper.text()).toContain('授权管理')
    const cards = wrapper.findAll('.grid-card')
    expect(cards).toHaveLength(2)
    expect(cards[0].text()).toContain('评估任务授权及转交')
    expect(cards[0].text()).toContain('查看和管理评估任务授权转交记录')
    expect(cards[1].text()).toContain('校准任务授权')
    expect(cards[1].text()).toContain('可协助校准人将任务授权他人校准')
    const buttons = wrapper.findAll('.text-button')
    expect(buttons.map(item => item.text())).toEqual(['查看', '查看'])
  })

  it('emits the selected authorization item for the container to handle', async () => {
    const wrapper = mount(AuthorizationManagementPanel, { props: { authorizations } })

    await wrapper.findAll('.text-button')[1].trigger('click')

    expect(wrapper.emitted('view')).toEqual([[authorizations[1]]])
  })

  it('uses the captured geometry (mt-12 gap, card padding 20, grid 3 cols gap 16)', () => {
    expect(authSource).toMatch(/margin-top:\s*12px/)
    expect(authSource).toMatch(/--grid-card-padding:\s*20px/)
    expect(authSource).toMatch(/grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/)
    expect(authSource).toMatch(/gap:\s*16px/)
    expect(authSource).toMatch(/\.auth-title\s*\{[^}]*font-size:\s*14px;[^}]*font-weight:\s*600/s)
    expect(authSource).toMatch(/\.auth-desc\s*\{[^}]*margin:\s*4px 0 0;[^}]*color:\s*#646a73/s)
  })
})

describe('extracted shared shells', () => {
  it('PerformanceSurfaceCard reuses the captured white-card shell', () => {
    expect(surfaceCardSource).toMatch(/padding:\s*20px;[^}]*border-radius:\s*8px/s)
    expect(surfaceCardSource).toMatch(/box-shadow:\s*rgba\(31, 35, 41, 0\.03\)/)
    expect(surfaceCardSource).toContain('PerformanceSectionCardHeader')
  })

  it('PerformanceGridCard carries the captured card border shell', () => {
    expect(gridCardSource).toMatch(/border:\s*1px solid #dee0e3;[^}]*border-radius:\s*8px/s)
    expect(gridCardSource).toMatch(/min-width:\s*300px/)
  })

  it('PerformanceTextButton uses the captured text button tokens with hover evidence', () => {
    expect(textButtonSource).toMatch(/color:\s*#1456f0/)
    expect(textButtonSource).toMatch(/padding:\s*2px 4px;[^}]*border-radius:\s*6px/s)
    expect(textButtonSource).toMatch(/:hover\s*\{[^}]*background:\s*rgba\(20, 86, 240, 0\.2\)/s)
  })
})
