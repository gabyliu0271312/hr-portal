import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import PushFieldMapper from './PushFieldMapper.vue'

const MappingWorkspaceStub = defineComponent({
  name: 'MappingWorkspace',
  props: ['modelValue', 'policy', 'compatibility', 'sourceFields', 'targetFields'],
  template: '<div data-test="mapping-workspace" />',
})

function mountMapper(mappings: Array<Record<string, unknown>> = []) {
  return mount(PushFieldMapper, {
    props: {
      mappings: mappings as any,
      sourceColumns: [
        {
          code: 'employee_no', label: '工号', data_type: 'string', is_pk_part: false,
          is_sensitive: false, is_visible: true, display_order: 0, auto_discovered: false,
          enum_options: null, agg_role: '', is_computed: false,
        },
      ],
      sourceAsset: 'employee_source',
    },
    global: { stubs: { MappingWorkspace: MappingWorkspaceStub } },
  })
}

describe('PushTarget 公共字段映射接入', () => {
  it('实际挂载 MappingWorkspace，并设置 push_target policy 与源字段白名单', () => {
    const wrapper = mountMapper([{ source: 'employee_no', target: 'staff_code' }])
    const workspace = wrapper.findComponent(MappingWorkspaceStub)

    expect(workspace.exists()).toBe(true)
    expect(workspace.props('policy')).toMatchObject({
      caller: 'push_target',
      source: { allowedFieldIds: ['employee_no'] },
      metadata: { permissionScope: 'warehouse.service' },
    })
    expect(workspace.props('modelValue').ruleSet.rules[0]).toMatchObject({
      type: 'field',
      sourceFields: ['employee_no'],
      targetFields: ['staff_code'],
      config: { mode: 'rename' },
    })
  })

  it('空 mapping 无损写回为空，保持原样推送语义', () => {
    const wrapper = mountMapper()
    expect((wrapper.vm as any).serialize()).toEqual({
      ok: true,
      storageMode: 'legacy_v1',
      mappings: [],
    })
  })

  it('field rename 保存时保留旧 mapping 的未知字段', () => {
    const wrapper = mountMapper([
      { source: 'employee_no', target: 'staff_code', future_option: 'keep' },
    ])
    expect((wrapper.vm as any).serialize()).toEqual({
      ok: true,
      storageMode: 'legacy_v1',
      mappings: [
        { source: 'employee_no', target: 'staff_code', future_option: 'keep' },
      ],
    })
  })

  it('非 field 规则保存为 component_v1 文档', async () => {
    const wrapper = mountMapper()
    const workspace = wrapper.findComponent(MappingWorkspaceStub)
    const document = workspace.props('modelValue')
    document.ruleSet.rules.push({
      id: 'value-rule', type: 'value_map', enabled: true, displayOrder: 0,
      sourceFields: ['employee_no'], targetFields: ['employee_no'],
      config: { mappings: { E001: 'S001' }, unmatched: 'keep' },
    })
    workspace.vm.$emit('update:modelValue', document)
    await nextTick()

    expect((wrapper.vm as any).serialize()).toMatchObject({
      ok: true,
      storageMode: 'component_v1',
      document: { ruleSet: { rules: [{ type: 'value_map' }] } },
    })
  })
})
