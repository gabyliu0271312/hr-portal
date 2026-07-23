<template>
  <div class="systems-tab">
    <div class="kpi-row kpi-row-4col">
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
        <div class="kpi-label">凭证风险</div>
        <div class="kpi-value">{{ credentialRiskCount }}</div>
        <div class="kpi-sub">主 {{ kpi.credPrimaryCount }} · 备 {{ kpi.credBackupCount }} · 即将过期 {{ credentialRiskCount }}</div>
      </div>
      <div class="kpi-card kpi-abnormal" :class="{ 'kpi-alert-warn': abnormalSystemCount > 0 }">
        <div class="kpi-label">异常系统</div>
        <div class="kpi-value">{{ abnormalSystemCount }}</div>
        <div class="kpi-sub">连接失败 / 禁用 / 配置异常</div>
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
        :overview="overviewMap[sys.id]"
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

    <!-- P1-G: 系统详情抽屉（6 Tab）-->
    <el-drawer
      v-model="drawerOpen"
      :title="`${activeSystem?.system_name || ''} 详情`"
      size="620px"
      direction="rtl"
    >
      <template v-if="activeSystem">
        <el-tabs v-model="detailTab" class="system-detail-tabs">
          <!-- Tab 1: 概览 -->
          <el-tab-pane label="概览" name="overview">
            <div class="tab-content">
              <el-descriptions :column="1" border size="small">
                <el-descriptions-item label="系统编码">{{ activeSystem.system_code }}</el-descriptions-item>
                <el-descriptions-item label="系统名称">{{ activeSystem.system_name }}</el-descriptions-item>
                <el-descriptions-item label="系统类型">{{ activeSystem.system_type || '—' }}</el-descriptions-item>
                <el-descriptions-item label="负责人">{{ activeSystem.owner || '—' }}</el-descriptions-item>
                <el-descriptions-item label="状态">
                  <el-tag :type="activeSystem.is_active ? 'success' : 'info'" size="small">
                    {{ activeSystem.is_active ? '运行中' : '已停用' }}
                  </el-tag>
                </el-descriptions-item>
                <el-descriptions-item label="资源数">{{ activeSystem.resource_count || resourcesOf(activeSystem.id).length }}</el-descriptions-item>
                <el-descriptions-item label="凭证数">{{ systemCredentials.length }}</el-descriptions-item>
                <el-descriptions-item label="说明">{{ activeSystem.description || '—' }}</el-descriptions-item>
              </el-descriptions>
              <div class="quick-actions" style="margin-top: 16px">
                <el-button @click="detailTab = 'resources'">+ 添加表/API</el-button>
                <el-button @click="detailTab = 'credentials'; openAddCredentialForSystem(activeSystem)">
                  <el-icon><Key /></el-icon>补充凭证
                </el-button>
                <el-button @click="editSystem(activeSystem)">编辑系统</el-button>
                <el-button type="danger" @click="confirmDeleteSystem(activeSystem)">删除系统</el-button>
              </div>
            </div>
          </el-tab-pane>

          <!-- Tab 2: 资源 -->
          <el-tab-pane label="资源" name="resources">
            <div class="tab-content">
              <div class="tab-head">
                <span>资源列表（{{ resourcesOf(activeSystem.id).length }}）</span>
                <el-button size="small" type="primary" @click="addResource(activeSystem)">
                  <el-icon><Plus /></el-icon>添加
                </el-button>
              </div>
              <el-table v-if="resourcesOf(activeSystem.id).length" :data="resourcesOf(activeSystem.id)" stripe size="small" max-height="400" style="cursor: pointer" @row-click="(row: any) => openResource(activeSystem, row)">
                <el-table-column prop="resource_name" label="名称" min-width="100" />
                <el-table-column label="类型" width="90">
                  <template #default="{ row }">
                    <el-tag size="small">{{ row.resource_type || 'API' }}</el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="接入类型" min-width="110">
                  <template #default="{ row }">
                    <span v-if="row.connector_type">{{ connectorLabel(row.connector_type) }}</span>
                    <span v-else class="text-muted">—</span>
                  </template>
                </el-table-column>
                <el-table-column label="状态" width="80">
                  <template #default="{ row }">
                    <el-tag v-if="row.status === 1" type="success" size="small">启用</el-tag>
                    <el-tag v-else-if="row.status === 2" type="info" size="small">停用</el-tag>
                    <el-tag v-else type="warning" size="small">未启用</el-tag>
                  </template>
                </el-table-column>                <el-table-column label="操作" width="76">
                  <template #default="{ row }">
                    <el-button link type="primary" size="small" @click.stop="openResource(activeSystem, row)">配置</el-button>
                  </template>
                </el-table-column>
              </el-table>
              <el-empty v-else description="暂无资源" :image-size="60" />
            </div>
          </el-tab-pane>

          <!-- Tab 3: 凭证 -->
          <el-tab-pane label="凭证" name="credentials">
            <div class="tab-content">
              <div class="tab-head">
                <span>凭证（{{ systemCredentials.length }}）</span>
                <el-button size="small" type="primary" @click="openAddCredentialForSystem(activeSystem)">
                  <el-icon><Plus /></el-icon>补充
                </el-button>
              </div>
              <div v-if="systemCredentials.length === 0" class="text-muted" style="padding:16px">
                尚未配置凭证。点击「补充」录入第一套凭证。
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
                  <el-button v-if="!c.is_primary" size="small" link type="primary" @click="setPrimaryCredential(c)">
                    设为激活
                  </el-button>
                  <el-button size="small" link type="primary" @click="openEditCredential(c)">编辑</el-button>
                </div>
              </div>
            </div>
          </el-tab-pane>

          <el-tab-pane label="业务能力" name="capabilities">
            <div class="tab-content">
              <el-alert type="info" :closable="false" style="margin-bottom: 12px" title="标准 SaaS 系统在此管理业务能力；不会要求创建资源或填写接口信息。" />
              <el-table v-if="systemCapabilities.length" :data="systemCapabilities" stripe size="small">
                <el-table-column prop="operation_name" label="业务能力" min-width="170" />
                <el-table-column label="状态" width="140"><template #default="{ row }"><el-tag :type="row.enabled ? 'success' : 'info'" size="small">{{ row.enabled ? '已启用' : '未启用' }}</el-tag><div v-if="row.enabled" class="text-muted">{{ row.test_status }}</div></template></el-table-column>
                <el-table-column label="操作" width="210"><template #default="{ row }"><el-button v-if="row.enabled" link type="primary" size="small" @click="openCapabilityTest(row)">测试</el-button><el-button v-if="row.enabled" link type="primary" size="small" @click="openCapabilityTestResults(row)">测试记录</el-button><el-button link type="primary" size="small" @click="toggleSystemCapability(row)">{{ row.enabled ? '停用' : '启用' }}</el-button></template></el-table-column>
              </el-table>
              <el-empty v-else description="此系统尚未启用标准业务能力" :image-size="60" />
            </div>
          </el-tab-pane>

          <!-- Tab 4: 流水线 -->
          <el-tab-pane label="流水线" name="pipelines">
            <div class="tab-content">
              <div class="tab-head">
                <span>引用该系统的流水线（{{ detailPipelines.length }}）</span>
              </div>
              <el-table v-if="detailPipelines.length" :data="detailPipelines" stripe size="small" max-height="400">
                <el-table-column prop="pipeline_name" label="名称" min-width="120" />
                <el-table-column label="触发方式" width="90">
                  <template #default="{ row }">
                    <el-tag size="small">{{ row.trigger_type || 'MANUAL' }}</el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="状态" width="80">
                  <template #default="{ row }">
                    <el-tag v-if="row.status === 1" type="success" size="small">启用</el-tag>
                    <el-tag v-else type="info" size="small">停用</el-tag>
                  </template>
                </el-table-column>
              </el-table>
              <el-empty v-else description="暂无关联流水线" :image-size="60" />
            </div>
          </el-tab-pane>

          <!-- Tab 5: 执行记录 -->
          <el-tab-pane label="执行记录" name="executions">
            <div class="tab-content">
              <el-table v-if="detailExecutions.length" :data="detailExecutions" stripe size="small" max-height="400">
                <el-table-column label="Trace ID" min-width="100">
                  <template #default="{ row }">
                    <code style="font-size:11px">{{ row.trace_id?.slice(0, 8) }}</code>
                  </template>
                </el-table-column>
                <el-table-column prop="pipeline_code" label="流水线" width="130" />
                <el-table-column label="状态" width="100">
                  <template #default="{ row }">
                    <el-tag :type="execStatusColor(row.status)" size="small">{{ row.status }}</el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="时间" min-width="140">
                  <template #default="{ row }">
                    <span style="font-size:11px;color:#8f959e">{{ formatDateTime(row.started_at || row.created_at) }}</span>
                  </template>
                </el-table-column>
              </el-table>
              <el-empty v-else description="暂无执行记录" :image-size="60" />
            </div>
          </el-tab-pane>

          <!-- Tab 6: 审计/测试 -->
          <el-tab-pane label="审计/测试" name="audit">
            <div class="tab-content">
              <div class="sd-section-title">最近变更</div>
              <el-timeline v-if="detailAuditLogs.length" style="margin-top:8px">
                <el-timeline-item
                  v-for="(item, i) in detailAuditLogs"
                  :key="i"
                  :timestamp="formatDateTime(item.created_at)"
                  placement="top"
                >
                  {{ item.action || item.message || '配置变更' }}
                </el-timeline-item>
              </el-timeline>
              <el-empty v-else description="暂无审计记录" :image-size="60" />
            </div>
          </el-tab-pane>
        </el-tabs>
      </template>
    </el-drawer>

    <el-dialog v-model="capabilityTestVisible" title="测试业务能力" width="520px">
      <el-alert type="info" :closable="false" style="margin-bottom: 16px">仅输入业务参数；系统不会展示接口地址、Scope 或凭证内容。测试记录会保存脱敏摘要和 Trace。</el-alert>
      <el-form label-width="110px"><el-form-item v-for="field in capabilityTestFields" :key="field.key" :label="field.label" required><el-input v-model="capabilityTestParameters[field.key]" :placeholder="`输入${field.label}`" /></el-form-item></el-form>
      <template #footer><el-button @click="capabilityTestVisible = false">取消</el-button><el-button type="primary" :loading="submitting" @click="submitCapabilityTest">开始测试</el-button></template>
    </el-dialog>

    <el-dialog v-model="capabilityTestResultVisible" :title="`${capabilityUnderTest?.operation_name || '业务能力'}测试结果`" width="760px" destroy-on-close>
      <el-tabs v-model="capabilityResultTab">
        <el-tab-pane label="本次结果" name="current">
          <el-alert :type="capabilityTestResult?.status === 'SUCCESS' ? 'success' : 'warning'" :closable="false" style="margin-bottom:16px" :title="capabilityTestResult?.error_message || capabilityTestResult?.status || '暂无测试结果'" />
          <el-descriptions v-if="capabilityTestResult" :column="2" border size="small" style="margin-bottom:16px">
            <el-descriptions-item label="Trace"><code>{{ capabilityTestResult.trace_id?.slice(0, 8) }}</code></el-descriptions-item>
            <el-descriptions-item label="测试时间">{{ formatDateTime(capabilityTestResult.created_at) }}</el-descriptions-item>
          </el-descriptions>
          <el-divider content-position="left">返回结果（已脱敏）</el-divider>
          <el-empty v-if="capabilityResultRows.length === 0" description="本次未返回可展示的数据" :image-size="56" />
          <el-collapse v-else>
            <el-collapse-item v-for="(row, index) in capabilityResultRows" :key="index" :title="`结果 ${index + 1}`" :name="index">
              <el-descriptions :column="1" border size="small">
                <el-descriptions-item v-for="([key, value]) in objectEntries(row)" :key="key" :label="resultFieldLabel(key)">{{ displayResultValue(value) }}</el-descriptions-item>
              </el-descriptions>
            </el-collapse-item>
          </el-collapse>
        </el-tab-pane>
        <el-tab-pane label="测试记录" name="history">
          <div class="capability-result-toolbar"><span>仅保留脱敏的输入和响应摘要</span><el-button link type="primary" :loading="capabilityTestHistoryLoading" @click="loadCapabilityTestHistory">刷新</el-button></div>
          <el-table v-if="capabilityTestHistory.length" :data="capabilityTestHistory" stripe size="small" max-height="360">
            <el-table-column label="时间" min-width="145"><template #default="{ row }">{{ formatDateTime(row.created_at) }}</template></el-table-column>
            <el-table-column label="状态" width="100"><template #default="{ row }"><el-tag :type="row.status === 'SUCCESS' ? 'success' : 'warning'" size="small">{{ row.status }}</el-tag></template></el-table-column>
            <el-table-column label="Trace" width="100"><template #default="{ row }"><code>{{ row.trace_id?.slice(0, 8) }}</code></template></el-table-column>
            <el-table-column label="结果" min-width="120"><template #default="{ row }">{{ (row.response_summary?.rows || []).length }} 条</template></el-table-column>
            <el-table-column label="操作" width="70"><template #default="{ row }"><el-button link type="primary" size="small" @click="viewCapabilityTestRun(row)">查看</el-button></template></el-table-column>
          </el-table>
          <el-empty v-else-if="!capabilityTestHistoryLoading" description="暂无测试记录" :image-size="56" />
        </el-tab-pane>
      </el-tabs>
    </el-dialog>

    <el-dialog v-model="credentialEditVisible" title="编辑凭证" width="520px">
      <el-form :model="credentialEditForm" label-width="105px">
        <el-form-item label="凭证名称" required><el-input v-model="credentialEditForm.credential_name" /></el-form-item>
        <el-form-item label="环境"><el-select v-model="credentialEditForm.env_tag" style="width:100%"><el-option label="生产" value="prod" /><el-option label="测试" value="staging" /><el-option label="开发" value="dev" /><el-option label="备份" value="backup" /></el-select></el-form-item>
        <el-form-item label="认证方式"><el-select v-model="credentialEditForm.auth_type" style="width:100%"><el-option label="API Key" value="api_key" /><el-option label="Basic" value="basic" /><el-option label="OAuth2" value="oauth2" /><el-option label="Token" value="token" /></el-select></el-form-item>
        <el-form-item label="更新密钥"><div v-for="field in currentEditCredentialFields" :key="field.key" class="cred-row"><el-input :model-value="field.label" disabled style="width:160px" /><el-input v-model="credentialEditForm.secrets[field.key]" type="password" :placeholder="`留空则不修改；输入新的 ${field.label}`" style="flex:1" /></div></el-form-item>
        <el-form-item label="说明"><el-input v-model="credentialEditForm.description" type="textarea" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="credentialEditVisible=false">取消</el-button><el-button type="primary" :loading="submitting" @click="saveCredentialEdit">保存</el-button></template>
    </el-dialog>

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
          <el-form-item label="接入类型">
            <el-select
              v-model="resourceEditForm.connector_type"
              filterable
              placeholder="选择接入类型"
              style="width: 100%"
              @change="onEditConnectorChange"
            >
              <el-option
                v-for="item in connectorTypes"
                :key="item.code"
                :label="item.label"
                :value="item.code"
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
        <template v-if="resourceEditForm.connector_type === '__legacy_bitable__'">
          <el-divider content-position="left">飞书多维表格数据对象</el-divider>
          <div class="resource-object-toolbar"><span>一个资源可配置多张业务表</span><el-button type="primary" size="small" @click="openBitableTableDialog()">新增数据对象</el-button></div>
          <el-table v-loading="bitableTablesLoading" :data="bitableTables" size="small" max-height="240">
            <el-table-column prop="object_name" label="名称" min-width="110" />
            <el-table-column prop="object_code" label="编码" min-width="130" />
            <el-table-column prop="table_id_masked" label="数据表" min-width="100" />
            <el-table-column label="状态" width="70"><template #default="{ row }"><el-tag :type="row.is_active ? 'success' : 'info'" size="small">{{ row.is_active ? '启用' : '停用' }}</el-tag></template></el-table-column>
            <el-table-column label="操作" width="160"><template #default="{ row }"><el-button link size="small" @click="openBitableTableDialog(row)">编辑</el-button><el-button link size="small" @click="previewBitableTable(row)">预览</el-button><el-button link type="danger" size="small" @click="removeBitableTable(row)">删除</el-button></template></el-table-column>
          </el-table>
          <el-empty v-if="!bitableTablesLoading && bitableTables.length === 0" description="暂无数据对象，新增后可在流水线中选择具体表" :image-size="50" />
        </template>
        <template v-if="resourceEditForm.connector_type && resourceEditForm.connector_type !== '__legacy_bitable__'">
          <el-divider content-position="left">{{ connectorObjectLabel(resourceEditForm.connector_type) }}</el-divider>
          <div class="resource-object-toolbar"><span>连接共用凭证；在这里配置可被流水线选择的多个数据对象。</span><el-button type="primary" size="small" @click="openDataObjectDialog()">新增数据对象</el-button></div>
          <el-table v-if="dataObjects.length" :data="dataObjects" size="small" border style="margin-top:10px">
            <el-table-column prop="object_code" label="编码" min-width="120" /><el-table-column prop="object_name" label="名称" min-width="140" />
            <el-table-column label="状态" width="76"><template #default="{ row }"><el-tag size="small" :type="row.is_active ? 'success' : 'info'">{{ row.is_active ? '启用' : '停用' }}</el-tag></template></el-table-column>
            <el-table-column label="操作" width="130"><template #default="{ row }"><el-button link type="primary" size="small" @click="openDataObjectDialog(row)">编辑</el-button><el-button link type="danger" size="small" @click="removeDataObject(row)">删除</el-button></template></el-table-column>
          </el-table>
          <el-empty v-else description="暂无数据对象，新增后可在流水线中选择" :image-size="50" />
        </template>

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
    <el-dialog v-model="bitableDialogVisible" :title="editingBitableTable ? '编辑数据对象' : '新增数据对象'" width="620px" append-to-body>
      <el-form :model="bitableForm" label-width="105px"><el-form-item label="对象编码" required><el-input v-model="bitableForm.object_code" placeholder="FEISHU_EMPLOYEE_ROSTER" /></el-form-item><el-form-item label="对象名称" required><el-input v-model="bitableForm.object_name" placeholder="员工花名册" /></el-form-item><el-form-item label="App Token" required><el-input v-model="bitableForm.app_token" /></el-form-item><el-form-item label="Table ID" required><el-input v-model="bitableForm.table_id" /></el-form-item><el-form-item label="View ID"><el-input v-model="bitableForm.view_id" /></el-form-item><el-form-item label="字段映射"><el-input v-model="bitableForm.field_mapping" type="textarea" :rows="4" placeholder='{"飞书字段": "平台字段"}' /></el-form-item><el-form-item label="单页条数"><el-input-number v-model="bitableForm.page_size" :min="1" :max="500" /></el-form-item><el-form-item label="最大记录数"><el-input-number v-model="bitableForm.max_records" :min="1" :max="50000" /></el-form-item><el-form-item label="启用"><el-switch v-model="bitableForm.is_active" /></el-form-item></el-form>
      <template #footer><el-button @click="bitableDialogVisible = false">取消</el-button><el-button type="primary" :loading="bitableSaving" @click="saveBitableTable">保存</el-button></template>
    </el-dialog>    </el-drawer>

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
          <el-form-item label="标准系统">
            <el-select v-model="selectedPackageCode" clearable placeholder="可选：选择已内置的标准系统" style="width: 100%" @change="selectStandardPackage">
              <el-option v-for="item in standardPackages" :key="item.package_code" :label="item.package_name" :value="item.package_code" />
            </el-select>
            <div v-if="isStandardSystem" class="text-muted">后续直接启用业务能力，无需添加资源、选择适配器或填写接口信息。</div>
          </el-form-item>
          <el-form-item label="系统编码" required>
            <el-input v-model="systemForm.system_code" placeholder="如 BEISEN / FEISHU" :disabled="isStandardSystem" />
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
          <el-form-item label="域/团队">
            <el-input v-model="systemForm.domain" placeholder="如 HR / SSC / IT" />
          </el-form-item>
          <el-form-item label="说明">
            <el-input v-model="systemForm.description" type="textarea" :rows="2" />
          </el-form-item>
          <el-form-item label="标签">
            <el-input v-model="systemForm.tagsStr" placeholder="逗号分隔，如 生产,核心" />
          </el-form-item>
          <el-form-item label="敏感级别">
            <el-select v-model="systemForm.sensitivity" style="width:100%">
              <el-option label="内部" value="internal" />
              <el-option label="机密" value="confidential" />
              <el-option label="绝密" value="restricted" />
            </el-select>
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
          <el-form-item label="过期时间">
            <el-date-picker
              v-model="credForm.expires_at"
              type="datetime"
              placeholder="选填，到期后凭证自动标记为已过期"
              style="width: 100%"
              value-format="YYYY-MM-DDTHH:mm:ss"
            />
          </el-form-item>
          <el-form-item label="到期提醒">
            <el-input-number v-model="credForm.remind_before_days" :min="1" :max="90" style="width: 200px" />
            <span style="margin-left: 8px; color: #8f959e; font-size: 12px">提前 N 天提醒</span>
          </el-form-item>
          <el-form-item label="说明">
            <el-input v-model="credForm.description" type="textarea" :rows="2" />
          </el-form-item>
        </el-form>
      </template>

      <!-- Step 3: 添加资源（可选，列表 + 添加按钮，蓝本 v2 场景 3） -->
      <template v-else-if="wizardStep === 3">
        <template v-if="isStandardSystem">
          <el-alert type="success" :closable="false" style="margin-bottom: 16px" title="选择要启用的业务能力" />
          <div class="text-muted" style="margin-bottom: 12px">能力测试需要真实业务参数；当前可先启用，状态将显示为“待补充测试参数”。</div>
          <el-checkbox-group v-model="selectedOperationIds" class="capability-list">
            <el-card v-for="operation in selectedPackageOperations" :key="operation.operation_id" shadow="never" class="capability-card">
              <el-checkbox :label="operation.operation_id">{{ operation.operation_name }}</el-checkbox>
              <div class="text-muted capability-fields">输入：{{ operation.input_fields.join('、') || '无' }}　输出：{{ operation.output_fields.join('、') || '无' }}</div>
              <el-tag size="small" type="warning">待补充测试参数</el-tag>
            </el-card>
          </el-checkbox-group>
        </template>
        <template v-else>
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
            <span v-if="isStandardSystem">标准 SaaS 不需要创建资源</span>
            <span v-else-if="wizardResources.length > 0">已添加 {{ wizardResources.length }} 个</span>
            <span v-else class="text-muted">跳过（稍后添加）</span>
          </el-descriptions-item>
          <el-descriptions-item v-if="isStandardSystem" label="业务能力">已启用 {{ selectedOperationIds.length }} 项；测试状态：待补充测试参数</el-descriptions-item>
        </el-descriptions>
        <div class="finish-checklist">
          <div class="check-item"><el-icon class="ok"><CircleCheck /></el-icon>系统信息已录入</div>
          <div class="check-item"><el-icon class="ok"><CircleCheck /></el-icon>第一套凭证已绑定</div>
          <div class="check-item">
            <el-icon v-if="isStandardSystem || wizardResources.length > 0" class="ok"><CircleCheck /></el-icon>
            <el-icon v-else class="skip"><DocumentRemove /></el-icon>
            {{ isStandardSystem ? `已启用 ${selectedOperationIds.length} 项业务能力` : (wizardResources.length > 0 ? `已添加 ${wizardResources.length} 个资源` : '资源 — 跳过') }}
          </div>
        </div>
      </template>

      <template #footer>
        <!-- 上一步在左边（蓝本 v2 场景 3） -->
        <el-button v-if="wizardStep > 1" @click="wizardStep--">← 上一步</el-button>
        <el-button @click="cancelWizard">取消</el-button>
        <el-button
          v-if="wizardStep === 3 && !isStandardSystem"
          @click="submitSystemStep3"
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
        <el-form-item label="接入类型" required>
          <el-select
            v-model="resourceForm.connector_type"
            filterable
            placeholder="选择接入类型"
            style="width: 100%"
            @change="onAddConnectorChange"
          >
            <el-option
              v-for="item in connectorTypes"
              :key="item.code"
              :label="item.label"
              :value="item.code"
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
          v-if="addSchema && !resourceForm.connector_type"
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

    <el-dialog v-model="dataObjectDialogVisible" :title="editingDataObject ? '编辑数据对象' : '新增数据对象'" width="620px" append-to-body>
      <el-form :model="dataObjectForm" label-width="105px"><el-form-item label="对象编码" required><el-input v-model="dataObjectForm.object_code" placeholder="如 PENDING_EMPLOYEE" /></el-form-item><el-form-item label="对象名称" required><el-input v-model="dataObjectForm.object_name" placeholder="如 待入职人员" /></el-form-item><template v-if="activeResource?.connector_type === 'beisen_report'"><el-alert type="info" :closable="false" style="margin-bottom:16px" title="北森凭证和报表接口由连接统一复用；每个数据对象只需指定一张北森报表。" /><el-form-item label="Report ID" required><el-input v-model="dataObjectForm.report_id" placeholder="北森后台 → 报表管理" /></el-form-item></template><el-form-item v-else :label="objectConfigTitle"><el-input v-model="dataObjectForm.object_config" type="textarea" :rows="8" :placeholder="objectConfigPlaceholder" /></el-form-item><el-form-item label="字段映射"><el-input v-model="dataObjectForm.field_mapping" type="textarea" :rows="3" placeholder="可选，JSON 对象" /></el-form-item><el-form-item label="启用"><el-switch v-model="dataObjectForm.is_active" /></el-form-item></el-form>
      <template #footer><el-button @click="dataObjectDialogVisible = false">取消</el-button><el-button type="primary" :loading="dataObjectSaving" @click="saveDataObject">保存</el-button></template>
    </el-dialog>

    <!-- 编辑系统 -->
    <el-dialog v-model="showEditSystemDialog" title="编辑系统" width="520px" destroy-on-close>
      <el-form v-if="editForm" :model="editForm" label-width="80px">
        <el-form-item label="名称">
          <el-input v-model="editForm.system_name" />
        </el-form-item>
        <el-form-item label="系统类型">
          <el-select v-model="editForm.system_type" style="width:100%">
            <el-option label="HR SaaS" value="HR_SAAS" />
            <el-option label="OA 协同" value="OA" />
            <el-option label="IM" value="IM" />
            <el-option label="财务" value="FINANCE" />
            <el-option label="自定义" value="CUSTOM" />
          </el-select>
        </el-form-item>
        <el-form-item label="负责人">
          <el-input v-model="editForm.owner" placeholder="员工 ID 或姓名" />
        </el-form-item>
        <el-form-item label="域/团队">
          <el-input v-model="editForm.domain" placeholder="如 HR / SSC / IT" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="editForm.description" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="标签">
          <el-input v-model="editForm.tagsStr" placeholder="逗号分隔，如 生产,核心,敏感" />
        </el-form-item>
        <el-form-item label="敏感级别">
          <el-select v-model="editForm.sensitivity" style="width:100%">
            <el-option label="公开" value="public" />
            <el-option label="内部" value="internal" />
            <el-option label="机密" value="confidential" />
            <el-option label="绝密" value="restricted" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="editForm.is_active" :active-value="1" :inactive-value="0" active-text="启用" inactive-text="停用" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEditSystemDialog = false">取消</el-button>
        <el-button type="primary" :loading="editSubmitting" @click="submitEditSystem">保存</el-button>
      </template>
    </el-dialog>

  </div>
