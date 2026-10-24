<script setup lang="ts">
import { reactive, ref, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import SmartCodeInput from '@/components/common/SmartCodeInput.vue'
import { adminTablesApi, type RegisteredTableOut } from '@/api/admin_tables'
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
const createdTableName = ref('')

const DATASOURCE_TYPES = [
  { value: 'upload', label: '手动上传' },
  { value: 'beisen_report', label: '北森报表' },
  { value: 'beisen_api', label: '北森接口' },
  { value: 'feishu_sheet', label: '飞书在线表格' },
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

function open() {
  Object.assign(form, {
    table_name: '', table_label: '', description: '',
    is_period: false, period_col: 'month', period_source: 'field',
    is_result_table: false, icon: 'Grid', display_order: 999,
    create_datasource: false, datasource_source_type: 'upload',
    create_push_target: false,
  })
  createdTableName.value = ''
  visible.value = true
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

    ElMessage.success(`视图「${result.table_label}」创建成功`)
    visible.value = false
    emit('done', result)
    if (form.create_push_target && form.create_datasource) {
      createdTableName.value = `dwd_${result.table_name.slice(4)}`
      await nextTick()
      pushDialogRef.value?.open()
    }
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
            prefix="ods_"
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
        <el-form-item v-if="form.period_source === 'field'" label="期间字段">
          <span style="font-size: 13px; color: var(--color-text-secondary)">请先保存来源配置并发现字段，再选择飞书中的实际年月字段。</span>
        </el-form-item>
        <el-form-item v-else label="期间字段编码">
          <span style="font-size: 13px; color: var(--color-text-secondary)">系统将在同步时自动写入 <b>month</b>。</span>
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
          <el-alert
            type="info"
            :closable="false"
            show-icon
            style="margin-top: 8px"
          >
            创建成功后将以对应的 DWD 消费表打开统一推送配置，可配置推送方式、IP 白名单、字段映射和调度计划。
          </el-alert>
        </template>
      </template>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="confirm">确认创建</el-button>
    </template>
  </el-dialog>

  <PushTargetDialog
    ref="pushDialogRef"
    :source-table="createdTableName"
  />
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
