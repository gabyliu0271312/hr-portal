<template>
  <div class="systems-tab">
    <!-- 场景 2 优化：运维驾驶舱 + 风险前置 -->
    <div class="ops-overview">
      <el-alert
        type="warning"
        :closable="false"
        class="risk-alert"
        show-icon
      >
        <template #title>
          今日需处理：{{ credentialRiskCount }} 个凭证风险、{{ kpi.alertCount }} 条告警待确认
        </template>
        优先处理已过期 / 即将到期的生产凭证；建议为关键系统补齐备用凭证，避免流水线阻断。
      </el-alert>
      <div class="health-card">
        <div class="health-label">平台健康度</div>
        <div class="health-main"><span>{{ platformHealthScore }}</span><em>/100</em></div>
        <div class="health-sub">接入稳定性 · 凭证健康 · 告警综合评分</div>
      </div>
    </div>

    <div class="kpi-row kpi-row-optimized">
      <div class="kpi-card kpi-sys">
        <div class="kpi-label">接入系统</div>
        <div class="kpi-value">{{ kpi.systemCount }}</div>
        <div class="kpi-sub">{{ kpi.systemActiveCount }} 运行中 · {{ inactiveSystemCount }} 停用</div>
      </div>
      <div class="kpi-card kpi-res">
        <div class="kpi-label">数据资源</div>
        <div class="kpi-value">{{ kpi.resourceCount }}</div>
        <div class="kpi-sub">启用 {{ kpi.resourceActiveCount }} · 停用 {{ kpi.resourceInactiveCount }}</div>
      </div>
      <div class="kpi-card kpi-cred" :class="{ 'kpi-alert-warn': credentialRiskCount > 0 }">
        <div class="kpi-label">凭证健康</div>
        <div class="kpi-value">{{ credentialHealthText }}</div>
        <div class="kpi-sub">主 {{ kpi.credPrimaryCount }} · 备 {{ kpi.credBackupCount }} · 风险 {{ credentialRiskCount }}</div>
      </div>
      <div class="kpi-card kpi-pipeline">
        <div class="kpi-label">活跃流水线</div>
        <div class="kpi-value">14</div>
        <div class="kpi-sub">3 运行中 · 2 排队</div>
      </div>
      <div class="kpi-card kpi-sync">
        <div class="kpi-label">24h 同步次数</div>
        <div class="kpi-value">1,247</div>
        <div class="kpi-sub">↑ 8.2% 较昨日</div>
      </div>
      <div class="kpi-card kpi-alert" :class="{ 'kpi-alert-warn': kpi.alertCount > 0 }">
        <div class="kpi-label">失败率 / 告警</div>
        <div class="kpi-value">1.4%</div>
        <div class="kpi-sub">{{ kpi.alertCount }} 条告警 · ↓ 0.3%</div>
      </div>
    </div>

    <div class="toolbar optimized-toolbar">
      <el-input
        v-model="searchKw"
        placeholder="搜索系统 / 资源 / 凭证 / 负责人"
        clearable
        style="width: 260px"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
      <div class="filter-pills">
        <span class="filter-pill active">全部 {{ kpi.systemCount }}</span>
        <span class="filter-pill">健康 {{ healthySystemCount }}</span>
        <span class="filter-pill warn">凭证风险 {{ credentialRiskCount }}</span>
        <span class="filter-pill">同步失败 1</span>
        <span class="filter-pill">排序：风险优先 ▾</span>
      </div>
      <div class="toolbar-right">
        <el-button>批量导入</el-button>
        <el-button>连通性巡检</el-button>
        <el-button type="primary" @click="openAddSystemWizard({ mode: 'system' })">
          <el-icon><Plus /></el-icon>添加系统
        </el-button>
      </div>
    </div>

    <div v-if="loading" class="loading-state">
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>加载中…</span>
    </div>

    <div v-else class="system-grid">
      <SystemCard
        v-for="sys in filteredSystems"
        :key="sys.id"
        :system="sys"
        :resources="systemResources(sys.id)"
        :credentials="systemCredentialsOf(sys.id)"
        :health="systemHealth(sys)"
        @open="openSystem(sys)"
        @open-resource="(res: any) => openResource(sys, res)"
        @add-resource="addResource(sys)"
      />
    </div>

    <el-empty
      v-if="!loading && systems.length === 0"
      description="尚未接入任何系统，点击「添加系统」开始接入"
    />

    <!-- 系统详情抽屉 -->
    <el-drawer
      v-model="drawerOpen"
      :title="`${activeSystem?.system_name || ''} 详情`"
      size="540px"
      direction="rtl"
    >
      <div v-if="activeSystem" class="system-detail">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="系统编码">{{ activeSystem.system_code }}</el-descriptions-item>
          <el-descriptions-item label="系统名称">{{ activeSystem.system_name }}</el-descriptions-item>
          <el-descriptions-item label="系统类型">{{ activeSystem.system_type }}</el-descriptions-item>
          <el-descriptions-item label="负责人">{{ activeSystem.owner || '—' }}</el-descriptions-item>
          <el-descriptions-item label="说明">{{ activeSystem.description || '—' }}</el-descriptions-item>
          <el-descriptions-item label="资源数">{{ activeSystem.resource_count }}</el-descriptions-item>
        </el-descriptions>

        <el-divider>凭证管理 (1 系统可挂多套: 生产/测试/开发)</el-divider>
        <div v-if="systemCredentials.length === 0" class="text-muted">
          尚未配置凭证。点下方「补充凭证」开始。
        </div>
        <div v-else class="cred-list">
          <div v-for="c in systemCredentials" :key="c.id" class="cred-item">
            <el-icon><Key /></el-icon>
            <div class="cred-item-info">
              <div class="cred-item-name">
                {{ c.credential_name }}
                <el-tag v-if="c.is_primary" type="success" size="small">激活</el-tag>
                <el-tag v-else type="info" size="small">备用</el-tag>
                <el-tag v-if="c.env_tag" size="small">{{ c.env_tag }}</el-tag>
              </div>
              <div class="cred-item-meta">{{ c.auth_type }} · 验证于 {{ c.last_verified_at || '—' }}</div>
            </div>
            <el-button
              v-if="!c.is_primary"
              size="small"
              link
              type="primary"
              @click="setPrimaryCredential(c)"
            >
              设为激活
            </el-button>
          </div>
        </div>

        <el-divider>快捷操作</el-divider>
        <div class="quick-actions">
          <el-button @click="addResource(activeSystem)">+ 添加表/API</el-button>
          <el-button @click="openAddCredentialForSystem(activeSystem)">
            <el-icon><Key /></el-icon>补充凭证
          </el-button>
          <el-button @click="editSystem(activeSystem)">编辑系统</el-button>
          <el-button type="danger" @click="confirmDeleteSystem(activeSystem)">删除系统</el-button>
        </div>
      </div>
    </el-drawer>

    <!-- 资源详情/编辑抽屉 (Phase 5-4: schema 驱动字段渲染) -->
    <el-drawer
      v-model="resourceDrawerOpen"
      :title="activeResource ? `资源：${activeResource.resource_name}` : '资源详情'"
      size="560px"
      direction="rtl"
    >
      <div v-if="activeResource" class="resource-detail">
        <el-form :model="resourceEditForm" label-width="100px">
          <el-form-item label="资源编码">
            <el-input v-model="activeResource.resource_code" disabled />
          </el-form-item>
          <el-form-item label="资源名称">
            <el-input v-model="resourceEditForm.resource_name" />
          </el-form-item>
          <el-form-item label="适配器">
            <el-select
              v-model="resourceEditForm.adapter_code"
              filterable
              clearable
              allow-create
              placeholder="选择或输入 adapter_code"
              style="width: 100%"
              @change="onEditAdapterChange"
            >
              <el-option
                v-for="a in adapters"
                :key="a.adapter_code"
                :label="`${a.name} (${a.adapter_code})`"
                :value="a.adapter_code"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="凭证">
            <el-select v-model="resourceEditForm.credential_id" placeholder="选择凭证" clearable style="width: 100%">
              <el-option
                v-for="c in credentials"
                :key="c.id"
                :label="`${c.credential_name} (${c.auth_type})`"
                :value="c.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="状态">
            <el-radio-group v-model="resourceEditForm.status">
              <el-radio :value="0">未启用</el-radio>
              <el-radio :value="1">启用</el-radio>
              <el-radio :value="2">停用</el-radio>
            </el-radio-group>
          </el-form-item>

          <!-- Phase 5-4: schema 驱动的动态字段 (通用组件) -->
          <SchemaFormField
            v-if="editSchema"
            :schema="editSchema"
            v-model="editFormValues"
            title="配置（schema 驱动）"
            empty-text="当前 adapter 未注册 schema, 无扩展字段。"
          />
        </el-form>

        <!-- Phase 6-3: 反向引用 — 哪些流水线引用了此 resource (蓝本 v2 场景 6) -->
        <el-divider content-position="left">
          <span style="font-size: 13px; color: #1f2329">
            <el-icon><Connection /></el-icon> 被引用的流水线
            <el-tag v-if="usingPipelines" type="info" size="small" style="margin-left: 6px">
              {{ usingPipelines.total }}
            </el-tag>
          </span>
        </el-divider>
        <div v-if="usingPipelinesLoading" class="ref-loading">
          <el-icon class="is-loading"><Loading /></el-icon> 加载引用关系…
        </div>
        <el-empty
          v-else-if="usingPipelines && usingPipelines.total === 0"
          :image-size="60"
          description="暂无流水线引用此资源"
        />
        <div v-else-if="usingPipelines" class="ref-list">
          <div
            v-for="p in usingPipelines.items"
            :key="p.id"
            class="ref-item"
            @click="goToPipeline(p.id)"
          >
            <el-icon class="ref-icon"><Connection /></el-icon>
            <div class="ref-info">
              <div class="ref-name">
                {{ p.pipeline_name }}
                <span class="ref-code">({{ p.pipeline_code }})</span>
              </div>
              <div class="ref-meta">
                <el-tag size="small" :type="triggerTypeColor(p.trigger_type)">
                  {{ triggerTypeLabel(p.trigger_type) }}
                </el-tag>
                <el-tag size="small" :type="pipelineStatusColor(p.status)">
                  {{ pipelineStatusLabel(p.status) }}
                </el-tag>
                <span class="ref-steps">共 {{ p.step_count }} 步 · 命中 {{ p.hit_steps.length }}</span>
              </div>
            </div>
            <el-icon class="ref-arrow"><ArrowRight /></el-icon>
          </div>
        </div>

        <div class="drawer-footer">
          <el-button type="danger" @click="confirmDeleteResource">删除资源</el-button>
          <el-button type="primary" @click="saveResource">保存</el-button>
        </div>
      </div>
    </el-drawer>

    <!-- 添加系统对话框 (4 步向导: 系统信息 → 第一套凭证 → 第一个资源 → 测试与完成) -->
    <el-dialog
      v-model="showAddSystem"
      :title="wizardTitle"
      width="640px"
      :close-on-click-modal="false"
    >
      <!-- 步骤指示器 (蓝本 v2 4 步进度条) -->
      <div class="wizard-steps">
        <div v-for="(s, i) in wizardSteps" :key="i" class="wiz-step" :class="{ active: wizardStep === i + 1, done: wizardStep > i + 1 }">
          <span class="wiz-dot">{{ wizardStep > i + 1 ? '✓' : i + 1 }}</span>
          <span class="wiz-label">{{ s }}</span>
        </div>
      </div>

      <!-- Step 1: 系统信息 -->
      <template v-if="wizardStep === 1">
        <el-alert type="info" :closable="false" style="margin-bottom: 16px">
          业务系统 = 1 家公司或服务（北森 / 飞书 / 滴滴）。<br />
          凭证是「钥匙」，稍后录入；同一系统可挂多套凭证（生产 / 测试 / 备份）。
        </el-alert>
        <el-form :model="systemForm" label-width="100px">
          <el-form-item label="系统编码" required>
            <el-input v-model="systemForm.system_code" placeholder="如 BEISEN / FEISHU" />
          </el-form-item>
          <el-form-item label="系统名称" required>
            <el-input v-model="systemForm.system_name" placeholder="如 北森 / 飞书" />
          </el-form-item>
          <el-form-item label="系统类型">
            <el-select v-model="systemForm.system_type" placeholder="选择类型" style="width: 100%">
              <el-option label="HR SaaS" value="HR_SAAS" />
              <el-option label="OA" value="OA" />
              <el-option label="IM (即时通讯)" value="IM" />
              <el-option label="CAR (出行)" value="CAR" />
              <el-option label="自定义" value="CUSTOM" />
            </el-select>
          </el-form-item>
          <el-form-item label="负责人">
            <el-input v-model="systemForm.owner" placeholder="可选" />
          </el-form-item>
          <el-form-item label="说明">
            <el-input v-model="systemForm.description" type="textarea" :rows="2" />
          </el-form-item>
        </el-form>
      </template>

      <!-- Step 2: 第一套凭证 -->
      <template v-else-if="wizardStep === 2">
        <el-alert
          type="success"
          :closable="false"
          style="margin-bottom: 16px"
          :title="`系统「${systemForm.system_name}」已创建，现在录入第一套凭证`"
        />
        <el-form :model="credForm" label-width="100px">
          <el-form-item label="凭证编码" required>
            <el-input
              v-model="credForm.credential_code"
              :placeholder="`如 CRED-${(systemForm.system_code || 'SYS').toUpperCase()}-PROD`"
            />
          </el-form-item>
          <el-form-item label="凭证名称" required>
            <el-input v-model="credForm.credential_name" placeholder="如 北森生产凭证" />
          </el-form-item>
          <el-form-item label="环境">
            <el-select v-model="credForm.env_tag" placeholder="选环境" style="width: 100%">
              <el-option label="生产 (prod)" value="prod" />
              <el-option label="测试 (staging)" value="staging" />
              <el-option label="开发 (dev)" value="dev" />
              <el-option label="备份 (backup)" value="backup" />
            </el-select>
          </el-form-item>
          <el-form-item label="认证方式">
            <el-select v-model="credForm.auth_type" style="width: 100%">
              <el-option label="API Key" value="api_key" />
              <el-option label="Basic" value="basic" />
              <el-option label="OAuth2" value="oauth2" />
              <el-option label="Token" value="token" />
            </el-select>
          </el-form-item>
          <el-form-item label="密钥字段" required>
            <div v-for="field in currentCredFields" :key="field.key" class="cred-row">
              <el-input :model-value="field.label" disabled style="width: 160px" />
              <el-input
                v-model="credForm.secrets[field.key]"
                :type="showSecret ? 'text' : 'password'"
                :placeholder="`输入 ${field.label}`"
                style="flex: 1"
              />
            </div>
            <el-button size="small" link @click="showSecret = !showSecret">
              {{ showSecret ? '隐藏' : '显示' }}值
            </el-button>
          </el-form-item>
          <el-form-item label="说明">
            <el-input v-model="credForm.description" type="textarea" :rows="2" />
          </el-form-item>
        </el-form>
      </template>

      <!-- Step 3: 添加资源（可选，列表 + 添加按钮，蓝本 v2 场景 3） -->
      <template v-else-if="wizardStep === 3">
        <el-alert
          type="info"
          :closable="false"
          style="margin-bottom: 16px"
        >
          <template #title>
            建议先添加至少 1 个资源
          </template>
          资源对应外部系统的一张表或一个 API。系统添加完成后也可以在系统详情页补充资源。
        </el-alert>

        <div class="wizard-step3-head">
          <div class="wizard-step3-title">
            资源列表（{{ wizardResources.length }}）
          </div>
          <el-button type="primary" size="small" @click="addResourceFromWizard">
            <el-icon><Plus /></el-icon>添加资源
          </el-button>
        </div>

        <el-table
          v-if="wizardResources.length > 0"
          :data="wizardResources"
          stripe
          size="small"
          style="width: 100%"
          max-height="320"
        >
          <el-table-column prop="resource_name" label="资源名称" min-width="120" />
          <el-table-column label="适配器" min-width="100">
            <template #default="{ row }">
              <code v-if="row.adapter_code" style="font-size: 11px">{{ row.adapter_code }}</code>
              <span v-else class="text-muted">—</span>
            </template>
          </el-table-column>
          <el-table-column prop="resource_code" label="标识" min-width="120">
            <template #default="{ row }">
              <code style="color: var(--el-text-color-secondary); font-size: 11px">{{ row.resource_code }}</code>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag v-if="row.status === 1" type="success" size="small">启用</el-tag>
              <el-tag v-else-if="row.status === 2" type="info" size="small">停用</el-tag>
              <el-tag v-else type="warning" size="small">未启用</el-tag>
            </template>
          </el-table-column>
        </el-table>

        <el-empty
          v-else
          description="尚未添加资源（点击右上角「+ 添加资源」开始；或跳过此步,稍后到系统详情补加）"
          :image-size="80"
        />
      </template>

      <!-- Step 4: 配置检查 -->
      <template v-else>
        <el-alert
          type="info"
          :closable="false"
          style="margin-bottom: 16px"
          title="即将完成 — 检查摘要"
        />
        <el-descriptions :column="1" border>
          <el-descriptions-item label="系统">{{ systemForm.system_name }} ({{ systemForm.system_code }})</el-descriptions-item>
          <el-descriptions-item label="系统类型">{{ systemForm.system_type }}</el-descriptions-item>
          <el-descriptions-item label="凭证">{{ credForm.credential_name }} · {{ credForm.env_tag }} · {{ credForm.auth_type }}</el-descriptions-item>
          <el-descriptions-item label="资源">
            <span v-if="wizardResources.length > 0">已添加 {{ wizardResources.length }} 个</span>
            <span v-else class="text-muted">跳过（稍后添加）</span>
          </el-descriptions-item>
        </el-descriptions>
        <div class="finish-checklist">
          <div class="check-item"><el-icon class="ok"><CircleCheck /></el-icon>系统信息已录入</div>
          <div class="check-item"><el-icon class="ok"><CircleCheck /></el-icon>第一套凭证已绑定</div>
          <div class="check-item">
            <el-icon v-if="wizardResources.length > 0" class="ok"><CircleCheck /></el-icon>
            <el-icon v-else class="skip"><DocumentRemove /></el-icon>
            {{ wizardResources.length > 0 ? `已添加 ${wizardResources.length} 个资源` : '资源 — 跳过' }}
          </div>
        </div>
      </template>

      <template #footer>
        <!-- 上一步在左边（蓝本 v2 场景 3） -->
        <el-button v-if="wizardStep > 1" @click="wizardStep--">← 上一步</el-button>
        <el-button @click="cancelWizard">取消</el-button>
        <el-button
          v-if="wizardStep === 3"
          @click="wizardStep = 4"
        >
          跳过
        </el-button>
        <el-button
          v-if="wizardStep === 1"
          type="primary"
          :loading="submitting"
          @click="submitSystemStep1"
        >
          下一步
        </el-button>
        <el-button
          v-else-if="wizardStep === 2"
          type="primary"
          :loading="submitting"
          @click="submitSystemStep2"
        >
          下一步
        </el-button>
        <el-button
          v-else-if="wizardStep === 3"
          type="primary"
          :loading="submitting"
          @click="wizardStep = 4"
        >
          下一步 →
        </el-button>
        <el-button
          v-else
          type="primary"
          :loading="submitting"
          @click="finishWizardAll"
        >
          完成 — 启用
        </el-button>
      </template>
    </el-dialog>

    <!-- 添加资源对话框（在系统下加表）(Phase 5-4: schema 驱动) -->
    <el-dialog
      v-model="showAddResource"
      :title="`添加数据资源${addResourceSystem ? ' — ' + addResourceSystem.system_name : ''}`"
      width="640px"
      :close-on-click-modal="false"
    >
      <el-form :model="resourceForm" label-width="100px">
        <el-alert type="info" :closable="false" style="margin-bottom: 16px">
          一个系统可包含多个资源（员工表/组织表/职位表…），共用同一凭证。<br />
          <span style="color: #3b82f6">选择适配器后,下方配置项会自动按 schema 渲染。</span>
        </el-alert>
        <el-form-item label="资源编码" required>
          <el-input v-model="resourceForm.resource_code" placeholder="如 EMPLOYEE / ORG / POSITION" />
        </el-form-item>
        <el-form-item label="资源名称" required>
          <el-input v-model="resourceForm.resource_name" placeholder="如 员工表" />
        </el-form-item>
        <el-form-item label="适配器">
          <el-select
            v-model="resourceForm.adapter_code"
            filterable
            clearable
            allow-create
            placeholder="选择或输入 adapter_code"
            style="width: 100%"
            @change="onAddAdapterChange"
          >
            <el-option
              v-for="a in adapters"
              :key="a.adapter_code"
              :label="`${a.name} (${a.adapter_code})`"
              :value="a.adapter_code"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="凭证">
          <el-select
            v-model="resourceForm.credential_id"
            placeholder="选择凭证（仅显示当前系统下的凭证）"
            clearable
            style="width: 100%"
          >
            <el-option
              v-for="c in systemCredentialsOf(addResourceSystem?.id)"
              :key="c.id"
              :label="`${c.credential_name} (${c.env_tag}${c.is_primary ? ' · 主' : ''})`"
              :value="c.id"
            />
            <template v-if="systemCredentialsOf(addResourceSystem?.id).length === 0" #empty>
              <span style="color: #909399; padding: 8px 12px">该系统尚未配置凭证</span>
            </template>
          </el-select>
        </el-form-item>

        <!-- Phase 5-4: schema 驱动的动态字段 (通用组件) -->
        <SchemaFormField
          v-if="addSchema"
          :schema="addSchema"
          v-model="addFormValues"
          title="配置（schema 驱动）"
          empty-text="当前 adapter 未注册 schema, 跳过扩展配置。"
        />
      </el-form>
      <template #footer>
        <el-button @click="showAddResource = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitResource">创建</el-button>
      </template>
    </el-dialog>

  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  ArrowRight,
  CircleCheck,
  Connection,
  DocumentRemove,
  Key,
  Loading,
  Plus,
  Search,
} from '@element-plus/icons-vue'
import { ucpApi, monitorApi } from '@/api/ucp'
import SchemaFormField, { type SchemaCategory } from '../components/SchemaFormField.vue'
import SystemCard from '../components/SystemCard.vue'

