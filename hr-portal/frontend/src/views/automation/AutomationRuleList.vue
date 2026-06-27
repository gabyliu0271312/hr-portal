<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Notification, Switch, List, Edit, Delete } from '@element-plus/icons-vue'
import { automationApi, type AutomationRuleOut } from '@/api/automation'
import { useUserStore } from '@/stores/user'

const router = useRouter()
const userStore = useUserStore()
const rules = ref<AutomationRuleOut[]>([])
const loading = ref(false)

const triggerTypeLabels: Record<string, string> = {
  scheduled_job_success: '定时任务执行成功',
  scheduled_job_failed: '定时任务执行失败',
  scheduled_job_finished: '定时任务执行完成',
  report_run_success: '报表运行成功',
  report_run_failed: '报表运行失败',
  scheduled_report_success: '定时报表生成成功',
  scheduled_report_failed: '定时报表生成失败',
}

const actionTypeLabels: Record<string, string> = {
  feishu_send_message: '飞书消息',
}

function hasOp(code: string, op: string) {
  const fieldMap: Record<string, string> = { C: 'can_create', U: 'can_update', D: 'can_delete', E: 'can_export' }
  const field = fieldMap[op] || `can_${op}`
  return userStore.menus.some(m => m.code === code && (m as any)[field] === true)
}

async function loadRules() {
  loading.value = true
  try {
    rules.value = await automationApi.listRules()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '加载失败')
  } finally {
    loading.value = false
  }
}

function getActionSummary(rule: AutomationRuleOut) {
  const types = (rule.actions_config || []).map(a => actionTypeLabels[a.type] || a.type)
  return types.join(', ') || '无动作'
}

/** 判断规则配置是否完整（满足启用条件） */
function isRuleConfigComplete(rule: AutomationRuleOut): boolean {
  if (!rule.trigger_type) return false
  const actions = rule.actions_config || []
  if (actions.length === 0) return false
  for (const action of actions) {
    if (action.type === 'feishu_send_message') {
      const receivers: any[] = (action.config as any)?.receivers || []
      if (receivers.length === 0) return false
    }
  }
  return true
}

function getTriggerLabel(triggerType: string) {
  return triggerTypeLabels[triggerType] || triggerType
}

async function handleToggle(rule: AutomationRuleOut) {
  // 启用前校验配置完整度（前端兜底，后端也会校验）
  if (!rule.enabled && !isRuleConfigComplete(rule)) {
    ElMessage.warning('请先完善触发器和通知动作配置后再启用')
    return
  }
  try {
    if (rule.enabled) {
      await automationApi.disableRule(rule.id)
      rule.enabled = false
      ElMessage.success('已停用')
    } else {
      await automationApi.enableRule(rule.id)
      rule.enabled = true
      ElMessage.success('已启用')
    }
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '操作失败')
  }
}

function handleEdit(rule: AutomationRuleOut) {
  router.push({ name: 'AutomationRuleEdit', params: { id: rule.id } })
}

function handleCreate() {
  router.push({ name: 'AutomationRuleCreate' })
}

async function handleDelete(rule: AutomationRuleOut) {
  try {
    await ElMessageBox.confirm(
      `确定要删除通知规则「${rule.name}」吗？删除后不可恢复。`,
      '确认删除',
      { confirmButtonText: '确定删除', cancelButtonText: '取消', type: 'warning' }
    )
    await automationApi.deleteRule(rule.id)
    ElMessage.success('已删除')
    await loadRules()
  } catch (e: any) {
    if (e !== 'cancel' && e !== 'close') {
      ElMessage.error(e?.response?.data?.detail || '删除失败')
    }
  }
}

onMounted(() => {
  loadRules()
})
</script>

