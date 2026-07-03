<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { Upload, Document, Check } from '@element-plus/icons-vue'
import { ucpApi } from '@/api/ucp'

interface MappingRule { source: string; target: string }

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'success'): void
}>()

// 步骤：1 上传 → 2 配置映射 → 3 导入
const step = ref(1)
const uploading = ref(false)
const importing = ref(false)

const fileKey = ref('')
const fileName = ref('')
const headers = ref<string[]>([])
const previewRows = ref<Record<string, any>[]>([])
const totalRows = ref(0)
const sheetNames = ref<string[]>([])
const selectedSheet = ref('')

const targetTable = ref('')
const joinKey = ref('')
const mappingRules = ref<MappingRule[]>([])

const importResult = ref<{
  status: string
  total_rows: number
  success_count: number
  failed_count: number
  failed_details: Array<{ row_index: number; reason: string }>
  target_table: string
  message?: string
} | null>(null)

const dialogVisible = computed({
  get: () => props.visible,
  set: (v) => emit('update:visible', v),
})

function reset() {
  step.value = 1
  fileKey.value = ''
  fileName.value = ''
  headers.value = []
  previewRows.value = []
  totalRows.value = 0
  sheetNames.value = []
  selectedSheet.value = ''
  targetTable.value = ''
  joinKey.value = ''
  mappingRules.value = []
  importResult.value = null
}

async function handleUpload(file: File) {
  uploading.value = true
  try {
    const res = await ucpApi.excelUpload(file)
    fileKey.value = res.file_key
    fileName.value = res.filename
    headers.value = res.headers
    previewRows.value = res.preview_rows
    totalRows.value = res.total_rows
    sheetNames.value = res.sheet_names
    selectedSheet.value = res.sheet_names[0] || ''
    // 默认映射：source === target（同名映射，可编辑）
    mappingRules.value = res.headers.map((h) => ({ source: h, target: h }))
    step.value = 2
    ElMessage.success(`解析成功：${res.total_rows} 行，${res.headers.length} 列`)
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail?.message || e?.response?.data?.detail || '上传解析失败')
  } finally {
    uploading.value = false
  }
  return false // 阻止 el-upload 自动上传
}

function addMapping() {
  mappingRules.value.push({ source: '', target: '' })
}

function removeMapping(idx: number) {
  mappingRules.value.splice(idx, 1)
}

async function doImport() {
  if (!targetTable.value) {
    ElMessage.warning('请填写目标表名')
    return
  }
  if (!joinKey.value) {
    ElMessage.warning('请填写幂等主键字段')
    return
  }
  importing.value = true
  try {
    const res = await ucpApi.excelImport({
      file_key: fileKey.value,
      target_table: targetTable.value,
      join_key: joinKey.value,
      mapping_rules: mappingRules.value.filter((r) => r.source && r.target),
      sheet_name: selectedSheet.value || undefined,
    })
    importResult.value = res
    step.value = 3
    if (res.failed_count === 0) {
      ElMessage.success(`导入成功：${res.success_count} 行`)
    } else {
      ElMessage.warning(`导入完成：${res.success_count} 成功，${res.failed_count} 失败`)
    }
    emit('success')
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail?.message || e?.response?.data?.detail || '导入失败')
  } finally {
    importing.value = false
  }
}

function close() {
  dialogVisible.value = false
  setTimeout(reset, 300)
}
</script>

