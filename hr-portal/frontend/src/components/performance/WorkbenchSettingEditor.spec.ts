import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WorkbenchSettingEditor from './WorkbenchSettingEditor.vue'
import WorkbenchAnnouncementScopes from './WorkbenchAnnouncementScopes.vue'
import WorkbenchAnnouncementAcknowledgement from './WorkbenchAnnouncementAcknowledgement.vue'
import WorkbenchLocalizedField from './WorkbenchLocalizedField.vue'

const api = vi.hoisted(() => ({ list: vi.fn(), announcementImage: vi.fn(), uploadAnnouncementImage: vi.fn() }))
vi.mock('@/api/performance', () => ({ performanceCycleApi: api, performanceWorkbenchSettingsApi: api }))
const stubs = {
  PerformanceDialogShell: { props: ['modelValue', 'title'], template: '<section v-if="modelValue"><h2>{{ title }}</h2><slot /><footer><slot name="footer" /></footer></section>' },
  WorkbenchAnnouncementImageUpload: { template: '<div class="image-upload" />' },
  WorkbenchAnnouncementExample: { template: '<button>查看示例</button>' },
  PerformanceSearchSelect: { props: { ariaLabel: String, modelValue: [String, Array], multiple: Boolean, options: Array }, emits: ['update:modelValue', 'open'], template: '<button class="search-select" :aria-label="ariaLabel" @click="$emit(\'open\'); $emit(\'update:modelValue\', multiple ? [\'HRBP\', \'REAL_LINE_MANAGER\'] : \'cycle:1\')">选择框</button>' },
}
function editor(item?: any) { return mount(WorkbenchSettingEditor, { props: { modelValue: true, kind: 'announcement', item }, global: { stubs } }) }
function button(wrapper: ReturnType<typeof editor>, text: string) { return wrapper.findAll('button').find(node => node.text() === text)! }
const announcement = { id: 8, title: '中文标题', title_en: 'English title', link: '/detail', link_en: 'https://example.com/en', description: '中文描述', description_en: 'English description', image_id: 5, image_en_id: 6, cycle_label: '指定周期', cycle_ref: 'cycle:1', visibility: '指定角色', visibility_roles: ['HRBP', 'REAL_LINE_MANAGER'], require_ack: true, status: 'active' }