const searchKw = ref('')
const loading = ref(false)
const submitting = ref(false)
const router = useRouter()

const systems = ref<any[]>([])
const resourcesMap = ref<Record<number, any[]>>({})
const credentials = ref<any[]>([])

// ── Phase 5-4: schema 驱动配置 ──
const adapters = ref<any[]>([])

// 抽屉（编辑已有资源）
const editSchema = ref<{ categories: any[] } | null>(null)
const editFormValues = ref<Record<string, Record<string, any>>>({})

// 添加资源对话框 / 向导 step 3 共享
const addSchema = ref<{ categories: any[] } | null>(null)
const addFormValues = ref<Record<string, Record<string, any>>>({})

// schema 字段类型判别与占位符已抽到 components/SchemaFormField.vue
// 这里仅保留: 8 个 category 落库映射 + formValues 重组


// 把 schema 摊平到一个嵌套结构 {category_key: {field_name: default}}
function initFormValuesFromSchema(cats: SchemaCategory[]): Record<string, Record<string, any>> {
  const out: Record<string, Record<string, any>> = {}
  for (const cat of cats) {
    out[cat.key] = {}
    for (const f of cat.fields) {
      out[cat.key][f.name] = f.default !== undefined ? f.default : ''
    }
  }
  return out
}

// 反向:把 formValues 还原成 {category_key: {field_name: value}} JSON
function flattenFormToJson(
  cats: SchemaCategory[],
  form: Record<string, Record<string, any>>
): Record<string, Record<string, any>> {
  const out: Record<string, Record<string, any>> = {}
  for (const cat of cats) {
    const inner: Record<string, any> = {}
    for (const f of cat.fields) {
      const v = form[cat.key]?.[f.name]
      // 跳过空值(可选字段未填)
      if (v === '' || v === null || v === undefined) continue
      inner[f.name] = v
    }
    if (Object.keys(inner).length > 0) out[cat.key] = inner
  }
  return out
}

