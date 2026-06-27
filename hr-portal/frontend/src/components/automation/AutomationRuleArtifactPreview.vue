<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Bell, Promotion, CircleCheck, Close } from '@element-plus/icons-vue'
import type { AutomationRuleArtifact } from '@/api/ai'
import { automationApi } from '@/api/automation'

const props = defineProps<{
  artifact: AutomationRuleArtifact
}>()

const emit = defineEmits<{
  saved: []
  dismissed: []
}>()

const saving = ref(false)
const triggerTypeLabels: Record<string, string> = {
  scheduled_job_success: '定时任务执行成功',
  scheduled_job_failed: '定时任务执行失败',
  scheduled_job_finished: '定时任务执行完成',
  report_run_success: '报表运行成功',
  report_run_failed: '报表运行失败',
  scheduled_report_success: '定时报表生成成功',
  scheduled_report_failed: '定时报表生成失败',
}

async function handleSave() {
  if (!props.artifact) return
  saving.value = true
  try {
    const draft = props.artifact.rule_draft
    if (!draft) return
    const payload = {
      name: draft.name,
      description: draft.description,
      biz_type: draft.biz_type,
      trigger_type: draft.trigger_type,
      trigger_config: draft.trigger_config,
      condition_config: draft.condition_config || [],
      actions_config: draft.actions_config,
      enabled: false,
      source: 'ai_generated' as const,
    }
    const result = await automationApi.createRule(payload)
    ElMessage.success(`通知「${result.name}」已保存，请手动启用`)
    emit('saved')
  } catch (e: any) {
    const detail = e?.response?.data?.detail || '保存失败'
    ElMessage.error(detail)
  } finally {
    saving.value = false
  }
}

function handleDismiss() {
  emit('dismissed')
}

function getActionSummary(action: any) {
  if (action.type === 'feishu_send_message') {
    const config = action.config || {}
    const receivers = config.receivers || []
    return receivers.length > 0
      ? `${receivers.length} 个接收规则`
      : '未配置接收人'
  }
  return action.type
}

function getReceiverSummary(receiver: any): string {
  if (receiver.type === 'fixed_users') {
    return receiver.user_ids?.length ? `指定用户 (${receiver.user_ids.length}人)` : '指定用户（待选择）'
  }
  if (receiver.type === 'fixed_chats') {
    return receiver.chat_ids?.length ? `指定群聊 (${receiver.chat_ids.length}个)` : '指定群聊（待选择）'
  }
  if (receiver.type === 'employee_field_user') {
    return `员工字段 ${receiver.target_field}`
  }
  if (receiver.type === 'employee_department_manager') {
    return `部门负责人 (${receiver.department_field})`
  }
  return JSON.stringify(receiver)
}

function getMessagePreview(config: any): string {
  return config?.message?.content_template || '（使用默认模板）'
}
</script>

