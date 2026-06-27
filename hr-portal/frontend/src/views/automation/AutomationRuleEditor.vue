<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  ArrowLeft, Notification, Clock, Promotion, Edit, Plus, Delete,
  SetUp, Timer, CircleCheck, CircleClose, Finished, DocumentChecked
} from '@element-plus/icons-vue'
import { automationApi, type AutomationRuleOut, type AutomationRuleCreate } from '@/api/automation'
import TriggerWizard from '@/components/automation/TriggerWizard.vue'
import ActionWizard from '@/components/automation/ActionWizard.vue'
import { useUserStore } from '@/stores/user'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

const isEdit = computed(() => !!route.params.id)
const ruleId = computed(() => Number(route.params.id))

const form = ref<AutomationRuleCreate>({
  name: '',
  description: null,
  biz_type: null,
  trigger_type: '',
  trigger_config: {},
  condition_config: [],
  actions_config: [],
  enabled: false,
  source: 'manual',
})

const saving = ref(false)
const loading = ref(false)

// ── 向导状态 ──────────────────────────────────────────
const showTriggerWizard = ref(false)
const showActionWizard = ref(false)
const editingActionIndex = ref<number | null>(null)
const editingActionConfig = ref<Record<string, any> | null>(null)

// ── 触发器摘要 ────────────────────────────────────────
const triggerDefs: Record<string, { label: string; icon: any; category: string }> = {
  schedule: { label: '定时通知', icon: Clock, category: '系统内置' },
  scheduled_job_success: { label: '定时任务执行成功', icon: CircleCheck, category: '门户继承' },
  scheduled_job_failed: { label: '定时任务执行失败', icon: CircleClose, category: '门户继承' },
  scheduled_job_finished: { label: '定时任务执行完成', icon: Finished, category: '门户继承' },
  report_run_success: { label: '报表运行成功', icon: CircleCheck, category: '报表系统' },
  report_run_failed: { label: '报表运行失败', icon: CircleClose, category: '报表系统' },
  scheduled_report_success: { label: '定时报表生成成功', icon: DocumentChecked, category: '报表系统' },
  scheduled_report_failed: { label: '定时报表生成失败', icon: Timer, category: '报表系统' },
}

const triggerSummary = computed(() => {
  if (!form.value.trigger_type) return null
  const def = triggerDefs[form.value.trigger_type]
  if (!def) return { label: form.value.trigger_type, icon: SetUp, category: '', detail: '' }

  let detail = ''
  const cfg = form.value.trigger_config || {}
  if (form.value.trigger_type === 'schedule') {
    const presets: Record<string, string> = {
      'FREQ=DAILY;INTERVAL=1': '每天',
      'FREQ=WEEKLY;BYDAY=MO': '每周一',
      'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR': '每周一至周五',
      'FREQ=MONTHLY;BYMONTHDAY=1': '每月1日',
    }
    detail = presets[cfg.rrule as string] || cfg.rrule || '自定义'
  } else if (cfg.biz_id) {
    detail = `关联 ID: ${cfg.biz_id}`
  }
  return { ...def, detail }
})

// ── 动作摘要 ──────────────────────────────────────────
const actionSummaries = computed(() => {
  return (form.value.actions_config || []).map((action, idx) => {
    const cfg = action.config || {}
    const receiverCount = (cfg.receivers || []).length
    const format = cfg.message?.message_format || 'markdown'
    return {
      index: idx,
      type: action.type,
      name: action.name || '通知动作',
      enabled: action.enabled !== false,
      receiverCount,
      format,
      hasCard: cfg.card_button?.enabled || false,
    }
  })
})

// ── 表单完整度判断（用于控制启用开关是否可操作）──────
const isFormComplete = computed(() => {
  if (!form.value.trigger_type) return false
  const actions = form.value.actions_config || []
  if (actions.length === 0) return false
  for (const action of actions) {
    if (action.type === 'feishu_send_message') {
      const receivers: any[] = (action.config as any)?.receivers || []
      if (receivers.length === 0) return false
    }
  }
  return true
})