// 把 schema 映射到 8 个 JSON 字段后端 key
const CATEGORY_TO_DB_FIELD: Record<string, string> = {
  protocol: 'protocol',
  report: 'report_config',
  mapping: 'mapping_config',
  file: 'file_config',
  scheduling: 'scheduling',
  notification: 'notification_config',
  retry: 'retry_config',
  circuit_breaker: 'circuit_breaker_config',
}

// 把扁平化的 category→fields 重组为 8 个 JSON 字段
function buildBackendJsonFields(
  payload: Record<string, Record<string, any>>
): Record<string, any> {
  const out: Record<string, any> = {}
  for (const [catKey, fields] of Object.entries(payload)) {
    const dbField = CATEGORY_TO_DB_FIELD[catKey] || `${catKey}_config`
    if (Object.keys(fields).length > 0) out[dbField] = fields
  }
  return out
}

async function loadAdapters() {
  try {
    const list = await (ucpApi as any).adapterRegistryList({ is_active: true, limit: 200 })
    adapters.value = list || []
  } catch (e) {
    console.warn('loadAdapters error', e)
    adapters.value = []
  }
}

async function loadAdapterSchema(code: string | null | undefined): Promise<SchemaCategory[]> {
  if (!code) return []
  try {
    const res = await (ucpApi as any).adapterSchema(code)
    return (res?.categories || []) as SchemaCategory[]
  } catch {
    return []
  }
}