<template>
  <div class="ar-root">

    <!-- ═══════════════════════════════════════════════════════
         列表页（卡片网格）
    ════════════════════════════════════════════════════════ -->
    <div class="page-header">
      <div>
        <h1 class="page-title">自动通知</h1>
        <p class="page-desc">按事件触发器配置飞书消息通知，任务完成、报表生成后自动推送提醒</p>
      </div>
      <div class="header-actions">
        <el-button
          v-if="hasOp('automation.rules', 'C')"
          type="primary"
          :icon="Plus"
          @click="handleCreate"
        >
          新建通知
        </el-button>
      </div>
    </div>

    <!-- 骨架屏 -->
    <div v-if="loading" class="list-loading">
      <div class="skeleton" v-for="i in 3" :key="i" />
    </div>

    <!-- 空状态 -->
    <div v-else-if="!rules.length" class="empty-state">
      <el-icon class="empty-icon"><Notification /></el-icon>
      <p>暂无自动通知规则</p>
      <p class="empty-hint">创建规则后，系统将根据触发条件自动发送飞书消息通知</p>
      <el-button
        v-if="hasOp('automation.rules', 'C')"
        type="primary"
        :icon="Plus"
        @click="handleCreate"
      >
        创建第一条通知
      </el-button>
    </div>

    <!-- 卡片网格 -->
    <div v-else class="rule-grid">
      <div class="rule-card" v-for="rule in rules" :key="rule.id">
        <!-- 卡片主体 -->
        <div class="rule-card-body">
          <div class="rule-card-icon">
            <el-icon><Notification /></el-icon>
          </div>
          <div class="rule-card-info">
            <div class="rule-name">{{ rule.name }}</div>
            <div class="rule-desc" v-if="rule.description">{{ rule.description }}</div>
            <div class="rule-meta">
              <span class="meta-tag trigger">{{ getTriggerLabel(rule.trigger_type) }}</span>
              <span class="meta-dot">·</span>
              <span class="meta-text">{{ getActionSummary(rule) }}</span>
            </div>
          </div>
        </div>

        <!-- 卡片底部：标签 + 操作 -->
        <div class="rule-card-footer">
          <div class="rule-tags">
            <el-tag
              :type="rule.enabled ? 'success' : 'info'"
              size="small"
              effect="plain"
            >
              {{ rule.enabled ? '已启用' : '已停用' }}
            </el-tag>
            <el-tag
              v-if="rule.source === 'ai_generated'"
              type="warning"
              size="small"
              effect="plain"
            >
              AI 生成
            </el-tag>
          </div>
          <div class="rule-card-actions">
            <el-button size="small" :icon="Edit" @click="handleEdit(rule)">
              编辑
            </el-button>
            <el-tooltip
              :content="'请先完善触发器和通知动作配置后再启用'"
              :disabled="rule.enabled || isRuleConfigComplete(rule)"
              placement="top"
            >
              <el-button
                size="small"
                :type="rule.enabled ? 'warning' : 'success'"
                :disabled="!rule.enabled && !isRuleConfigComplete(rule)"
                @click="handleToggle(rule)"
              >
                {{ rule.enabled ? '停用' : '启用' }}
              </el-button>
            </el-tooltip>
            <el-button
              v-if="hasOp('automation.rules', 'D')"
              size="small"
              type="danger"
              :icon="Delete"
              @click="handleDelete(rule)"
            >
              删除
            </el-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ── 根容器 ─────────────────────────────────────────────── */
.ar-root {
  min-height: calc(100vh - var(--layout-topbar-height));
  background: var(--color-bg-page);
  padding: 24px;
}

/* ── 页面头部 ───────────────────────────────────────────── */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
}
.page-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 4px;
}
.page-desc {
  font-size: 13px;
  color: var(--color-text-placeholder);
  margin: 0;
  max-width: 560px;
  line-height: 1.6;
}
.header-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

/* ── 骨架屏 ─────────────────────────────────────────────── */
.list-loading {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.skeleton {
  height: 100px;
  border-radius: var(--radius-lg);
  background: linear-gradient(90deg, #eef1f6 25%, #f8fafc 50%, #eef1f6 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
}
@keyframes shimmer {
  to { background-position: -200% 0; }
}

/* ── 空状态 ─────────────────────────────────────────────── */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 80px 0;
  color: var(--color-text-placeholder);
}
.empty-icon {
  font-size: 48px;
}
.empty-state p {
  margin: 0;
  font-size: 14px;
}
.empty-hint {
  font-size: 12px;
  color: var(--color-text-secondary);
}

/* ── 卡片网格 ───────────────────────────────────────────── */
.rule-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 12px;
}

/* ── 单张卡片 ───────────────────────────────────────────── */
.rule-card {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  transition: border-color var(--duration-fast), box-shadow var(--duration-fast);
}
.rule-card:hover {
  border-color: var(--color-primary);
  box-shadow: var(--shadow-card);
}

/* 卡片主体 */
.rule-card-body {
  display: flex;
  gap: 12px;
}
.rule-card-icon {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: var(--radius-md);
  background: var(--color-primary-light);
  color: var(--color-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
}
.rule-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 3px;
}
.rule-desc {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-bottom: 6px;
  line-height: 1.5;
}
.rule-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}
.meta-tag {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: var(--radius-pill);
  background: var(--color-primary-light);
  color: var(--color-primary);
}
.meta-tag.trigger {
  background: var(--color-success-light);
  color: var(--color-success-dark);
}
.meta-dot {
  color: var(--color-text-placeholder);
}
.meta-text {
  font-size: 12px;
  color: var(--color-text-secondary);
}

/* 卡片底部 */
.rule-card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.rule-tags {
  display: flex;
  gap: 6px;
}
.rule-card-actions {
  display: flex;
  gap: 6px;
}
</style>
