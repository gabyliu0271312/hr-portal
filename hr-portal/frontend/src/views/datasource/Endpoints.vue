<script setup lang="ts">
import { computed, reactive, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Refresh, CopyDocument } from '@element-plus/icons-vue'
import PermissionButton from '@/components/PermissionButton.vue'
import PushTargetList from '@/components/push/PushTargetList.vue'
import {
  SOURCE_TYPES,
  SCHEDULE_OPTIONS,
  findSourceType,
  initFormForType,
} from '@/config/dataSources'
import { datasourcesApi, type DataSourceListItem } from '@/api/datasources'
import { adminTablesApi } from '@/api/admin_tables'

const router = useRouter()

const list = ref<DataSourceListItem[]>([])
const loading = ref(false)

// 月度自动偏移（inject）表集合：period_source==='inject' 的表显示「月份设置」
const injectTables = ref<Set<string>>(new Set())
async function loadInjectTables() {
  try {
    const tables = await adminTablesApi.list()
    injectTables.value = new Set(
      tables.filter((t) => t.period_source === 'inject').map((t) => t.table_name)
    )
  } catch {
    injectTables.value = new Set()
  }
}

async function load() {
  loading.value = true
  try {
    list.value = await datasourcesApi.list()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '加载失败')
  } finally {
    loading.value = false
  }
}

function statusType(s: string) {
  if (s === 'success') return 'success'
  if (s === 'failed') return 'danger'
  return 'info'
}
function statusLabel(s: string) {
  if (s === 'success') return '成功'
  if (s === 'failed') return '失败'
  return '未拉取'
}

function sourceTypeLabel(code: string): string {
  return findSourceType(code)?.label ?? code
}

// ===== 配置抽屉 =====
const drawerOpen = ref(false)
const activeTab = ref('pull')
const editing = ref<DataSourceListItem | null>(null)
const form = reactive<{
  source_type: string
  schedule: string
  is_active: boolean
  config: Record<string, string>  // 明文字段值（含 secrets 输入）
}>({
  source_type: 'beisen_report',
  schedule: '每日 06:00',
  is_active: true,
  config: {},
})
const saving = ref(false)
const testing = ref(false)
const testResult = ref<{ ok: boolean; message: string } | null>(null)

const currentType = computed(() => findSourceType(form.source_type))

// ===== 月度表「月份设置」：period_source==='inject' 的表均支持月度自动偏移 =====
const isPeriodTable = computed(
  () => !!editing.value && injectTables.value.has(editing.value.table_name)
)
const monthOffset = computed<number>({
  get: () => parseInt(form.config['MONTH_OFFSET'] ?? '0', 10) || 0,
  set: (v) => {
    form.config['MONTH_OFFSET'] = String(v ?? 0)
  },
})
const monthPreview = computed(() => {
  const d = new Date()
  const idx = d.getFullYear() * 12 + d.getMonth() + monthOffset.value
  const y = Math.floor(idx / 12)
  const m = (idx % 12) + 1
  return `${y}${String(m).padStart(2, '0')}`
})

// 哪些字段是 secrets（与后端 SECRET_KEYS 保持一致）
const SECRET_KEY_SET = new Set([
  'BEISEN_APP_KEY',
  'BEISEN_APP_SECRET',
  'BEISEN_API_APP_KEY',
  'BEISEN_API_APP_SECRET',
  'HTTP_CREDENTIAL',
  'WEBHOOK_TOKEN',
  'DB_PASSWORD',
])

function onTypeChange(newType: string) {
  const old = { ...form.config }
  const t = findSourceType(newType)
  if (!t) return
  const fresh = initFormForType(newType)
  for (const k of Object.keys(fresh)) {
    if (old[k] !== undefined && old[k] !== '') {
      fresh[k] = old[k]
    }
  }
  form.config = fresh
  form.schedule = t.defaultSchedule ?? form.schedule
  testResult.value = null
}

function openEdit(row: DataSourceListItem) {
  editing.value = row
  // settings 直接展开；secrets 用占位符（不显示原值，由 has_secret 标记是否已配）
  const merged: Record<string, string> = { ...initFormForType(row.source_type) }
  // 把 settings 中的非敏感字段灌进表单
  for (const [k, v] of Object.entries(row.settings || {})) {
    merged[k] = String(v ?? '')
  }
  // 敏感字段：留空，提示 placeholder 说明"已保存"
  // 月度表：默认月份偏移 0（当前月）
  if (injectTables.value.has(row.table_name) && !merged['MONTH_OFFSET']) {
    merged['MONTH_OFFSET'] = '0'
  }
  Object.assign(form, {
    source_type: row.source_type,
    schedule: row.schedule,
    is_active: row.is_active,
    config: merged,
  })
  testResult.value = null
  drawerOpen.value = true
}