async function onAddAdapterChange(code: string | null) {
  const cats = await loadAdapterSchema(code || null)
  addSchema.value = cats.length > 0 ? { categories: cats } : null
  addFormValues.value = initFormValuesFromSchema(cats)
}

async function onEditAdapterChange(code: string | null) {
  const cats = await loadAdapterSchema(code || null)
  editSchema.value = cats.length > 0 ? { categories: cats } : null
  editFormValues.value = initFormValuesFromSchema(cats)
  // 如果正在编辑的资源已有该 category 的 JSON 数据,反填到 form
  if (activeResource.value) {
    const r = activeResource.value
    const prefill = (key: string, dbField: string) => {
      if (cats.find((c) => c.key === key) && r[dbField]) {
        for (const [k, v] of Object.entries(r[dbField])) {
          if (k in editFormValues.value[key]) editFormValues.value[key][k] = v
        }
      }
    }
    prefill('protocol', 'protocol')
    prefill('report', 'report_config')
    prefill('mapping', 'mapping_config')
    prefill('file', 'file_config')
    prefill('scheduling', 'scheduling')
    prefill('notification', 'notification_config')
    prefill('retry', 'retry_config')
    prefill('circuit_breaker', 'circuit_breaker_config')
  }
}

// 系统详情抽屉
const drawerOpen = ref(false)
const activeSystem = ref<any>(null)
const systemCredentials = ref<any[]>([])

