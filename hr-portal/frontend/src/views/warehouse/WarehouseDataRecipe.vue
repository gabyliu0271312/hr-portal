<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useUserStore } from '@/stores/user'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Delete, Top, Bottom, Refresh, VideoPlay, Upload, ArrowRight } from '@element-plus/icons-vue'
import {
  listAssets, listAssetColumns,
  listStandardizationRules, createStandardizationRule, updateStandardizationRule, deleteStandardizationRule,
  listStandardizationTemplates, createStandardizationTemplate, loadTemplateToAsset, previewStandardization, generateDwdView,
  executeStandardization,
  STANDARDIZATION_RULE_TYPES, STANDARDIZATION_RULE_LABELS,
  type Asset,
} from '@/api/warehouse'

const userStore = useUserStore()

// ===== 选表 =====
const tables = ref<Asset[]>([])
const selectedTable = ref('')
const targetTableName = ref('')
const tableFields = ref<{ column_code: string; column_label: string; data_type: string }[]>([])

async function loadTables() {
  try { const res = await listAssets({ page_size: 200 }); tables.value = res.items } catch { tables.value = [] }
}

async function onTableChange(tableName: string) {
  if (!tableName) { tableFields.value = []; return }
  try {
    const res = await listAssetColumns(tableName)
    tableFields.value = res.columns.map((c: any) => ({ column_code: c.column_code, column_label: c.column_label, data_type: c.data_type || '' }))
  } catch { tableFields.value = [] }
  await loadRules()
}

// ===== 步骤流 =====
interface Step {
  id?: number; rule_type: string; source_field: string; target_field: string
  rule_config: Record<string, any>; enabled: boolean; display_order: number; dirty?: boolean
}
const steps = ref<Step[]>([])
const dirty = ref(false)

async function loadRules() {
  if (!selectedTable.value) return
  try {
    const res = await listStandardizationRules({ asset_code: selectedTable.value, page_size: 200 })
    steps.value = res.items.map(r => ({ id: r.id, rule_type: r.rule_type, source_field: r.source_field, target_field: r.target_field, rule_config: r.rule_config || {}, enabled: r.enabled, display_order: r.display_order })).sort((a, b) => a.display_order - b.display_order)
    dirty.value = false
  } catch { steps.value = [] }
}

const showAddMenu = ref(false)
function addStep(ruleType: string) {
  steps.value.push({ rule_type: ruleType, source_field: '', target_field: '', rule_config: {}, enabled: true, display_order: steps.value.length + 1, dirty: true })
  expandStep(steps.value.length - 1)
  showAddMenu.value = false
}
function removeStep(index: number) {
  steps.value.splice(index, 1)
  steps.value.forEach((s, i) => { s.display_order = i + 1; s.dirty = true })
  dirty.value = true
}
function moveStep(index: number, dir: -1 | 1) {
  const target = index + dir
  if (target < 0 || target >= steps.value.length) return
  const tmp = steps.value[target]; steps.value[target] = steps.value[index]; steps.value[index] = tmp
  steps.value.forEach((s, i) => { s.display_order = i + 1; s.dirty = true })
  dirty.value = true
}

const editingIndex = ref(-1)
function expandStep(index: number) { editingIndex.value = index }
function collapseStep() { editingIndex.value = -1 }
const editingStep = computed(() => editingIndex.value >= 0 ? steps.value[editingIndex.value] : null)

function onStepFieldChange() {
  dirty.value = true
  if (editingIndex.value >= 0) steps.value[editingIndex.value].dirty = true
}
function addMapRow() {
  const cfg = steps.value[editingIndex.value].rule_config; if (!cfg.mappings) cfg.mappings = []
  cfg.mappings.push({ from: '', to: '' }); onStepFieldChange()
}
function removeMapRow(rowIdx: number) {
  steps.value[editingIndex.value].rule_config.mappings.splice(rowIdx, 1); onStepFieldChange()
}
function addSplitField() {
  const cfg = steps.value[editingIndex.value].rule_config; if (!cfg.target_fields) cfg.target_fields = []
  cfg.target_fields.push(''); onStepFieldChange()
}
function removeSplitField(idx: number) {
  steps.value[editingIndex.value].rule_config.target_fields.splice(idx, 1); onStepFieldChange()
}