<template>
  <div v-if="artifact?.artifact_type === 'automation_rule'" class="artifact-preview">
    <!-- 头部 -->
    <div class="artifact-header">
      <div class="artifact-header-left">
        <div class="artifact-badge">
          <el-icon><Bell /></el-icon>
        </div>
        <div>
          <h4 class="artifact-title">自动通知规则草稿</h4>
          <p class="artifact-subtitle">AI 已为你生成通知规则，请确认后保存</p>
        </div>
      </div>
      <el-button size="small" text :icon="Close" @click="handleDismiss" />
    </div>

    <!-- 验证错误 -->
    <div v-if="artifact.validation_errors?.length" class="validation-errors">
      <el-alert
        type="warning"
        :closable="false"
        show-icon
        title="配置有误，请修改后保存"
      >
        <ul>
          <li v-for="(err, idx) in artifact.validation_errors" :key="idx">{{ err }}</li>
        </ul>
      </el-alert>
    </div>

    <!-- 待配置项 -->
    <div v-if="artifact.needs_config?.length" class="needs-config">
      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="以下信息待配置，保存后可在编辑器中补充"
      >
        <ul>
          <li v-for="(item, idx) in artifact.needs_config" :key="idx">{{ item }}</li>
        </ul>
      </el-alert>
    </div>

    <!-- 草稿内容 -->
    <div v-if="artifact.rule_draft" class="artifact-body">
      <div class="rule-name">{{ artifact.rule_draft.name }}</div>
      <div v-if="artifact.rule_draft.description" class="rule-desc">
        {{ artifact.rule_draft.description }}
      </div>

      <div class="draft-grid">
        <!-- 触发器 -->
        <div class="draft-card">
          <div class="draft-card-label">触发器</div>
          <div class="draft-card-value">
            <el-tag type="" size="small">
              {{ triggerTypeLabels[artifact.rule_draft.trigger_type] || artifact.rule_draft.trigger_type }}
            </el-tag>
            <span v-if="artifact.rule_draft.trigger_config?.biz_id" class="biz-id">
              关联 ID: {{ artifact.rule_draft.trigger_config.biz_id }}
            </span>
          </div>
        </div>

        <!-- 动作 -->
        <div class="draft-card">
          <div class="draft-card-label">通知动作</div>
          <div class="draft-card-value">
            <div
              v-for="(action, idx) in artifact.rule_draft.actions_config"
              :key="idx"
              class="action-summary-item"
            >
              <el-icon><Promotion /></el-icon>
              <span>飞书消息 · {{ getActionSummary(action) }}</span>
            </div>
          </div>
        </div>

        <!-- 消息预览 -->
        <div
          v-for="(action, idx) in artifact.rule_draft.actions_config?.filter(a => a.type === 'feishu_send_message')"
          :key="'msg-' + idx"
          class="draft-card"
        >
          <div class="draft-card-label">消息内容预览</div>
          <div class="draft-card-value">
            <div class="msg-receivers" v-if="(action.config?.receivers || []).length">
              <span class="msg-kv-label">接收人：</span>
              <el-tag
                v-for="(receiver, rIdx) in (action.config?.receivers || [])"
                :key="rIdx"
                size="small"
              >
                {{ getReceiverSummary(receiver) }}
              </el-tag>
            </div>
            <div class="msg-body">
              <span class="msg-kv-label">内容：</span>
              <span class="msg-body-text">{{ getMessagePreview(action.config) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 无草稿 -->
    <div v-else class="no-draft">
      <el-alert type="info" :closable="false" show-icon title="信息不足，无法生成完整规则草稿" />
    </div>

    <!-- 操作按钮 -->
    <div class="artifact-actions">
      <el-button size="small" @click="handleDismiss">放弃</el-button>
      <el-button
        size="small"
        type="primary"
        :icon="CircleCheck"
        :loading="saving"
        :disabled="!artifact.rule_draft || (artifact.validation_errors?.length ?? 0) > 0"
        @click="handleSave"
      >
        保存通知
      </el-button>
    </div>

    <!-- 追问 -->
    <div v-if="artifact.follow_up_question" class="follow-up">
      <el-alert type="info" :closable="false" show-icon :title="artifact.follow_up_question" />
    </div>
  </div>
</template>

<style scoped>
.artifact-preview {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--color-primary-light);
  border-radius: var(--radius-lg);
  background: linear-gradient(135deg, var(--color-primary-light-9), var(--color-bg-card));
  margin-top: 8px;
}

/* ── 头部 ───────────────────────────────────────────────── */
.artifact-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.artifact-header-left {
  display: flex;
  gap: 10px;
}
.artifact-badge {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border-radius: var(--radius-md);
  background: var(--color-primary-light);
  color: var(--color-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
}
.artifact-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-primary);
}
.artifact-subtitle {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--color-text-secondary);
}

/* ── 验证 / 配置提示 ───────────────────────────────────── */
.validation-errors ul,
.needs-config ul {
  margin: 4px 0 0;
  padding-left: 18px;
}
.validation-errors li,
.needs-config li {
  font-size: 12px;
  line-height: 1.6;
}

/* ── 草稿主体 ──────────────────────────────────────────── */
.artifact-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.rule-name {
  font-weight: 600;
  font-size: 15px;
  color: var(--color-text-primary);
}
.rule-desc {
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.5;
}

/* 信息卡片网格 */
.draft-grid {
  display: grid;
  gap: 8px;
}
.draft-card {
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-card);
}
.draft-card-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-placeholder);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 6px;
}
.draft-card-value {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.action-summary-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--color-text-primary);
}
.biz-id {
  font-size: 12px;
  color: var(--color-text-secondary);
}

/* 消息预览 */
.msg-receivers {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  margin-bottom: 6px;
}
.msg-body {
  display: flex;
  align-items: flex-start;
  gap: 4px;
}
.msg-kv-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-placeholder);
  flex-shrink: 0;
}
.msg-body-text {
  font-size: 12px;
  color: var(--color-text-secondary);
  white-space: pre-wrap;
  line-height: 1.5;
  max-height: 80px;
  overflow-y: auto;
}

/* ── 操作按钮 ──────────────────────────────────────────── */
.artifact-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 10px;
  border-top: 1px solid var(--color-border-light);
}
</style>