</template>

<script setup lang="ts">
import { formatDateTime, toUtcNaive } from '@/utils/datetime'
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
import { datasourcesApi } from '@/api/datasources'
import SchemaFormField, { type SchemaCategory } from '../components/SchemaFormField.vue'
import SystemCard from '../components/SystemCard.vue'

const searchKw = ref('')
const loading = ref(false)
const submitting = ref(false)
const router = useRouter()

const systems = ref<any[]>([])
const overviewMap = ref<Record<number, any>>({})
const resourcesMap = ref<Record<number, any[]>>({})
const credentials = ref<any[]>([])

// ── Phase 5-4: schema 驱动配置 ──
const connectorTypes = ref<any[]>([])

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

async function loadConnectorTypes() {
  try {
    const items = await datasourcesApi.types('ucp')
    connectorTypes.value = (items || []).filter((item: any) => item.connection_kind === 'DATA_OBJECT')
  } catch (_e) {
    connectorTypes.value = []
  }
}

function connectorLabel(code: string | null | undefined) {
  return connectorTypes.value.find((item: any) => item.code === code)?.label || code || '旧版资源'
}
function connectorObjectLabel(code: string | null | undefined) {
  return connectorTypes.value.find((item: any) => item.code === code)?.object_label || '数据对象'
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

async function onAddConnectorChange(_code: string | null) {
  addSchema.value = null
  addFormValues.value = {}
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

async function onEditConnectorChange(_code: string | null) {
  editSchema.value = null
  editFormValues.value = {}
}

// 系统详情抽屉
const drawerOpen = ref(false)
const activeSystem = ref<any>(null)
const systemCredentials = ref<any[]>([])
const systemCapabilities = ref<any[]>([])
const capabilityTestVisible = ref(false)
const capabilityUnderTest = ref<any>(null)
const capabilityTestParameters = ref<Record<string, string>>({})
const capabilityTestFields = computed(() => capabilityUnderTest.value?.input_parameters || [])
const capabilityTestResultVisible = ref(false)
const capabilityResultTab = ref('current')
const capabilityTestResult = ref<any>(null)
const capabilityTestHistory = ref<any[]>([])
const capabilityTestHistoryLoading = ref(false)
const capabilityResultRows = computed(() => capabilityTestResult.value?.response_summary?.rows || [])
const credentialEditVisible = ref(false)
const credentialEditForm = ref<any>({})
const currentEditCredentialFields = computed(() => AUTH_FIELDS[credentialEditForm.value.auth_type] || [])

// 资源详情抽屉
const resourceDrawerOpen = ref(false)
const activeResource = ref<any>(null)
const bitableTables = ref<any[]>([])
const bitableTablesLoading = ref(false)
const bitableDialogVisible = ref(false)
const bitableSaving = ref(false)
const editingBitableTable = ref<any>(null)
const bitableForm = ref<any>({ object_code: '', object_name: '', app_token: '', table_id: '', view_id: '', field_mapping: '{}', page_size: 100, max_records: 10000, is_active: true })
const bitablePreview = ref<any>(null)
const dataObjects = ref<any[]>([])
const dataObjectDialogVisible = ref(false)
const dataObjectSaving = ref(false)
const editingDataObject = ref<any>(null)
const dataObjectForm = ref<any>({ object_code: '', object_name: '', report_id: '', object_config: '{}', field_mapping: '{}', is_active: true })
const objectConfigTitle = computed(() => {
  const type = activeResource.value?.connector_type
  return type === 'feishu_sheet' ? '表格配置' : type === 'feishu_bitable' ? '多维表格配置' : type === 'beisen_report' ? '报表配置' : '对象配置'
})
const objectConfigPlaceholder = computed(() => {
  const type = activeResource.value?.connector_type
  if (type === 'feishu_sheet') return '{ "source_url": "飞书链接", "sheet_id": "可选", "range": "A1:ZZ10000" }'
  if (type === 'feishu_bitable') return '{ "app_token": "appxxx", "table_id": "tblxxx", "view_id": "可选" }'
  if (type === 'beisen_report') return '{ "report_id": "报表ID", "data_url": "报表地址", "method": "POST", "body_template": {} }'
  return '{}'
})
// Phase 6-3: 反向引用状态
const usingPipelines = ref<{ resource_id: number; total: number; items: any[] } | null>(null)
const usingPipelinesLoading = ref(false)
const resourceEditForm = ref<any>({})

// 添加系统向导
const showAddSystem = ref(false)
const wizardStep = ref(1)
const standardPackages = ref<any[]>([])
const selectedPackageCode = ref('')
const selectedOperationIds = ref<number[]>([])
const isStandardSystem = computed(() => Boolean(selectedPackageCode.value))
const selectedPackage = computed(() => standardPackages.value.find((item) => item.package_code === selectedPackageCode.value))
const selectedPackageOperations = computed(() => selectedPackage.value?.operations || [])
const wizardSteps = computed(() => isStandardSystem.value ? ['系统信息', '第一套凭证', '启用业务能力', '配置检查'] : ['系统信息', '第一套凭证', '添加资源', '配置检查'])
const wizardTitle = computed(() => `添加业务系统 — 第 ${wizardStep.value}/4 步：${wizardSteps.value[wizardStep.value - 1]}`)
const pendingSystemId = ref<number | null>(null)
const pendingCredId = ref<number | null>(null)
const systemForm = ref({
  system_code: '',
  system_name: '',
  system_type: 'HR_SAAS',
  owner: '',
  domain: '',
  description: '',
  tagsStr: '',
  sensitivity: 'internal',
})

// 添加资源
const showAddResource = ref(false)
const addResourceSystem = ref<any>(null)
const resourceForm = ref<any>({
  resource_code: '',
  resource_name: '',
  connector_type: '',
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
  expires_at: '',
  remind_before_days: 7,
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

const currentCredFields = computed(() => {
  const systemCode = String(systemForm.value.system_code || '').toUpperCase()
  const systemName = String(systemForm.value.system_name || '')
  if (systemCode.includes('BEISEN') || systemName.includes('北森')) {
    return [
      { key: 'BEISEN_APP_KEY', label: '北森 AppKey' },
      { key: 'BEISEN_APP_SECRET', label: '北森 AppSecret' },
    ]
  }
  return AUTH_FIELDS[credForm.value.auth_type] || []
})

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

/* ── 系统详情抽屉 ── */
const detailTab = ref('overview')
const detailPipelines = ref<any[]>([])
const detailExecutions = ref<any[]>([])
const detailAuditLogs = ref<any[]>([])

function resourcesOf(sysId: number): any[] {
  return resourcesMap.value[sysId] || []
}

function execStatusColor(status: string): string {
  const map: Record<string, string> = { SUCCESS: 'success', FAILED: 'danger', PARTIAL_SUCCESS: 'warning', RUNNING: '', PENDING: 'info' }
  return map[status] || 'info'
}

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
  // 来自 monitor/summary
  pipelineTotal: 0,
  pipelineRunning: 0,
  syncCount24h: 0,
  failRate: 0,
})

const inactiveSystemCount = computed(() => Math.max(0, kpi.value.systemCount - kpi.value.systemActiveCount))
const abnormalSystemCount = computed(() => systems.value.filter(s => {
  const h = overviewMap.value[s.id]?.health_status
  return h === 'failing' || h === 'blocked' || h === 'offline'
}).length)
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

    // 系统聚合概览（流水线数、24h同步、成功率）
    try {
      const ovRes = await ucpApi.systemsOverview()
      const ovMap: Record<number, any> = {}
      for (const item of ovRes.items) {
        ovMap[item.system_id] = item
      }
      overviewMap.value = ovMap
    } catch { overviewMap.value = {} }

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
    // 告警 & 流水线统计 (蓝本 KPI 第 4-6 卡)
    try {
      const [alerts, summary] = await Promise.all([
        monitorApi.alerts(50),
        monitorApi.summary(24),
      ])
      kpi.value.alertCount = alerts.length
      kpi.value.pipelineTotal = summary.pipeline_total
      kpi.value.pipelineRunning = summary.pipeline_running
      // syncCount24h from overview aggregation, fallback to monitor summary
      const totalSync = Object.values(overviewMap.value).reduce((sum: number, ov: any) => sum + (ov.sync_count_24h || 0), 0)
      kpi.value.syncCount24h = totalSync || summary.pipeline_total
      kpi.value.failRate = summary.fail_rate
    } catch {
      kpi.value.alertCount = 0
    }
  } catch (_e) {
    ElMessage.error('加载系统列表失败')
  } finally {
    loading.value = false
  }
}