function hasSecret(key: string): boolean {
  return !!editing.value?.has_secret?.[key]
}

function fieldPlaceholder(key: string, original?: string): string {
  if (SECRET_KEY_SET.has(key) && hasSecret(key)) {
    return '••• 已保存（留空不变；填新值则覆盖）'
  }
  return original ?? ''
}

const copyDialogOpen = ref(false)
const copySource = ref<number | null>(null)
const copyableEndpoints = computed(() =>
  list.value.filter(
    (e) => e.source_type === form.source_type && e.id !== editing.value?.id
  )
)
function openCopyDialog() {
  if (!copyableEndpoints.value.length) {
    ElMessage.info('当前没有同类型的其他接入可供复制凭证')
    return
  }
  copySource.value = null
  copyDialogOpen.value = true
}
function applyCopy() {
  if (copySource.value === null) {
    ElMessage.warning('请选择来源')
    return
  }
  const src = list.value.find((e) => e.id === copySource.value)
  if (!src) return
  // 把源的非敏感 settings 复制过来（敏感字段无法跨表自动复制，因为后端不返回明文）
  for (const [k, v] of Object.entries(src.settings || {})) {
    form.config[k] = String(v ?? '')
  }
  copyDialogOpen.value = false
  ElMessage.success(`已从「${src.table_label}」复制非敏感配置；敏感字段需重新输入`)
}

/** 拆分 form.config 为 settings（明文）+ secrets（明文，后端会加密）*/
function splitPayload(): { settings: Record<string, any>; secrets: Record<string, string> } {
  const settings: Record<string, any> = {}
  const secrets: Record<string, string> = {}
  for (const [k, v] of Object.entries(form.config)) {
    if (SECRET_KEY_SET.has(k)) {
      if (v) secrets[k] = v
    } else {
      settings[k] = v
    }
  }
  return { settings, secrets }
}

async function onSave() {
  // 必填校验
  const t = currentType.value
  if (t) {
    for (const g of t.groups) {
      for (const f of g.fields) {
        if (!f.required) continue
        const val = form.config[f.key]
        if (SECRET_KEY_SET.has(f.key)) {
          // 敏感字段：本次没填但后端已保存过 → 视为通过
          if (!val && !hasSecret(f.key)) {
            ElMessage.warning(`「${f.label}」为必填`)
            return
          }
        } else if (!val?.trim()) {
          ElMessage.warning(`「${f.label}」为必填`)
          return
        }
      }
    }
  }
  if (!editing.value) return
  saving.value = true
  try {
    const { settings, secrets } = splitPayload()
    const updated = await datasourcesApi.update(editing.value.id, {
      source_type: form.source_type,
      schedule: form.schedule,
      settings,
      secrets,
      is_active: form.is_active,
    })
    // 更新列表里的这一行
    const idx = list.value.findIndex((e) => e.id === updated.id)
    if (idx >= 0) list.value[idx] = updated
    ElMessage.success('配置已保存')
    drawerOpen.value = false
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '保存失败')
  } finally {
    saving.value = false
  }
}

async function handleTest() {
  if (!editing.value) return
  testing.value = true
  testResult.value = null
  try {
    const { settings, secrets } = splitPayload()
    const res = await datasourcesApi.test(editing.value.id, {
      source_type: form.source_type,
      schedule: form.schedule,
      settings,
      secrets,
      is_active: form.is_active,
    })
    testResult.value = {
      ok: res.ok,
      message: res.ok
        ? `连接成功${res.token_preview ? ` · token: ${res.token_preview}` : ''}`
        : res.message,
    }
  } catch (e: any) {
    testResult.value = { ok: false, message: e?.response?.data?.detail || '测试失败' }
  } finally {
    testing.value = false
  }
}

async function triggerSync(row: DataSourceListItem) {
  try {
    ElMessage.info(`正在拉取「${row.table_label}」...`)
    const res = await datasourcesApi.sync(row.id)
    if (res.ok) {
      ElMessage.success(`同步成功：${res.message}`)
    } else {
      ElMessage.error(`同步失败：${res.message}`)
    }
    // 刷新该行
    await load()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '触发失败')
  }
}

