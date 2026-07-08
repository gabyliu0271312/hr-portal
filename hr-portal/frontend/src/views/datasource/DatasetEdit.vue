<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft, Check, Plus, Delete, Connection, InfoFilled } from '@element-plus/icons-vue'
import {
  datasetsApi,
  type DatasetItem,
  type DatasetPayload,
  type DatasetRelationItem,
  type DatasetTableItem,
  type JoinKey,
} from '@/api/datasets'
import { dataApi, type ColumnInfo } from '@/api/data'
import AclEditor, { type AclRow } from '@/components/AclEditor.vue'
import { SCOPE_STRATEGY_OPTIONS, type ScopeStrategy } from '@/constants/scopeStrategy'

const route = useRoute()
const router = useRouter()

const datasetId = computed(() => {
  const id = route.params.id as string
  return id === 'new' ? null : Number(id)
})
const isNew = computed(() => datasetId.value === null)

const form = reactive<{
  name: string
  description: string
  is_active: boolean
  scope_strategy: ScopeStrategy | null
  tables: DatasetTableItem[]
  relations: DatasetRelationItem[]
  acl: AclRow[]
}>({
  name: '',
  description: '',
  is_active: true,
  scope_strategy: null,
  tables: [],
  relations: [],
  acl: [],
})

const visibleTables = ref<{ table_name: string; label: string }[]>([])
const columnsByAlias = ref<Record<string, ColumnInfo[]>>({})
const saving = ref(false)
const integrityResult = ref<{ ok: boolean; issues: string[] } | null>(null)

const JOIN_TYPES = [
  { value: 'inner', label: 'INNER (内连接)' },
  { value: 'left', label: 'LEFT (左外，常用)' },
  { value: 'right', label: 'RIGHT (右外)' },
  { value: 'full', label: 'FULL (全外)' },
]

const CARDINALITIES = [
  { value: '1:1', label: '1:1（一对一）' },
  { value: '1:N', label: '1:N（左1右多）' },
  { value: 'N:1', label: 'N:1（左多右1）' },
]

const ALIAS_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

async function loadVisibleTables() {
  try {
    visibleTables.value = await datasetsApi.visibleTables()
  } catch {
    visibleTables.value = []
  }
}

async function loadDataset() {
  if (isNew.value) return
  try {
    const r = await datasetsApi.get(datasetId.value!)
    form.name = r.name
    form.description = r.description ?? ''
    form.is_active = r.is_active
    form.scope_strategy = r.scope_strategy
    form.acl = (r.acl || []).map((a) => ({ id: a.id, role_id: a.role_id, user_id: a.user_id }))
    form.tables = r.tables.map((t) => ({
      table_name: t.table_name,
      alias: t.alias,
      table_label: t.table_label,
    }))
    form.relations = r.relations.map((rel) => ({
      left_alias: rel.left_alias,
      right_alias: rel.right_alias,
      join_type: rel.join_type,
      cardinality: rel.cardinality || '1:1',
      keys: rel.keys.map((k) => ({ ...k })),
    }))
    await loadAliasColumns()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '加载失败')
  }
}

async function loadAliasColumns() {
  // 加载每个 alias 对应表的字段元数据，用于关联键下拉
  const next: Record<string, ColumnInfo[]> = {}
  for (const t of form.tables) {
    try {
      next[t.alias] = await dataApi.columns(t.table_name)
    } catch {
      next[t.alias] = []
    }
  }
  columnsByAlias.value = next
}

function addTable() {
  const first = visibleTables.value[0]
  if (!first) {
    ElMessage.warning('没有可用源表')
    return
  }
  form.tables.push({
    table_name: first.table_name,
    alias: nextAlias(first.table_name),
    table_label: first.label,
  })
  loadAliasColumns()
}

function removeTable(i: number) {
  const removed = form.tables[i]
  form.tables.splice(i, 1)
  // 删除该 alias 相关的所有 relation
  form.relations = form.relations.filter(
    (r) => r.left_alias !== removed.alias && r.right_alias !== removed.alias
  )
  delete columnsByAlias.value[removed.alias]
}

function onTableChange(t: DatasetTableItem) {
  t.table_label = visibleTableLabel(t.table_name)
  if (!t.alias || aliasDuplicate(t.alias, t)) {
    updateTableAlias(t, nextAlias(t.table_name))
  }
  loadAliasColumns()
}

function normalizeAlias(raw: string): string {
  let alias = (raw || '').trim().replace(/[^A-Za-z0-9_]/g, '_')
  if (!alias) alias = 't'
  if (/^[0-9]/.test(alias)) alias = `t_${alias}`
  return alias
}

