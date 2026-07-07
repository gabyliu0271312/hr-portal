<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete, View, Check, Finished, Upload, Warning, InfoFilled } from '@element-plus/icons-vue'
import { api } from '@/api/client'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()

// ════════════════════ 列表视图 ════════════════════
const definitions = ref<any[]>([])
const loading = ref(false)

async function load() {
  loading.value = true
  try { const res = await api.get('/warehouse/ads-definitions'); definitions.value = res.data.items } catch { definitions.value = [] }
  finally { loading.value = false }
}

async function doDelete(id: number) {
  try { await ElMessageBox.confirm('确定删除此 ADS 定义？', '确认', { type: 'warning' }); await api.delete(`/warehouse/ads-definitions/${id}`); ElMessage.success('已删除'); load() } catch { }
}

// ════════════════════ 向导视图 ════════════════════
const wizardVisible = ref(false)
const editId = ref<number | null>(null)
const currentStep = ref(1)
const totalSteps = 5
const saving = ref(false)

// Step 1: 基本信息
const form = ref({
  name: '', description: '', source_type: '', source_id: null as number | null,
  subject_area: '', consume_domain: '', owner_name: '',
})

// Step 2: 维度
const dimensionRefs = ref<{ code: string; name: string; field: string; ref_table: string }[]>([])
const availDims = ref<any[]>([])

// Step 3: 输出字段
const outputFields = ref<{ source_field: string; output_name: string; output_label: string; data_type: string; agg_role: string; is_sensitive: boolean }[]>([])

// Step 4: 预设过滤
const presetFilters = ref<{ field: string; operator: string; value: string }[]>([])

// Step 5: 预览
const previewResult = ref<any>(null)
const publishing = ref(false)
const publishTargets = ref<string[]>(['asset'])
const publishErrors = ref<string[]>([])

// 数据源
const sources = ref<any[]>([])

async function loadSources() {
  try { const res = await api.get('/warehouse/ads-sources'); sources.value = res.data.sources || [] } catch { sources.value = [] }
}

async function loadDimensions() {
  try { const res = await api.get('/warehouse/ads-available-dimensions'); availDims.value = res.data || [] } catch { availDims.value = [] }
}

function openWizard(def?: any) {
  loadSources(); loadDimensions()
  if (def) {
    editId.value = def.id
    form.value = { name: def.name, description: def.description || '', source_type: def.source_type, source_id: def.source_id, subject_area: def.subject_area || '', consume_domain: def.consume_domain || '', owner_name: def.owner_name || '' }
    dimensionRefs.value = [...(def.dimension_refs || [])]
    outputFields.value = [...(def.output_fields || [])]
    presetFilters.value = [...(def.preset_filters || [])]
    previewResult.value = null
  } else {
    editId.value = null
    form.value = { name: '', description: '', source_type: 'dws_aggregate', source_id: null, subject_area: '', consume_domain: '', owner_name: '' }
    dimensionRefs.value = []
    outputFields.value = []
    presetFilters.value = []
    previewResult.value = null
  }
  currentStep.value = 1
  wizardVisible.value = true
}

// ── Step 操作 ─────────────────────────────────
function nextStep() {
  if (currentStep.value === 1 && (!form.value.name || !form.value.source_id)) {
    ElMessage.warning('请填写名称和选择来源'); return
  }
  if (currentStep.value < totalSteps) currentStep.value++
  if (currentStep.value === 5) doPreview()
}

function prevStep() { if (currentStep.value > 1) currentStep.value-- }

async function doPreview() {
  // 临时保存获取预览
  if (!editId.value) {
    try {
      const res = await api.post('/warehouse/ads-definitions', {
        ...form.value,
        dimension_refs: dimensionRefs.value,
        output_fields: outputFields.value,
        preset_filters: presetFilters.value.length ? presetFilters.value : null,
      })
      editId.value = res.data.id
    } catch (e: any) {
      ElMessage.error(e?.response?.data?.detail?.validation_errors?.join('; ') || '保存失败')
      currentStep.value = 4; return
    }
  } else {
    try {
      await api.patch(`/warehouse/ads-definitions/${editId.value}`, {
        ...form.value,
        dimension_refs: dimensionRefs.value,
        output_fields: outputFields.value,
        preset_filters: presetFilters.value.length ? presetFilters.value : null,
      })
    } catch (e: any) {
      ElMessage.error(e?.response?.data?.detail || '保存失败')
      currentStep.value = 4; return
    }
  }
  try {
    previewResult.value = (await api.get(`/warehouse/ads-definitions/${editId.value}/preview`)).data
  } catch { previewResult.value = { error: true } }
}

