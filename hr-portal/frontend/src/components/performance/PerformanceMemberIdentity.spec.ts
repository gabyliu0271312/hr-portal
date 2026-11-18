import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import PerformanceMemberIdentity from './PerformanceMemberIdentity.vue'
import type { PerformanceMemberDelegation } from '@/api/performance'

const record = (overrides: Partial<PerformanceMemberDelegation> = {}): PerformanceMemberDelegation => ({
  id: 1, authorization_type: 'AUTHORIZE', status: 'ACTIVE', operator_name: '操作人', recipient_name: '接收人', original_handler_name: '原处理人', stage_name: '上级评估', created_at: '2026-11-01T00:00:00Z', operated_at: '2026-11-01T00:00:00Z', revoked_by_name: null, ...overrides,
})
afterEach(() => { document.body.innerHTML = '' })

describe('PerformanceMemberIdentity', () => {
  it('保持旧姓名与紧凑离职胶囊兼容', () => {
    const wrapper = mount(PerformanceMemberIdentity, { props: { displayName: '员工示例', size: 'sm', dimission: true, tag: true } })
    expect(wrapper.text()).toContain('员工示例（已离职）')
    expect(wrapper.classes()).toContain('is-dimission')
    wrapper.unmount()
  })

  it('授权、转交、离职固定顺序，离职不改变姓名为置灰旧态', () => {
    const wrapper = mount(PerformanceMemberIdentity, { props: { displayName: '员工示例', identityStatus: { live_employment_status: '离职', delegations: [record({ authorization_type: 'TRANSFER', id: 2 }), record()] } } })
    expect(wrapper.findAll('.member-status-tag').map(tag => tag.text())).toEqual(['已授权', '已转交', '已离职'])
    expect(wrapper.classes()).not.toContain('is-dimission')
    wrapper.unmount()
  })

  it('显示含校准及撤销替换的完整历史，最新操作在上，且不触发行点击', async () => {
    let clicked = 0
    const wrapper = mount({ components: { PerformanceMemberIdentity }, template: '<div @click="clicked"><PerformanceMemberIdentity display-name="员工示例" :identity-status="identity" /></div>', setup: () => ({ clicked: () => { clicked++ }, identity: { live_employment_status: '在职', delegations: [record(), record({ id: 2, status: 'REVOKED', stage_name: '公司校准', operated_at: '2026-11-03T00:00:00Z', revoked_by_name: '管理员' }), record({ id: 3, status: 'REPLACED', operated_at: '2026-11-02T00:00:00Z' })] } }) }, { attachTo: document.body })
    await wrapper.get('button').trigger('click')
    const history = document.body.querySelectorAll('.member-delegation-record')
    expect(history.length).toBe(3)
    expect(history[0].textContent).toContain('公司校准')
    expect(history[0].textContent).toContain('管理员撤销')
    expect(history[1].textContent).toContain('已替换')
    expect(history[2].textContent).toContain('生效中')
    expect(clicked).toBe(0)
    wrapper.unmount()
  })

  it('撤销最后有效记录后标签和已打开的浮层同时消失', async () => {
    const wrapper = mount(PerformanceMemberIdentity, { props: { displayName: '员工示例', identityStatus: { live_employment_status: '在职', delegations: [record()] } }, attachTo: document.body })
    await wrapper.get('button').trigger('focus')
    expect(document.body.querySelector('.member-delegation-popover')).not.toBeNull()
    await wrapper.setProps({ identityStatus: { live_employment_status: '在职', delegations: [record({ status: 'REVOKED' })] } })
    expect(wrapper.find('button').exists()).toBe(false)
    expect(document.body.querySelector('.member-delegation-popover')).toBeNull()
    wrapper.unmount()
  })

  it('键盘聚焦可打开记录并通过Escape关闭', async () => {
    const wrapper = mount(PerformanceMemberIdentity, { props: { displayName: '员工示例', identityStatus: { live_employment_status: '在职', delegations: [record()] } }, attachTo: document.body })
    await wrapper.get('button').trigger('focus')
    expect(document.body.querySelector('.member-delegation-popover')).not.toBeNull()
    await wrapper.get('button').trigger('keydown', { key: 'Escape' })
    expect(document.body.querySelector('.member-delegation-popover')).toBeNull()
    wrapper.unmount()
  })

  it('暂停账号不当作离职', () => {
    const wrapper = mount(PerformanceMemberIdentity, { props: { displayName: '员工示例', identityStatus: { live_employment_status: '暂停', delegations: [] } } })
    expect(wrapper.find('.member-status-tag--departed').exists()).toBe(false)
    wrapper.unmount()
  })
})