// 资源详情抽屉
const resourceDrawerOpen = ref(false)
const activeResource = ref<any>(null)
// Phase 6-3: 反向引用状态
const usingPipelines = ref<{ resource_id: number; total: number; items: any[] } | null>(null)
const usingPipelinesLoading = ref(false)
const resourceEditForm = ref<any>({})

// 添加系统向导
const showAddSystem = ref(false)
const wizardStep = ref(1)
const wizardSteps = ['系统信息', '第一套凭证', '添加资源', '配置检查']
const wizardTitle = computed(() => `添加业务系统 — 第 ${wizardStep.value}/4 步：${wizardSteps[wizardStep.value - 1]}`)
const pendingSystemId = ref<number | null>(null)
const pendingCredId = ref<number | null>(null)
const systemForm = ref({
  system_code: '',
  system_name: '',
  system_type: 'HR_SAAS',
  owner: '',
  description: '',
})

// 添加资源
const showAddResource = ref(false)
const addResourceSystem = ref<any>(null)
const resourceForm = ref<any>({
  resource_code: '',
  resource_name: '',
  adapter_code: '',
  credential_id: null,
})

// 凭证（向导第 2 步复用）
const showSecret = ref(false)
const credForm = ref<any>({
  credential_code: '',
  credential_name: '',
  auth_type: 'api_key',
  env_tag: 'prod',
  description: '',
  secrets: {} as Record<string, string>,
})

// 向导 Step 3: 资源列表（每加一个即时刷新；跳过则为空）
const wizardResources = ref<any[]>([])
// 标志位:当前 addResource 流程是否由向导 Step 3 触发
const addResourceFromWizardFlag = ref(false)

const AUTH_FIELDS: Record<string, { key: string; label: string }[]> = {
  api_key: [
    { key: 'app_id', label: 'app_id' },
    { key: 'app_secret', label: 'app_secret' },
  ],
  basic: [
    { key: 'username', label: 'username' },
    { key: 'password', label: 'password' },
  ],
  oauth2: [
    { key: 'client_id', label: 'client_id' },
    { key: 'client_secret', label: 'client_secret' },
    { key: 'authorize_url', label: 'authorize_url' },
    { key: 'token_url', label: 'token_url' },
  ],
  token: [{ key: 'token', label: 'token' }],
}

const currentCredFields = computed(() => AUTH_FIELDS[credForm.value.auth_type] || [])

watch(
  () => credForm.value.auth_type,
  (n, o) => {
    if (n !== o) credForm.value.secrets = {}
  }
)

const filteredSystems = computed(() => {
  const kw = searchKw.value.trim().toLowerCase()
  if (!kw) return systems.value
  return systems.value.filter(
    (s) =>
      (s.system_code || '').toLowerCase().includes(kw) ||
      (s.system_name || '').toLowerCase().includes(kw)
  )
})

/* ── KPI 卡片统计 ── */
const kpi = ref({
  systemCount: 0,
  systemActiveCount: 0,
  resourceCount: 0,
  resourceActiveCount: 0,
  resourceInactiveCount: 0,
  credCount: 0,
  credPrimaryCount: 0,
  credBackupCount: 0,
  alertCount: 0,
})

const inactiveSystemCount = computed(() => Math.max(0, kpi.value.systemCount - kpi.value.systemActiveCount))
const credentialRiskCount = computed(() => {
  const allCreds = Object.values(credentialsBySystem.value).flat()
  const missingCredSystems = systems.value.filter((s) => systemCredentialsOf(s.id).length === 0).length
  const syntheticExpiryRisks = allCreds.filter((c: any) => /expire|expired|过期|即将/i.test(`${c.status || ''} ${c.description || ''} ${c.credential_name || ''}`)).length
  return Math.max(syntheticExpiryRisks, missingCredSystems)
})
const credentialHealthText = computed(() => `${Math.max(0, kpi.value.credCount - credentialRiskCount.value)}/${kpi.value.credCount || 0}`)
const healthySystemCount = computed(() => systems.value.filter((s) => systemHealth(s) === 'ok').length)
const platformHealthScore = computed(() => Math.max(72, Math.min(99, 96 - credentialRiskCount.value * 3 - kpi.value.alertCount)))
function recomputeKpi() {
  kpi.value.systemCount = systems.value.length
  kpi.value.systemActiveCount = systems.value.filter((s) => s.is_active).length
  kpi.value.resourceCount = Object.values(resourcesMap.value).reduce(
    (a, list) => a + (list?.length || 0),
    0
  )
  const allRes = Object.values(resourcesMap.value).flat()
  kpi.value.resourceActiveCount = allRes.filter((r: any) => r.status === 1).length
  kpi.value.resourceInactiveCount = allRes.filter((r: any) => r.status === 2).length
  // 凭证统计
  const allCreds = Object.values(credentialsBySystem.value).flat()
  kpi.value.credCount = allCreds.length
  kpi.value.credPrimaryCount = allCreds.filter((c: any) => c.is_primary).length
  kpi.value.credBackupCount = kpi.value.credCount - kpi.value.credPrimaryCount
}

/* ── 系统健康状态色点 (蓝本 v2 借鉴) ── */
function systemHealth(sys: any): 'ok' | 'warn' | 'offline' | 'unconfigured' {
  const res = systemResources(sys.id)
  const creds = systemCredentialsOf(sys.id)
  if (res.length === 0) return 'unconfigured'
  if (creds.length === 0) return 'warn'
  if (!sys.is_active) return 'offline'
  return 'ok'
}
// 注: iconColor 迁至 SystemCard 组件 (按 system_type 哈希分配色块)

function systemResources(id: number) {
  return resourcesMap.value[id] || []
}

// 系统下凭证列表(从已经拉过的 systemDetail 中汇总)
const credentialsBySystem = ref<Record<number, any[]>>({})
function systemCredentialsOf(sysId: number) {
  return credentialsBySystem.value[sysId] || []
}

async function load() {
  loading.value = true
  try {
    const sysRes = await ucpApi.systems()
    systems.value = sysRes.items || []

    // 并行拉所有系统的资源 + 凭证
    const resourcePromises = systems.value.map((s) => ucpApi.resources({ system_id: s.id }).catch(() => ({ items: [] })))
    const credPromises = systems.value.map((s) => ucpApi.systemDetail(s.id).catch(() => ({ credentials: [] })))
    const [resourceResults, credResults] = await Promise.all([
      Promise.all(resourcePromises),
      Promise.all(credPromises),
    ])
    const rMap: Record<number, any[]> = {}
    const cMap: Record<number, any[]> = {}
    systems.value.forEach((s, i) => {
      rMap[s.id] = resourceResults[i]?.items || []
      cMap[s.id] = credResults[i]?.credentials || []
    })
    resourcesMap.value = rMap
    credentialsBySystem.value = cMap

    // 凭证全量列表(供下拉)
    const credRes = await ucpApi.credentials().catch(() => ({ items: [] }))
    credentials.value = credRes.items || []
    recomputeKpi()
    // 告警 (蓝本 KPI 第 4 卡)
    try {
      const alerts = await monitorApi.alerts(50)
      kpi.value.alertCount = alerts.length
    } catch {
      kpi.value.alertCount = 0
    }
  } catch (e) {
    console.error('load systems error', e)
    ElMessage.error('加载系统列表失败')
  } finally {
    loading.value = false
  }
}