<template>
  <el-dialog v-model="dialogVisible" title="Excel 文件导入" width="780px" @close="close">
    <el-steps :active="step - 1" finish-status="success" align-center style="margin-bottom: 20px">
      <el-step title="上传文件" />
      <el-step title="配置映射" />
      <el-step title="导入结果" />
    </el-steps>

    <!-- Step 1: 上传 -->
    <div v-if="step === 1">
      <el-upload
        :auto-upload="true"
        :show-file-list="false"
        :http-request="(opts: any) => handleUpload(opts.file)"
        accept=".xlsx,.xls"
        drag
        v-loading="uploading"
      >
        <el-icon class="el-icon--upload"><Upload /></el-icon>
        <div class="el-upload__text">拖拽 Excel 到此，或<em>点击上传</em></div>
        <template #tip>
          <div class="el-upload__tip">支持 .xlsx / .xls，单文件最大 20MB。数据将自动脱敏预览。</div>
        </template>
      </el-upload>
    </div>

    <!-- Step 2: 配置映射 -->
    <div v-if="step === 2">
      <el-descriptions :column="2" border style="margin-bottom: 16px">
        <el-descriptions-item label="文件名">{{ fileName }}</el-descriptions-item>
        <el-descriptions-item label="总行数">{{ totalRows }}</el-descriptions-item>
        <el-descriptions-item label="工作表">
          <el-select v-if="sheetNames.length" v-model="selectedSheet" size="small" style="width: 180px">
            <el-option v-for="s in sheetNames" :key="s" :label="s" :value="s" />
          </el-select>
          <span v-else>—</span>
        </el-descriptions-item>
        <el-descriptions-item label="列数">{{ headers.length }}</el-descriptions-item>
      </el-descriptions>

      <el-form label-width="110px" style="margin-bottom: 12px">
        <el-form-item label="目标表名" required>
          <el-input v-model="targetTable" placeholder="如 hr_pending_employee_full" />
        </el-form-item>
        <el-form-item label="幂等主键" required>
          <el-input v-model="joinKey" placeholder="如 application_id / employee_id" />
        </el-form-item>
      </el-form>

      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px">
        <span style="font-weight: 600; font-size: 13px">字段映射（Excel 列名 → 目标表字段）</span>
        <el-button size="small" @click="addMapping">+ 新增映射</el-button>
      </div>
      <el-table :data="mappingRules" stripe size="small" max-height="180" style="margin-bottom: 12px">
        <el-table-column label="Excel 列名" min-width="180">
          <template #default="{ row }">
            <el-select v-model="row.source" size="small" filterable>
              <el-option v-for="h in headers" :key="h" :label="h" :value="h" />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="→" width="40" align="center">→</el-table-column>
        <el-table-column label="目标字段" min-width="180">
          <template #default="{ row }">
            <el-input v-model="row.target" size="small" placeholder="目标字段名" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="70">
          <template #default="{ $index }">
            <el-button size="small" link type="danger" @click="removeMapping($index)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div style="font-weight: 600; font-size: 13px; margin-bottom: 6px">预览（脱敏样本，前 20 行）</div>
      <el-table :data="previewRows" stripe size="small" max-height="200" style="width: 100%">
        <el-table-column v-for="h in headers.slice(0, 8)" :key="h" :label="h" min-width="120" show-overflow-tooltip>
          <template #default="{ row }">{{ row[h] ?? '' }}</template>
        </el-table-column>
      </el-table>

      <div style="text-align: right; margin-top: 16px">
        <el-button @click="step = 1">上一步</el-button>
        <el-button type="primary" :loading="importing" @click="doImport">
          <el-icon style="margin-right: 4px"><Check /></el-icon>开始导入
        </el-button>
      </div>
    </div>

    <!-- Step 3: 导入结果 -->
    <div v-if="step === 3 && importResult">
      <el-result
        :icon="importResult.failed_count === 0 ? 'success' : 'warning'"
        :title="importResult.status === 'SUCCESS' ? '导入成功' : '导入完成（部分失败）'"
        :sub-title="`目标表 ${importResult.target_table}：成功 ${importResult.success_count} / ${importResult.total_rows} 行`"
      />
      <div v-if="importResult.failed_details.length" style="margin-top: 8px">
        <div style="font-weight: 600; font-size: 13px; margin-bottom: 6px; color: var(--color-danger)">
          失败明细（{{ importResult.failed_details.length }} 条）
        </div>
        <el-table :data="importResult.failed_details" stripe size="small" max-height="200">
          <el-table-column label="行号" width="80" prop="row_index" />
          <el-table-column label="原因" prop="reason" show-overflow-tooltip />
        </el-table>
      </div>
      <div style="text-align: right; margin-top: 16px">
        <el-button type="primary" @click="close">完成</el-button>
      </div>
    </div>
  </el-dialog>
</template>
