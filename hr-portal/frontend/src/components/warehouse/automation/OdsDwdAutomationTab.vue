<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Setting, Refresh, CircleCheck, CircleClose, Clock } from '@element-plus/icons-vue'
import { listOdsDwdAutomationConfigs, updateOdsDwdAutomationConfig, getWarehouseFeatures, triggerOdsDwdSync } from '@/api/warehouse'

const router = useRouter()

const featureEnabled = ref(false)
const loading = ref(true)
const configs = ref<any[]>([])
const filterMode = ref('')

async function load() {
  loading.value = true
  try {
    const f = await getWarehouseFeatures()
    featureEnabled.value = f.ods_dwd_automation
    const params: any = {}
    if (filterMode.value) params.update_mode = filterMode.value
    configs.value = await listOdsDwdAutomationConfigs(params) as any[]
  } catch { featureEnabled.value = false; configs.value = [] }
  finally { loading.value = false }
}

async function toggleConfig(config: any) {
  try {
    if (config.enabled) {
      await updateOdsDwdAutomationConfig(config.ods_table_name, { enabled: false })
      ElMessage.success(`已暂停 ${config.ods_table_label || config.ods_table_name}`)
    } else {
      await ElMessageBox.confirm(`开启后，每次 ${config.ods_table_label || config.ods_table_name} 同步完成将自动更新 DWD，确定？`, '确认开启自动化', { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' })
      await updateOdsDwdAutomationConfig(config.ods_table_name, { enabled: true })
      ElMessage.success(`已开启 ${config.ods_table_label || config.ods_table_name}`)
    }
    await load()
  } catch (e: any) { if (e !== 'cancel') ElMessage.error(e?.response?.data?.detail || '操作失败') }
}

const triggering = ref<string | null>(null)
async function doTrigger(config: any) {
  triggering.value = config.ods_table_name
  try {
    const r = await triggerOdsDwdSync(config.ods_table_name)
    ElMessage.success(r.message || '已触发同步')
    await load()
  } catch (e: any) { ElMessage.error(e?.response?.data?.detail || '触发失败') }
  finally { triggering.value = null }
}

function goRecipe(tableName: string) { router.push({ path: '/warehouse/data-recipe', query: { table: tableName } }) }
function modeLabel(mode: string) { const map: Record<string, string> = { cleaning_rule: '清洗规则', passthrough: '直通更新' }; return map[mode] || mode }
function syncLabel(s: string) { const map: Record<string, string> = { full_snapshot: '全量快照', incremental_append: '增量追加', incremental_upsert: '增量更新' }; return map[s] || s }
function statusIcon(s: string | null) { if (s === 'success') return CircleCheck; if (s === 'failed') return CircleClose; return Clock }

onMounted(load)
</script>

<template>
  <div>
    <el-alert v-if="!featureEnabled && !loading" type="info" :closable="false" show-icon style="margin-bottom:12px">
      <template #title>ODS→DWD 自动化能力当前未启用</template>
      请联系管理员在 .env 中设置 <code>WAREHOUSE_FEATURE_ODS_DWD_AUTOMATION=true</code>。
    </el-alert>

    <div class="filter-bar">
      <el-select v-model="filterMode" placeholder="更新模式" clearable size="default" @change="load">
        <el-option label="清洗规则" value="cleaning_rule" />
        <el-option label="直通更新" value="passthrough" />
      </el-select>
    </div>

    <el-table :data="configs" v-loading="loading" stripe size="default" style="margin-top:12px">
      <el-table-column label="ODS 表" min-width="160">
        <template #default="{ row }">
          {{ row.ods_table_label || row.ods_table_name }}
          <el-tag v-if="row.auto_created" size="small" type="info" effect="plain" style="margin-left:4px">自动</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="DWD 资产" min-width="140">
        <template #default="{ row }">{{ row.dwd_table_label !== '-' ? row.dwd_table_label : (row.target_dwd_table_name || '-') }}</template>
      </el-table-column>
      <el-table-column label="更新模式" width="100">
        <template #default="{ row }"><el-tag size="small" :type="row.update_mode === 'cleaning_rule' ? 'success' : 'warning'">{{ modeLabel(row.update_mode) }}</el-tag></template>
      </el-table-column>
      <el-table-column label="ODS语义" width="100">
        <template #default="{ row }">{{ syncLabel(row.ods_sync_semantics) }}</template>
      </el-table-column>
      <el-table-column label="最近状态" width="90">
        <template #default="{ row }">
          <span v-if="row.last_execution_status" :style="{ color: row.last_execution_status === 'success' ? '#67C23A' : '#F56C6C' }">
            <component :is="statusIcon(row.last_execution_status)" style="font-size:14px;vertical-align:middle" />
            {{ row.last_execution_status === 'success' ? '成功' : '失败' }}
          </span>
          <span v-else style="color:#909399">-</span>
        </template>
      </el-table-column>
      <el-table-column label="最近执行" min-width="130">
        <template #default="{ row }">{{ row.last_execution_at?.slice(0, 16) || '-' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="240" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="goRecipe(row.ods_table_name)"><el-icon style="margin-right:2px"><Setting /></el-icon>编辑</el-button>
          <el-button size="small" @click="doTrigger(row)" :loading="triggering === row.ods_table_name"><el-icon style="margin-right:2px"><Refresh /></el-icon>手动触发</el-button>
          <el-button size="small" :type="row.enabled ? 'warning' : 'success'" @click="toggleConfig(row)">{{ row.enabled ? '暂停' : '开启' }}</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-empty v-if="!loading && configs.length === 0" description="暂无 ODS→DWD 自动化配置">
      <p style="color:#909399;font-size:13px">前往 <el-link type="primary" @click="router.push('/warehouse/data-recipe')">数据清洗</el-link> 页面，选择 ODS 表后配置自动化规则</p>
    </el-empty>
  </div>
</template>

<style scoped>
.filter-bar { display: flex; align-items: center; }
</style>