async function openSystem(sys: any) {
  activeSystem.value = sys
  systemCredentials.value = []
  detailTab.value = 'overview'
  detailPipelines.value = []
  detailExecutions.value = []
  detailAuditLogs.value = []
  systemCapabilities.value = []
  // 拉详情（含凭证）
  try {
    const detail = await ucpApi.systemDetail(sys.id)
    systemCredentials.value = detail.credentials || []
    // 同步资源（防止遗漏）
    resourcesMap.value[sys.id] = detail.resources || []
    systemCapabilities.value = await ucpApi.systemCapabilities(sys.id)
  } catch (_e) {
  }
  // 异步加载流水线和执行记录
  loadDetailPipelines(sys.id)
  loadDetailExecutions(sys.id)
  drawerOpen.value = true
}

async function toggleSystemCapability(capability: any) {
  if (!activeSystem.value) return
  try {
    await ucpApi.setSystemCapability(activeSystem.value.id, capability.operation_id, {
      credential_id: systemCredentials.value.find((item: any) => item.is_primary)?.id || systemCredentials.value[0]?.id,
      enabled: !capability.enabled,
    })
    systemCapabilities.value = await ucpApi.systemCapabilities(activeSystem.value.id)
    ElMessage.success(capability.enabled ? '业务能力已停用' : '业务能力已启用')
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.detail || '更新业务能力失败')
  }
}