async function openSystem(sys: any) {
  activeSystem.value = sys
  systemCredentials.value = []
  // 拉详情（含凭证）
  try {
    const detail = await ucpApi.systemDetail(sys.id)
    systemCredentials.value = detail.credentials || []
    // 同步资源（防止遗漏）
    resourcesMap.value[sys.id] = detail.resources || []
  } catch (e) {
    console.error(e)
  }
  drawerOpen.value = true
}

async function openResource(sys: any, res: any) {
  activeResource.value = res
  resourceEditForm.value = {
    resource_name: res.resource_name,
    adapter_code: res.adapter_code,
    credential_id: res.credential_id,
    status: res.status,
  }
  // 触发 schema 加载并反填历史值
  await onEditAdapterChange(res.adapter_code)
  resourceDrawerOpen.value = true
  // Phase 6-3: 反向引用 — 拉取引用此 resource 的流水线
  loadUsingPipelines(res.id)
}

async function loadUsingPipelines(resourceId: number) {
  usingPipelinesLoading.value = true
  usingPipelines.value = null
  try {
    usingPipelines.value = await ucpApi.pipelinesUsingResource(resourceId)
  } catch (e) {
    console.warn('loadUsingPipelines error', e)
    usingPipelines.value = { resource_id: resourceId, total: 0, items: [] }
  } finally {
    usingPipelinesLoading.value = false
  }
}

function triggerTypeColor(t: string): 'primary' | 'success' | 'warning' | 'info' {
  if (t === 'SCHEDULED') return 'primary'
  if (t === 'EVENT') return 'warning'
  if (t === 'MANUAL') return 'success'
  return 'info'
}
function triggerTypeLabel(t: string): string {
  return { SCHEDULED: '定时', EVENT: '事件', MANUAL: '手动' }[t] || t
}
function pipelineStatusColor(s: number): 'success' | 'info' | 'warning' {
  if (s === 1) return 'success'
  if (s === 2) return 'info'
  return 'warning'
}
function pipelineStatusLabel(s: number): string {
  return { 0: '未启用', 1: '启用', 2: '停用' }[s] || '未知'
}
function goToPipeline(pipelineId: number) {
  resourceDrawerOpen.value = false
  router.push({ name: 'UcpPipelineDesigner', query: { pipelineId } })
}

async function addResource(sys: any) {
  addResourceSystem.value = sys
  resourceForm.value = {
    resource_code: '',
    resource_name: '',
    adapter_code: '',
    // 向导 Step 3 触发时,默认凭证 = 刚创建的 pendingCredId
    credential_id: addResourceFromWizardFlag.value && pendingCredId.value ? pendingCredId.value : null,
  }
  // 清空 schema
  addSchema.value = null
  addFormValues.value = {}
  // 默认带出该系统已用的凭证
  try {
    const r = await ucpApi.systemDefaultCredential(sys.id)
    if (r.credential_id) resourceForm.value.credential_id = r.credential_id
  } catch {}
  showAddResource.value = true
}

function editSystem(sys: any) {
  ElMessage.info('编辑系统：TODO')
}

async function confirmDeleteSystem(sys: any) {
  try {
    await ElMessageBox.confirm(
      `确定删除系统「${sys.system_name}」？该操作会级联删除其下所有资源。`,
      '删除确认',
      { type: 'warning' }
    )
  } catch {
    return
  }
  try {
    await ucpApi.deleteSystem(sys.id)
    ElMessage.success('已删除')
    drawerOpen.value = false
    await load()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '删除失败')
  }
}

async function saveResource() {
  if (!activeResource.value) return
  try {
    // Phase 5-4: 按 schema 把 formValues 重组到 8 个 JSON 字段
    const cats = (editSchema.value?.categories || []) as SchemaCategory[]
    const payload = flattenFormToJson(cats, editFormValues.value)
    const jsonFields = buildBackendJsonFields(payload)
    const body: any = {
      resource_name: resourceEditForm.value.resource_name,
      credential_id: resourceEditForm.value.credential_id,
      status: resourceEditForm.value.status,
      ...jsonFields,
    }
    // adapter_code 允许空(用 sendUndefined)——后端不传则不动
    if (resourceEditForm.value.adapter_code) {
      body.adapter_code = resourceEditForm.value.adapter_code
    }
    await ucpApi.updateResource(activeResource.value.id, body)
    ElMessage.success('已保存')
    resourceDrawerOpen.value = false
    await load()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '保存失败')
  }
}

async function confirmDeleteResource() {
  if (!activeResource.value) return
  try {
    await ElMessageBox.confirm(
      `确定删除资源「${activeResource.value.resource_name}」？`,
      '删除确认',
      { type: 'warning' }
    )
  } catch {
    return
  }
  try {
    await ucpApi.deleteResource(activeResource.value.id)
    ElMessage.success('已删除')
    resourceDrawerOpen.value = false
    await load()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '删除失败')
  }
}

// ── 添加系统 向导 ──
function openAddSystemWizard(opts: { mode?: 'system' | 'credOnly'; system?: any } = {}) {
  if (opts.mode === 'credOnly' && opts.system) {
    openAddCredentialForSystem(opts.system)
    return
  }
  systemForm.value = { system_code: '', system_name: '', system_type: 'HR_SAAS', owner: '', description: '' }
  credForm.value = {
    credential_code: '',
    credential_name: '',
    auth_type: 'api_key',
    env_tag: 'prod',
    description: '',
    secrets: {} as Record<string, string>,
  }
  pendingSystemId.value = null
  wizardStep.value = 1
  showAddSystem.value = true
}

// ── 给已存在系统补充凭证 ──
function openAddCredentialForSystem(sys: any) {
  pendingSystemId.value = sys.id
  systemForm.value = {
    system_code: sys.system_code,
    system_name: sys.system_name,
    system_type: sys.system_type || 'HR_SAAS',
    owner: sys.owner || '',
    description: sys.description || '',
  }
  // 自动选下一个未用的 env_tag
  const used = new Set((systemCredentials.value || []).map((c: any) => c.env_tag))
  const next = ['prod', 'staging', 'dev', 'backup'].find((t) => !used.has(t)) || 'prod'
  credForm.value = {
    credential_code: `CRED-${sys.system_code}-${next.toUpperCase()}`,
    credential_name: `${sys.system_name} (${next})`,
    auth_type: 'api_key',
    env_tag: next,
    description: '',
    secrets: {} as Record<string, string>,
  }
  showSecret.value = false
  wizardStep.value = 2
  showAddSystem.value = true
}

