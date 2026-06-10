<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  QuestionFilled, Plus,
  List, Calendar, Money, Histogram, OfficeBuilding, Collection,
  TrendCharts, DataLine, Document, Grid, Cpu, Files, Coin,
} from '@element-plus/icons-vue'
import PermissionButton from '@/components/PermissionButton.vue'
import CreateTableDialog from '@/components/data/CreateTableDialog.vue'
import { adminTablesApi, type RegisteredTableOut } from '@/api/admin_tables'

const ICON_MAP: Record<string, any> = {
  List, Calendar, Money, Histogram, OfficeBuilding, Collection,
  TrendCharts, DataLine, Document, Grid, Cpu, Files, Coin,
}

const router = useRouter()
const tables = ref<RegisteredTableOut[]>([])
const loading = ref(false)
const createDialogRef = ref<InstanceType<typeof CreateTableDialog> | null>(null)

async function loadTables() {
  loading.value = true
  try {
    tables.value = await adminTablesApi.list()
  } catch {
    ElMessage.error('加载视图列表失败')
  } finally {
    loading.value = false
  }
}

function tableIcon(iconName: string) {
  return ICON_MAP[iconName] ?? Grid
}

function tablePath(t: RegisteredTableOut): string {
  return `/data/${t.table_name}`
}

function onCreated() {
  loadTables()
}

onMounted(loadTables)
</script>

<template>
  <div style="padding: 24px">
    <el-card>
      <template #header>
        <div style="display: flex; align-items: center; justify-content: space-between">
          <div style="display: flex; align-items: center; gap: 8px">
            <span style="font-size: 16px; font-weight: 600">数据视图</span>
            <el-tooltip placement="right" :show-after="100">
              <template #content>
                <div style="max-width: 280px; line-height: 1.8; font-size: 13px">
                  <div style="font-weight: 600; margin-bottom: 6px">报表拉取逻辑</div>
                  <div>· <b>有业务主键</b>：按主键 upsert，本次未出现的行直接删除</div>
                  <div>· <b>无业务主键</b>：退化为整行 hash，每次全量替换</div>
                  <div>· <b>月度表</b>：删除仅限当月，历史月份数据保留</div>
                  <div>· <b>空批次保护</b>：源端返回空时不做任何删除</div>
                  <div>· <b>跨表查找字段</b>（如费用类型）：每次拉取强制重算，映射表更新后重拉即可同步</div>
                </div>
              </template>
              <el-icon style="color: var(--color-text-placeholder); cursor: default; font-size: 15px">
                <QuestionFilled />
              </el-icon>
            </el-tooltip>
          </div>
          <PermissionButton menu="system.users" op="C" type="primary" @click="createDialogRef?.open()">
            <el-icon style="margin-right: 4px"><Plus /></el-icon>新建视图
          </PermissionButton>
        </div>
      </template>

      <p style="color: var(--color-text-secondary); margin: 0 0 20px 0; font-size: 13px">
        点击下方任一卡片查看对应数据表的全量字段、最新拉取时间与脱敏视图。
      </p>

      <div v-loading="loading" class="data-grid">
        <div
          v-for="t in tables"
          :key="t.table_name"
          class="data-card"
          @click="router.push(tablePath(t))"
        >
          <div class="data-card__icon">
            <el-icon :size="20"><component :is="tableIcon(t.icon)" /></el-icon>
          </div>
          <div class="data-card__title">
            {{ t.table_label }}
            <el-tag v-if="!t.is_builtin" size="small" type="success" effect="plain" style="margin-left: 6px">自定义</el-tag>
          </div>
          <div class="data-card__desc">
            {{ t.description || (t.is_period ? `月度表 · 期间字段：${t.period_col}` : '全量表') }}
          </div>
        </div>
      </div>
    </el-card>

    <CreateTableDialog
      ref="createDialogRef"
      :existing-table-names="tables.map((t) => t.table_name)"
      @done="onCreated"
    />
  </div>
</template>

<style scoped>
.data-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
}
.data-card {
  padding: 20px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
  background: var(--color-bg-card);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.data-card:hover {
  border-color: var(--color-primary);
  background: var(--color-primary-light);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(51, 112, 255, 0.08);
}
.data-card__icon {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: var(--color-primary-light);
  color: var(--color-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;
}
.data-card__title {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-primary);
  display: flex;
  align-items: center;
}
.data-card__desc {
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 1.5;
}
</style>