function openEditCredential(credential: any) {
  credentialEditForm.value = { id: credential.id, credential_name: credential.credential_name, env_tag: credential.env_tag || 'prod', auth_type: credential.auth_type, description: credential.description || '', secrets: {} }
  credentialEditVisible.value = true
}

async function saveCredentialEdit() {
  submitting.value = true
  try {
    const payload = { ...credentialEditForm.value }
    const fields = currentEditCredentialFields.value
    const provided = fields.filter((field) => payload.secrets[field.key]?.trim())
    if (provided.length > 0 && provided.length !== fields.length) { ElMessage.warning('如需轮换密钥，请完整填写当前认证方式要求的全部密钥字段'); return }
    if (provided.length === 0) delete payload.secrets
    await ucpApi.updateCredential(payload.id, payload)
    credentialEditVisible.value = false
    ElMessage.success('凭证已更新')
    if (activeSystem.value) await openSystem(activeSystem.value)
    await load()
  } catch (error: any) { ElMessage.error(error?.response?.data?.detail || '更新凭证失败') } finally { submitting.value = false }
}

function openCapabilityTest(capability: any) {
  capabilityUnderTest.value = capability
  capabilityTestParameters.value = Object.fromEntries((capability.input_parameters || []).map((field: any) => [field.key, '']))
  capabilityTestVisible.value = true
}