// ===== 保存 =====
const saving = ref(false)
async function doSave() {
  if (!selectedTable.value) { ElMessage.warning('请先选择来源表'); return }
  saving.value = true
  try {
    const currentIds = new Set(steps.value.filter(s => s.id).map(s => s.id!))
    const existing = await listStandardizationRules({ asset_code: selectedTable.value, page_size: 200 })
    for (const r of existing.items) { if (!currentIds.has(r.id)) await deleteStandardizationRule(r.id) }
    for (const step of steps.value) {
      const payload = { asset_type: 'table', asset_code: selectedTable.value, rule_type: step.rule_type, source_field: step.source_field, target_field: step.target_field, rule_config: step.rule_config, enabled: step.enabled, display_order: step.display_order }
      if (step.id) { await updateStandardizationRule(step.id, payload as any) } else { const created = await createStandardizationRule(payload as any); step.id = created.id }
    }
    dirty.value = false; steps.value.forEach(s => s.dirty = false)
    ElMessage.success('规则已保存'); await loadRules()
  } catch (e: any) { ElMessage.error(e?.response?.data?.detail || '保存失败') } finally { saving.value = false }
}

// ===== 预览 =====
const previewLoading = ref(false)
const previewData = ref<{ columns: string[]; items: any[]; preview_items: any[] } | null>(null)
const previewMode = ref<'detail' | 'structure'>('detail')
const previewDebounce = ref<ReturnType<typeof setTimeout> | null>(null)
async function doPreview() {
  if (!selectedTable.value || steps.value.length === 0) return
  previewLoading.value = true
  try {
    const ruleIds = steps.value.filter(s => s.id).map(s => s.id!)
    const inlineRules = steps.value.filter(s => !s.id).map(s => ({ rule_type: s.rule_type, source_field: s.source_field, target_field: s.target_field, rule_config: s.rule_config, display_order: s.display_order }))
    previewData.value = await previewStandardization({ asset_code: selectedTable.value, rule_ids: ruleIds, inline_rules: inlineRules, sample_size: 20 })
  } catch { previewData.value = null } finally { previewLoading.value = false }
}
function schedulePreview() { if (previewDebounce.value) clearTimeout(previewDebounce.value); previewDebounce.value = setTimeout(doPreview, 500) }

// ===== 模板 =====
const templateVisible = ref(false); const templates = ref<any[]>([]); const templateLoading = ref(false)
async function loadTemplates() { templateLoading.value = true; try { const res = await listStandardizationTemplates(); templates.value = res.items } catch { templates.value = [] } finally { templateLoading.value = false }; templateVisible.value = true }
async function applyTemplate(tpl: any) {
  try { await ElMessageBox.confirm(`模板"${tpl.name}"包含 ${tpl.template_rules?.length || 0} 条规则，将追加到当前步骤流末尾。`, '加载模板', { type: 'info' }); await loadTemplateToAsset(tpl.id, selectedTable.value, 'table', 'skip'); ElMessage.success('模板已加载'); templateVisible.value = false; await loadRules() } catch { /* cancel */ }
}

// 保存为模板
const saveTplVisible = ref(false); const saveTplForm = ref({ name: '', business_object: '' }); const saveTplSaving = ref(false)
function openSaveTemplate() { saveTplForm.value = { name: selectedTable.value + '_模板', business_object: '' }; saveTplVisible.value = true }
async function doSaveTemplate() {
  if (!saveTplForm.value.name.trim()) { ElMessage.warning('请输入模板名称'); return }
  saveTplSaving.value = true
  try {
    const tplRules = steps.value.map(s => ({ rule_type: s.rule_type, source_field: s.source_field, target_field: s.target_field, rule_config: s.rule_config, display_order: s.display_order }))
    await createStandardizationTemplate({ name: saveTplForm.value.name.trim(), business_object: saveTplForm.value.business_object.trim() || selectedTable.value, template_rules: tplRules } as any)
    ElMessage.success('模板已保存'); saveTplVisible.value = false
  } catch (e: any) { ElMessage.error(e?.response?.data?.detail || '保存模板失败') }
  finally { saveTplSaving.value = false }
}

// ===== 执行 =====
const executing = ref(false); const execResult = ref<{ success: number; failed: number; errors: any[] } | null>(null)
async function doExecute() {
  if (!selectedTable.value) return
  if (!targetTableName.value.trim()) { ElMessage.warning('请先输入目标表名'); return }
  try { await ElMessageBox.confirm(`将对 ODS 表"${selectedTable.value}"全量执行规则并写入"${targetTableName.value}"。目标表已存在时将被重建。确定？`, '确认执行', { type: 'warning' }) } catch { return }
  executing.value = true; execResult.value = null
  try { if (dirty.value) await doSave(); const res = await executeStandardization(selectedTable.value, targetTableName.value); execResult.value = { success: res.success, failed: res.failed, errors: res.errors || [] }; if (res.failed === 0) ElMessage.success(`执行完成：共 ${res.total} 行 → ${res.target_table}`); else ElMessage.warning(`执行完成：成功 ${res.success}，失败 ${res.failed}`) } catch (e: any) { ElMessage.error(e?.response?.data?.detail || '执行失败') } finally { executing.value = false }
}

