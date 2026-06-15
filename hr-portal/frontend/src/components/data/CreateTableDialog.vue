<script setup lang="ts">
import { reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import SmartCodeInput from '@/components/common/SmartCodeInput.vue'
import { adminTablesApi, type RegisteredTableOut } from '@/api/admin_tables'
import { pushTargetsApi, type PushTargetIn } from '@/api/push_targets'
import PushTargetDialog from '@/components/push/PushTargetDialog.vue'

const props = withDefaults(defineProps<{
  existingTableNames?: string[]
}>(), {
  existingTableNames: () => [],
})

const emit = defineEmits<{
  'done': [table: RegisteredTableOut]
}>()

const visible = ref(false)
const saving = ref(false)
const pushDialogRef = ref<InstanceType<typeof PushTargetDialog> | null>(null)

const DATASOURCE_TYPES = [
  { value: 'upload', label: '手动上传' },
  { value: 'beisen_report', label: '北森报表' },
  { value: 'beisen_api', label: '北森接口' },
  { value: 'http_generic', label: '通用 HTTP' },
]

const ICON_OPTIONS = [
  'Grid', 'List', 'Calendar', 'Money', 'Histogram',
  'OfficeBuilding', 'Collection', 'TrendCharts', 'DataLine', 'Document',
]

const form = reactive({
  table_name: '',
  table_label: '',
  description: '',
  is_period: false,
  period_col: 'month',
  period_source: 'field' as 'field' | 'inject',
  is_result_table: false,
  icon: 'Grid',
  display_order: 999,
  create_datasource: false,
  datasource_source_type: 'upload',
  create_push_target: false,
})

// 推送目标内嵌表单状态（与 PushTargetDialog 共享同一套字段结构）
const pushForm = reactive({
  name: '',
  push_type: 'external_db' as 'external_db' | 'http_push' | 'api_expose',
  schedule: '手动触发',
  period_ym: '',
  dialect: 'mysql',
  host: '', port: '3306', database: '', db_user: '', password: '', target_table: '',
  url: '', method: 'POST', bearer_token: '', batch_size: '500',
  access_token: '',
  field_mappings: [] as { source: string; target: string }[],
  is_active: true,
})

function open() {
  Object.assign(form, {
    table_name: '', table_label: '', description: '',
    is_period: false, period_col: 'month', period_source: 'field',
    is_result_table: false, icon: 'Grid', display_order: 999,
    create_datasource: false, datasource_source_type: 'upload',
    create_push_target: false,
  })
  Object.assign(pushForm, {
    name: '', push_type: 'external_db', schedule: '手动触发', period_ym: '',
    dialect: 'mysql', host: '', port: '3306', database: '', db_user: '', password: '', target_table: '',
    url: '', method: 'POST', bearer_token: '', batch_size: '500', access_token: '',
    field_mappings: [], is_active: true,
  })
  visible.value = true
}

function buildPushPayload(tableName: string): PushTargetIn {
  const base: PushTargetIn = {
    source_table: tableName,
    name: pushForm.name || `${form.table_label}推送`,
    push_type: pushForm.push_type,
    settings: { period_ym: pushForm.period_ym },
    secrets: {},
    field_mappings: pushForm.field_mappings.filter((m) => m.source && m.target),
    is_active: pushForm.is_active,
    schedule: pushForm.schedule,
  }
  if (pushForm.push_type === 'external_db') {
    base.settings = {
      ...base.settings,
      dialect: pushForm.dialect, host: pushForm.host, port: Number(pushForm.port),
      database: pushForm.database, user: pushForm.db_user, target_table: pushForm.target_table,
    }
    if (pushForm.password) base.secrets = { password: pushForm.password }
  } else if (pushForm.push_type === 'http_push') {
    base.settings = { ...base.settings, url: pushForm.url, method: pushForm.method, batch_size: Number(pushForm.batch_size) }
    if (pushForm.bearer_token) base.secrets = { bearer_token: pushForm.bearer_token }
  } else if (pushForm.push_type === 'api_expose') {
    if (pushForm.access_token) base.secrets = { access_token: pushForm.access_token }
  }
  return base
}

async function confirm() {
  if (!form.table_label.trim()) {
    ElMessage.warning('请填写中文名')
    return
  }
  if (!form.table_name.trim()) {
    ElMessage.warning('表名正在生成，请稍后再创建')
    return
  }
  saving.value = true
  try {
    const result = await adminTablesApi.create({
      table_name: form.table_name.trim(),
      table_label: form.table_label.trim(),
      description: form.description.trim() || null,
      is_period: form.is_period,
      period_col: form.period_col,
      period_source: form.period_source,
      is_result_table: form.is_result_table,
      icon: form.icon,
      display_order: form.display_order,
      create_datasource: form.create_datasource,
      datasource_source_type: form.datasource_source_type,
    })

    // 同时创建推送目标
    if (form.create_push_target && form.create_datasource) {
      try {
        await pushTargetsApi.create(buildPushPayload(result.table_name))
      } catch {
        ElMessage.warning('视图已创建，但推送目标创建失败，请到接口配置页补充配置')
      }
    }

    ElMessage.success(`视图「${result.table_label}」创建成功`)
    visible.value = false
    emit('done', result)
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '创建失败')
  } finally {
    saving.value = false
  }
}

