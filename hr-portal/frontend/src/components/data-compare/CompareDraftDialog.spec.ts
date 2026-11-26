import { shallowMount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CompareDraftDialog from './CompareDraftDialog.vue'
import { dataCompareApi } from '@/api/data-compare'
vi.mock('@/api/data-compare', () => ({ dataCompareApi: { generateDialogue: vi.fn(), createSkill: vi.fn(), updateSkill: vi.fn() } }))
const ready = { status: 'requires_confirmation', conversation_id: 17, revision: 1, summary: '口径摘要', params: { kind: 'report_amount_v1' } }
const confirmed = { ...ready, status: 'confirmed', revision: 2, confirmation_token: 'signed-token' }
function setup() { return shallowMount(CompareDraftDialog, { props: { modelValue: true, skill: null } }) }
describe('多轮确认安全', () => {
  beforeEach(() => vi.clearAllMocks())
  it('未确认不能保存，确认 token 随保存提交但不执行', async () => {
    const wrapper = setup(), vm = wrapper.vm as any
    vm.name = '对比'; vm.message = '核对报表金额'
    vi.mocked(dataCompareApi.generateDialogue).mockResolvedValueOnce(ready as any).mockResolvedValueOnce(confirmed as any)
    await vm.send('message')
    expect(vm.canSave).toBe(false)
    await vm.send('confirm')
    expect(dataCompareApi.generateDialogue).toHaveBeenLastCalledWith({ dialogue: true, instruction: '', action: 'confirm', conversation_id: 17, revision: 1 })
    expect(vm.canSave).toBe(true)
    await vm.save()
    expect(dataCompareApi.createSkill).toHaveBeenCalledWith(expect.objectContaining({ confirmation_token: 'signed-token', params: ready.params }))
  })
  it('多轮补充后保存仅使用最后一轮原文，与服务端 digest 一致', async () => {
    const vm = setup().vm as any
    vm.name = '多轮对比'
    vi.mocked(dataCompareApi.generateDialogue)
      .mockResolvedValueOnce({ ...ready, status: 'requires_input', revision: 1 } as any)
      .mockResolvedValueOnce({ ...ready, revision: 2 } as any)
      .mockResolvedValueOnce({ ...confirmed, revision: 3 } as any)
    vm.message = '  对比五月工资  '
    await vm.send('message')
    vm.message = '  按部门，增加六月  '
    await vm.send('message')
    expect(dataCompareApi.generateDialogue).toHaveBeenLastCalledWith({ dialogue: true, instruction: '按部门，增加六月', action: 'message', conversation_id: 17, revision: 1 })
    await vm.send('confirm')
    expect(dataCompareApi.generateDialogue).toHaveBeenLastCalledWith({ dialogue: true, instruction: '', action: 'confirm', conversation_id: 17, revision: 2 })
    await vm.save()
    expect(dataCompareApi.createSkill).toHaveBeenCalledWith({ name: '多轮对比', instruction: '按部门，增加六月', params: ready.params, confirmation_token: 'signed-token' })
    expect(vm.messages.filter((item: any) => item.role === '需求').map((item: any) => item.text)).toEqual(['对比五月工资', '按部门，增加六月'])
  })
  it('旧模式修改需求时清除旧配置，不能提交新需求旧 JSON', async () => {
    const vm = setup().vm as any
    vm.legacy = true
    vm.name = '旧对比'
    vm.instruction = '旧需求'
    vm.paramsJson = '{"compare_type":"amount"}'
    vm.instruction = '新需求'
    expect(vm.paramsJson).toBe('')
    expect(vm.canSave).toBe(false)
    await vm.save()
    expect(dataCompareApi.createSkill).not.toHaveBeenCalled()
  })
  it('编辑需求立即废弃确认 token，不能保存旧参数', async () => {
    const vm = setup().vm as any
    vm.name = '对比'; vm.draft = confirmed
    expect(vm.canSave).toBe(true)
    vm.message = '改成六月'
    expect(vm.canSave).toBe(false)
    expect(vm.draft.confirmation_token).toBeNull()
    await vm.save()
    expect(dataCompareApi.createSkill).not.toHaveBeenCalled()
  })
  it('超时保留需求并显示可恢复状态', async () => {
    const vm = setup().vm as any
    vm.message = '最近3个月，包含所有金额字段'
    vi.mocked(dataCompareApi.generateDialogue).mockRejectedValueOnce({ code: 'ECONNABORTED' })
    await vm.send('message')
    expect(vm.requestError).toContain('超时')
    expect(vm.needsRestart).toBe(true)
    expect(vm.message).toContain('最近3个月')
    expect(vm.messages.at(-1).role).toBe('请求失败')
    vm.restart()
    expect(vm.needsRestart).toBe(false)
    expect(vm.draft).toBeNull()
    expect(vm.message).toContain('所有金额字段')
  })
  it('发送后继续编辑时保留会话进度但废弃迟到确认', async () => {
    let resolve!: (v: any) => void
    vi.mocked(dataCompareApi.generateDialogue).mockReturnValue(new Promise(r => { resolve = r }))
    const vm = setup().vm as any
    vm.message = '对比五月'
    const request = vm.send('message')
    vm.message = '改成六月'
    expect(vm.busy).toBe(true)
    await vm.send('message')
    expect(dataCompareApi.generateDialogue).toHaveBeenCalledTimes(1)
    resolve(confirmed)
    await request
    expect(vm.draft.conversation_id).toBe(17)
    expect(vm.draft.revision).toBe(2)
    expect(vm.draft.confirmation_token).toBeNull()
    expect(vm.message).toBe('改成六月')
    expect(vm.canSave).toBe(false)
    vi.mocked(dataCompareApi.generateDialogue).mockResolvedValueOnce({ ...ready, revision: 3 } as any)
    await vm.send('message')
    expect(dataCompareApi.generateDialogue).toHaveBeenLastCalledWith(expect.objectContaining({ conversation_id: 17, revision: 2, instruction: '改成六月' }))
  })
})