async function submitCapabilityTest() {
  if (!activeSystem.value || !capabilityUnderTest.value) return
  submitting.value = true
  try {
    const result = await ucpApi.testSystemCapability(activeSystem.value.id, capabilityUnderTest.value.operation_id, capabilityTestParameters.value)
    ElMessage.success(`${result.message}（Trace：${result.trace_id.slice(0, 8)}）`)
    capabilityTestVisible.value = false
    capabilityTestResult.value = result.test_run || null
    capabilityResultTab.value = 'current'
    capabilityTestResultVisible.value = true
    await loadCapabilityTestHistory()
    systemCapabilities.value = await ucpApi.systemCapabilities(activeSystem.value.id)
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.detail || '能力测试失败')
  } finally { submitting.value = false }
}

async function loadCapabilityTestHistory() {
  if (!activeSystem.value || !capabilityUnderTest.value) return
  capabilityTestHistoryLoading.value = true
  try {
    capabilityTestHistory.value = await ucpApi.systemCapabilityTestRuns(activeSystem.value.id, capabilityUnderTest.value.operation_id)
  } catch (error: any) {
    capabilityTestHistory.value = []
    ElMessage.error(error?.response?.data?.detail || '加载测试记录失败')
  } finally { capabilityTestHistoryLoading.value = false }
}