// ===== 发布 DWD =====
const publishing = ref(false)
async function doPublish() {
  if (!selectedTable.value) return
  try { await ElMessageBox.confirm('将基于当前规则生成 DWD 逻辑视图，确定？', '发布 DWD', { type: 'info' }) } catch { return }
  publishing.value = true
  try { if (dirty.value) await doSave(); const res = await generateDwdView(selectedTable.value, 'table'); ElMessage.success(`DWD 视图"${res.view_name}"已发布（版本 ${res.version}）`) } catch (e: any) { ElMessage.error(e?.response?.data?.detail || '发布失败') } finally { publishing.value = false }
}

// ===== 数据预览 =====
const previewItems = computed(() => previewData.value?.preview_items || previewData.value?.items || [])
const previewColumns = computed(() => { if (previewData.value?.columns) return previewData.value.columns; if (previewItems.value.length > 0) return Object.keys(previewItems.value[0]); return [] })

function stepSummary(s: Step): string {
  const from = s.source_field || '?'; const to = s.target_field || '?'; const cfg = s.rule_config
  switch (s.rule_type) {
    case 'rename': return `${from} → ${to}`
    case 'type_convert': return `${from}: ${cfg.from_type || '?'} → ${cfg.to_type || '?'}`
    case 'value_map': return `${from}: ${cfg.mappings?.length || 0} 条映射`
    case 'unit_convert': return `${from}: ${cfg.from_unit || '?'}→${cfg.to_unit || '?'}`
    case 'split_merge': return `${from} → ${cfg.target_fields?.length || 0} 字段`
    case 'deduplicate': return `${cfg.keys?.join(',') || from}`
    case 'null_handling': return `${to || from}: ${cfg.strategy || '?'}`
    case 'format_standardize': return `${from}: ${cfg.format_type || '?'}`
    default: return `${from} → ${to}`
  }
}
const ruleTypeIcon: Record<string, string> = { rename: 'Aa', type_convert: '#', value_map: '{ }', unit_convert: '≍', split_merge: '⤨', deduplicate: '⊚', null_handling: '∅', format_standardize: '✦' }

watch(dirty, (v) => { if (v) window.addEventListener('beforeunload', warnUnsaved); else window.removeEventListener('beforeunload', warnUnsaved) })
function warnUnsaved(e: BeforeUnloadEvent) { e.preventDefault(); e.returnValue = '' }
onMounted(loadTables)
</script>