async function doPublish() {
  if (!editId.value) return
  if (!publishTargets.value.length) { ElMessage.warning('请至少选择一个发布目标'); return }
  publishing.value = true
  publishErrors.value = []
  try {
    const res = await api.post(`/warehouse/ads-definitions/${editId.value}/publish`, null, { params: { targets: publishTargets.value } })
    ElMessage.success('发布成功')
    wizardVisible.value = false; load()
  } catch (e: any) {
    const detail = e?.response?.data?.detail
    if (typeof detail === 'string') publishErrors.value = [detail]
    else publishErrors.value = [JSON.stringify(detail)]
  } finally { publishing.value = false }
}

async function doUnpublish(def: any) {
  try { await ElMessageBox.confirm('确定撤回发布？', '确认', { type: 'warning' }); await api.post(`/warehouse/ads-definitions/${def.id}/unpublish`); ElMessage.success('已撤回'); load() } catch { }
}

// ── 维度管理 ─────────────────────────────────
function addDimRef(dim: any) {
  if (dimensionRefs.value.some(d => d.code === dim.code)) return
  dimensionRefs.value.push({ code: dim.code, name: dim.name, field: dim.bound_field || '', ref_table: dim.bound_table || '' })
}

function removeDimRef(code: string) {
  dimensionRefs.value = dimensionRefs.value.filter(d => d.code !== code)
}

// ── 输出字段 ─────────────────────────────────
function addField() {
  outputFields.value.push({ source_field: '', output_name: '', output_label: '', data_type: 'string', agg_role: 'dimension', is_sensitive: false })
}

function removeField(idx: number) { outputFields.value.splice(idx, 1) }

// ── 过滤条件 ─────────────────────────────────
function addFilter() {
  presetFilters.value.push({ field: '', operator: 'eq', value: '' })
}

function removeFilter(idx: number) { presetFilters.value.splice(idx, 1) }

const filterOperators = [
  { value: 'eq', label: '=' },
  { value: 'ne', label: '!=' },
  { value: 'gt', label: '>' },
  { value: 'lt', label: '<' },
  { value: 'in', label: 'IN' },
  { value: 'like', label: 'LIKE' },
]

// ── 发布目标选项 ─────────────────────────────
const targetOptions = [
  { value: 'asset', label: '数据资产', desc: '进入数据资产目录，可被搜索、查看和权限控制' },
  { value: 'view', label: '数据视图', desc: '生成逻辑视图，供 SQL 查询和 BI 直连' },
  { value: 'api', label: 'API 候选', desc: '注册为 API 暴露候选，供接口管理模块发布' },
  { value: 'push', label: '推送候选', desc: '注册为推送目标候选，供定时推送任务使用' },
]

const consumeDomains = ['BI', 'API', 'push', 'report']
const subjectAreas = ['组织', '人员', '薪酬', '招聘', '培训', '绩效', '通用']

onMounted(load)
</script>