async function openCapabilityTestResults(capability: any) {
  capabilityUnderTest.value = capability
  capabilityTestResult.value = null
  capabilityResultTab.value = 'history'
  capabilityTestResultVisible.value = true
  await loadCapabilityTestHistory()
}

function viewCapabilityTestRun(testRun: any) {
  capabilityTestResult.value = testRun
  capabilityResultTab.value = 'current'
}

function objectEntries(row: Record<string, any>): [string, any][] {
  return Object.entries(row || {})
}

function resultFieldLabel(key: string) {
  const labels: Record<string, string> = { application_id: '投递记录 ID', id: 'Offer ID', offer_id: 'Offer ID', offer_status: 'Offer 状态' }
  return labels[key] || key
}

function displayResultValue(value: unknown) {
  return typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '—')
}

async function loadDetailPipelines(sysId: number) {
  try {
    const res = await ucpApi.pipelines().catch(() => ({ items: [] }))
    // 筛选引用该系统资源的流水线（简化：展示全部启用流水线）
    detailPipelines.value = (res.items || []).filter((p: any) => p.status === 1)
  } catch { detailPipelines.value = [] }
}

async function loadDetailExecutions(sysId: number) {
  try {
    const res = await ucpApi.executions({ limit: 20 }).catch(() => ({ items: [] }))
    detailExecutions.value = res.items || []
  } catch { detailExecutions.value = [] }
}