// ── 加载/保存 ─────────────────────────────────────────
async function loadRule() {
  if (!isEdit.value) return
  loading.value = true
  try {
    const rule = await automationApi.getRule(ruleId.value)
    form.value = {
      name: rule.name,
      description: rule.description,
      biz_type: rule.biz_type,
      trigger_type: rule.trigger_type,
      trigger_config: rule.trigger_config,
      condition_config: rule.condition_config || [],
      actions_config: rule.actions_config || [],
      enabled: rule.enabled,
      source: (rule.source as any) || 'manual',
    }
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '加载失败')
    router.push({ name: 'AutomationRuleList' })
  } finally {
    loading.value = false
  }
}

function validate(): string | null {
  if (!form.value.name?.trim()) return '请输入通知名称'
  // 未启用时只校验名称，跳过其余所有校验（允许存草稿）
  if (!form.value.enabled) return null
  if (!form.value.trigger_type) return '请选择触发器'
  if (!form.value.actions_config || form.value.actions_config.length === 0) return '请至少添加一个通知动作'
  return null
}

async function handleSave() {
  const err = validate()
  if (err) { ElMessage.warning(err); return }
  saving.value = true
  try {
    if (isEdit.value) {
      await automationApi.updateRule(ruleId.value, form.value)
      ElMessage.success('通知已更新')
    } else {
      await automationApi.createRule(form.value)
      ElMessage.success('通知已创建')
    }
    router.push({ name: 'AutomationRuleList' })
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '保存失败')
  } finally {
    saving.value = false
  }
}

// ── 触发器操作 ────────────────────────────────────────
function openTriggerWizard() {
  showTriggerWizard.value = true
}

function onTriggerConfirm(payload: { triggerType: string; triggerConfig: Record<string, any>; bizId: number | null }) {
  form.value.trigger_type = payload.triggerType
  form.value.trigger_config = payload.triggerConfig
}

// ── 动作操作 ──────────────────────────────────────────
function openAddAction() {
  editingActionIndex.value = null
  editingActionConfig.value = null
  showActionWizard.value = true
}

function openEditAction(index: number) {
  const action = form.value.actions_config![index]
  editingActionIndex.value = index
  editingActionConfig.value = { type: action.type, config: { ...(action.config || {}) } }
  showActionWizard.value = true
}

function onActionConfirm(payload: { type: string; name: string; enabled: boolean; config: Record<string, any> }) {
  const actions = [...(form.value.actions_config || [])]
  const newAction = { type: payload.type, name: payload.name, enabled: payload.enabled, config: payload.config }
  if (editingActionIndex.value !== null) {
    actions[editingActionIndex.value] = newAction
  } else {
    actions.push(newAction)
  }
  form.value.actions_config = actions
}

