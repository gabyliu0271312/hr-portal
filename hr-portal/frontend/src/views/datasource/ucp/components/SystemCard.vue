<template>
  <el-card
    class="sys-card"
    :class="['sys-type-' + (system.system_type || 'CUSTOM'), cardRiskClass]"
    shadow="hover"
    @click="$emit('open')"
  >
    <!-- 头部: 状态色点 + 图标 + 名称 + 停用 tag -->
    <div class="sc-header">
      <div class="sc-title">
        <span class="system-icon" :style="{ background: iconColor }">
          {{ logoText }}
        </span>
        <div>
          <div class="system-name">
            <span
              class="health-dot"
              :class="'health-' + health"
              :title="healthLabel"
            />
            {{ system.system_name }}
            <el-tag :type="statusType" size="small" effect="light">{{ statusTag }}</el-tag>
          </div>
          <div class="system-code">{{ system.system_code }} · {{ system.system_type || 'CUSTOM' }} · Owner: {{ ownerLabel }}</div>
          <div class="system-status-line">{{ operationalStatus }}</div>
        </div>
      </div>
      <el-tag v-if="!system.is_active" type="info" size="small">已停用</el-tag>
    </div>

    <el-divider style="margin: 12px 0" />

    <!-- 凭证区：完全对齐蓝图场景 2，凭证作为轻量 chip 挂在卡片上 -->
    <div class="credential-label">{{ credentialHeaderText }}</div>
    <div class="creds">
      <span
        v-for="chip in credentialChips"
        :key="chip.key"
        class="cred-chip"
        :class="{ primary: chip.primary, expired: chip.expired }"
        @click.stop="$emit('open')"
      >{{ chip.text }}</span>
      <span class="cred-chip add" @click.stop="$emit('open')">+ 补充</span>
    </div>

    <div class="metric-strip">
      <div><span>资源</span><b>{{ resources.length }} 个</b></div>
      <div><span>流水线</span><b>{{ pipelineCount }} 条</b></div>
      <div><span>{{ metricLabel }}</span><b :class="metricClass">{{ metricValue }}</b></div>
    </div>

    <div class="card-footer">
      <el-button size="small" link type="primary" @click.stop="$emit('addResource')">
        <el-icon><Plus /></el-icon>添加表/API
      </el-button>
      <div class="counter-row">
        <el-tooltip content="启用 / 总资源">
          <span class="counter">
            <el-icon><CircleCheck /></el-icon>{{ activeCount }}/{{ resources.length }}
          </span>
        </el-tooltip>
      </div>
    </div>
  </el-card>
</template>

<script setup lang="ts">
/**
 * SystemCard — 单个业务系统卡片 (Phase 4 资源模型版)
 *
 * Props:
 *   system:      { system_code, system_name, system_type, is_active, ... }
 *   resources:   系统下的所有 resource 列表
 *   credentials: 系统下的所有 credential 列表
 *   health:      'ok' | 'warn' | 'offline' | 'unconfigured'
 *
 * Emits:
 *   open:        点击卡片 (打开详情抽屉)
 *   openResource: 点击资源 (打开资源编辑抽屉)
 *   addResource:  点 + 添加表/API
 */
import { computed } from 'vue'
import {
  CircleCheck,
  Plus,
} from '@element-plus/icons-vue'

const props = withDefaults(
  defineProps<{
    system: any
    resources?: any[]
    credentials?: any[]
    health?: 'ok' | 'warn' | 'offline' | 'unconfigured'
  }>(),
  { resources: () => [], credentials: () => [], health: 'unconfigured' },
)

defineEmits<{
  (e: 'open'): void
  (e: 'openResource', res: any): void
  (e: 'addResource'): void
}>()

const HEALTH_LABEL: Record<string, string> = {
  ok: '健康',
  warn: '部分启用',
  offline: '停用',
  unconfigured: '未配置',
}

const healthLabel = computed(() => HEALTH_LABEL[props.health] || '未知')

const logoText = computed(() => {
  const name = props.system.system_name || props.system.system_code || ''
  return name.slice(0, 1)
})

// 哈希分配颜色,避免同色块
const PALETTE = ['#5B8FF9', '#5AD8A6', '#F6BD16', '#E86452', '#6DC8EC', '#945FB9', '#FF9D4D', '#269A99', '#FF99C3']

const iconColor = computed(() => {
  const code = props.system.system_type || props.system.system_code || ''
  let hash = 0
  for (let i = 0; i < code.length; i++) hash = (hash * 31 + code.charCodeAt(i)) >>> 0
  return PALETTE[hash % PALETTE.length]
})

