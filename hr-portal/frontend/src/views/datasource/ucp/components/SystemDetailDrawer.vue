<template>
  <el-drawer
    v-model="visible"
    :title="title"
    size="520px"
    direction="rtl"
    :destroy-on-close="false"
  >
    <div v-if="systemInfo" class="sd-body">
      <div class="sd-section">
        <div class="sd-section-title">连接状态</div>
        <el-descriptions :column="2" border>
          <el-descriptions-item label="系统编码">{{ systemInfo.system_code }}</el-descriptions-item>
          <el-descriptions-item label="系统名称">{{ systemInfo.system_name }}</el-descriptions-item>
          <el-descriptions-item label="方向">
            <el-tag size="small" effect="plain">{{ directionLabel(systemInfo.direction) }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag size="small" :type="activeCount > 0 ? 'success' : 'warning'" effect="light">
              {{ activeCount > 0 ? '已启用' : '未启用' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="连接器数量" :span="2">
            {{ systemInfo.connector_count }} 个（启用 {{ systemInfo.active_count }}）
          </el-descriptions-item>
          <el-descriptions-item v-if="systemInfo.description" label="描述" :span="2">
            {{ systemInfo.description }}
          </el-descriptions-item>
        </el-descriptions>
      </div>

      <div class="sd-section">
        <div class="sd-section-title">快捷操作</div>
        <div class="sd-actions">
          <el-button @click="$emit('open-events')">
            <el-icon><Document /></el-icon>事件中心
            <el-badge
              v-if="stats.event_count_24h"
              :value="stats.event_count_24h"
              class="sd-badge"
            />
          </el-button>
          <el-button @click="$emit('open-pipelines')">
            <el-icon><Connection /></el-icon>流水线
            <el-badge
              v-if="stats.pipeline_count"
              :value="stats.pipeline_count"
              class="sd-badge"
            />
          </el-button>
        </div>
      </div>

      <div class="sd-section">
        <div class="sd-section-title">触发器（{{ stats.trigger_count || 0 }}）</div>
        <div class="sd-list" v-if="triggers.length">
          <div v-for="t in triggers" :key="t.id" class="sd-list-item">
            <div class="sd-list-main">
              <div class="sd-list-name">
                {{ t.trigger_name || t.trigger_code }}
                <el-tag size="small" :type="t.is_active ? 'success' : 'info'" effect="plain">
                  {{ t.is_active ? '启用' : '停用' }}
                </el-tag>
              </div>
              <div class="sd-list-meta">
                {{ t.event_type || t.source_system || '—' }}
              </div>
            </div>
          </div>
        </div>
        <el-empty v-else description="暂无触发器" :image-size="60" />
      </div>

      <div class="sd-section">
        <div class="sd-section-title">连接器（{{ systemInfo.connector_count }}）</div>
        <div class="sd-list" v-if="systemInfo.connectors?.length">
          <div
            v-for="c in systemInfo.connectors"
            :key="c.id"
            class="sd-list-item"
          >
            <div class="sd-list-main">
              <div class="sd-list-name">
                {{ c.system_name }} - {{ c.connector_type }}
                <el-tag size="small" :type="c.status === 1 ? 'success' : 'info'" effect="plain">
                  {{ c.status === 1 ? '已启用' : '已停用' }}
                </el-tag>
                <el-tag
                  v-if="c.test_status"
                  size="small"
                  :type="c.test_status === 'PASS' ? 'success' : c.test_status === 'FAIL' ? 'danger' : 'info'"
                  effect="plain"
                >
                  测试：{{ c.test_status }}
                </el-tag>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <el-empty v-else description="加载中…" />
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Connection, Document } from '@element-plus/icons-vue'
import { ucpApi } from '@/api/ucp'

const props = defineProps<{
  modelValue: boolean
  systemCode: string
  systemInfo: any
  stats: any
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'open-events'): void
  (e: 'open-pipelines'): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const title = computed(() =>
  props.systemInfo ? `系统详情 - ${props.systemInfo.system_name || props.systemInfo.system_code}` : '系统详情'
)

const activeCount = computed(() => props.systemInfo?.active_count || 0)

const triggers = ref<any[]>([])

watch(
  () => props.systemCode,
  async (code) => {
    if (!code) return
    try {
      const res = await ucpApi.listEventTriggers({ limit: 20 }).catch(() => ({ items: [] }))
      triggers.value = (res.items || []).filter((t: any) => t.source_system === code)
    } catch {
      triggers.value = []
    }
  },
  { immediate: true }
)

function directionLabel(d: string) {
  return { INBOUND: '入站', OUTBOUND: '出站', BIDIRECTIONAL: '双向' }[d] || d
}
</script>

<style scoped>
.sd-body {
  padding: 0 8px;
}
.sd-section {
  margin-bottom: 24px;
}
.sd-section-title {
  font-size: 13px;
  font-weight: 600;
  color: #1f2329;
  margin-bottom: 12px;
  padding-left: 8px;
  border-left: 3px solid #5b8ff9;
}
.sd-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.sd-actions .el-button {
  flex: 1;
  min-width: 140px;
}
.sd-badge {
  margin-left: 6px;
}
.sd-list {
  border: 1px solid #f0f1f3;
  border-radius: 6px;
  overflow: hidden;
}
.sd-list-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  border-bottom: 1px solid #f0f1f3;
}
.sd-list-item:last-child {
  border-bottom: none;
}
.sd-list-name {
  font-size: 13px;
  color: #1f2329;
  display: flex;
  align-items: center;
  gap: 6px;
}
.sd-list-meta {
  font-size: 12px;
  color: #8f959e;
  margin-top: 4px;
}
</style>