function nextAlias(tableName: string): string {
  const base = normalizeAlias(tableName)
  const used = new Set(form.tables.map((t) => t.alias))
  if (!used.has(base)) return base
  let index = 2
  while (used.has(`${base}_${index}`)) index += 1
  return `${base}_${index}`
}

function aliasDuplicate(alias: string, current: DatasetTableItem): boolean {
  return form.tables.some((item) => item !== current && item.alias === alias)
}

function syncRelationAlias(oldAlias: string, newAlias: string) {
  if (!oldAlias || oldAlias === newAlias) return
  form.relations.forEach((r) => {
    if (r.left_alias === oldAlias) r.left_alias = newAlias
    if (r.right_alias === oldAlias) r.right_alias = newAlias
  })
}

function updateTableAlias(t: DatasetTableItem, alias: string) {
  const oldAlias = t.alias
  t.alias = alias
  syncRelationAlias(oldAlias, alias)
  if (oldAlias && oldAlias !== alias) {
    const oldColumns = columnsByAlias.value[oldAlias]
    if (oldColumns && !columnsByAlias.value[alias]) columnsByAlias.value[alias] = oldColumns
    delete columnsByAlias.value[oldAlias]
  }
}

function onAliasInput(t: DatasetTableItem, alias: string) {
  updateTableAlias(t, alias)
}

function onAliasChange(t: DatasetTableItem) {
  const alias = normalizeAlias(t.alias)
  if (!ALIAS_RE.test(alias)) {
    ElMessage.warning('别名请使用英文、数字、下划线，且不能以数字开头')
    updateTableAlias(t, nextAlias(t.table_name))
    loadAliasColumns()
    return
  }
  if (aliasDuplicate(alias, t)) {
    ElMessage.warning(`别名重复: ${alias}`)
    updateTableAlias(t, nextAlias(t.table_name))
    loadAliasColumns()
    return
  }
  updateTableAlias(t, alias)
  loadAliasColumns()
}

function addRelation() {
  if (form.tables.length < 2) {
    ElMessage.warning('请先添加至少 2 张数据表')
    return
  }
  form.relations.push({
    left_alias: form.tables[0].alias,
    right_alias: form.tables[1].alias,
    join_type: 'left',
    cardinality: '1:1',
    keys: [{ left: '', right: '' }],
  })
}

function removeRelation(i: number) {
  form.relations.splice(i, 1)
}

function addKey(rel: DatasetRelationItem) {
  rel.keys.push({ left: '', right: '' })
}

function removeKey(rel: DatasetRelationItem, ki: number) {
  rel.keys.splice(ki, 1)
}

function buildPayload(): DatasetPayload {
  return {
    name: form.name.trim(),
    description: form.description.trim() || null,
    is_active: form.is_active,
    scope_strategy: form.scope_strategy || null,
    tables: form.tables.map((t) => ({ table_name: t.table_name, alias: t.alias })),
    relations: form.relations.map((r) => ({
      left_alias: r.left_alias,
      right_alias: r.right_alias,
      join_type: r.join_type,
      cardinality: r.cardinality || '1:1',
      keys: r.keys.filter((k) => k.left && k.right),
    })),
    acl: form.acl
      .filter((a) => a.role_id != null || a.user_id != null)
      .map((a) => ({ role_id: a.role_id, user_id: a.user_id })),
  }
}

function visibleTableLabel(tableName: string): string {
  return visibleTables.value.find((t) => t.table_name === tableName)?.label || tableName
}

function tableDisplayName(t: DatasetTableItem): string {
  return t.table_label || visibleTableLabel(t.table_name)
}

function tableAliasOptionLabel(t: DatasetTableItem): string {
  return tableDisplayName(t)
}

async function save() {
  if (!form.name.trim()) {
    ElMessage.warning('请填写名称')
    return
  }
  if (form.tables.length === 0) {
    ElMessage.warning('至少添加一张数据表')
    return
  }
  const aliases = new Set<string>()
  for (const t of form.tables) {
    updateTableAlias(t, normalizeAlias(t.alias))
    if (!ALIAS_RE.test(t.alias || '')) {
      ElMessage.warning(`别名格式不合法: ${t.alias}`)
      return
    }
    if (aliases.has(t.alias)) {
      ElMessage.warning(`别名重复: ${t.alias}`)
      return
    }
    aliases.add(t.alias)
  }
  saving.value = true
  try {
    const payload = buildPayload()
    if (isNew.value) {
      const r = await datasetsApi.create(payload)
      ElMessage.success('已创建')
      router.replace(`/datasource/datasets/${r.id}`)
    } else {
      await datasetsApi.update(datasetId.value!, payload)
      ElMessage.success('已保存')
      await checkIntegrity()
    }
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '保存失败')
  } finally {
    saving.value = false
  }
}