async function setPrimaryCredential(c: any) {
  try {
    await ucpApi.updateCredential(c.id, { is_primary: true })
    ElMessage.success(`「${c.credential_name}」已设为激活凭证`)
    await load()
    // 刷新抽屉
    if (activeSystem.value) {
      const detail = await ucpApi.systemDetail(activeSystem.value.id)
      systemCredentials.value = detail.credentials || []
    }
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '设置失败')
  }
}

function cancelWizard() {
  showAddSystem.value = false
  wizardStep.value = 1
  pendingSystemId.value = null
  pendingCredId.value = null
  showSecret.value = false
  addFormValues.value = {}
  addSchema.value = null
}

async function submitSystemStep1() {
  if (!systemForm.value.system_code || !systemForm.value.system_name) {
    ElMessage.warning('请填写系统编码和名称')
    return
  }
  submitting.value = true
  try {
    const r = await ucpApi.createSystem(systemForm.value)
    pendingSystemId.value = r.id
    ElMessage.success(`系统「${systemForm.value.system_name}」已创建`)
    wizardStep.value = 2
    // 预填凭证编码
    if (!credForm.value.credential_code) {
      credForm.value.credential_code = `CRED-${(systemForm.value.system_code || 'SYS').toUpperCase()}-${(credForm.value.env_tag || 'PROD').toUpperCase()}`
    }
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '创建系统失败')
  } finally {
    submitting.value = false
  }
}

async function submitSystemStep2() {
  if (!pendingSystemId.value) return
  if (!credForm.value.credential_code || !credForm.value.credential_name) {
    ElMessage.warning('请填写凭证编码和名称')
    return
  }
  const required = currentCredFields.value
  const missing = required.filter((f) => !credForm.value.secrets[f.key]?.trim())
  if (missing.length > 0) {
    ElMessage.warning(`请填写所有密钥字段：${missing.map((f) => f.label).join(' / ')}`)
    return
  }
  submitting.value = true
  try {
    const r = await ucpApi.createCredential({
      credential_code: credForm.value.credential_code,
      credential_name: credForm.value.credential_name,
      auth_type: credForm.value.auth_type || undefined,
      description: credForm.value.description || undefined,
      system_id: pendingSystemId.value,
      env_tag: credForm.value.env_tag || undefined,
      is_primary: true,
      secrets: credForm.value.secrets,
    })
    pendingCredId.value = r.id
    ElMessage.success('凭证已创建并绑定到系统')
    // 预填资源 form 凭证
    resourceForm.value.credential_id = r.id
    // 进入 Step 3: 加载该系统下的资源列表
    await loadWizardResources()
    wizardStep.value = 3
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '创建凭证失败')
  } finally {
    submitting.value = false
  }
}

// Step 3: 资源已通过"添加资源"按钮即时加入 wizardResources。
// 这里只做"下一步"按钮的兜底提交（资源为空时直接进 Step 4）；
// 若列表非空,说明用户已通过对话框完成创建,直接到 Step 4。
async function submitSystemStep3() {
  wizardStep.value = 4
}

// 拉取新建系统下的资源列表(Step 3 展示)
async function loadWizardResources() {
  if (!pendingSystemId.value) {
    wizardResources.value = []
    return
  }
  try {
    const detail = await ucpApi.systemDetail(pendingSystemId.value)
    wizardResources.value = (detail as any)?.resources || []
  } catch {
    wizardResources.value = []
  }
}

// Step 3 顶部"添加资源"按钮:复用 addResource 流程,但把 addResourceSystem 设为待接入系统
async function addResourceFromWizard() {
  if (!pendingSystemId.value) return
  addResourceFromWizardFlag.value = true
  // 构造一个"伪 system 对象"喂给 addResource(),只用到 sys.id
  const sysStub = { id: pendingSystemId.value, system_name: systemForm.value.system_name }
  await addResource(sysStub)
}

function finishWizardAll() {
  showAddSystem.value = false
  wizardStep.value = 1
  pendingSystemId.value = null
  pendingCredId.value = null
  showSecret.value = false
  addFormValues.value = {}
  addSchema.value = null
  ElMessage.success(`系统「${systemForm.value.system_name}」接入完成`)
  load()
}

function finishWizardSkipCred() {
  showAddSystem.value = false
  wizardStep.value = 1
  pendingSystemId.value = null
  showSecret.value = false
  ElMessage.info('系统已创建，可在系统详情中补充凭证')
  load()
}

async function submitResource() {
  if (!addResourceSystem.value) return
  if (!resourceForm.value.resource_code || !resourceForm.value.resource_name) {
    ElMessage.warning('请填写资源编码和名称')
    return
  }
  submitting.value = true
  try {
    // Phase 5-4: 按 schema 重组 8 个 JSON 字段
    const cats = (addSchema.value?.categories || []) as SchemaCategory[]
    const payload = flattenFormToJson(cats, addFormValues.value)
    const jsonFields = buildBackendJsonFields(payload)
    await ucpApi.createResource({
      system_id: addResourceSystem.value.id,
      resource_code: resourceForm.value.resource_code,
      resource_name: resourceForm.value.resource_name,
      adapter_code: resourceForm.value.adapter_code || undefined,
      credential_id: resourceForm.value.credential_id || undefined,
      ...jsonFields,
    })
    ElMessage.success('资源已创建')
    showAddResource.value = false
    addFormValues.value = {}
    addSchema.value = null
    // 向导内调用 → 局部刷新 Step 3 列表；否则刷新整页
    if (addResourceFromWizardFlag.value) {
      await loadWizardResources()
      addResourceFromWizardFlag.value = false
    } else {
      await load()
    }
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '创建失败')
  } finally {
    submitting.value = false
  }
}

// 加载 adapter 列表
onMounted(async () => {
  await loadAdapters()
  await load()
})
</script>