async function removeAction(index: number) {
  try {
    await ElMessageBox.confirm('确定要删除这个通知动作吗？', '删除确认', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch { return }
  const actions = [...(form.value.actions_config || [])]
  actions.splice(index, 1)
  form.value.actions_config = actions
}

function handleBack() {
  router.push({ name: 'AutomationRuleList' })
}

async function handleDeleteRule() {
  if (!isEdit.value) return
  try {
    await ElMessageBox.confirm(
      `确定要删除通知规则「${form.value.name || '未命名'}」吗？删除后不可恢复。`,
      '确认删除',
      { confirmButtonText: '确定删除', cancelButtonText: '取消', type: 'warning' }
    )
    await automationApi.deleteRule(ruleId.value)
    ElMessage.success('已删除')
    router.push({ name: 'AutomationRuleList' })
  } catch (e: any) {
    if (e !== 'cancel' && e !== 'close') {
      ElMessage.error(e?.response?.data?.detail || '删除失败')
    }
  }
}

function hasOp(code: string, op: string) {
  const fieldMap: Record<string, string> = { C: 'can_create', U: 'can_update', D: 'can_delete', E: 'can_export' }
  const field = fieldMap[op] || `can_${op}`
  return userStore.menus.some(m => m.code === code && (m as any)[field] === true)
}

onMounted(() => { loadRule() })
</script>

<template>
  <div class="are-root" v-loading="loading">
    <!-- ═══════════════════════════════════════════════════════
         顶部导航栏
    ════════════════════════════════════════════════════════ -->
    <div class="topbar">
      <button class="back-btn" @click="handleBack">
        <el-icon><ArrowLeft /></el-icon><span>返回通知列表</span>
      </button>
      <div class="topbar-center">
        <el-icon class="topbar-icon"><Notification /></el-icon>
        <h1 class="topbar-title">{{ isEdit ? '编辑通知' : '新建通知' }}</h1>
      </div>
      <div class="topbar-actions">
        <el-button @click="handleBack">取消</el-button>
        <el-button v-if="isEdit && hasOp('automation.rules', 'D')" type="danger" :icon="Delete" @click="handleDeleteRule">
          删除规则
        </el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">
          {{ isEdit ? '保存修改' : '创建通知' }}
        </el-button>
      </div>
    </div>

    <!-- ═══════════════════════════════════════════════════════
         卡片概述布局
    ════════════════════════════════════════════════════════ -->
    <div class="overview-layout">
      <!-- 卡片1：基础信息 -->
      <div class="ov-card">
        <div class="ov-card-header">
          <h2 class="ov-card-title">基础信息</h2>
        </div>
        <div class="ov-card-body">
          <div class="field-row">
            <label class="field-label required">通知名称</label>
            <el-input v-model="form.name" placeholder="如：月度报表生成通知" maxlength="100" show-word-limit />
          </div>
          <div class="field-row">
            <label class="field-label">通知描述</label>
            <el-input v-model="form.description" type="textarea"
              :autosize="{ minRows: 2, maxRows: 4 }" placeholder="描述通知的用途和场景（可选）" />
          </div>
          <div class="field-row">
            <label class="field-label">启用状态</label>
            <div class="switch-row">
              <el-switch v-model="form.enabled" size="small" :disabled="!form.enabled && !isFormComplete" />
              <span class="switch-hint">{{ form.enabled ? '事件触发时自动执行通知' : '仅保存配置，暂不执行' }}</span>
              <span v-if="!form.enabled && !isFormComplete" class="switch-warn">（请先完善触发器和通知动作配置后再启用）</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 卡片2：触发器 -->
      <div class="ov-card">
        <div class="ov-card-header">
          <h2 class="ov-card-title">触发器</h2>
          <span class="ov-badge required-badge">必选</span>
        </div>
        <div class="ov-card-body">
          <!-- 已选择触发器 -->
          <div v-if="triggerSummary" class="summary-block">
            <div class="summary-row">
              <div class="summary-icon">
                <el-icon :size="22"><component :is="triggerSummary.icon" /></el-icon>
              </div>
              <div class="summary-info">
                <div class="summary-label">{{ triggerSummary.label }}</div>
                <div class="summary-detail" v-if="triggerSummary.detail">{{ triggerSummary.detail }}</div>
                <div class="summary-meta">{{ triggerSummary.category }}</div>
              </div>
              <el-button :icon="Edit" size="small" @click="openTriggerWizard">更改</el-button>
            </div>
          </div>

          <!-- 空状态 -->
          <div v-else class="empty-state" @click="openTriggerWizard">
            <div class="empty-icon">
              <el-icon :size="28"><SetUp /></el-icon>
            </div>
            <div class="empty-text">尚未选择触发器</div>
            <div class="empty-hint">点击此处选择触发通知的事件类型</div>
            <el-button :icon="Plus" type="primary" size="small" class="empty-btn">
              选择触发器
            </el-button>
          </div>
        </div>
      </div>

      <!-- 卡片3：通知动作 -->
      <div class="ov-card">
        <div class="ov-card-header">
          <h2 class="ov-card-title">通知动作</h2>
          <span class="ov-badge">{{ actionSummaries.length }} 个</span>
        </div>
        <div class="ov-card-body">
          <!-- 动作列表 -->
          <div v-for="summary in actionSummaries" :key="summary.index" class="summary-block action-block">
            <div class="summary-row">
              <div class="summary-icon action-icon">
                <el-icon :size="20"><Promotion /></el-icon>
              </div>
              <div class="summary-info">
                <div class="summary-label">动作 {{ summary.index + 1 }} · 发送飞书消息</div>
                <div class="summary-detail">{{ summary.receiverCount }} 个接收人 · {{ summary.format === 'markdown' ? 'Markdown' : '纯文本' }}</div>
                <div class="summary-meta" v-if="summary.hasCard">含卡片按钮</div>
              </div>
              <div class="summary-actions">
                <el-button :icon="Edit" size="small" text @click.stop="openEditAction(summary.index)">编辑</el-button>
                <el-button :icon="Delete" size="small" text type="danger" @click.stop="removeAction(summary.index)">删除</el-button>
              </div>
            </div>
          </div>

          <!-- 空状态 / 添加按钮 -->
          <div v-if="actionSummaries.length === 0" class="empty-state small" @click="openAddAction">
            <div class="empty-icon small-icon">
              <el-icon :size="24"><Promotion /></el-icon>
            </div>
            <div class="empty-text">暂无通知动作</div>
            <div class="empty-hint">添加动作来配置消息通知的发送方式和内容</div>
          </div>

          <el-button :icon="Plus" type="primary" plain @click="openAddAction" class="add-action-btn">
            添加通知动作
          </el-button>
        </div>
      </div>
    </div>

    <!-- ═══════════════════════════════════════════════════════
         触发器向导
    ════════════════════════════════════════════════════════ -->
    <TriggerWizard
      v-model="showTriggerWizard"
      :trigger-type="form.trigger_type"
      :trigger-config="form.trigger_config"
      @confirm="onTriggerConfirm"
    />

    <!-- ═══════════════════════════════════════════════════════
         动作向导
    ════════════════════════════════════════════════════════ -->
    <ActionWizard
      v-model="showActionWizard"
      :edit-config="editingActionConfig"
      @confirm="onActionConfirm"
    />
  </div>
</template>

<style scoped>
/* ── 根 ─────────────────────────────────────────────── */
.are-root {
  min-height: calc(100vh - var(--layout-topbar-height));
  background: var(--color-bg-page, #f5f7fa);
}

/* ── 顶部导航栏 ─────────────────────────────────────── */
.topbar {
  display: flex; align-items: center; gap: 16px;
  padding: 16px 24px; background: var(--color-bg-card, #fff);
  border-bottom: 1px solid var(--color-border, #e4e7ed);
  position: sticky; top: 0; z-index: 10;
}
.back-btn {
  display: flex; align-items: center; gap: 4px; font-size: 13px;
  color: var(--color-text-secondary, #909399);
  background: none; border: none; cursor: pointer; padding: 4px 0;
  transition: color 0.15s; flex-shrink: 0;
}
.back-btn:hover { color: var(--color-primary, #409eff); }
.topbar-center { flex: 1; display: flex; align-items: center; gap: 8px; }
.topbar-icon { font-size: 20px; color: var(--color-primary, #409eff); }
.topbar-title { font-size: 17px; font-weight: 600; color: var(--color-text-primary, #303133); margin: 0; }
.topbar-actions { display: flex; gap: 8px; flex-shrink: 0; }

/* ── 概述布局 ───────────────────────────────────────── */
.overview-layout {
  max-width: 900px; margin: 0 auto; padding: 24px; display: flex; flex-direction: column; gap: 16px;
}

/* ── 卡片 ───────────────────────────────────────────── */
.ov-card {
  background: var(--color-bg-card, #fff);
  border: 1px solid var(--color-border, #e4e7ed);
  border-radius: 12px; overflow: hidden;
  transition: box-shadow 0.2s ease;
}
.ov-card:hover { box-shadow: 0 2px 12px rgba(0,0,0,0.04); }
.ov-card-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 18px 24px 0;
}
.ov-card-title {
  font-size: 15px; font-weight: 600;
  color: var(--color-text-primary, #303133); margin: 0;
}
.ov-card-body { padding: 18px 24px 20px; }
.ov-badge {
  font-size: 11px; color: var(--color-text-placeholder, #c0c4cc);
  background: var(--color-bg-subtle, #f0f2f5);
  padding: 2px 10px; border-radius: 12px;
}
.ov-badge.required-badge {
  color: var(--color-danger, #f56c6c);
  background: rgba(245, 108, 108, 0.08);
}

/* ── 基础信息字段 ───────────────────────────────────── */
.field-row {
  margin-bottom: 14px;
}
.field-row:last-child { margin-bottom: 0; }
.field-label {
  display: block; font-size: 13px; font-weight: 500;
  color: var(--color-text-regular, #606266); margin-bottom: 6px;
}
.field-label.required::after { content: ' *'; color: var(--color-danger, #f56c6c); }
.switch-row { display: flex; align-items: center; gap: 10px; }
.switch-hint { font-size: 12px; color: var(--color-text-secondary, #909399); }
.switch-warn { font-size: 12px; color: var(--color-text-placeholder, #c0c4cc); margin-left: 4px; }

/* ── 摘要块（触发器/动作） ──────────────────────────── */
.summary-block {
  padding: 12px 16px; border: 1px solid var(--color-border, #e4e7ed);
  border-radius: 10px; background: var(--color-bg-subtle, #f8f9fb);
  margin-bottom: 10px;
}
.summary-block:last-of-type { margin-bottom: 0; }
.action-block { padding: 10px 14px; }
.summary-row {
  display: flex; align-items: center; gap: 12px;
}
.summary-icon {
  width: 42px; height: 42px; border-radius: 10px;
  background: var(--color-primary-subtle, #ecf5ff);
  color: var(--color-primary, #409eff);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.summary-icon.action-icon {
  width: 36px; height: 36px; border-radius: 8px;
  background: var(--color-bg-page, #f5f7fa);
}
.summary-info { flex: 1; min-width: 0; }
.summary-label { font-size: 14px; font-weight: 600; color: var(--color-text-primary, #303133); }
.summary-detail { font-size: 12px; color: var(--color-text-secondary, #909399); margin-top: 2px; }
.summary-meta {
  font-size: 10px; color: var(--color-text-placeholder, #c0c4cc);
  margin-top: 2px;
}
.summary-actions { display: flex; gap: 4px; flex-shrink: 0; }

/* ── 空状态 ─────────────────────────────────────────── */
.empty-state {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 32px 20px; border: 2px dashed var(--color-border, #e4e7ed);
  border-radius: 10px; background: var(--color-bg-subtle, #f8f9fb);
  cursor: pointer; transition: all 0.2s ease;
}
.empty-state:hover {
  border-color: var(--color-primary-light, #a0cfff);
  background: var(--color-primary-subtle, #ecf5ff);
}
.empty-state.small { padding: 20px; gap: 4px; }
.empty-icon {
  width: 52px; height: 52px; border-radius: 12px;
  background: var(--color-bg-page, #f5f7fa);
  color: var(--color-text-placeholder, #c0c4cc);
  display: flex; align-items: center; justify-content: center;
}
.empty-icon.small-icon { width: 40px; height: 40px; border-radius: 10px; }
.empty-text { font-size: 14px; color: var(--color-text-secondary, #909399); margin-top: 4px; }
.empty-hint { font-size: 12px; color: var(--color-text-placeholder, #c0c4cc); }
.empty-btn { margin-top: 8px; }

.add-action-btn { width: 100%; border-style: dashed; margin-top: 8px; }
</style>