<template>
  <div style="padding:24px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h2 style="margin:0;font-size:20px">ADS 消费资产</h2>
      <el-button v-if="userStore.hasOp('warehouse.modeling','C')" type="primary" :icon="Plus" @click="openWizard()">新建 ADS</el-button>
    </div>

    <!-- 列表 -->
    <el-card shadow="never">
      <el-table v-loading="loading" :data="definitions" border stripe size="small" empty-text="暂无 ADS 定义">
        <el-table-column prop="name" label="名称" min-width="160" />
        <el-table-column label="来源" width="160">
          <template #default="{ row }">
            <el-tag size="small" type="info">{{ row.source_type }}</el-tag>
            {{ row.source_label || row.source_id }}
          </template>
        </el-table-column>
        <el-table-column label="输出字段" width="80" align="center">
          <template #default="{ row }">{{ (row.output_fields || []).length }}</template>
        </el-table-column>
        <el-table-column label="维度" width="60" align="center">
          <template #default="{ row }">{{ (row.dimension_refs || []).length }}</template>
        </el-table-column>
        <el-table-column prop="subject_area" label="主题域" width="80" />
        <el-table-column prop="consume_domain" label="消费域" width="80" />
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="row.publish_status === 'published' ? 'success' : 'info'">
              {{ row.publish_status === 'published' ? '已发布' : row.publish_status === 'archived' ? '已归档' : '草稿' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="发布目标" width="120">
          <template #default="{ row }">
            <el-tag v-for="t in (row.publish_targets || [])" :key="t" size="small" style="margin-right:4px">{{ t }}</el-tag>
            <span v-if="!(row.publish_targets || []).length" style="color:#909399">—</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button text size="small" :icon="Edit" @click="openWizard(row)">编辑</el-button>
            <el-button v-if="row.publish_status === 'published'" text size="small" type="warning" @click="doUnpublish(row)">撤回</el-button>
            <el-button text size="small" type="danger" :icon="Delete" @click="doDelete(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- ════════════════ 向导弹窗 ════════════════ -->
    <el-dialog v-model="wizardVisible" :title="editId ? '编辑 ADS' : '新建 ADS 消费资产'" width="780px" top="40px" @close="editId = null; previewResult = null">
      <!-- 步骤条 -->
      <el-steps :active="currentStep - 1" finish-status="success" align-center style="margin-bottom:24px">
        <el-step title="基本信息" />
        <el-step title="关联维度" />
        <el-step title="输出字段" />
        <el-step title="预设过滤" />
        <el-step title="预览与发布" />
      </el-steps>

      <div style="min-height:300px">
        <!-- Step 1: 基本信息 -->
        <div v-show="currentStep === 1">
          <el-form label-width="90px" size="small">
            <el-form-item label="名称" required>
              <el-input v-model="form.name" maxlength="256" placeholder="如：员工月度薪酬汇总" />
            </el-form-item>
            <el-form-item label="描述">
              <el-input v-model="form.description" type="textarea" :rows="2" />
            </el-form-item>
            <el-form-item label="来源类型" required>
              <el-select v-model="form.source_type" style="width:200px">
                <el-option label="DWS 聚合" value="dws_aggregate" />
                <el-option label="数据集" value="dataset" />
                <el-option label="模型" value="model" />
              </el-select>
            </el-form-item>
            <el-form-item label="来源" required>
              <el-select v-model="form.source_id" filterable placeholder="选择 DWS 来源" style="width:100%">
                <el-option v-for="s in sources" :key="s.type + '-' + s.id" :label="s.label" :value="s.id" />
              </el-select>
            </el-form-item>
            <el-form-item label="主题域">
              <el-select v-model="form.subject_area" clearable style="width:160px">
                <el-option v-for="a in subjectAreas" :key="a" :label="a" :value="a" />
              </el-select>
            </el-form-item>
            <el-form-item label="消费域">
              <el-select v-model="form.consume_domain" clearable style="width:160px">
                <el-option v-for="d in consumeDomains" :key="d" :label="d" :value="d" />
              </el-select>
            </el-form-item>
            <el-form-item label="负责人">
              <el-input v-model="form.owner_name" style="width:200px" />
            </el-form-item>
          </el-form>
        </div>

        <!-- Step 2: 维度 -->
        <div v-show="currentStep === 2">
          <el-alert type="info" :closable="false" show-icon style="margin-bottom:12px">
            从可用维度中选择关联到此 ADS 消费资产的维度，消费端可按这些维度筛选和分组。
          </el-alert>

          <div style="display:flex;gap:12px">
            <div style="flex:1;border:1px solid #e4e7ed;border-radius:6px;padding:12px;max-height:300px;overflow-y:auto">
              <div style="font-size:13px;font-weight:600;margin-bottom:8px">可用维度</div>
              <div v-for="dim in availDims" :key="dim.code"
                style="padding:6px 8px;border-radius:4px;cursor:pointer;font-size:13px;margin-bottom:2px"
                :style="{ background: dimensionRefs.some(d => d.code === dim.code) ? '#ecf5ff' : 'transparent' }"
                @click="addDimRef(dim)"
              >
                <strong>{{ dim.code }}</strong>
                <span style="color:#909399;margin-left:8px">{{ dim.name }}</span>
                <span style="color:#c0c4cc;font-size:11px;margin-left:8px">{{ dim.bound_table }}.{{ dim.bound_field }}</span>
              </div>
            </div>

            <div style="flex:1;border:1px solid #e4e7ed;border-radius:6px;padding:12px;max-height:300px;overflow-y:auto">
              <div style="font-size:13px;font-weight:600;margin-bottom:8px">已选择 ({{ dimensionRefs.length }})</div>
              <div v-if="!dimensionRefs.length" style="color:#909399;font-size:13px">点击左侧维度添加</div>
              <div v-for="(d, i) in dimensionRefs" :key="d.code"
                style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;border-radius:4px;background:#f5f7fa;margin-bottom:4px"
              >
                <div>
                  <el-tag size="small">{{ d.code }}</el-tag>
                  <span style="margin-left:6px;font-size:12px">{{ d.name }}</span>
                </div>
                <el-button text size="small" type="danger" @click="removeDimRef(d.code)">×</el-button>
              </div>
            </div>
          </div>
        </div>

        <!-- Step 3: 输出字段 -->
        <div v-show="currentStep === 3">
          <el-alert type="info" :closable="false" show-icon style="margin-bottom:12px">
            定义 ADS 消费资产的输出字段，可为字段设置别名和标签。至少需配置一个字段。
          </el-alert>

          <div v-for="(f, i) in outputFields" :key="i"
            style="display:flex;gap:8px;align-items:center;padding:8px;border:1px solid #ebeef5;border-radius:6px;margin-bottom:8px"
          >
            <el-input v-model="f.source_field" placeholder="源字段" size="small" style="width:120px" />
            <span style="color:#c0c4cc">→</span>
            <el-input v-model="f.output_name" placeholder="输出字段名" size="small" style="width:120px" />
            <el-input v-model="f.output_label" placeholder="显示名" size="small" style="width:100px" />
            <el-select v-model="f.agg_role" size="small" style="width:90px">
              <el-option label="维度" value="dimension" />
              <el-option label="度量" value="measure" />
              <el-option label="属性" value="attribute" />
            </el-select>
            <el-checkbox v-model="f.is_sensitive" size="small" title="敏感字段">敏感</el-checkbox>
            <el-button text size="small" type="danger" @click="removeField(i)">×</el-button>
          </div>
          <el-button size="small" :icon="Plus" @click="addField">添加字段</el-button>
        </div>

        <!-- Step 4: 预设过滤 -->
        <div v-show="currentStep === 4">
          <el-alert type="info" :closable="false" show-icon style="margin-bottom:12px">
            配置预设过滤条件，消费端默认应用这些过滤（如只显示当前年份数据）。
          </el-alert>

          <div v-for="(f, i) in presetFilters" :key="i"
            style="display:flex;gap:8px;align-items:center;padding:8px;border:1px solid #ebeef5;border-radius:6px;margin-bottom:8px"
          >
            <el-input v-model="f.field" placeholder="字段名" size="small" style="width:160px" />
            <el-select v-model="f.operator" size="small" style="width:80px">
              <el-option v-for="op in filterOperators" :key="op.value" :label="op.label" :value="op.value" />
            </el-select>
            <el-input v-model="f.value" placeholder="值" size="small" style="flex:1" />
            <el-button text size="small" type="danger" @click="removeFilter(i)">×</el-button>
          </div>
          <el-button size="small" :icon="Plus" @click="addFilter" :disabled="presetFilters.length >= 10">添加过滤</el-button>
        </div>

        <!-- Step 5: 预览与发布 -->
        <div v-show="currentStep === 5">
          <div v-if="previewResult?.error" style="text-align:center;padding:40px;color:#f56c6c">
            <el-icon :size="32"><Warning /></el-icon>
            <p>预览数据加载失败</p>
          </div>
          <template v-else-if="previewResult">
            <!-- 预览摘要 -->
            <el-descriptions :column="2" border size="small" style="margin-bottom:16px">
              <el-descriptions-item label="ADS 名称">{{ previewResult.name }}</el-descriptions-item>
              <el-descriptions-item label="来源">{{ previewResult.source?.label }}</el-descriptions-item>
              <el-descriptions-item label="输出字段">{{ previewResult.field_count }} 个</el-descriptions-item>
              <el-descriptions-item label="关联维度">{{ previewResult.dimension_count }} 个</el-descriptions-item>
            </el-descriptions>

            <!-- 敏感字段提示 -->
            <el-alert v-if="previewResult.sensitive_fields?.length" type="warning" :closable="false" show-icon style="margin-bottom:12px">
              <template #title>敏感字段提示</template>
              以下字段标记为敏感: {{ previewResult.sensitive_fields.join(', ') }}。<br/>
              发布为 API/推送候选时需确保已脱敏处理，否则发布将失败。
            </el-alert>

            <!-- 警告 -->
            <el-alert v-if="previewResult.warnings?.length" type="warning" :closable="false" show-icon style="margin-bottom:12px">
              <template #title>预览警告</template>
              <ul style="margin:4px 0 0;padding-left:18px;font-size:12px">
                <li v-for="w in previewResult.warnings" :key="w">{{ w }}</li>
              </ul>
            </el-alert>

            <!-- 输出字段预览 -->
            <div style="margin-bottom:16px">
              <div style="font-size:13px;font-weight:600;margin-bottom:8px">输出字段清单</div>
              <el-table :data="previewResult.output_fields" size="small" border max-height="200">
                <el-table-column prop="source_field" label="源字段" width="140" />
                <el-table-column prop="output_name" label="输出名" width="140" />
                <el-table-column prop="output_label" label="显示名" width="120" />
                <el-table-column prop="agg_role" label="角色" width="80" />
                <el-table-column label="敏感" width="60" align="center">
                  <template #default="{ row }">
                    <el-tag v-if="row.is_sensitive" size="small" type="danger">是</el-tag>
                    <span v-else style="color:#909399">否</span>
                  </template>
                </el-table-column>
              </el-table>
            </div>

            <!-- 发布选项 -->
            <div style="border:1px solid #e4e7ed;border-radius:6px;padding:12px">
              <div style="font-size:13px;font-weight:600;margin-bottom:12px">发布为</div>
              <div v-if="publishErrors.length" style="margin-bottom:8px">
                <el-alert v-for="(err, i) in publishErrors" :key="i" type="error" :closable="false" :title="err" style="margin-bottom:4px" />
              </div>
              <el-checkbox-group v-model="publishTargets">
                <div v-for="t in targetOptions" :key="t.value"
                  style="display:flex;align-items:flex-start;padding:8px;margin-bottom:4px;border:1px solid #ebeef5;border-radius:6px"
                >
                  <el-checkbox :value="t.value" style="margin-right:8px" />
                  <div>
                    <div style="font-weight:500;font-size:13px">{{ t.label }}</div>
                    <div style="font-size:12px;color:#909399">{{ t.desc }}</div>
                  </div>
                </div>
              </el-checkbox-group>
            </div>
          </template>
          <div v-else style="text-align:center;padding:40px;color:#909399">加载预览中…</div>
        </div>
      </div>

      <template #footer>
        <div style="display:flex;justify-content:space-between">
          <el-button v-if="currentStep === 5 && editId" type="primary" :icon="Upload" :loading="publishing" @click="doPublish">
            确认发布
          </el-button>
          <div v-else></div>
          <div>
            <el-button @click="prevStep" :disabled="currentStep === 1">上一步</el-button>
            <el-button v-if="currentStep < totalSteps" type="primary" @click="nextStep">下一步</el-button>
            <el-button v-else @click="wizardVisible = false">关闭</el-button>
          </div>
        </div>
      </template>
    </el-dialog>
  </div>
</template>