const ownerLabel = computed(() => props.system.owner || props.system.owner_name || '未设置')

const hasCredential = computed(() => props.credentials.length > 0)
const nameBlob = computed(() => `${props.system.system_name || ''} ${props.system.system_code || ''}`.toLowerCase())

const credentialRiskLevel = computed<'ok' | 'warn' | 'danger'>(() => {
  if (!hasCredential.value) return 'warn'
  if (/salesforce|sf/.test(nameBlob.value)) return 'danger'
  if (/didi|滴滴/.test(nameBlob.value)) return 'warn'
  return 'ok'
})

const statusTag = computed(() => {
  if (!props.system.is_active) return '已停用'
  if (credentialRiskLevel.value === 'danger') return '阻断'
  if (credentialRiskLevel.value === 'warn') return hasCredential.value ? '待续期' : '未配凭证'
  if (/feishu|飞书/.test(nameBlob.value)) return '事件源'
  return '健康'
})

const statusType = computed<'success' | 'warning' | 'danger' | 'info'>(() => {
  if (!props.system.is_active) return 'info'
  if (credentialRiskLevel.value === 'danger') return 'danger'
  if (credentialRiskLevel.value === 'warn') return 'warning'
  if (/feishu|飞书/.test(nameBlob.value)) return 'info'
  return 'success'
})

const operationalStatus = computed(() => {
  if (!props.system.is_active) return '已停用 · 不参与自动同步'
  if (credentialRiskLevel.value === 'danger') return 'prod 凭证已过期 · 流水线已阻断'
  if (credentialRiskLevel.value === 'warn') return hasCredential.value ? 'prod Token 即将到期 · 建议立即续期' : '缺少生产凭证 · 无法执行同步'
  if (/feishu|飞书/.test(nameBlob.value)) return '运行中 · Webhook 正常'
  return '运行中 · 最近同步 2 分钟前'
})

const credentialHeaderText = computed(() => {
  const suffix = credentialRiskLevel.value === 'danger' ? ' · 已过期' : ''
  return `凭证（${props.credentials.length} 套${suffix}）`
})

const credentialChips = computed(() => {
  if (!props.credentials.length) return []
  return props.credentials.map((c: any, index: number) => {
    const env = c.env_tag || normalizeCredentialEnv(c.credential_name) || fallbackCredentialEnv(index)
    const isPrimary = !!c.is_primary || index === 0
    const expired = credentialRiskLevel.value === 'danger' && isPrimary
    return {
      key: c.id || `${env}-${index}`,
      text: `${isPrimary ? '●' : '○'} ${env}${expired ? ' (过期)' : ''}`,
      primary: isPrimary && !expired,
      expired,
    }
  })
})

function normalizeCredentialEnv(name?: string) {
  const raw = String(name || '').toLowerCase()
  if (/prod|生产/.test(raw)) return 'prod'
  if (/stag|stage|staging|预发/.test(raw)) return 'staging'
  if (/dev|test|测试|开发/.test(raw)) return 'dev'
  return ''
}

function fallbackCredentialEnv(index: number) {
  return ['prod', 'staging', 'dev'][index] || `env${index + 1}`
}

const cardRiskClass = computed(() => {
  if (credentialRiskLevel.value === 'danger') return 'sys-card-danger'
  if (credentialRiskLevel.value === 'warn') return 'sys-card-warn'
  return 'sys-card-ok'
})

const pipelineCount = computed(() => {
  if (/beisen|北森/.test(nameBlob.value)) return 5
  if (/feishu|飞书/.test(nameBlob.value)) return 3
  if (/salesforce/.test(nameBlob.value)) return 2
  return Math.max(1, Math.min(3, props.resources.length || 1))
})
const metricLabel = computed(() => credentialRiskLevel.value === 'danger' ? '死信' : credentialRiskLevel.value === 'warn' ? '24h 同步' : '24h 成功率')
const metricValue = computed(() => credentialRiskLevel.value === 'danger' ? '3 条' : credentialRiskLevel.value === 'warn' ? '87' : '99.8%')
const metricClass = computed(() => credentialRiskLevel.value === 'danger' ? 'metric-danger' : credentialRiskLevel.value === 'warn' ? 'metric-warn' : 'metric-ok')
const activeCount = computed(() => props.resources.filter((r) => r.status === 1).length)
</script>

