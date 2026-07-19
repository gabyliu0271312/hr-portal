import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AutomationRuleArtifactPreview from './AutomationRuleArtifactPreview.vue'

const { createRule } = vi.hoisted(() => ({ createRule: vi.fn() }))

vi.mock('@/api/automation', () => ({
  automationApi: { createRule },
}))
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn() },
}))

const draft = {
  artifact_type: 'automation_rule' as const,
  status: 'draft' as const,
  rule_draft: {
    name: '月报通知',
    description: '报表完成后通知',
    biz_type: null,
    trigger_type: 'scheduled_report_success',
    trigger_config: {},
    condition_config: [],
    actions_config: [{
      type: 'feishu_send_message', name: '发送飞书消息', enabled: true,
      config: { receivers: [{ type: 'fixed_chats', chat_ids: [] }], message: { content_template: '请查看报表' } },
    }],
    enabled: false,
    source: 'ai_generated',
    receiver_query: '薪酬组群',
  },
  validation_errors: [],
  missing_slots: [],
  needs_config: ['receiver_ids (请在前端选择具体用户/群)'],
  follow_up_question: null,
}

describe('AutomationRuleArtifactPreview', () => {
  beforeEach(() => createRule.mockReset())

  it('展示 result.data 草稿和待配置接收人提示', () => {
    const wrapper = mount(AutomationRuleArtifactPreview, { props: { artifact: draft } })
    expect(wrapper.text()).toContain('月报通知')
    expect(wrapper.text()).toContain('receiver_ids')
    expect(wrapper.text()).toContain('指定群聊（待选择）')
  })

  it('校验失败时禁用保存', () => {
    const wrapper = mount(AutomationRuleArtifactPreview, {
      props: { artifact: { ...draft, validation_errors: ['触发器不合法'] } },
    })
    expect(wrapper.findAll('button').at(-1)?.attributes('disabled')).toBeDefined()
  })

  it('保存禁用草稿并发出 saved，取消发出 dismissed', async () => {
    createRule.mockResolvedValue({ name: '月报通知' })
    const wrapper = mount(AutomationRuleArtifactPreview, { props: { artifact: draft } })
    await wrapper.findAll('button').at(-1)!.trigger('click')
    await flushPromises()
    expect(createRule).toHaveBeenCalledWith(expect.objectContaining({ enabled: false, source: 'ai_generated' }))
    expect(wrapper.emitted('saved')?.length).toBeGreaterThan(0)
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('dismissed')?.length).toBeGreaterThan(0)
  })
})
