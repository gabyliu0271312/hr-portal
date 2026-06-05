<script setup lang="ts">
import { reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { PushTargetIn, PushTargetOut } from '@/api/push_targets'
import { pushTargetsApi } from '@/api/push_targets'
import { dataApi, type ColumnInfo } from '@/api/data'
import { SCHEDULE_OPTIONS } from '@/config/dataSources'
import PushFieldMapper from './PushFieldMapper.vue'

const props = defineProps<{ sourceTable: string }>()
const emit = defineEmits<{ 'done': [target: PushTargetOut] }>()

const visible = ref(false)
const saving = ref(false)
const currentTarget = ref<PushTargetOut | null>(null)
const sourceColumns = ref<ColumnInfo[]>([])
const revealedSecrets = ref<Record<string, string>>({})
const revealing = ref(false)

async function revealSecret(key: string) {
  if (!currentTarget.value) return
  if (revealedSecrets.value[key] !== undefined) {
    // 再次点击隐藏
    delete revealedSecrets.value[key]
    return
  }
  revealing.value = true
  try {
    const secrets = await pushTargetsApi.reveal(currentTarget.value.id)
    revealedSecrets.value[key] = secrets[key] ?? '（未设置）'
  } catch {
    ElMessage.error('获取失败')
  } finally {
    revealing.value = false
  }
}

const PUSH_TYPES = [
  { value: 'external_db', label: '写入外部数据库（MySQL/PostgreSQL）' },
  { value: 'http_push', label: 'POST JSON 到接口' },
  { value: 'api_expose', label: '暴露只读 API（对方主动拉取）' },
  { value: 'db_expose', label: '暴露只读数据库账号（对方直连 PostgreSQL）' },
]

const DIALECTS = [
  { value: 'mysql', label: 'MySQL' },
  { value: 'postgresql', label: 'PostgreSQL' },
]

const isExposeType = (t: string) => t === 'api_expose' || t === 'db_expose'

const form = reactive<{
  name: string
  description: string
  push_type: string
  is_active: boolean
  schedule: string
  field_mappings: { source: string; target: string }[]
  period_ym: string
  dialect: string
  host: string
  port: string
  database: string
  db_user: string
  password: string
  target_table: string
  url: string
  method: string
  bearer_token: string
  batch_size: string
  app_id: string
  app_secret: string
  ip_whitelist: string
}>({
  name: '', description: '', push_type: 'external_db',
  is_active: true, schedule: '手动触发', field_mappings: [], period_ym: '',
  dialect: 'mysql', host: '', port: '3306', database: '', db_user: '', password: '', target_table: '',
  url: '', method: 'POST', bearer_token: '', batch_size: '500',
  app_id: '', app_secret: '', ip_whitelist: '',
})

async function open(target?: PushTargetOut | null) {
  currentTarget.value = target ?? null
  revealedSecrets.value = {}
  sourceColumns.value = await dataApi.columns(props.sourceTable).catch(() => [])

  if (target) {
    const s = target.settings || {}
    form.name = target.name
    form.description = target.description ?? ''
    form.push_type = target.push_type
    form.is_active = target.is_active
    form.field_mappings = (target.field_mappings || []).map((m: any) => ({ ...m }))
    form.schedule = s.schedule ?? '手动触发'
    form.period_ym = s.period_ym ?? ''
    form.ip_whitelist = (s.ip_whitelist || []).join(', ')
    if (target.push_type === 'external_db') {
      form.dialect = s.dialect ?? 'mysql'
      form.host = s.host ?? ''
      form.port = String(s.port ?? 3306)
      form.database = s.database ?? ''
      form.db_user = s.user ?? ''
      form.target_table = s.target_table ?? ''
    } else if (target.push_type === 'http_push') {
      form.url = s.url ?? ''
      form.method = s.method ?? 'POST'
      form.batch_size = String(s.batch_size ?? 500)
    } else if (target.push_type === 'api_expose') {
      form.app_id = s.app_id ?? ''
    }
  } else {
    Object.assign(form, {
      name: '', description: '', push_type: 'external_db', is_active: true,
      schedule: '手动触发', field_mappings: [], period_ym: '', ip_whitelist: '',
      dialect: 'mysql', host: '', port: '3306', database: '', db_user: '', password: '', target_table: '',
      url: '', method: 'POST', bearer_token: '', batch_size: '500',
      app_id: '', app_secret: '',
    })
  }
  visible.value = true
}

function parseIpWhitelist(): string[] {
  return form.ip_whitelist.split(/[,\n]/).map((s) => s.trim()).filter(Boolean)
}

function buildPayload(): PushTargetIn {
  const base: PushTargetIn = {
    source_table: props.sourceTable,
    name: form.name.trim(),
    description: form.description.trim() || null,
    push_type: form.push_type as any,
    settings: {},
    secrets: {},
    field_mappings: isExposeType(form.push_type)
      ? []
      : form.field_mappings.filter((m) => m.source && m.target),
    is_active: form.is_active,
    schedule: isExposeType(form.push_type) ? '手动触发' : form.schedule,
  }
  if (form.push_type === 'external_db') {
    base.settings = {
      period_ym: form.period_ym,
      dialect: form.dialect, host: form.host, port: Number(form.port),
      database: form.database, user: form.db_user, target_table: form.target_table,
    }
    if (form.password) base.secrets = { password: form.password }
  } else if (form.push_type === 'http_push') {
    base.settings = { period_ym: form.period_ym, url: form.url, method: form.method, batch_size: Number(form.batch_size) }
    if (form.bearer_token) base.secrets = { bearer_token: form.bearer_token }
  } else if (form.push_type === 'api_expose') {
    base.settings = { app_id: form.app_id, ip_whitelist: parseIpWhitelist() }
    if (form.app_secret) base.secrets = { app_secret: form.app_secret }
  } else if (form.push_type === 'db_expose') {
    base.settings = { ip_whitelist: parseIpWhitelist() }
  }
  return base
}

async function confirm() {
  if (!form.name.trim()) { ElMessage.warning('请填写推送目标名称'); return }
  saving.value = true
  try {
    const payload = buildPayload()
    const result = currentTarget.value
      ? await pushTargetsApi.update(currentTarget.value.id, payload)
      : await pushTargetsApi.create(payload)
    ElMessage.success(currentTarget.value ? '已更新' : '已创建')
    visible.value = false
    emit('done', result)
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '保存失败')
  } finally {
    saving.value = false
  }
}

