<script setup lang="ts">
import { ref } from 'vue'
import { Delete, Plus } from '@element-plus/icons-vue'
import type { AutomationRuleAction } from '@/api/automation'
import FeishuMessageActionConfig from './FeishuMessageActionConfig.vue'

const props = defineProps<{
  modelValue: AutomationRuleAction[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: AutomationRuleAction[]]
}>()

const expandedIndex = ref<number | null>(null)

function addAction() {
  const newActions = [...props.modelValue, {
    type: 'feishu_send_message',
    name: '发送飞书消息',
    enabled: true,
    config: {
      receivers: [],
      message: {
        message_format: 'markdown',
        title_template: '',
        content_template: '{{trigger_event.event_type}} 事件触发',
        resources: [],
      },
      require_completion: false,
    },
  }]
  expandedIndex.value = newActions.length - 1
  emit('update:modelValue', newActions)
}

function removeAction(index: number) {
  const newActions = [...props.modelValue]
  newActions.splice(index, 1)
  if (expandedIndex.value === index) expandedIndex.value = null
  emit('update:modelValue', newActions)
}

function updateAction(index: number, updated: AutomationRuleAction) {
  const newActions = [...props.modelValue]
  newActions[index] = updated
  emit('update:modelValue', newActions)
}
</script>

<template>
  <div class="action-list-editor">
    <!-- 空状态 -->
    <div v-if="modelValue.length === 0" class="empty-actions">
      <div class="empty-icon-wrap">
        <el-icon class="empty-icon"><Promotion /></el-icon>
      </div>
      <p class="empty-text">暂无通知动作</p>
      <p class="empty-hint">添加动作来配置消息通知的发送方式和内容</p>
    </div>

    <!-- 动作列表 -->
    <div
      v-for="(action, idx) in modelValue"
      :key="idx"
      class="action-item"
      :class="{ expanded: expandedIndex === idx }"
    >
      <!-- 折叠头 -->
      <div class="action-header" @click="expandedIndex === idx ? expandedIndex = null : expandedIndex = idx">
        <div class="action-header-left">
          <span class="action-chevron" :class="{ rotated: expandedIndex === idx }">›</span>
          <div>
            <div class="action-name">动作 {{ idx + 1 }} · 发送飞书消息</div>
            <div class="action-meta">
              <span>{{ (action.config?.receivers || []).length }} 个接收人规则</span>
            </div>
          </div>
        </div>
        <el-button
          size="small"
          type="danger"
          text
          :icon="Delete"
          @click.stop="removeAction(idx)"
        />
      </div>

      <!-- 展开编辑区 -->
      <div v-if="expandedIndex === idx" class="action-editor">
        <FeishuMessageActionConfig
          :config="action.config"
          @update:config="updateAction(idx, { ...action, config: $event })"
        />
      </div>
    </div>

    <!-- 添加按钮 -->
    <el-button :icon="Plus" @click="addAction" class="add-action-btn">
      添加通知动作
    </el-button>
  </div>
</template>

<script lang="ts">
import { Promotion } from '@element-plus/icons-vue'
</script>

<style scoped>
.action-list-editor {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* ── 空状态 ─────────────────────────────────────────────── */
.empty-actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 32px 20px;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg-subtle);
}
.empty-icon-wrap {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  background: var(--color-primary-light);
  display: flex;
  align-items: center;
  justify-content: center;
}
.empty-icon {
  font-size: 22px;
  color: var(--color-primary);
}
.empty-text {
  margin: 0;
  font-size: 14px;
  color: var(--color-text-secondary);
}
.empty-hint {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-placeholder);
}

/* ── 动作卡片 ───────────────────────────────────────────── */
.action-item {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg-card);
  transition: border-color var(--duration-fast);
  overflow: hidden;
}
.action-item:hover {
  border-color: var(--color-primary);
}
.action-item.expanded {
  border-color: var(--color-primary);
}

/* 折叠头 */
.action-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 14px;
  cursor: pointer;
  user-select: none;
}
.action-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.action-chevron {
  font-size: 16px;
  color: var(--color-text-placeholder);
  transition: transform var(--duration-fast);
  line-height: 1;
}
.action-chevron.rotated {
  transform: rotate(90deg);
}
.action-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
}
.action-meta {
  font-size: 11px;
  color: var(--color-text-placeholder);
  margin-top: 2px;
}

/* 展开编辑区 */
.action-editor {
  padding: 0 14px 14px;
  border-top: 1px solid var(--color-border);
  padding-top: 14px;
}

/* 添加按钮 */
.add-action-btn {
  border-style: dashed;
}
</style>
