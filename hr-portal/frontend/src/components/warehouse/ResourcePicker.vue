<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Search, Link, InfoFilled } from '@element-plus/icons-vue'
import { listUcpSystems, listUcpResources, isUcpConnected, UCP_DISABLED_TEXT } from '@/api/warehouse'
import type { UcpSystem, UcpResource } from '@/api/warehouse'

const props = defineProps<{
  modelValue?: { system_id: number | null; resource_id: number | null; resource_name?: string }
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: { system_id: number | null; resource_id: number | null; resource_name?: string }): void
}>()

// ==================== 状态 ====================

const visible = ref(false)
const loading = ref(false)
const systems = ref<UcpSystem[]>([])
const resources = ref<UcpResource[]>([])
const selectedSystemId = ref<number | undefined>(undefined)
const selectedResource = ref<UcpResource | null>(null)
const ucpAvailable = ref(true)
const keyword = ref('')

// ==================== 方法 ====================

async function loadSystems() {
  try {
    systems.value = await listUcpSystems()
    ucpAvailable.value = true
  } catch {
    ucpAvailable.value = false
    systems.value = []
  }
}

async function loadResources() {
  if (!ucpAvailable.value) return
  loading.value = true
  try {
    resources.value = await listUcpResources(selectedSystemId.value)
  } catch {
    resources.value = []
  } finally {
    loading.value = false
  }
}

function open() {
  visible.value = true
  selectedResource.value = null
  selectedSystemId.value = props.modelValue?.system_id ?? undefined
  loadSystems()
  if (ucpAvailable.value) {
    loadResources()
  }
}

function selectResource(r: UcpResource) {
  selectedResource.value = r
}

function confirm() {
  if (!selectedResource.value) {
    ElMessage.warning('请选择一个 UCP 资源')
    return
  }
  const r = selectedResource.value
  emit('update:modelValue', {
    system_id: r.system_id,
    resource_id: r.id,
    resource_name: r.name,
  })
  visible.value = false
}

function clear() {
  emit('update:modelValue', { system_id: null, resource_id: null, resource_name: undefined })
}

function onSystemChange() {
  loadResources()
}

const filteredResources = () => {
  if (!keyword.value) return resources.value
  const kw = keyword.value.toLowerCase()
  return resources.value.filter(r =>
    r.name.toLowerCase().includes(kw) ||
    r.resource_type.toLowerCase().includes(kw)
  )
}

onMounted(() => {
  loadSystems()
})
</script>

<template>
  <div class="resource-picker">
    <div v-if="props.modelValue?.resource_id" class="picked-resource">
      <el-tag type="success" size="small" effect="plain" closable @close="clear">
        <el-icon style="margin-right: 4px"><Link /></el-icon>
        {{ props.modelValue.resource_name || ('UCP 资源 #' + props.modelValue.resource_id) }}
      </el-tag>
    </div>
    <el-button size="small" @click="open" :disabled="!ucpAvailable">
      <el-icon><Link /></el-icon>
      {{ props.modelValue?.resource_id ? '更换' : '选择 UCP 资源' }}
    </el-button>
    <el-tooltip v-if="!ucpAvailable" :content="UCP_DISABLED_TEXT" placement="top">
      <el-icon style="margin-left: 4px; color: #909399"><InfoFilled /></el-icon>
    </el-tooltip>

    <!-- 选择器对话框 -->
    <el-dialog v-model="visible" title="选择数据连接资源" width="700px" destroy-on-close>
      <!-- UCP 未启用 -->
      <el-alert v-if="!ucpAvailable"
        :title="UCP_DISABLED_TEXT"
        type="info" show-icon :closable="false"
        description="数据连接平台当前未启用，无法关联 UCP 资源。"
        style="margin-bottom: 16px" />

      <template v-else>
        <!-- 筛选 -->
        <el-row :gutter="12" style="margin-bottom: 12px">
          <el-col :span="8">
            <el-select v-model="selectedSystemId" placeholder="系统筛选" clearable style="width: 100%"
              @change="onSystemChange">
              <el-option v-for="s in systems" :key="s.id" :label="s.name" :value="s.id" />
            </el-select>
          </el-col>
          <el-col :span="8">
            <el-input v-model="keyword" placeholder="搜索资源名称/类型" :prefix-icon="Search" clearable />
          </el-col>
        </el-row>

        <!-- 资源列表 -->
        <el-table :data="filteredResources()" size="small" stripe max-height="350" v-loading="loading"
          highlight-current-row @row-click="selectResource"
          :row-class-name="({ id }: UcpResource) => selectedResource?.id === id ? 'selected-row' : ''">
          <el-table-column label="系统" width="100">
            <template #default="{ row }">
              {{ systems.find(s => s.id === row.system_id)?.name || '-' }}
            </template>
          </el-table-column>
          <el-table-column prop="name" label="资源名称" min-width="140" />
          <el-table-column prop="resource_type" label="类型" width="80" />
          <el-table-column label="状态" width="80">
            <template #default="{ row }">
              <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small" effect="plain">
                {{ row.status }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="最近测试" width="100">
            <template #default="{ row }">
              <span style="font-size: 12px; color: #909399">{{ row.last_test_at || '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="70">
            <template #default>
              <el-button link size="small" type="primary">选择</el-button>
            </template>
          </el-table-column>
        </el-table>

        <el-empty v-if="!loading && resources.length === 0" description="暂无 UCP 资源" :image-size="80" />
      </template>

      <template #footer>
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" @click="confirm" :disabled="!ucpAvailable">确认选择</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.resource-picker { display: flex; align-items: center; gap: 8px; }
.picked-resource { display: flex; align-items: center; }
:deep(.selected-row) { background-color: #ecf5ff; }
</style>
