import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import FullscreenWorkspaceShell from './FullscreenWorkspaceShell.vue'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('FullscreenWorkspaceShell', () => {
  it('renders shared title content and keeps navigation stable', async () => {
    const wrapper = mount(FullscreenWorkspaceShell, {
      props: { title: '编辑报表', subtitle: '工资数据集 · 12 个字段', busy: true },
      slots: {
        'title-extra': '<span class="status-tag">私密</span>',
        actions: '<button class="save-action">保存</button>',
        default: '<section class="workspace-body">配置内容</section>',
      },
      global: { stubs: { ElIcon: true, ElTooltip: true } },
    })

    const shell = document.body.querySelector('.fullscreen-workspace')
    expect(shell?.textContent).toContain('编辑报表')
    expect(shell?.textContent).toContain('工资数据集 · 12 个字段')
    expect(shell?.querySelector('.status-tag')).not.toBeNull()
    expect(shell?.querySelector('.save-action')).not.toBeNull()
    expect(shell?.querySelector('.workspace-body')).not.toBeNull()

    const back = shell?.querySelector<HTMLButtonElement>('.workspace-back')
    expect(back?.disabled).toBe(true)
    back?.click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('back')).toBeUndefined()

    wrapper.unmount()
  })
})