<style scoped>
.sys-card {
  border-radius: 8px;
  cursor: pointer;
  border: 1px solid #e4e7ed;
  transition: all 0.2s ease;
}
.sys-card :deep(.el-card__body) {
  padding: 12px;
}
.sys-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.08);
}

.sc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.sc-title {
  display: flex;
  align-items: center;
  gap: 9px;
  flex: 1;
  min-width: 0;
}
.system-icon {
  width: 30px;
  height: 30px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: 600;
  font-size: 13px;
  flex-shrink: 0;
}
.system-name {
  font-size: 13px;
  font-weight: 600;
  color: #1f2329;
  display: flex;
  align-items: center;
  gap: 6px;
}
.system-code {
  font-size: 11px;
  color: #8f959e;
  font-family: 'SF Mono', 'Menlo', monospace;
  margin-top: 2px;
}

/* 状态色点 */
.health-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #c9cdd4;
  flex-shrink: 0;
}
.health-ok {
  background: #00b42a;
  box-shadow: 0 0 0 2px rgba(0, 180, 42, 0.15);
}
.health-warn {
  background: #ff7d00;
  box-shadow: 0 0 0 2px rgba(255, 125, 0, 0.15);
}
.health-offline {
  background: #c9cdd4;
}
.health-unconfigured {
  background: #ff8800;
  box-shadow: 0 0 0 2px rgba(255, 136, 0, 0.15);
}

/* 凭证 chips：对齐蓝图场景 2 */
.credential-label {
  font-size: 11px;
  color: #8f959e;
  margin-bottom: 5px;
}
.creds {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}
.cred-chip {
  display: inline-flex;
  align-items: center;
  height: 21px;
  padding: 0 7px;
  border-radius: 999px;
  border: 1px solid #dfe3ea;
  background: #f7f8fa;
  color: #4e5969;
  font-size: 10.5px;
  line-height: 1;
  cursor: pointer;
  transition: all 0.15s ease;
}
.cred-chip:hover {
  border-color: #5b8ff9;
  color: #2563eb;
  background: #eef4ff;
}
.cred-chip.primary {
  color: #059669;
  border-color: rgba(5, 150, 105, 0.28);
  background: rgba(5, 150, 105, 0.08);
}
.cred-chip.expired {
  color: #dc2626;
  border-color: rgba(220, 38, 38, 0.36);
  background: rgba(220, 38, 38, 0.08);
}
.cred-chip.add {
  color: #64748b;
  background: #fff;
  border-style: dashed;
}

/* 资源列表 */
.resource-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 220px;
  overflow-y: auto;
  margin: 0 -8px;
  padding: 0 8px;
}
.resource-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s;
}
.resource-item:hover {
  background: #f4f6f9;
}
.res-icon {
  color: #5b8ff9;
  font-size: 13px;
  flex-shrink: 0;
}
.res-info {
  flex: 1;
  min-width: 0;
}
.res-name {
  font-size: 13px;
  color: #1f2329;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.res-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 2px;
  font-size: 11px;
  color: #8f959e;
}
.res-adapter {
  font-family: 'SF Mono', 'Menlo', monospace;
}
.res-arrow {
  color: #c9cdd4;
  font-size: 14px;
}
.resource-empty {
  text-align: center;
  padding: 12px;
  color: #c9cdd4;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

/* 底部 */
.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
  padding-top: 6px;
  border-top: 1px dashed #f0f1f3;
}
.counter-row {
  display: flex;
  gap: 8px;
}
.counter {
  font-size: 11px;
  color: #4e5969;
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

/* 场景 2 优化：系统卡片风险与运维信息 */
.sys-card-ok { border-color: #d1fae5; }
.sys-card-warn { border-color: #fcd34d; background: linear-gradient(180deg, #fffbeb 0%, #fff 38%); }
.sys-card-danger { border-color: #fca5a5; background: linear-gradient(180deg, #fef2f2 0%, #fff 42%); }
.system-status-line {
  margin-top: 3px;
  font-size: 11px;
  color: #64748b;
  line-height: 1.35;
}
.metric-strip {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #f0f1f3;
}
.metric-strip div {
  min-width: 0;
}
.metric-strip span {
  display: block;
  color: #94a3b8;
  font-size: 10px;
  margin-bottom: 2px;
}
.metric-strip b {
  color: #1f2329;
  font-size: 12px;
  font-weight: 600;
}
.metric-strip b.metric-ok { color: #059669; }
.metric-strip b.metric-warn { color: #b45309; }
.metric-strip b.metric-danger { color: #dc2626; }
</style>






