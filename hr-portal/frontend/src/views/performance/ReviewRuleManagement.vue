<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { performanceReviewRuleApi } from '@/api/performance'
import AddOutlinedIcon from '@/components/performance/AddOutlinedIcon.vue'
import PerformanceListToolbar from '@/components/performance/PerformanceListToolbar.vue'
import ReviewRuleTable from '@/components/performance/ReviewRuleTable.vue'
import type { ReviewRule } from '@/components/performance/reviewRuleTypes'

const emit = defineEmits<{
  create: []
  filter: []
  edit: [rule: ReviewRule]
}>()

const keyword = ref('')
const loading = ref(false)
const rules = ref<ReviewRule[]>([])
const page = ref(1)
const pageSize = ref(10)

async function loadRules() {
  loading.value = true
  try {
    const items = await performanceReviewRuleApi.list()
    rules.value = items.map((item) => ({
      id: String(item.id),
      name: item.name,
      method: item.review_type === '评级' ? 'rating' : item.review_type === '评分' ? 'score' : 'score_mapping',
      creator: item.creator,
      createdAt: item.created_at,
      remark: item.remark,
      deletable: item.deletable,
      isUsed: item.is_used,
    }))
  } catch {
    rules.value = []
  } finally {
    loading.value = false
  }
}

async function removeRule(rule: ReviewRule) {
  try {
    await ElMessageBox.confirm(`确定删除「${rule.name}」吗？`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
    await performanceReviewRuleApi.remove(Number(rule.id))
    ElMessage.success('评估规则已删除')
    await loadRules()
  } catch (error: any) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(error?.response?.data?.detail?.message || '评估规则删除失败，请稍后重试')
  }
}

onMounted(() => { void loadRules() })
</script>

<template>
  <div class="review-rule-management">
    <PerformanceListToolbar v-model:keyword="keyword" @filter="emit('filter')">
      <template #left>
        <el-button type="primary" class="rule-create-button" @click="emit('create')">
          <AddOutlinedIcon class="rule-create-icon" /><span class="rule-create-label">新建</span></el-button>
      </template>
    </PerformanceListToolbar>

    <ReviewRuleTable
      :rules="rules"
      :loading="loading"
      :page="page"
      :page-size="pageSize"
      :total="rules.length"
      @edit="emit('edit', $event)"
      @remove="removeRule"
      @page-change="page = $event"
      @page-size-change="pageSize = $event"
    />
  </div>
</template>

<style scoped>
.rule-create-button {
  width: 80px;
  height: 32px;
  flex: none;
  box-sizing: border-box;
  padding: 4px 11px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 400;
  line-height: 22px;
}
.rule-create-icon {
  width: 14px;
  height: 14px;
  margin-right: 4px;
}
.rule-create-label {
  position: relative;
  top: 1px;
}
</style>