async function loadBitableTables(resourceId: number) {
  bitableTablesLoading.value = true
  try { bitableTables.value = (await (ucpApi as any).bitableTables(resourceId)).items || [] }
  catch { bitableTables.value = [] }
  finally { bitableTablesLoading.value = false }
}
function openBitableTableDialog(item?: any) {
  editingBitableTable.value = item || null
  bitablePreview.value = null
  bitableForm.value = item ? { ...item, field_mapping: JSON.stringify(item.field_mapping || {}, null, 2) } : { object_code: '', object_name: '', app_token: '', table_id: '', view_id: '', field_mapping: '{}', page_size: 100, max_records: 10000, is_active: true }
  bitableDialogVisible.value = true
}
async function saveBitableTable() {
  if (!activeResource.value) return
  let mapping: Record<string, any> = {}
  try { mapping = JSON.parse(bitableForm.value.field_mapping || '{}') } catch { ElMessage.error('字段映射必须是合法 JSON 对象'); return }
  bitableSaving.value = true
  try {
    const payload = { ...bitableForm.value, field_mapping: mapping }
    if (editingBitableTable.value) await (ucpApi as any).updateBitableTable(activeResource.value.id, editingBitableTable.value.id, payload)
    else await (ucpApi as any).createBitableTable(activeResource.value.id, payload)
    ElMessage.success('数据对象已保存')
    bitableDialogVisible.value = false
    await loadBitableTables(activeResource.value.id)
  } catch (e: any) { ElMessage.error(e?.response?.data?.detail || '保存失败') }
  finally { bitableSaving.value = false }
}
async function removeBitableTable(item: any) {
  if (!activeResource.value) return
  try { await (ucpApi as any).deleteBitableTable(activeResource.value.id, item.id); ElMessage.success('数据对象已删除'); await loadBitableTables(activeResource.value.id) }
  catch (e: any) { ElMessage.error(e?.response?.data?.detail || '删除失败') }
}
async function previewBitableTable(item: any) {
  if (!activeResource.value) return
  try { bitablePreview.value = await (ucpApi as any).previewBitableTable(activeResource.value.id, item.id); ElMessage.success(`预览成功，共 ${bitablePreview.value.row_count} 条`) }
  catch (e: any) { ElMessage.error(e?.response?.data?.detail || '预览失败') }
}
async function loadDataObjects(resourceId: number) {
  try { dataObjects.value = (await ucpApi.resourceDataObjects(resourceId)).items || [] } catch { dataObjects.value = [] }
}
function openDataObjectDialog(item?: any) {
  editingDataObject.value = item || null
  dataObjectForm.value = item ? { ...item, report_id: item.object_config?.report_id || '', object_config: JSON.stringify(item.object_config || {}, null, 2), field_mapping: JSON.stringify(item.field_mapping || {}, null, 2) } : { object_code: '', object_name: '', report_id: '', object_config: '{}', field_mapping: '{}', is_active: true }
  dataObjectDialogVisible.value = true
}
async function saveDataObject() {
  if (!activeResource.value) return
  let objectConfig: Record<string, any>; let fieldMapping: Record<string, any>
  try {
    objectConfig = activeResource.value.connector_type === 'beisen_report'
      ? { report_id: String(dataObjectForm.value.report_id || '').trim() }
      : JSON.parse(dataObjectForm.value.object_config || '{}')
    fieldMapping = JSON.parse(dataObjectForm.value.field_mapping || '{}')
  } catch { ElMessage.error('对象配置和字段映射必须是合法 JSON 对象'); return }
  if (activeResource.value.connector_type === 'beisen_report' && !objectConfig.report_id) { ElMessage.warning('请填写 Report ID'); return }
  dataObjectSaving.value = true
  try {
    const payload = { ...dataObjectForm.value, object_config: objectConfig, field_mapping: fieldMapping }
    if (editingDataObject.value) await ucpApi.updateResourceDataObject(activeResource.value.id, editingDataObject.value.id, payload)
    else await ucpApi.createResourceDataObject(activeResource.value.id, payload)
    ElMessage.success('数据对象已保存'); dataObjectDialogVisible.value = false; await loadDataObjects(activeResource.value.id)
  } catch (e: any) { ElMessage.error(e?.response?.data?.detail || '保存失败') } finally { dataObjectSaving.value = false }
}
async function removeDataObject(item: any) {
  if (!activeResource.value) return
  try { await ucpApi.deleteResourceDataObject(activeResource.value.id, item.id); ElMessage.success('数据对象已删除'); await loadDataObjects(activeResource.value.id) } catch (e: any) { ElMessage.error(e?.response?.data?.detail || '删除失败') }
}
async function openResource(sys: any, res: any) {
  activeResource.value = res
  resourceEditForm.value = {
    resource_name: res.resource_name,
    connector_type: res.connector_type,
    credential_id: res.credential_id,
    status: res.status,
  }
  // 触发 schema 加载并反填历史值
  await onEditConnectorChange(res.connector_type)
  resourceDrawerOpen.value = true
  // Phase 6-3: 反向引用 — 拉取引用此 resource 的流水线
  loadUsingPipelines(res.id)
  if (res.connector_type) await loadDataObjects(res.id)
}