<template>
  <div class="recipe-page">
    <!-- ===== Zone 1: 顶部工具栏 ===== -->
    <header class="recipe-header">
      <div class="header-top">
        <div class="header-left">
          <h1 class="page-title">数据加工</h1>
          <div class="source-selector">
            <label>来源表</label>
            <el-select v-model="selectedTable" filterable placeholder="选择 ODS 表" size="default" @change="onTableChange">
              <el-option v-for="t in tables" :key="t.table_name" :label="`${t.table_label || t.table_name}`" :value="t.table_name">
                <div style="display:flex;justify-content:space-between;align-items:center">
                  <span>{{ t.table_label || t.table_name }}</span>
                  <el-tag size="small" type="info" style="margin-left:8px">{{ t.warehouse_layer }}</el-tag>
                </div>
              </el-option>
            </el-select>
          </div>
          <div class="target-input">
            <label>目标表</label>
            <el-input v-model="targetTableName" placeholder="dwd_table_name" size="default" clearable />
          </div>
        </div>
        <div class="header-actions">
          <el-button v-if="dirty" type="warning" size="default" @click="doSave" :loading="saving" plain>保存 *</el-button>
          <el-button @click="loadTemplates" :disabled="!selectedTable" size="default">
            <el-icon style="margin-right:4px"><Upload /></el-icon>从模板加载
          </el-button>
          <el-button @click="openSaveTemplate" :disabled="steps.length === 0" size="default" type="primary" plain>
            保存为模板
          </el-button>
        </div>
      </div>
      <div class="toolbar">
        <button v-for="rt in STANDARDIZATION_RULE_TYPES" :key="rt" class="tool-btn" :disabled="!selectedTable" @click="addStep(rt)">
          <span class="tool-btn-icon">{{ ruleTypeIcon[rt] }}</span>
          <span class="tool-btn-label">{{ STANDARDIZATION_RULE_LABELS[rt] }}</span>
        </button>
      </div>
    </header>

    <!-- ===== 主体：Zone 2 预览 + Zone 3 步骤流 ===== -->
    <div class="recipe-body" v-if="selectedTable">
      <!-- Zone 2: 中间数据预览 -->
      <section class="preview-zone">
        <div class="preview-toolbar">
          <div class="view-switch">
            <button :class="{ active: previewMode === 'detail' }" @click="previewMode = 'detail'; doPreview()">明细视图</button>
            <button :class="{ active: previewMode === 'structure' }" @click="previewMode = 'structure'">表结构</button>
          </div>
          <button class="refresh-btn" :disabled="steps.length === 0" @click="doPreview">
            <Refresh /> 刷新
          </button>
        </div>

        <!-- 明细 -->
        <div v-if="previewMode === 'detail'" class="preview-table-wrap" v-loading="previewLoading">
          <table v-if="previewColumns.length && previewItems.length" class="data-table">
            <thead><tr><th v-for="c in previewColumns" :key="c">{{ c }}</th></tr></thead>
            <tbody>
              <tr v-for="(row, i) in previewItems" :key="i" :class="{ odd: i % 2 === 0 }">
                <td v-for="c in previewColumns" :key="c" :title="row[c]">{{ row[c] }}</td>
              </tr>
            </tbody>
          </table>
          <div v-else class="preview-empty">
            <p v-if="steps.length === 0">选择来源表并添加加工步骤后，点击刷新预览</p>
            <p v-else>暂无数据</p>
          </div>
        </div>

        <!-- 表结构 -->
        <div v-else class="preview-table-wrap">
          <el-table :data="tableFields" size="small" border>
            <el-table-column prop="column_code" label="字段名" width="160" />
            <el-table-column prop="column_label" label="中文名" width="140" />
            <el-table-column prop="data_type" label="类型" width="100" />
            <el-table-column label="来源"><template #default>{{ selectedTable }}</template></el-table-column>
          </el-table>
        </div>

        <!-- 执行结果 -->
        <div v-if="execResult" class="exec-result" :class="execResult.failed ? 'warn' : 'ok'">
          <span v-if="execResult.failed === 0">执行完成，共 {{ execResult.success }} 行</span>
          <span v-else>执行完成：成功 {{ execResult.success }} 行，失败 {{ execResult.failed }} 行</span>
        </div>

        <!-- 底部操作 -->
        <div class="bottom-actions">
          <el-button :loading="previewLoading" @click="doPreview" :disabled="steps.length === 0" size="default">预览采样</el-button>
          <el-button type="primary" :loading="saving" @click="doSave" size="default">保存</el-button>
          <el-button type="success" :icon="VideoPlay" :loading="executing" @click="doExecute" :disabled="steps.length === 0" size="default">执行</el-button>
          <el-button type="warning" :loading="publishing" @click="doPublish" :disabled="steps.length === 0" size="default" plain>发布为 DWD 视图</el-button>
        </div>
      </section>

      <!-- Zone 3: 右侧流程步骤流 -->
      <aside class="flow-zone">
        <h3 class="flow-title">加工流程</h3>

        <!-- 来源表节点（流程图顶部） -->
        <div class="flow-source-node">
          <div class="node-dot source"></div>
          <div class="node-card source">
            <div class="node-label">数据来源</div>
            <div class="node-name">{{ selectedTable }}</div>
            <div class="node-meta">{{ tableFields.length }} 个字段</div>
          </div>
        </div>

        <!-- 连接线 + 步骤节点 -->
        <div v-for="(step, i) in steps" :key="i" class="flow-step-group">
          <!-- 连接线 -->
          <div class="flow-connector">
            <div class="connector-line" :class="{ active: editingIndex === i }"></div>
            <div v-if="i === 0" class="connector-arrow"><ArrowRight /></div>
          </div>

          <!-- 步骤节点 -->
          <div class="flow-node" :class="{ expanded: editingIndex === i, dirty: step.dirty }" @click="editingIndex === i ? collapseStep() : expandStep(i)">
            <div class="node-dot" :class="step.enabled ? 'active' : 'disabled'">{{ i + 1 }}</div>
            <div class="node-card">
              <div class="node-header">
                <span class="node-type-icon">{{ ruleTypeIcon[step.rule_type] }}</span>
                <span class="node-type-label">{{ STANDARDIZATION_RULE_LABELS[step.rule_type] }}</span>
                <span v-if="!step.enabled" class="node-disabled-tag">禁用</span>
              </div>
              <div class="node-summary">{{ stepSummary(step) }}</div>
              <!-- 操作按钮（展开时） -->
              <div v-if="editingIndex === i" class="node-actions" @click.stop>
                <button :disabled="i === 0" @click="moveStep(i, -1)" title="上移"><Top /></button>
                <button :disabled="i === steps.length - 1" @click="moveStep(i, 1)" title="下移"><Bottom /></button>
                <button class="danger" @click="removeStep(i)" title="删除"><Delete /></button>
              </div>
            </div>
          </div>

          <!-- 配置面板（展开在节点下方） -->
          <div v-if="editingIndex === i" class="config-panel" @click.stop>
            <!-- 通用字段 -->
            <div class="config-row">
              <div class="config-field">
                <label>源字段</label>
                <el-select v-model="step.source_field" filterable placeholder="选择字段" size="small" @change="onStepFieldChange">
                  <el-option v-for="f in tableFields" :key="f.column_code" :label="`${f.column_label || f.column_code}`" :value="f.column_code" />
                </el-select>
              </div>
              <div class="config-field" v-if="step.rule_type !== 'deduplicate'">
                <label>目标字段</label>
                <el-input v-model="step.target_field" size="small" placeholder="目标字段名" @change="onStepFieldChange" />
              </div>
            </div>

            <!-- 类型转换 -->
            <div v-if="step.rule_type === 'type_convert'" class="config-row">
              <div class="config-field">
                <label>源类型</label>
                <el-select v-model="step.rule_config.from_type" size="small" @change="onStepFieldChange">
                  <el-option v-for="t in ['text','int','float','decimal','date','boolean']" :key="t" :value="t" />
                </el-select>
              </div>
              <div class="config-field">
                <label>目标类型</label>
                <el-select v-model="step.rule_config.to_type" size="small" @change="onStepFieldChange">
                  <el-option v-for="t in ['int','float','decimal','text','date','boolean']" :key="t" :value="t" />
                </el-select>
              </div>
            </div>

            <!-- 枚举映射 -->
            <div v-if="step.rule_type === 'value_map'" class="config-section">
              <label>映射关系</label>
              <div v-for="(m, mi) in (step.rule_config.mappings || [])" :key="mi" class="map-row">
                <el-input v-model="m.from" size="small" placeholder="原值" @change="onStepFieldChange" />
                <span class="map-arrow">→</span>
                <el-input v-model="m.to" size="small" placeholder="新值" @change="onStepFieldChange" />
                <button class="config-remove" @click="removeMapRow(mi)">×</button>
              </div>
              <el-button size="small" text type="primary" @click="addMapRow">+ 添加映射</el-button>
            </div>

            <!-- 单位转换 -->
            <div v-if="step.rule_type === 'unit_convert'" class="config-row">
              <div class="config-field"><label>原单位</label><el-input v-model="step.rule_config.from_unit" size="small" placeholder="如：元" @change="onStepFieldChange" /></div>
              <div class="config-field"><label>目标单位</label><el-input v-model="step.rule_config.to_unit" size="small" placeholder="如：万元" @change="onStepFieldChange" /></div>
              <div class="config-field"><label>系数</label><el-input-number v-model="step.rule_config.factor" size="small" :min="0.0001" :step="1" @change="onStepFieldChange" /></div>
            </div>

            <!-- 拆分合并 -->
            <div v-if="step.rule_type === 'split_merge'" class="config-section">
              <label>分隔符</label>
              <el-input v-model="step.rule_config.separator" size="small" placeholder="如：," style="width:120px" @change="onStepFieldChange" />
              <label style="margin-top:8px">目标字段</label>
              <div v-for="(tf, ti) in (step.rule_config.target_fields || [])" :key="ti" class="map-row">
                <el-input v-model="step.rule_config.target_fields[ti]" size="small" placeholder="字段名" @change="onStepFieldChange" />
                <button class="config-remove" @click="removeSplitField(ti)">×</button>
              </div>
              <el-button size="small" text type="primary" @click="addSplitField">+ 添加目标字段</el-button>
            </div>

            <!-- 去重 -->
            <div v-if="step.rule_type === 'deduplicate'" class="config-section">
              <label>去重依据</label>
              <el-select v-model="step.rule_config.keys" multiple filterable placeholder="选择去重字段" size="small" @change="onStepFieldChange">
                <el-option v-for="f in tableFields" :key="f.column_code" :label="f.column_label || f.column_code" :value="f.column_code" />
              </el-select>
              <label style="margin-top:8px">保留策略</label>
              <el-select v-model="step.rule_config.strategy" size="small" @change="onStepFieldChange">
                <el-option label="保留第一条" value="first" /><el-option label="保留最后一条" value="last" />
              </el-select>
            </div>

            <!-- 空值处理 -->
            <div v-if="step.rule_type === 'null_handling'" class="config-section">
              <label>处理策略</label>
              <el-select v-model="step.rule_config.strategy" size="small" @change="onStepFieldChange">
                <el-option label="填充默认值" value="fill_default" /><el-option label="标记问题行" value="mark" />
                <el-option label="跳过（保留空值）" value="skip" /><el-option label="使用上游值" value="use_upstream" />
              </el-select>
              <div v-if="step.rule_config.strategy === 'fill_default'" class="config-field" style="margin-top:8px">
                <label>默认值</label><el-input v-model="step.rule_config.default_value" size="small" placeholder="默认值" @change="onStepFieldChange" />
              </div>
            </div>

            <!-- 格式标准化 -->
            <div v-if="step.rule_type === 'format_standardize'" class="config-section">
              <label>标准化类型</label>
              <el-select v-model="step.rule_config.format_type" size="small" @change="onStepFieldChange">
                <el-option label="日期格式" value="date" /><el-option label="编码格式" value="code" />
                <el-option label="大小写" value="case" /><el-option label="去空格" value="trim" />
                <el-option label="字段长度" value="truncate" />
              </el-select>
              <div v-if="step.rule_config.format_type === 'date'" class="config-row" style="margin-top:8px">
                <div class="config-field"><label>源格式</label><el-input v-model="step.rule_config.from_format" size="small" placeholder="yyyyMMdd" @change="onStepFieldChange" /></div>
                <div class="config-field"><label>目标格式</label><el-input v-model="step.rule_config.to_format" size="small" placeholder="yyyy-MM-dd" @change="onStepFieldChange" /></div>
              </div>
              <div v-if="step.rule_config.format_type === 'case'" class="config-field" style="margin-top:8px">
                <el-select v-model="step.rule_config.case_type" size="small" @change="onStepFieldChange">
                  <el-option label="大写" value="upper" /><el-option label="小写" value="lower" />
                </el-select>
              </div>
              <div v-if="step.rule_config.format_type === 'truncate'" class="config-field" style="margin-top:8px">
                <label>最大长度</label><el-input-number v-model="step.rule_config.max_length" size="small" :min="1" :max="10000" @change="onStepFieldChange" />
              </div>
            </div>

            <!-- 启用/禁用 -->
            <div style="margin-top:10px">
              <el-switch v-model="step.enabled" size="small" active-text="启用" @change="onStepFieldChange" />
            </div>
          </div>
        </div>

        <!-- 底部 + 添加步骤 -->
        <div class="flow-add-area">
          <div class="flow-connector"><div class="connector-line dashed"></div></div>
          <el-popover v-model:visible="showAddMenu" placement="bottom-start" :width="220" trigger="click">
            <template #reference>
              <button class="add-step-btn" :disabled="!selectedTable"><Plus /> 添加步骤</button>
            </template>
            <div class="add-step-menu">
              <button v-for="rt in STANDARDIZATION_RULE_TYPES" :key="rt" class="add-step-item" @click="addStep(rt)">
                <span class="add-step-icon">{{ ruleTypeIcon[rt] }}</span>
                {{ STANDARDIZATION_RULE_LABELS[rt] }}
              </button>
            </div>
          </el-popover>
        </div>
      </aside>
    </div>

    <!-- 空表 -->
    <div v-else class="recipe-empty">
      <div class="empty-illustration">📋</div>
      <h2>选择来源表开始</h2>
      <p>从已入仓的 ODS 表中选择一张表，开始构建数据加工配方</p>
    </div>

    <!-- 模板弹窗 -->
    <!-- 保存为模板弹窗 -->
    <el-dialog v-model="saveTplVisible" title="保存为模板" width="440px">
      <el-form label-width="80px" size="small">
        <el-form-item label="模板名称" required><el-input v-model="saveTplForm.name" placeholder="如：员工月薪标准化模板" maxlength="128" /></el-form-item>
        <el-form-item label="业务对象"><el-input v-model="saveTplForm.business_object" placeholder="如：员工表，留空则用来源表名" maxlength="64" /></el-form-item>
      </el-form>
      <div style="color:#909399;font-size:12px;margin-bottom:8px">当前 {{ steps.length }} 条规则将被保存为模板，后续可在其他表上加载复用。</div>
      <template #footer><el-button @click="saveTplVisible = false">取消</el-button><el-button type="primary" :loading="saveTplSaving" @click="doSaveTemplate">保存</el-button></template>
    </el-dialog>

    <el-dialog v-model="templateVisible" title="选择模板" width="500px">
      <el-table v-loading="templateLoading" :data="templates" size="small" border empty-text="暂无模板">
        <el-table-column prop="name" label="模板名称" min-width="140" />
        <el-table-column prop="business_object" label="业务对象" width="100" />
        <el-table-column label="规则数" width="70" align="center">
          <template #default="{ row }">{{ row.template_rules?.length || 0 }}</template>
        </el-table-column>
        <el-table-column label="版本" width="60" align="center" prop="version" />
        <el-table-column label="" width="80"><template #default="{ row }"><el-button text size="small" type="primary" @click="applyTemplate(row)">加载</el-button></template></el-table-column>
      </el-table>
    </el-dialog>
  </div>
