import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TableToolFullscreenShell from './TableToolFullscreenShell.vue'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('TableToolFullscreenShell', () => {
  it('teleports the workflow shell and emits navigation events', async () => {
    const wrapper = mount(TableToolFullscreenShell, {
      props: {
        title: '编辑模板',
        description: '模板编辑说明',
        steps: [
          { key: 'base', label: '基础模板' },
          { key: 'output', label: '信息输出' },
        ],
        activeStep: 'base',
      },
      slots: {
        actions: '<button class="save-action">下一步</button>',
        default: '<section class="page-content">页面内容</section>',
      },
      global: {
        stubs: {
          ElIcon: true,
          ElTooltip: { template: '<span><slot /></span>' },
        },
      },
    })

    const shell = document.body.querySelector('.table-tool-fullscreen')
    expect(shell).not.toBeNull()
    expect(shell?.textContent).toContain('编辑模板')
    expect(shell?.querySelector('.save-action')).not.toBeNull()
    expect(shell?.querySelector('.page-content')).not.toBeNull()
    expect(shell?.querySelector('[aria-label="查看编辑模板说明"]')).not.toBeNull()

    const buttons = shell?.querySelectorAll<HTMLButtonElement>('.table-tool-step')
    expect(buttons?.[0].querySelector('.table-tool-step-label')?.textContent).toBe('基础模板')
    buttons?.[1].click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('stepChange')).toEqual([['output']])

    shell?.querySelector<HTMLButtonElement>('.table-tool-back')?.click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('back')).toHaveLength(1)

    wrapper.unmount()
  })
})