function copyUrl(id: number) {
  const url = `${window.location.origin}/api/v1/push-targets/${id}/data`
  navigator.clipboard.writeText(url).then(() => ElMessage.success('已复制')).catch(() => ElMessage.error('复制失败'))
}

const apiBaseUrl = window.location.origin

defineExpose({ open })
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="currentTarget ? '编辑推送目标' : '新建推送目标'"
    width="680px"
    :close-on-click-modal="false"
  >
    <el-form :model="form" label-position="top">
      <div class="section-title">基本信息</div>
      <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 16px">
        <el-form-item label="名称" required>
          <el-input v-model="form.name" placeholder="如 推送到IT系统" />
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="form.is_active" active-text="启用" />
        </el-form-item>
      </div>
      <el-form-item label="推送方式" required>
        <el-select v-model="form.push_type" style="width: 100%">
          <el-option v-for="t in PUSH_TYPES" :key="t.value" :label="t.label" :value="t.value" />
        </el-select>
      </el-form-item>

      <!-- 调度 + 月份：仅主动推送类型显示 -->
      <template v-if="!isExposeType(form.push_type)">
        <el-form-item label="调度计划">
          <el-select v-model="form.schedule" style="width: 240px">
            <el-option v-for="s in SCHEDULE_OPTIONS" :key="s.value" :label="s.label" :value="s.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="月份（月度表专用，YYYYMM，空则推全量）">
          <el-input v-model="form.period_ym" placeholder="如 202504" style="width: 160px" />
        </el-form-item>
      </template>

      <!-- external_db -->
      <template v-if="form.push_type === 'external_db'">
        <div class="section-title">数据库连接</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px">
          <el-form-item label="数据库类型">
            <el-select v-model="form.dialect" style="width: 100%">
              <el-option v-for="d in DIALECTS" :key="d.value" :label="d.label" :value="d.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="目标表名" required>
            <el-input v-model="form.target_table" placeholder="如 beisen_salary_report" />
          </el-form-item>
        </div>
        <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 16px">
          <el-form-item label="Host" required>
            <el-input v-model="form.host" placeholder="192.168.1.100" />
          </el-form-item>
          <el-form-item label="Port">
            <el-input v-model="form.port" placeholder="3306" />
          </el-form-item>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px">
          <el-form-item label="数据库名" required>
            <el-input v-model="form.database" />
          </el-form-item>
          <el-form-item label="用户名" required>
            <el-input v-model="form.db_user" />
          </el-form-item>
          <el-form-item label="密码">
            <el-input v-model="form.password" type="password" placeholder="不修改留空" show-password />
          </el-form-item>
        </div>
      </template>

      <!-- http_push -->
      <template v-else-if="form.push_type === 'http_push'">
        <div class="section-title">接口配置</div>
        <div style="display: grid; grid-template-columns: 3fr 1fr; gap: 16px">
          <el-form-item label="接口 URL" required>
            <el-input v-model="form.url" placeholder="https://..." />
          </el-form-item>
          <el-form-item label="方法">
            <el-select v-model="form.method" style="width: 100%">
              <el-option value="POST" label="POST" />
              <el-option value="PUT" label="PUT" />
            </el-select>
          </el-form-item>
        </div>
        <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 16px">
          <el-form-item label="Bearer Token（可选）">
            <el-input v-model="form.bearer_token" type="password" show-password />
          </el-form-item>
          <el-form-item label="批次大小">
            <el-input v-model="form.batch_size" placeholder="500" />
          </el-form-item>
        </div>
      </template>

      <!-- api_expose -->
      <template v-else-if="form.push_type === 'api_expose'">
        <div class="section-title">鉴权配置</div>
        <template v-if="currentTarget">
          <!-- 编辑已有记录：显示已保存值 + 眼睛 -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px">
            <el-form-item label="AppID">
              <div style="display: flex; align-items: center; gap: 8px; width: 100%">
                <el-input
                  :model-value="revealedSecrets['app_id'] !== undefined ? revealedSecrets['app_id'] : '******'"
                  readonly style="flex: 1"
                />
                <el-button link :loading="revealing" @click="revealSecret('app_id')">
                  <el-icon>{{ revealedSecrets['app_id'] !== undefined ? '🙈' : '👁' }}</el-icon>
                </el-button>
              </div>
            </el-form-item>
            <el-form-item label="AppSecret">
              <div style="display: flex; align-items: center; gap: 8px; width: 100%">
                <el-input
                  :model-value="revealedSecrets['app_secret'] !== undefined ? revealedSecrets['app_secret'] : '******'"
                  readonly style="flex: 1"
                />
                <el-button link :loading="revealing" @click="revealSecret('app_secret')">
                  <el-icon>{{ revealedSecrets['app_secret'] !== undefined ? '🙈' : '👁' }}</el-icon>
                </el-button>
              </div>
            </el-form-item>
          </div>
          <div style="font-size: 12px; color: var(--color-text-placeholder); margin-bottom: 8px">
            AppID 和 AppSecret 由系统自动生成，点击眼睛图标查看。
          </div>
        </template>
        <template v-else>
          <!-- 新建：提示将自动生成 -->
          <el-alert type="info" :closable="false" show-icon style="margin-bottom: 12px">
            保存后系统将自动生成 AppID 和 AppSecret，在编辑页查看。
          </el-alert>
        </template>
        <el-form-item label="IP 白名单（逗号或换行分隔，空则不限制）">
          <el-input v-model="form.ip_whitelist" type="textarea" :rows="3" placeholder="192.168.1.100, 10.0.0.1" />
        </el-form-item>
        <div style="font-size: 12px; color: var(--color-text-placeholder); line-height: 1.6; margin-bottom: 8px">
          对方拉取时需在请求头携带：<code>X-App-Id: {AppID}</code>
          <code style="margin-left: 8px">X-App-Secret: {AppSecret}</code>
        </div>
        <el-form-item v-if="currentTarget" label="拉取 URL">
          <el-input
            :model-value="`${apiBaseUrl}/api/v1/push-targets/${currentTarget.id}/data`"
            readonly
          >
            <template #append>
              <el-button @click="copyUrl(currentTarget.id)">复制</el-button>
            </template>
          </el-input>
        </el-form-item>
      </template>

      <!-- db_expose -->
      <template v-else-if="form.push_type === 'db_expose'">
        <div class="section-title">访问控制</div>
        <el-form-item label="IP 白名单（逗号或换行分隔，空则不限制）">
          <el-input v-model="form.ip_whitelist" type="textarea" :rows="3" placeholder="192.168.1.100, 10.0.0.1" />
        </el-form-item>
        <div class="section-title">连接信息（保存后自动生成）</div>
        <template v-if="currentTarget?.settings?.conn_url">
          <el-descriptions :column="1" size="small" border>
            <el-descriptions-item label="数据库名">{{ currentTarget.settings.database }}</el-descriptions-item>
            <el-descriptions-item label="主机">{{ currentTarget.settings.host }}</el-descriptions-item>
            <el-descriptions-item label="端口">{{ currentTarget.settings.port }}</el-descriptions-item>
            <el-descriptions-item label="用户名">{{ currentTarget.settings.readonly_user }}</el-descriptions-item>
            <el-descriptions-item label="密码">
              <div style="display: flex; align-items: center; gap: 8px">
                <span>{{ revealedSecrets['readonly_password'] !== undefined ? revealedSecrets['readonly_password'] : '••••••••••••' }}</span>
                <el-button link size="small" :loading="revealing" @click="revealSecret('readonly_password')">
                  {{ revealedSecrets['readonly_password'] !== undefined ? '隐藏' : '显示' }}
                </el-button>
              </div>
            </el-descriptions-item>
            <el-descriptions-item label="连接 URL">
              <el-text copyable>{{ currentTarget.settings.conn_url }}</el-text>
            </el-descriptions-item>
          </el-descriptions>
        </template>
        <el-alert v-else type="info" :closable="false" show-icon>
          保存后系统将自动创建只读账号，连接信息将在此处显示。
        </el-alert>
      </template>

      <!-- 字段映射：仅主动推送类型显示 -->
      <template v-if="!isExposeType(form.push_type)">
        <div class="section-title">字段映射（源字段 → 目标字段）</div>
        <PushFieldMapper
          :mappings="form.field_mappings"
          :source-columns="sourceColumns"
          @update:mappings="form.field_mappings = $event"
        />
      </template>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="confirm">保存</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.section-title {
  font-size: 12px; font-weight: 600; color: var(--color-text-secondary);
  text-transform: uppercase; letter-spacing: 0.5px;
  margin: 16px 0 12px; padding-bottom: 6px;
  border-bottom: 1px solid var(--color-border-light);
}
</style>