</template>

<style scoped>
/* ===== 页面基底 ===== */
.recipe-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #f8f9fb;
}

/* ===== Zone 1: 顶部 ===== */
.recipe-header {
  padding: 20px 24px 0;
  flex-shrink: 0;
}
.header-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 24px;
}
.page-title {
  font-size: 20px;
  font-weight: 700;
  color: #1a1a2e;
  margin: 0;
  letter-spacing: -0.3px;
}
.source-selector, .target-input {
  display: flex;
  align-items: center;
  gap: 8px;
}
.source-selector label, .target-input label {
  font-size: 13px;
  color: #6b7280;
  white-space: nowrap;
}
.source-selector :deep(.el-select) { width: 240px; }
.target-input :deep(.el-input) { width: 200px; }
.header-actions { display: flex; gap: 8px; }

/* 工具栏按钮 */
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 12px 16px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
}
.tool-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: #fff;
  color: #374151;
  font-size: 13px;
  cursor: pointer;
  transition: all .15s;
  font-family: inherit;
}
.tool-btn:hover:not(:disabled) {
  border-color: #f59e0b;
  color: #d97706;
  background: #fffbeb;
}
.tool-btn:disabled { opacity: .4; cursor: not-allowed; }
.tool-btn-icon { font-size: 14px; font-weight: 700; color: #9ca3af; }
.tool-btn:hover:not(:disabled) .tool-btn-icon { color: #f59e0b; }
.tool-btn-label { white-space: nowrap; }

/* ===== 主体两栏 ===== */
.recipe-body {
  flex: 1;
  display: flex;
  gap: 0;
  min-height: 0;
  padding: 16px 24px 24px;
}

/* ===== Zone 2: 预览 ===== */
.preview-zone {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 16px;
  margin-right: 20px;
}
.preview-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.view-switch {
  display: flex;
  background: #f3f4f6;
  border-radius: 8px;
  padding: 3px;
}
.view-switch button {
  padding: 5px 14px;
  border: none;
  background: transparent;
  border-radius: 6px;
  font-size: 13px;
  color: #6b7280;
  cursor: pointer;
  transition: all .15s;
  font-family: inherit;
}
.view-switch button.active {
  background: #fff;
  color: #1a1a2e;
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0,0,0,.08);
}
.refresh-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #fff;
  color: #6b7280;
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
  transition: all .15s;
}
.refresh-btn:hover:not(:disabled) { border-color: #f59e0b; color: #d97706; }
.refresh-btn:disabled { opacity: .4; cursor: not-allowed; }

.preview-table-wrap {
  flex: 1;
  overflow: auto;
  min-height: 200px;
}
.data-table {
  width: 100%;
  font-size: 12px;
  border-collapse: collapse;
}
.data-table th {
  position: sticky;
  top: 0;
  background: #f9fafb;
  padding: 8px 10px;
  text-align: left;
  font-weight: 600;
  color: #374151;
  border-bottom: 2px solid #e5e7eb;
  white-space: nowrap;
  font-size: 12px;
}
.data-table td {
  padding: 7px 10px;
  border-bottom: 1px solid #f3f4f6;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #4b5563;
}
.data-table tr.odd td { background: #fafbfc; }
.data-table tr:hover td { background: #fef3c7; }
.preview-empty { display: flex; align-items: center; justify-content: center; height: 200px; color: #9ca3af; font-size: 14px; }

.exec-result { padding: 10px 16px; border-radius: 8px; font-size: 13px; }
.exec-result.ok { background: #ecfdf5; color: #065f46; }
.exec-result.warn { background: #fffbeb; color: #92400e; }

.bottom-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding-top: 8px;
  border-top: 1px solid #f3f4f6;
}

/* ===== Zone 3: 流程侧栏 ===== */
.flow-zone {
  width: 340px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: 0 4px;
}
.flow-title {
  font-size: 14px;
  font-weight: 700;
  color: #1a1a2e;
  margin: 0 0 16px 0;
  padding-left: 40px;
}

/* 来源表节点 */
.flow-source-node {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  position: relative;
}
.node-dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
  z-index: 1;
  transition: all .2s;
}
.node-dot.source { background: #f3f4f6; color: #6b7280; border: 2px solid #d1d5db; }
.node-dot.active { background: #f59e0b; color: #fff; border-color: #f59e0b; }
.node-dot.disabled { background: #f3f4f6; color: #9ca3af; border-color: #e5e7eb; }

.node-card {
  flex: 1;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 10px 14px;
  cursor: pointer;
  transition: all .15s;
}
.node-card.source { border-style: dashed; cursor: default; background: #fafbfc; }
.node-card:hover { border-color: #d1d5db; }
.node-card.source:hover { border-color: #e5e7eb; }
.node-label { font-size: 11px; color: #9ca3af; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 2px; }
.node-name { font-size: 14px; font-weight: 600; color: #1f2937; margin-bottom: 2px; }
.node-meta { font-size: 12px; color: #9ca3af; }

/* 连接线 */
.flow-step-group { position: relative; }
.flow-connector {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-left: 14px;
  width: 28px;
}
.connector-line {
  width: 2px;
  height: 14px;
  background: #d1d5db;
  transition: background .2s;
}
.connector-line.active { background: #f59e0b; }
.connector-line.dashed { border-left: 2px dashed #d1d5db; height: 14px; background: none; }
.connector-arrow { color: #9ca3af; font-size: 10px; margin-top: -2px; }

/* 步骤节点 */
.flow-node {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  position: relative;
}
.flow-node.expanded .node-card { border-color: #f59e0b; background: #fffdf7; }
.flow-node.dirty .node-card { border-color: #fbbf24; }
.node-header { display: flex; align-items: center; gap: 6px; margin-bottom: 3px; }
.node-type-icon { font-size: 21px; font-weight: 700; color: #d97706; line-height: 1; }
.node-type-label { font-size: 14px; font-weight: 600; color: #1f2937; }
.node-disabled-tag { font-size: 10px; padding: 2px 6px; border-radius: 4px; background: #f3f4f6; color: #9ca3af; margin-left: auto; }
.node-summary { font-size: 12px; color: #6b7280; padding-left: 27px; }
.node-actions {
  display: flex;
  gap: 2px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #f3f4f6;
}
.node-actions button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px; height: 28px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #fff;
  color: #6b7280;
  cursor: pointer;
  font-size: 14px;
  transition: all .15s;
}
.node-actions button:hover:not(:disabled) { border-color: #f59e0b; color: #d97706; }
.node-actions button:disabled { opacity: .3; cursor: not-allowed; }
.node-actions button.danger:hover { border-color: #ef4444; color: #ef4444; background: #fef2f2; }

/* 配置面板 */
.config-panel {
  margin: 8px 0 8px 38px;
  padding: 14px;
  background: #fafbfc;
  border: 1px solid #fde68a;
  border-radius: 8px;
}
.config-row { display: flex; gap: 10px; margin-bottom: 8px; }
.config-field { flex: 1; }
.config-field label, .config-section label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: .3px;
  margin-bottom: 4px;
}
.config-field :deep(.el-select), .config-field :deep(.el-input) { width: 100%; }
.config-section { margin-bottom: 8px; }
.config-section :deep(.el-select) { width: 100%; }
.map-row { display: flex; gap: 4px; align-items: center; margin-bottom: 4px; }
.map-row :deep(.el-input) { flex: 1; }
.map-arrow { color: #9ca3af; font-size: 14px; flex-shrink: 0; }
.config-remove {
  width: 24px; height: 24px; border: none; background: transparent; color: #9ca3af;
  cursor: pointer; font-size: 16px; border-radius: 4px; display: flex; align-items: center; justify-content: center;
}
.config-remove:hover { color: #ef4444; background: #fef2f2; }

/* 添加步骤按钮区 */
.flow-add-area {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding-top: 4px;
}
.add-step-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: 2px dashed #d1d5db;
  border-radius: 8px;
  background: transparent;
  color: #9ca3af;
  cursor: pointer;
  font-size: 13px;
  font-family: inherit;
  transition: all .15s;
}
.add-step-btn:hover:not(:disabled) { border-color: #f59e0b; color: #d97706; }
.add-step-btn:disabled { opacity: .4; cursor: not-allowed; }

/* 添加步骤菜单 */
.add-step-menu {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.add-step-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 6px;
  font-size: 13px;
  color: #374151;
  font-family: inherit;
  width: 100%;
  text-align: left;
}
.add-step-item:hover { background: #fffbeb; color: #d97706; }
.add-step-icon { font-weight: 700; color: #f59e0b; width: 20px; text-align: center; }

/* ===== 空态 ===== */
.recipe-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: #9ca3af;
}
.empty-illustration { font-size: 48px; }
.recipe-empty h2 { font-size: 18px; color: #6b7280; margin: 0; font-weight: 600; }
.recipe-empty p { font-size: 14px; margin: 0; }
</style>
