<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import { performanceTagFillQuestionApi } from '@/api/performance'
import AddOutlinedIcon from '@/components/performance/AddOutlinedIcon.vue'
import PerformanceListPage from '@/components/performance/PerformanceListPage.vue'
import PerformanceListToolbar from '@/components/performance/PerformanceListToolbar.vue'
import TagFillQuestionTable from '@/components/performance/TagFillQuestionTable.vue'
import type { TagFillQuestionRecord } from '@/components/performance/tagFillQuestionFixtures'

const router = useRouter()
const keyword = ref('')
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const loading = ref(false)
const questions = ref<TagFillQuestionRecord[]>([])

async function load() {
  loading.value = true
  try {
    const result = await performanceTagFillQuestionApi.list(keyword.value, page.value, pageSize.value)
    questions.value = result.items
    total.value = result.total
  } catch {
    questions.value = []
    total.value = 0
    ElMessage.error('标签型填写题加载失败')
  } finally {
    loading.value = false
  }
}

function create() {
  void router.push({ name: 'TaggedFillQuestionCreate' })
}

function edit(question: TagFillQuestionRecord) {
  void router.push({ name: 'TaggedFillQuestionEdit', params: { id: question.id }, query: { from: 'list' } })
}

async function remove(question: TagFillQuestionRecord) {
  try {
    await performanceTagFillQuestionApi.remove(question.id)
    ElMessage.success('已删除')
    if (questions.value.length === 1 && page.value > 1) page.value -= 1
    else await load()
  } catch {
    ElMessage.error('删除失败，请确认该题目未被绩效模板引用')
  }
}

watch([page, pageSize], () => { void load() })
onMounted(load)
</script>

<template>
  <PerformanceListPage title="标签型填写题">
    <PerformanceListToolbar
      v-model:keyword="keyword"
      @search="page = 1; load()"
      @clear="page = 1; load()"
      @filter="ElMessage.info('当前列表仅支持名称、描述和备注搜索')"
    >
      <template #left>
        <el-button type="primary" class="create-button" @click="create">
          <AddOutlinedIcon class="create-icon" aria-hidden="true" />新建
        </el-button>
      </template>
    </PerformanceListToolbar>
    <TagFillQuestionTable
      :questions="questions"
      :loading="loading"
      :page="page"
      :page-size="pageSize"
      :total="total"
      @page-change="page = $event"
      @page-size-change="pageSize = $event; page = 1"
      @edit="edit"
      @remove="remove"
    />
  </PerformanceListPage>
</template>

<style scoped>
.create-button { width: 80px; height: 32px; padding: 4px 11px; border-radius: 6px; font: 400 14px/22px inherit; }
.create-icon { width: 14px; height: 14px; margin-right: 4px; }
</style>