async function loadUsingPipelines(resourceId: number) {
  usingPipelinesLoading.value = true
  usingPipelines.value = null
  try {
    usingPipelines.value = await ucpApi.pipelinesUsingResource(resourceId)
  } catch (_e) {
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
  router.push({ name: 'UcpPipelineDesigner' })
}

async function addResource(sys: any) {
  addResourceSystem.value = sys
  resourceForm.value = {
    resource_code: '',
    resource_name: '',
    connector_type: '',
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

const showEditSystemDialog = ref(false)
const editForm = ref<any>(null)
const editSubmitting = ref(false)

function editSystem(sys: any) {
  editForm.value = {
    system_name: sys.system_name || '',
    system_type: sys.system_type || 'CUSTOM',
    owner: sys.owner || '',
    domain: sys.domain || '',
    description: sys.description || '',
    tagsStr: Array.isArray(sys.tags) ? sys.tags.join(', ') : '',
    sensitivity: sys.sensitivity || 'internal',
    is_active: (sys.is_active ?? 1) as number,
  }
  showEditSystemDialog.value = true
}

async function submitEditSystem() {
  if (!editForm.value || !activeSystem.value) return
  editSubmitting.value = true
  try {
    const tags = editForm.value.tagsStr
      ? editForm.value.tagsStr.split(',').map((t: string) => t.trim()).filter(Boolean)
      : []
    await ucpApi.updateSystem(activeSystem.value.id, {
      system_name: editForm.value.system_name,
      system_type: editForm.value.system_type,
      owner: editForm.value.owner,
      domain: editForm.value.domain,
      description: editForm.value.description,
      tags,
      sensitivity: editForm.value.sensitivity,
      is_active: editForm.value.is_active,
    })
    ElMessage.success('系统已更新')
    showEditSystemDialog.value = false
    load()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '更新失败')
  } finally {
    editSubmitting.value = false
  }
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
    if (resourceEditForm.value.connector_type) {
      body.connector_type = resourceEditForm.value.connector_type
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
  // P2-A05: 删除前影响分析 — 查询引用该资源的流水线
  let impactMsg = `确定删除资源「${activeResource.value.resource_name}」？`
  try {
    const impact = await ucpApi.pipelinesUsingResource(activeResource.value.id)
    if (impact.total > 0) {
      const names = impact.items.map((p: any) => p.pipeline_name || p.pipeline_code).join('、')
      impactMsg = `资源「${activeResource.value.resource_name}」被 ${impact.total} 条流水线引用：${names}。\n删除后这些流水线将无法执行。\n\n确定删除？`
    }
  } catch { /* 查询失败不影响删除流程 */ }
  try {
    await ElMessageBox.confirm(impactMsg, '删除确认', {
      type: 'warning',
      confirmButtonText: '确认删除',
      dangerouslyUseHTMLString: false,
    })
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
  systemForm.value = { system_code: '', system_name: '', system_type: 'HR_SAAS', owner: '', domain: '', description: '', tagsStr: '', sensitivity: 'internal' }
  credForm.value = {
    credential_code: '',
    credential_name: '',
    auth_type: 'api_key',
    env_tag: 'prod',
    description: '',
    expires_at: '',
    secrets: {} as Record<string, string>,
  }
  pendingSystemId.value = null
  selectedPackageCode.value = ''
  selectedOperationIds.value = []
  wizardStep.value = 1
  loadStandardPackages()
  showAddSystem.value = true
}

async function loadStandardPackages() {
  try {
    standardPackages.value = await ucpApi.standardPackages()
  } catch {
    standardPackages.value = []
  }
}

function selectStandardPackage() {
  const packageItem = selectedPackage.value
  if (!packageItem) return
  systemForm.value.system_code = packageItem.package_code
  systemForm.value.system_name = packageItem.package_name
  systemForm.value.system_type = 'HR_SAAS'
  selectedOperationIds.value = packageItem.operations
    .filter((item: any) => item.object_code === 'OFFER')
    .map((item: any) => item.operation_id)
}

// ── 给已存在系统补充凭证 ──
function openAddCredentialForSystem(sys: any) {
  pendingSystemId.value = sys.id
  systemForm.value = {
    system_code: sys.system_code,
    system_name: sys.system_name,
    system_type: sys.system_type || 'HR_SAAS',
    owner: sys.owner || '',
    domain: sys.domain || '',
    description: sys.description || '',
    tagsStr: '',
    sensitivity: 'internal',
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
    const tags = systemForm.value.tagsStr
      ? systemForm.value.tagsStr.split(',').map((t: string) => t.trim()).filter(Boolean)
      : []
    const r = await ucpApi.createSystem({
      system_code: systemForm.value.system_code,
      system_name: systemForm.value.system_name,
      system_type: systemForm.value.system_type,
      owner: systemForm.value.owner,
      domain: systemForm.value.domain,
      description: systemForm.value.description,
      tags,
      sensitivity: systemForm.value.sensitivity,
    })
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
      expires_at: toUtcNaive(credForm.value.expires_at) || undefined,
      remind_before_days: credForm.value.remind_before_days ?? 7,
      secrets: credForm.value.secrets,
    })
    pendingCredId.value = r.id
    ElMessage.success('凭证已创建并绑定到系统')
    if (isStandardSystem.value) {
      wizardStep.value = 3
      return
    }
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
  if (isStandardSystem.value) {
    if (!pendingSystemId.value || !pendingCredId.value || selectedOperationIds.value.length === 0) {
      ElMessage.warning('请至少启用一项业务能力')
      return
    }
    submitting.value = true
    try {
      await Promise.all(selectedOperationIds.value.map((operationId) => ucpApi.setSystemCapability(
        pendingSystemId.value!, operationId, { credential_id: pendingCredId.value!, enabled: true }
      )))
      ElMessage.success('业务能力已启用，待补充测试参数后可进行连接测试')
    } catch (e: any) {
      ElMessage.error(e?.response?.data?.detail || '启用业务能力失败')
      return
    } finally {
      submitting.value = false
    }
  }
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
  if (!resourceForm.value.connector_type) {
    ElMessage.warning('请选择接入类型')
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
      connector_type: resourceForm.value.connector_type,
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
  await loadConnectorTypes()
  await loadStandardPackages()
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

/* 系统详情 6 Tab */
.system-detail-tabs :deep(.el-tabs__header) { margin-bottom: 8px; }
.tab-content { padding: 4px 0; }
.tab-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; font-weight: 500; font-size: 13px; color: #1f2329; }
.sd-section-title { font-size: 13px; font-weight: 600; color: #1f2329; margin-bottom: 8px; padding-left: 8px; border-left: 3px solid #5b8ff9; }
.resource-detail { padding: 0 8px; }
.drawer-footer { display: flex; justify-content: space-between; margin-top: 24px; }
.cred-row { display: flex; gap: 8px; margin-bottom: 6px; align-items: center; }
.capability-result-toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; color: #8f959e; font-size: 12px; }

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
.kpi-row-4col { grid-template-columns: repeat(4, minmax(0, 1fr)); }
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
  .kpi-row-4col { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .ops-overview { grid-template-columns: 1fr 190px; }
}
@media (max-width: 980px) {
  .kpi-row-optimized { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .ops-overview { grid-template-columns: 1fr; }
}
</style>