<style scoped>
/* ── KPI 卡片横排 (蓝本 v2) ── */
.kpi-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 20px;
}
.kpi-card {
  background: #fff;
  border-radius: 8px;
  padding: 16px 20px;
  border: 1px solid #e5e6eb;
  border-left: 3px solid #c9cdd4;
  transition: all 0.15s;
}
.kpi-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
.kpi-sys { border-left-color: #3b82f6; }
.kpi-res { border-left-color: #10b981; }
.kpi-cred { border-left-color: #8b5cf6; }
.kpi-alert { border-left-color: #6b7280; }
.kpi-alert-warn { border-left-color: #f59e0b; background: #fffbeb; }
.kpi-label { font-size: 12px; color: #8f959e; margin-bottom: 4px; }
.kpi-value { font-size: 24px; font-weight: 600; color: #1f2329; line-height: 1.2; }
.kpi-sub { font-size: 11px; color: #8f959e; margin-top: 4px; }

/* ── 系统健康状态色点 ── */
.health-dot {
  display: inline-block;
  width: 8px; height: 8px;
  border-radius: 50%;
  margin-right: 6px;
  vertical-align: middle;
}
.health-ok { background: #10b981; box-shadow: 0 0 0 2px rgba(16,185,129,0.15); }
.health-warn { background: #f59e0b; box-shadow: 0 0 0 2px rgba(245,158,11,0.15); }
.health-offline { background: #9ca3af; }
.health-unconfigured { background: #d1d5db; }

/* ── 4 步向导进度条 (蓝本 v2 场景 3 借鉴) ── */
.wizard-steps {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
  padding: 0 20px;
}
.wiz-step {
  display: flex;
  align-items: center;
  flex: 1;
  position: relative;
  color: #c9cdd4;
  font-size: 13px;
}
.wiz-step:not(:last-child)::after {
  content: '';
  flex: 1;
  height: 2px;
  background: #e5e6eb;
  margin: 0 12px;
}
.wiz-step.done:not(:last-child)::after { background: #3b82f6; }
.wiz-dot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px; height: 26px;
  border-radius: 50%;
  background: #e5e6eb;
  color: #8f959e;
  font-size: 12px;
  font-weight: 600;
  margin-right: 8px;
  flex-shrink: 0;
}
.wiz-step.active .wiz-dot { background: #3b82f6; color: #fff; }
.wiz-step.active { color: #1f2329; font-weight: 500; }
.wiz-step.done .wiz-dot { background: #10b981; color: #fff; }
.wiz-step.done { color: #10b981; }

/* Step 3 资源列表区头 (蓝本 v2 场景 3) */
.wizard-step3-head {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 10px;
}
.wizard-step3-title {
  font-size: 12.5px; font-weight: 500; color: #1f2329;
}

.finish-checklist {
  margin-top: 16px;
  padding: 12px 16px;
  background: #f7f8fa;
  border-radius: 6px;
}
.check-item {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 0;
  font-size: 13px; color: #1f2329;
}
.check-item .ok { color: #10b981; }
.check-item .skip { color: #8f959e; }

.systems-tab .toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}
.systems-tab .toolbar-right { display: flex; gap: 8px; }
.systems-tab .loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 60px 0;
  color: #8f959e;
}
/* 注: 系统卡片相关 CSS 已迁至 components/SystemCard.vue */

.system-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 16px;
}
.system-detail { padding: 0 8px; }
.quick-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.resource-detail { padding: 0 8px; }
.drawer-footer { display: flex; justify-content: space-between; margin-top: 24px; }
.cred-row { display: flex; gap: 8px; margin-bottom: 6px; align-items: center; }

/* ── Phase 6-3: 反向引用列表 ── */
.ref-loading {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px 0;
  color: #8f959e;
  font-size: 12px;
}
.ref-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.ref-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid #f0f1f3;
  background: #fafbfc;
  cursor: pointer;
  transition: all 0.15s;
}
.ref-item:hover {
  background: #eff6ff;
  border-color: #b6d6ff;
}
.ref-icon {
  color: #5b8ff9;
  font-size: 16px;
  flex-shrink: 0;
}
.ref-info {
  flex: 1;
  min-width: 0;
}
.ref-name {
  font-size: 13px;
  font-weight: 500;
  color: #1f2329;
}
.ref-code {
  font-family: 'SF Mono', 'Menlo', monospace;
  color: #8f959e;
  font-size: 11px;
  font-weight: normal;
  margin-left: 4px;
}
.ref-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  font-size: 11px;
  color: #8f959e;
}
.ref-steps {
  margin-left: 4px;
}
.ref-arrow {
  color: #c9cdd4;
  font-size: 14px;
}

/* ── Phase 5-4: schema 驱动配置区块 ── */
.schema-section {
  margin-top: 4px;
}
.schema-empty {
  padding: 12px 16px;
  background: #f5f7fa;
  border-radius: 6px;
  text-align: center;
}
.schema-category {
  background: #fafbfc;
  border: 1px solid #e5e6eb;
  border-radius: 6px;
  padding: 12px 16px;
  margin-bottom: 12px;
}
.schema-category-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #1f2329;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px dashed #e5e6eb;
}
.schema-field-help {
  font-size: 11px;
  color: #8f959e;
  margin-top: 2px;
  line-height: 1.4;
}
.text-muted { color: #8f959e; font-size: 13px; }


/* 笔记本紧凑模式：对齐蓝图，减少首屏高度 */
.systems-tab :deep(.el-alert__icon) { font-size: 16px; width: 16px; }
.kpi-row { gap: 8px; margin-bottom: 10px; }
.kpi-card { padding: 10px 12px; min-height: 68px; }
.kpi-label { font-size: 11px; margin-bottom: 3px; }
.kpi-value { font-size: 20px; line-height: 1.1; }
.kpi-sub { font-size: 10.5px; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.toolbar { margin-bottom: 10px; }
/* ── 场景 2 优化：风险提示 + 健康度 ── */
.ops-overview {
  display: grid;
  grid-template-columns: 1fr 220px;
  gap: 10px;
  margin-bottom: 10px;
}
.risk-alert {
  min-height: 58px;
  align-items: center;
  border: 1px solid #f7d08a;
  background: #fffbeb;
}
.health-card {
  border-radius: 8px;
  padding: 10px 12px;
  border: 1px solid #dbeafe;
  background: linear-gradient(135deg, #eff6ff 0%, #f5f3ff 100%);
}
.health-label { font-size: 11px; color: #64748b; margin-bottom: 5px; }
.health-main { display: flex; align-items: baseline; gap: 6px; }
.health-main span { font-size: 26px; font-weight: 700; color: #2563eb; line-height: 1; }
.health-main em { font-style: normal; color: #94a3b8; font-size: 13px; }
.health-sub { margin-top: 5px; color: #64748b; font-size: 11px; }
.kpi-row-optimized { grid-template-columns: repeat(6, minmax(0, 1fr)); }
.kpi-pipeline { border-left-color: #0ea5e9; }
.kpi-sync { border-left-color: #14b8a6; }
.optimized-toolbar {
  gap: 8px;
  align-items: center;
  padding: 8px 10px;
  background: #fff;
  border: 1px solid #e5e6eb;
  border-radius: 8px;
}
.filter-pills { display: flex; gap: 6px; flex: 1; flex-wrap: wrap; }
.filter-pill {
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 8px;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
  background: #f8fafc;
  color: #64748b;
  font-size: 11px;
  white-space: nowrap;
}
.filter-pill.active { color: #2563eb; border-color: #93c5fd; background: #eff6ff; }
.filter-pill.warn { color: #b45309; border-color: #fcd34d; background: #fffbeb; }
@media (max-width: 1280px) {
  .kpi-row-optimized { grid-template-columns: repeat(6, minmax(0, 1fr)); }
  .ops-overview { grid-template-columns: 1fr 190px; }
}
@media (max-width: 980px) {
  .kpi-row-optimized { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .ops-overview { grid-template-columns: 1fr; }
}
</style>