describe('WorkbenchSettingEditor', () => {
  beforeEach(() => { vi.clearAllMocks(); api.list.mockResolvedValue({ items: [{ cycle_ref: 'cycle:1', name: '年度绩效' }] }) })
  it('renders the shared shell, localized fields, single cycle and role controls', () => {
    const wrapper = editor()
    for (const label of ['新建公告', '公告标题', '跳转链接', '添加英文', '展示周期', '所有周期', '指定周期', '可见范围', '指定角色', '弹窗并要求查看人确认知悉', '取消', '保存', '启用']) expect(wrapper.text()).toContain(label)
    expect(wrapper.text()).not.toContain('指定人员')
  })
  it('submits both roles and every localized and image field on create', async () => {
    const wrapper = editor()
    await wrapper.get('input[aria-label="公告标题（中文）"]').setValue('公告标题')
    await wrapper.get('input[aria-label="跳转链接（中文）"]').setValue('/announcement')
    const fields = wrapper.findAllComponents(WorkbenchLocalizedField)
    await fields[0].vm.$emit('update:english', 'Title')
    await fields[1].vm.$emit('update:english', '/en')
    const scopes = wrapper.getComponent(WorkbenchAnnouncementScopes)
    scopes.vm.$emit('update:cycleScope', '指定周期')
    scopes.vm.$emit('update:visibility', '指定角色')
    await flushPromises()
    expect(wrapper.findAll('.search-select')).toHaveLength(2)
    await wrapper.get('[aria-label="指定周期"]').trigger('click')
    await wrapper.get('[aria-label="指定角色"]').trigger('click')
    const ack = wrapper.getComponent(WorkbenchAnnouncementAcknowledgement)
    ack.vm.$emit('update:enabled', true)
    ack.vm.$emit('update:description', '描述')
    ack.vm.$emit('update:descriptionEn', 'Description')
    ack.vm.$emit('update:imageId', 10)
    ack.vm.$emit('update:imageEnId', 11)
    await flushPromises()
    await button(wrapper, '启用').trigger('click')
    expect(wrapper.emitted('save')?.[0]?.[0], wrapper.text()).toEqual({ title: '公告标题', title_en: 'Title', link: '/announcement', link_en: '/en', cycle_label: '指定周期', cycle_ref: 'cycle:1', visibility: '指定角色', visibility_roles: ['HRBP', 'REAL_LINE_MANAGER'], require_ack: true, description: '描述', description_en: 'Description', image_id: 10, image_en_id: 11, status: 'active' })
  })
  it('reopens every field and saves without lossy writes', async () => {
    const wrapper = editor(announcement)
    expect(wrapper.get('input[aria-label="公告标题（英文）"]').element).toHaveProperty('value', 'English title')
    expect(wrapper.get('textarea[aria-label="描述（英文）"]').element).toHaveProperty('value', 'English description')
    expect(wrapper.getComponent(WorkbenchAnnouncementScopes).props()).toMatchObject({ roles: ['HRBP', 'REAL_LINE_MANAGER'], cycleRef: 'cycle:1' })
    expect(wrapper.getComponent(WorkbenchAnnouncementAcknowledgement).props()).toMatchObject({ imageId: 5, imageEnId: 6 })
    await button(wrapper, '保存').trigger('click')
    const { id, ...expected } = announcement
    expect(wrapper.emitted('save')?.[0]?.[0]).toEqual({ ...expected, status: 'inactive' })
  })
  it('retains roles and acknowledgement contents across switches', async () => {
    const wrapper = editor(announcement)
    const scopes = wrapper.getComponent(WorkbenchAnnouncementScopes)
    scopes.vm.$emit('update:visibility', '所有人')
    await flushPromises()
    scopes.vm.$emit('update:visibility', '指定角色')
    const ack = wrapper.getComponent(WorkbenchAnnouncementAcknowledgement)
    ack.vm.$emit('update:enabled', false)
    await flushPromises()
    await button(wrapper, '保存').trigger('click')
    expect(wrapper.emitted('save')?.[0]?.[0]).toMatchObject({ require_ack: false, description: '中文描述', image_id: 5, image_en_id: 6 })
    ack.vm.$emit('update:enabled', true)
    await flushPromises()
    expect(ack.props()).toMatchObject({ description: '中文描述', imageId: 5 })
    expect(scopes.props('roles')).toEqual(['HRBP', 'REAL_LINE_MANAGER'])
  })
  it('rejects empty fields, missing cycle, missing roles and unsafe links', async () => {
    const wrapper = editor()
    const scopes = wrapper.getComponent(WorkbenchAnnouncementScopes)
    scopes.vm.$emit('update:cycleScope', '指定周期')
    scopes.vm.$emit('update:visibility', '指定角色')
    await button(wrapper, '启用').trigger('click')
    for (const message of ['请输入公告标题', '请输入跳转链接', '请选择周期', '请至少选择一个角色']) expect(wrapper.text()).toContain(message)
    await wrapper.get('input[aria-label="公告标题（中文）"]').setValue('公告')
    await wrapper.get('input[aria-label="跳转链接（中文）"]').setValue('javascript:alert(1)')
    await button(wrapper, '保存').trigger('click')
    expect(wrapper.text()).toContain('请输入有效的 HTTP(S) 链接或站内路径')
    expect(wrapper.emitted('save')).toBeUndefined()
  })
  it('rejects invalid English URL and oversized descriptions', async () => {
    const wrapper = editor({ ...announcement, link_en: '//unsafe.test', description: '字'.repeat(1001) })
    await button(wrapper, '保存').trigger('click')
    expect(wrapper.text()).toContain('请输入有效的英文跳转链接')
    expect(wrapper.text()).toContain('公告描述不能超过 1000 字')
    expect(wrapper.emitted('save')).toBeUndefined()
  })
  it('blocks pending or failed image uploads and guards repeated saves', async () => {
    const wrapper = editor(announcement)
    wrapper.getComponent(WorkbenchAnnouncementAcknowledgement).vm.$emit('blocked', true)
    await flushPromises()
    expect(button(wrapper, '启用').attributes('disabled')).toBeDefined()
    await wrapper.setProps({ loading: true })
    expect(wrapper.findAll('input').every(node => node.attributes('disabled') !== undefined)).toBe(true)
    await button(wrapper, '保存').trigger('click')
    expect(wrapper.emitted('save')).toBeUndefined()
  })
  it('resets language expansion and values on a new editor session', async () => {
    const wrapper = editor(announcement)
    await wrapper.setProps({ modelValue: false })
    await wrapper.setProps({ modelValue: true, item: null })
    expect(wrapper.find('input[aria-label="公告标题（英文）"]').exists()).toBe(false)
    expect(wrapper.get('input[aria-label="公告标题（中文）"]').element).toHaveProperty('value', '')
  })
  it('keeps the entry-specific payload unchanged', async () => {
    const wrapper = editor()
    await wrapper.setProps({ kind: 'entry', item: { id: 1, title: '入口', link: '/entry', icon: 'help' } as any })
    expect(wrapper.text()).toContain('编辑更多入口')
    expect(wrapper.text()).not.toContain('展示周期')
    await button(wrapper, '保存').trigger('click')
    expect(wrapper.emitted('save')?.[0]?.[0]).toEqual({ title: '入口', link: '/entry', icon: 'help', visibility: '所有人', status: 'inactive' })
  })
})