onMounted(() => {
  load()
  loadInjectTables()
})
</script>

<template>
  <div style="padding: 24px">
    <el-card>
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center">
          <span style="font-size: 16px; font-weight: 600">接口配置（共 {{ list.length }} 个）</span>
        </div>
      </template>

      <el-alert
        title="数据接入说明"
        type="info"
        :closable="false"
        show-icon
        style="margin-bottom: 16px"
      >
        <p style="margin: 0; line-height: 1.6">
          每张数据表对应一行配置。支持的接入类型：北森报表 API / 北森接口 API / 内部上传 / 通用 HTTP API / 数据库直连。
          点「配置」编辑凭证与调度；点「立即拉取」触发同步并落库。同类型可一键复制非敏感配置。
        </p>
      </el-alert>

      <div style="overflow-x: auto">
        <el-table v-loading="loading" :data="list" stripe style="width: 100%" max-height="600">
          <el-table-column label="数据表" min-width="200">
            <template #default="{ row }">
              <strong>{{ row.table_label }}</strong>
              <div style="font-family: monospace; font-size: 11px; color: var(--color-text-secondary); margin-top: 2px">
                {{ row.table_name }}
              </div>
            </template>
          </el-table-column>
          <el-table-column label="接入类型" width="160">
            <template #default="{ row }">
              <el-tag size="small" effect="plain">{{ sourceTypeLabel(row.source_type) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="schedule" label="调度计划" min-width="180" />
          <el-table-column label="上次拉取" min-width="180">
            <template #default="{ row }">
              <span v-if="row.last_sync_at">
                {{ new Date(row.last_sync_at).toLocaleString('zh-CN') }}
              </span>
              <span v-else style="color: var(--color-text-placeholder)">—</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="statusType(row.last_status)" size="small">
                {{ statusLabel(row.last_status) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="行数" width="80">
            <template #default="{ row }">
              <span v-if="row.last_rows !== null">{{ row.last_rows }}</span>
              <span v-else style="color: var(--color-text-placeholder)">—</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="300" fixed="right">
            <template #default="{ row }">
              <PermissionButton menu="datasource.endpoints" op="U" size="small" @click="openEdit(row)">
                配置
              </PermissionButton>
              <PermissionButton menu="datasource.endpoints" op="U" size="small" type="primary" @click="triggerSync(row)">
                <el-icon style="margin-right: 4px"><Refresh /></el-icon>立即拉取
              </PermissionButton>
              <el-button size="small" link @click="router.push(`/datasource/sync-runs?ds=${row.id}`)">历史</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </el-card>

    <!-- ========= 配置抽屉（拉取 + 推送 两个 Tab）========= -->
    <el-drawer
      v-model="drawerOpen"
      :title="editing ? `配置接口 · ${editing.table_label}` : '新建接口'"
      direction="rtl"
      size="600px"
    >
      <el-tabs v-model="activeTab">
        <!-- Tab 1：拉取接口 -->
        <el-tab-pane label="拉取接口" name="pull">
          <el-form label-position="top">
            <el-form-item label="接入类型">
              <el-select v-model="form.source_type" style="width: 100%" @change="onTypeChange">
                <el-option
                  v-for="t in SOURCE_TYPES"
                  :key="t.code"
                  :label="t.label"
                  :value="t.code"
                />
              </el-select>
              <div v-if="currentType" style="margin-top: 6px; font-size: 12px; color: var(--color-text-secondary); line-height: 1.5">
                {{ currentType.description }}
              </div>
            </el-form-item>

            <template v-if="currentType">
              <div v-for="grp in currentType.groups" :key="grp.title" class="field-group">
                <div class="section-title">{{ grp.title }}</div>
                <el-form-item
                  v-for="f in grp.fields"
                  :key="f.key"
                  :label="f.label"
                  :required="f.required"
                >
                  <el-input
                    v-if="f.type === 'text' || f.type === 'url'"
                    v-model="form.config[f.key]"
                    :placeholder="fieldPlaceholder(f.key, f.placeholder)"
                  />
                  <el-input
                    v-else-if="f.type === 'password'"
                    v-model="form.config[f.key]"
                    type="password"
                    show-password
                    :placeholder="fieldPlaceholder(f.key, f.placeholder)"
                  />
                  <el-input
                    v-else-if="f.type === 'textarea'"
                    v-model="form.config[f.key]"
                    type="textarea"
                    :rows="4"
                    :placeholder="f.placeholder"
                  />
                  <el-select
                    v-else-if="f.type === 'select'"
                    v-model="form.config[f.key]"
                    style="width: 100%"
                  >
                    <el-option
                      v-for="opt in f.options"
                      :key="opt.value"
                      :label="opt.label"
                      :value="opt.value"
                    />
                  </el-select>
                  <div v-if="f.hint" class="field-hint">{{ f.hint }}</div>
                </el-form-item>
              </div>
            </template>

            <div v-if="isPeriodTable" class="field-group">
              <div class="section-title">月份设置</div>
              <el-form-item label="月份偏移">
                <el-input-number v-model="monthOffset" :step="1" controls-position="right" style="width: 160px" />
                <div class="field-hint">
                  拉取时自动在最前加一列「月份」，取值 = 当前月 + 偏移。0=当前月，-1=上月，1=下月。
                  当前将生成：<strong>{{ monthPreview }}</strong>
                </div>
              </el-form-item>
            </div>

            <div class="field-group">
              <div class="section-title">调度与状态</div>
              <el-form-item label="调度计划">
                <el-select v-model="form.schedule" style="width: 100%">
                  <el-option
                    v-for="opt in SCHEDULE_OPTIONS"
                    :key="opt.value"
                    :label="opt.label"
                    :value="opt.value"
                  />
                </el-select>
              </el-form-item>
              <el-form-item label="启用">
                <el-switch v-model="form.is_active" active-text="启用" inactive-text="停用" />
              </el-form-item>
            </div>

            <div
              v-if="testResult"
              :class="['test-result', testResult.ok ? 'test-result--ok' : 'test-result--fail']"
            >
              {{ testResult.ok ? '✓' : '✕' }} {{ testResult.message }}
            </div>
          </el-form>
        </el-tab-pane>

        <!-- Tab 2：推送接口 -->
        <el-tab-pane label="推送接口" name="push">
          <PushTargetList v-if="editing" :key="editing.id" :source-table="editing.table_name" />
          <el-empty v-else description="请先选择一条接口配置" />
        </el-tab-pane>
      </el-tabs>

      <template #footer>
        <div v-if="activeTab === 'pull'" style="display: flex; justify-content: space-between; align-items: center">
          <el-button link @click="openCopyDialog">
            <el-icon style="margin-right: 4px"><CopyDocument /></el-icon>从其他表复制凭证
          </el-button>
          <div>
            <el-button @click="drawerOpen = false">取消</el-button>
            <el-button v-if="currentType?.testable" :loading="testing" @click="handleTest">
              测试连接
            </el-button>
            <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
          </div>
        </div>
      </template>
    </el-drawer>

    <!-- ========= 复制凭证对话框 ========= -->
    <el-dialog v-model="copyDialogOpen" title="从其他表复制配置" width="420px">
      <p style="color: var(--color-text-secondary); font-size: 13px; margin: 0 0 16px">
        选择一个同类型（{{ currentType?.label }}）的接入，复制其非敏感配置到当前。
        <strong>敏感字段（AppSecret 等）出于安全考虑不会跨表复制</strong>，需重新输入。
      </p>
      <el-radio-group v-model="copySource" style="display: flex; flex-direction: column; gap: 8px">
        <el-radio v-for="e in copyableEndpoints" :key="e.id" :value="e.id">
          {{ e.table_label }}
          <span style="margin-left: 8px; font-family: monospace; font-size: 12px; color: var(--color-text-placeholder)">
            {{ e.table_name }}
          </span>
        </el-radio>
      </el-radio-group>
      <template #footer>
        <el-button @click="copyDialogOpen = false">取消</el-button>
        <el-button type="primary" @click="applyCopy">复制</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.field-group {
  margin-bottom: 8px;
}
.section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 16px 0 12px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--color-border-light);
}
.field-hint {
  font-size: 12px;
  color: var(--color-text-placeholder);
  margin-top: 4px;
  line-height: 1.5;
}
.test-result {
  margin-top: 16px;
  padding: 10px 14px;
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.5;
}
.test-result--ok {
  background: var(--color-success-light);
  color: var(--color-success);
  border: 1px solid var(--color-success-border);
}
.test-result--fail {
  background: var(--color-danger-light);
  color: var(--color-danger);
  border: 1px solid var(--color-danger-border);
}
</style>