defineExpose({ open })
</script>

<template>
  <el-dialog v-model="visible" title="新建视图" width="560px" :close-on-click-modal="false">
    <el-form :model="form" label-position="top">

      <div class="section-title">基本信息</div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px">
        <el-form-item label="中文名" required>
          <el-input v-model="form.table_label" placeholder="如 自定义数据表" />
        </el-form-item>
        <el-form-item label="表名（英文编码）" required>
          <SmartCodeInput
            v-model="form.table_name"
            :label="form.table_label"
            scope="table"
            context="数据视图表名"
            :existing-codes="props.existingTableNames"
            editable
          />
        </el-form-item>
      </div>
      <el-form-item label="描述">
        <el-input v-model="form.description" type="textarea" :rows="2" placeholder="可选" />
      </el-form-item>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px">
        <el-form-item label="图标">
          <el-select v-model="form.icon" style="width: 100%">
            <el-option v-for="ic in ICON_OPTIONS" :key="ic" :label="ic" :value="ic" />
          </el-select>
        </el-form-item>
        <el-form-item label="显示顺序">
          <el-input-number v-model="form.display_order" :min="1" :max="9999" style="width: 100%" />
        </el-form-item>
      </div>

      <div class="section-title">月度配置</div>
      <el-form-item label="是否月度表">
        <el-switch v-model="form.is_period" active-text="是（按月存储，历史月份保留）" inactive-text="否（全量替换）" />
      </el-form-item>
      <template v-if="form.is_period">
        <el-form-item label="期间字段编码">
          <el-input v-model="form.period_col" style="width: 160px" placeholder="month" />
          <span style="margin-left: 8px; font-size: 12px; color: var(--color-text-placeholder)">
            该列值为 YYYYMM 格式
          </span>
        </el-form-item>
        <el-form-item label="月份来源">
          <el-radio-group v-model="form.period_source">
            <el-radio value="field">
              接口自带
              <span style="font-size: 12px; color: var(--color-text-placeholder)">
                （数据里已有月份字段）
              </span>
            </el-radio>
            <el-radio value="inject">
              同步时自动注入
              <span style="font-size: 12px; color: var(--color-text-placeholder)">
                （接口无月份，按月份偏移写入）
              </span>
            </el-radio>
          </el-radio-group>
        </el-form-item>
      </template>

      <div class="section-title">扩展配置</div>
      <el-form-item label="可作为分摊结果表">
        <el-switch v-model="form.is_result_table" active-text="是（可在成本分摊方案中选为写入目标）" />
      </el-form-item>
      <el-form-item label="创建接口配置">
        <el-switch v-model="form.create_datasource" active-text="是（自动创建数据源接口配置）" />
      </el-form-item>
      <el-form-item v-if="form.create_datasource" label="接口类型">
        <el-select v-model="form.datasource_source_type" style="width: 240px">
          <el-option v-for="t in DATASOURCE_TYPES" :key="t.value" :label="t.label" :value="t.value" />
        </el-select>
      </el-form-item>
      <template v-if="form.create_datasource">
        <el-form-item label="同时创建推送目标">
          <el-switch v-model="form.create_push_target" active-text="是（配置对外推送）" />
        </el-form-item>
        <template v-if="form.create_push_target">
          <el-form-item label="推送方式" required>
            <el-select v-model="pushForm.push_type" style="width: 100%">
              <el-option value="external_db" label="写入外部数据库（MySQL/PostgreSQL）" />
              <el-option value="http_push" label="POST JSON 到接口" />
              <el-option value="api_expose" label="暴露只读 API（对方主动拉取）" />
              <el-option value="db_expose" label="暴露只读数据库账号（对方直连 PostgreSQL）" />
            </el-select>
          </el-form-item>
          <template v-if="pushForm.push_type === 'external_db'">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px">
              <el-form-item label="目标表名" required>
                <el-input v-model="pushForm.target_table" placeholder="如 beisen_salary_report" />
              </el-form-item>
              <el-form-item label="数据库类型">
                <el-select v-model="pushForm.dialect" style="width: 100%">
                  <el-option value="mysql" label="MySQL" />
                  <el-option value="postgresql" label="PostgreSQL" />
                </el-select>
              </el-form-item>
            </div>
            <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 12px">
              <el-form-item label="Host" required>
                <el-input v-model="pushForm.host" placeholder="192.168.1.100" />
              </el-form-item>
              <el-form-item label="Port">
                <el-input v-model="pushForm.port" placeholder="3306" />
              </el-form-item>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px">
              <el-form-item label="数据库名" required>
                <el-input v-model="pushForm.database" />
              </el-form-item>
              <el-form-item label="用户名" required>
                <el-input v-model="pushForm.db_user" />
              </el-form-item>
              <el-form-item label="密码">
                <el-input v-model="pushForm.password" type="password" show-password />
              </el-form-item>
            </div>
          </template>
          <template v-else-if="pushForm.push_type === 'http_push'">
            <el-form-item label="接口 URL" required>
              <el-input v-model="pushForm.url" placeholder="https://..." />
            </el-form-item>
            <el-form-item label="Bearer Token（可选）">
              <el-input v-model="pushForm.bearer_token" type="password" show-password />
            </el-form-item>
          </template>
          <template v-else-if="pushForm.push_type === 'api_expose'">
            <el-form-item label="Access Token">
              <el-input v-model="pushForm.access_token" type="password" show-password placeholder="设置一个随机字符串" />
            </el-form-item>
          </template>
          <template v-else-if="pushForm.push_type === 'api_expose'">
            <el-form-item label="Access Token">
              <el-input v-model="pushForm.access_token" type="password" show-password placeholder="设置一个随机字符串" />
            </el-form-item>
          </template>
          <template v-else-if="pushForm.push_type === 'db_expose'">
            <el-alert type="info" :closable="false" show-icon style="margin-top: 4px">
              保存后系统将自动在本地 PostgreSQL 创建只读账号，连接信息到接口配置页「推送接口」Tab 查看。
            </el-alert>
          </template>
          <div style="font-size: 12px; color: var(--color-text-placeholder); margin-top: 4px">
            字段映射可创建后在接口配置页的「推送接口」Tab 里补充配置。
          </div>
        </template>
      </template>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="confirm">确认创建</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
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
</style>
