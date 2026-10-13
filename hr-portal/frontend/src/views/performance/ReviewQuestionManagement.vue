<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { performanceReviewQuestionApi } from '@/api/performance'
import AddOutlinedIcon from '@/components/performance/AddOutlinedIcon.vue'
import PerformanceButton from '@/components/performance/PerformanceButton.vue'
import PerformanceListPage from '@/components/performance/PerformanceListPage.vue'
import PerformanceListToolbar from '@/components/performance/PerformanceListToolbar.vue'
import ReviewQuestionTable from '@/components/performance/ReviewQuestionTable.vue'
import ReviewRuleManagement from './ReviewRuleManagement.vue'
import type { ReviewQuestion } from '@/components/performance/reviewQuestionTypes'
import type { ReviewRule } from '@/components/performance/reviewRuleTypes'

type TabKey = 'question' | 'rule'

const route = useRoute()
const router = useRouter()
const activeTab = ref<TabKey>(route.query.tab === 'rule' ? 'rule' : 'question')
const keyword = ref('')
const loading = ref(false)
const questions = ref<ReviewQuestion[]>([])
const page = ref(1)
const pageSize = ref(10)


async function loadQuestions() {
  loading.value = true
  try {
    const items = await performanceReviewQuestionApi.list()
    questions.value = items.map((item) => ({
      id: String(item.id),
      name: item.name,
      type: item.type,
      creator: item.rule?.creator || '',
      createdAt: item.created_at,
      remark: item.remark,
      rule_id: item.rule_id,
      is_sub_question: item.is_sub_question,
      parent_question_id: item.parent_question_id,
      display_mode: item.display_mode,
    }))
  } catch {
    questions.value = []
  } finally {
    loading.value = false
  }
}

onMounted(() => { void loadQuestions() })

function selectTab(tab: TabKey) {
  activeTab.value = tab
  void router.replace({
    query: {
      ...route.query,
      tab: tab === 'rule' ? 'rule' : undefined,
    },
  })
}

function handleRuleCreate() {
  void router.push({ name: 'ReviewRuleCreate' })
}

function handleRuleEdit(rule: ReviewRule) {
  void router.push({
    name: 'ReviewRuleEdit',
    params: { id: rule.id },
    query: { name: rule.name },
  })
}

function handleCreate(command?: string) {
  if (command === 'create-sub') {
    void router.push({ name: 'ReviewQuestionCreate', query: { isSub: null } })
    return
  }
  void router.push({ name: 'ReviewQuestionCreate' })
}

function handleEdit(question: ReviewQuestion) {
  void router.push({ name: 'ReviewQuestionEdit', params: { id: question.id }, query: { name: question.name, type: question.type, remark: question.remark } })
}

function handleRemove(question: ReviewQuestion) {
  ElMessageBox.confirm(`确定删除「${question.name}」吗？`, '删除确认', {
    type: 'warning',
    confirmButtonText: '删除',
    cancelButtonText: '取消',
  })
    .then(() => {
      questions.value = questions.value.filter((item) => item.id !== question.id)
      ElMessage.success('已删除')
    })
    .catch(() => {})
}

</script>

<template>
  <PerformanceListPage title="评估题">
    <template #header>
      <div class="page-tabs">
        <span class="tab" :class="{ active: activeTab === 'question' }" @click="selectTab('question')">评估题</span>
        <span class="tab" :class="{ active: activeTab === 'rule' }" @click="selectTab('rule')">评估规则</span>
      </div>
    </template>

    <template v-if="activeTab === 'question'">
      <PerformanceListToolbar v-model:keyword="keyword">
        <template #left>
          <el-dropdown trigger="click" @command="handleCreate">
            <PerformanceButton variant="primary" class="create-button">
              <AddOutlinedIcon class="create-icon" /><span class="create-label">新建</span></PerformanceButton>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="create">新建评估题</el-dropdown-item>
                <el-dropdown-item command="create-sub">新建子评估题</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </template>
      </PerformanceListToolbar>

      <ReviewQuestionTable
        :questions="questions"
        :loading="loading"
        :page="page"
        :page-size="pageSize"
        :total="questions.length"
        @page-change="page = $event"
        @page-size-change="pageSize = $event"
        @edit="handleEdit"
        @remove="handleRemove"
      />
    </template>
    <ReviewRuleManagement v-else @create="handleRuleCreate" @edit="handleRuleEdit" />

  </PerformanceListPage>
</template>

<style scoped>
.page-tabs {
  display: flex;
  align-items: center;
  height: 48px;
  margin-top: -16px;
  margin-bottom: 12px;
  border-bottom: 1px solid rgba(31, 35, 41, 0.15);
}
.tab {
  position: relative;
  display: inline-flex;
  align-items: center;
  flex: none;
  height: 48px;
  margin-right: 28px;
  padding: 12px 0;
  box-sizing: border-box;
  font-size: 16px;
  font-weight: 400;
  line-height: 24px;
  color: rgba(0, 0, 0, 0.65);
  cursor: pointer;
}
.tab.active {
  font-weight: 600;
  color: rgb(20, 86, 240);
}
.tab.active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 3px;
  background: rgb(20, 86, 240);
  border-radius: 2px;
}
.create-button {
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
.create-icon {
  width: 14px;
  height: 14px;
  margin-right: 4px;
}
.create-label {
  position: relative;
  top: 1px;
}
</style>