async function checkIntegrity() {
  if (isNew.value) return
  try {
    integrityResult.value = await datasetsApi.integrity(datasetId.value!)
  } catch {
    integrityResult.value = null
  }
}

// P4-03: 输出字段配置
const outputFields = ref<{ id: number; output_code: string; output_label: string; agg_role: string; description: string | null; [k: string]: any }[]>([])

async function loadOutputFields() {
  if (isNew.value) return
  try {
    outputFields.value = await datasetsApi.outputFields(datasetId.value!)
  } catch { outputFields.value = [] }
}

async function updateField(row: any) {
  try {
    await datasetsApi.updateOutputField(datasetId.value!, row.id, {
      output_label: row.output_label,
      agg_role: row.agg_role,
      description: row.description,
    })
  } catch { /* ignore */ }
}

onMounted(async () => {
  await loadVisibleTables()
  if (!isNew.value) {
    await loadDataset()
    await checkIntegrity()
    await loadOutputFields()
  }
})
</script>

<template>
  <div style="padding: 24px">
    <el-card>
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center">
          <div>
            <el-button link @click="router.push('/datasource/datasets')">
              <el-icon><ArrowLeft /></el-icon>返回列表
            </el-button>
            <span style="font-size: 16px; font-weight: 600; margin-left: 8px">
              {{ isNew ? '新建数据集' : `编辑数据集 · ${form.name || '(未命名)'}` }}
            </span>
          </div>
          <el-button type="primary" :loading="saving" @click="save">
            <el-icon style="margin-right: 4px"><Check /></el-icon>保存
          </el-button>
        </div>
      </template>

      <el-alert
        v-if="integrityResult && !integrityResult.ok"
        type="warning"
        :closable="false"
        show-icon
        style="margin-bottom: 16px"
      >
        <strong>关联完整性检查未通过：</strong>
        <ul style="margin: 8px 0 0; padding-left: 20px">
          <li v-for="(iss, i) in integrityResult.issues" :key="i">{{ iss }}</li>
        </ul>
      </el-alert>

      <el-form label-position="top">
        <div class="section-title">基本信息</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px">
          <el-form-item label="数据集名称" required>
            <el-input v-model="form.name" maxlength="64" />
          </el-form-item>
          <el-form-item label="启用">
            <el-switch v-model="form.is_active" active-text="启用" inactive-text="停用" />
          </el-form-item>
        </div>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="2" maxlength="500" />
        </el-form-item>
        <el-form-item label="数据范围策略">
          <el-select v-model="form.scope_strategy" clearable style="width: 260px" placeholder="继承表默认">
            <el-option
              v-for="item in SCOPE_STRATEGY_OPTIONS"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>

        <div class="section-title">纳入的数据表（{{ form.tables.length }}）</div>
        <div v-for="(t, i) in form.tables" :key="i" class="rule-row">
          <el-select
            v-model="t.table_name"
            placeholder="选择源表"
            style="width: 260px"
            @change="() => onTableChange(t)"
          >
            <el-option v-for="vt in visibleTables" :key="vt.table_name" :label="vt.label" :value="vt.table_name" />
          </el-select>
          <el-input
            :model-value="t.alias"
            placeholder="别名，如 mgr / sub"
            style="width: 180px"
            @update:model-value="(v: string) => onAliasInput(t, v)"
            @change="() => onAliasChange(t)"
          />
          <span class="table-name-hint">{{ tableDisplayName(t) }}</span>
          <el-button link type="danger" @click="removeTable(i)">
            <el-icon><Delete /></el-icon>
          </el-button>
        </div>
        <el-button link type="primary" @click="addTable">
          <el-icon style="margin-right: 4px"><Plus /></el-icon>添加表
        </el-button>

        <div class="section-title">
          表间关联（{{ form.relations.length }}）
          <el-tooltip placement="right" effect="dark">
            <template #content>
              <div style="max-width: 360px; line-height: 1.7">
                <strong>连接方式</strong>（决定匹配不上的行是否保留，以左表为主表）：<br />
                • <strong>INNER 内连接</strong>：只保留两边都匹配上的行，对不上的整行丢弃<br />
                • <strong>LEFT 左外（常用）</strong>：左表全保留；右表没匹配则右侧字段为空<br />
                • <strong>RIGHT 右外</strong>：右表全保留；左表没匹配则左侧字段为空<br />
                • <strong>FULL 全外</strong>：两边都保留，缺的一侧为空<br />
                <br />
                <strong>基数</strong>（描述两表关系，供报表数值拆分用）：<br />
                • <strong>1:1</strong> 一对一　• <strong>1:N</strong> 左1右多　• <strong>N:1</strong> 左多右1
              </div>
            </template>
            <el-icon style="margin-left: 6px; cursor: help; color: var(--color-primary)"><InfoFilled /></el-icon>
          </el-tooltip>
        </div>
        <div v-for="(rel, i) in form.relations" :key="i" class="relation-block">
          <div class="relation-head">
            <el-icon><Connection /></el-icon>
            <el-select v-model="rel.left_alias" style="width: 160px">
              <el-option v-for="t in form.tables" :key="t.alias" :label="tableAliasOptionLabel(t)" :value="t.alias" />
            </el-select>
            <el-select v-model="rel.join_type" style="width: 200px">
              <el-option v-for="jt in JOIN_TYPES" :key="jt.value" :label="jt.label" :value="jt.value" />
            </el-select>
            <el-select v-model="rel.right_alias" style="width: 160px">
              <el-option v-for="t in form.tables" :key="t.alias" :label="tableAliasOptionLabel(t)" :value="t.alias" />
            </el-select>
            <el-select v-model="rel.cardinality" style="width: 150px" placeholder="基数">
              <el-option v-for="c in CARDINALITIES" :key="c.value" :label="c.label" :value="c.value" />
            </el-select>
            <el-button link type="danger" style="margin-left: auto" @click="removeRelation(i)">
              <el-icon><Delete /></el-icon>删除关联
            </el-button>
          </div>
          <div class="relation-keys">
            <div v-for="(k, ki) in rel.keys" :key="ki" class="key-row">
              <el-select v-model="k.left" placeholder="左字段" style="width: 200px" filterable>
                <el-option
                  v-for="c in columnsByAlias[rel.left_alias] || []"
                  :key="c.code"
                  :label="c.label"
                  :value="c.code"
                />
              </el-select>
              <span style="margin: 0 8px; color: var(--color-text-secondary)">=</span>
              <el-select v-model="k.right" placeholder="右字段" style="width: 200px" filterable>
                <el-option
                  v-for="c in columnsByAlias[rel.right_alias] || []"
                  :key="c.code"
                  :label="c.label"
                  :value="c.code"
                />
              </el-select>
              <el-button link type="danger" @click="removeKey(rel, ki)">
                <el-icon><Delete /></el-icon>
              </el-button>
            </div>
            <el-button link size="small" @click="addKey(rel)">
              <el-icon style="margin-right: 4px"><Plus /></el-icon>添加连接键
            </el-button>
          </div>
        </div>
        <el-button link type="primary" @click="addRelation">
          <el-icon style="margin-right: 4px"><Plus /></el-icon>添加关联
        </el-button>

        <div class="section-title">访问授权（谁能使用此数据集）</div>
        <AclEditor v-model="form.acl" />
      </el-form>
    </el-card>

    <!-- P4-03: 输出字段配置 -->
    <el-card v-if="!isNew && outputFields.length > 0" style="margin-top:16px">
      <template #header><span>输出字段配置（维度 / 度量）</span></template>
      <el-table :data="outputFields" size="small" style="width:100%">
        <el-table-column prop="output_code" label="字段编码" width="160" />
        <el-table-column prop="output_label" label="显示名称">
          <template #default="{ row }">
            <el-input v-model="row.output_label" size="small" @blur="updateField(row)" />
          </template>
        </el-table-column>
        <el-table-column prop="agg_role" label="角色" width="120">
          <template #default="{ row }">
            <el-select v-model="row.agg_role" size="small" @change="updateField(row)">
              <el-option label="维度" value="dimension" />
              <el-option label="度量" value="measure" />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column prop="description" label="描述">
          <template #default="{ row }">
            <el-input v-model="row.description" size="small" placeholder="口径说明" @blur="updateField(row)" />
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<style scoped>
.section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 24px 0 12px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--color-border-light);
}
.rule-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}
.table-name-hint {
  color: var(--color-text-secondary);
  font-size: 12px;
  min-width: 120px;
}
.relation-block {
  border: 1px solid var(--color-border-light);
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 12px;
  background: var(--color-bg-page);
}
.relation-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.relation-keys {
  padding-left: 28px;
}
.key-row {
  display: flex;
  align-items: center;
  margin-bottom: 6px;
}
</style>
