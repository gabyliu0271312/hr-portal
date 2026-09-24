<template>
  <section class="function-permission-card" aria-labelledby="function-permission-title">
    <h2 id="function-permission-title">功能权限</h2>
    <p class="function-permission-description">选择该角色在系统中看到的模块入口、菜单、列表等</p>

    <div class="function-tree" role="tree" aria-label="功能权限选项">
      <FunctionPermissionNode
        v-for="node in nodes"
        :key="node.key"
        :node="node"
        :expanded-keys="expandedKeys"
        :selected-keys="selectedKeys"
        @toggle-expand="toggleExpand"
        @toggle-select="toggleSelect"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import FunctionPermissionNode from './FunctionPermissionNode.vue'

export interface FunctionPermissionTreeNode {
  key: string
  label: string
  info?: string
  children?: FunctionPermissionTreeNode[]
}

const props = defineProps<{
  modelValue: string[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string[]]
}>()

const nodes: FunctionPermissionTreeNode[] = [
  {
    key: 'performance.backend',
    label: '绩效后台',
    children: [
      { key: 'performance.backend.cycles-projects', label: '周期与项目' },
      {
        key: 'performance.backend.people-groups',
        label: '人员组管理',
        children: [
          { key: 'performance.backend.people-groups.cycle', label: '周期级人员组管理', info: '周期内人员组配置' },
          { key: 'performance.backend.people-groups.project', label: '关联评估项目的人员组管理', info: '评估项目关联人员组配置' },
        ],
      },
      { key: 'performance.backend.metrics', label: '指标库' },
      { key: 'performance.backend.metric-templates', label: '指标模版' },
      { key: 'performance.backend.templates', label: '绩效模板' },
      { key: 'performance.backend.evaluation-questions', label: '评估题管理' },
      { key: 'performance.backend.permissions', label: '权限管理' },
      { key: 'performance.backend.subject-visibility', label: '被评估人信息可见性设置' },
      { key: 'performance.backend.system', label: '系统设置' },
    ],
  },
  {
    key: 'performance.frontend',
    label: '绩效前台',
    children: [
      { key: 'performance.frontend.progress', label: '进度管理与催办' },
      { key: 'performance.frontend.result-open', label: '开通绩效结果' },
      { key: 'performance.frontend.data-view', label: '绩效数据查看（列表/报表/矩阵/详情）' },
      { key: 'performance.frontend.export-members', label: '导出成员列表' },
      { key: 'performance.frontend.export-details', label: '导出绩效详情' },
      { key: 'performance.frontend.manage-evaluatees', label: '添加/删除/转移被评估人' },
      { key: 'performance.frontend.manage-reviewers-360', label: '添加/删除360 评估人' },
    ],
  },
]

const expandedKeys = ref(new Set<string>([
  'performance.backend',
  'performance.backend.people-groups',
  'performance.frontend',
]))
const selectedKeys = computed(() => new Set(props.modelValue))

function leafKeys(node: FunctionPermissionTreeNode): string[] {
  if (!node.children?.length) return [node.key]
  return node.children.flatMap(leafKeys)
}

function toggleExpand(key: string) {
  if (expandedKeys.value.has(key)) expandedKeys.value.delete(key)
  else expandedKeys.value.add(key)
}

function toggleSelect(node: FunctionPermissionTreeNode) {
  const next = new Set(props.modelValue)
  const keys = leafKeys(node)
  const checked = keys.every(key => next.has(key))
  keys.forEach(key => checked ? next.delete(key) : next.add(key))
  emit('update:modelValue', [...next])
}
</script>

<style scoped>
.function-permission-card { box-sizing: border-box; width: min(100%, 800px); margin-bottom: 16px; padding: 20px; border: 1px solid transparent; border-radius: 8px; background: #fff; box-shadow: rgba(31, 35, 41, .02) 0 1px 2px -2px, rgba(31, 35, 41, .02) 0 2px 4px, rgba(31, 35, 41, .02) 0 2px 8px 2px; color: #1f2329; }
.function-permission-card h2 { margin: 0; font-size: 16px; font-weight: 600; line-height: 24px; }
.function-permission-description { margin: 4px 0 16px; color: #646a73; font-size: 14px; line-height: 22px; }
.function-tree { display: grid; gap: 2px; }
</style>
