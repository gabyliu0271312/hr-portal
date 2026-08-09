<template>
  <div class="pipeline-designer-page">
    <div class="designer-toolbar">
      <div class="toolbar-left">
        <el-button @click="$router.push('/ucp/pipelines')">← 返回列表</el-button>
        <el-divider direction="vertical" />
        <span class="toolbar-title">{{ currentTpl ? `编辑流程 — ${form.name || form.template_code}` : '新建流程' }}</span>
      </div>
      <div class="toolbar-right">
        <el-button :disabled="!form.nodes.length" @click="autoLayout">智能布局</el-button>
        <el-button @click="viewVersions(currentTpl!)" :disabled="!currentTpl">版本历史</el-button>
        <el-button type="success" @click="dryRun">试运行</el-button>
        <el-button type="primary" :loading="saving" @click="saveTemplate">保存</el-button>
      </div>
    </div>

    <div class="designer-body">
      <div class="designer-left">
        <h4>&#22266;&#23450;&#33410;&#28857;</h4>
        <div v-for="nt in fixedNodeTypes" :key="nt.type" class="node-palette-item" :style="{ borderLeft: `4px solid ${nt.color}` }" draggable="true" @dragstart="onPaletteDragStart($event, nt.type)">
          <el-icon><component :is="resolveIcon(nt.icon)" /></el-icon>
          <span>{{ nt.label }}</span>
          <small>&#25302;&#25341;&#28155;&#21152;&#65288;&#27599;&#20010;&#27969;&#31243;&#20165;&#19968;&#20010;&#65289;</small>
        </div>
        <el-divider style="margin: 12px 0" />
        <h4>&#21487;&#32534;&#25490;&#33410;&#28857;</h4>
        <div v-for="nt in paletteNodeTypes" :key="nt.type" class="node-palette-item" :style="{ borderLeft: `4px solid ${nt.color}` }" draggable="true" @dragstart="onPaletteDragStart($event, nt.type)">
          <el-icon><component :is="resolveIcon(nt.icon)" /></el-icon>
          <span>{{ nt.label }}</span>
          <small>&#25302;&#25341;&#28155;&#21152;</small>
        </div>
      </div>

      <div class="canvas-viewport">
      <div class="designer-canvas" :class="{ 'is-panning': isCanvasPanning }" ref="canvasRef" @wheel.prevent="onCanvasWheel" @mousedown="startCanvasPan" @dragover.prevent @drop="onCanvasDrop" @click="onCanvasClick">
        <div class="canvas-scaler" :style="{ width: `${canvasW * canvasZoom}px`, height: `${canvasH * canvasZoom}px` }">
          <div class="canvas-content" :style="{ width: `${canvasW}px`, height: `${canvasH}px`, transform: `scale(${canvasZoom})` }">
        <svg class="edge-layer" :viewBox="`0 0 ${canvasW} ${canvasH}`" :width="canvasW" :height="canvasH">
          <defs>
            <marker id="arrowhead" viewBox="0 0 10 10" markerWidth="8" markerHeight="8" refX="10" refY="5" orient="auto" markerUnits="strokeWidth"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" /></marker>
            <pattern id="dotgrid" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#e4e7ed" /></pattern>
          </defs>
          <rect :width="canvasW" :height="canvasH" fill="url(#dotgrid)" />
          <path v-for="(edge, i) in drawingEdges" :key="`draw-edge-${i}`" :d="edgePath(edge)" stroke="#909399" stroke-width="2" fill="none" stroke-dasharray="5,3" marker-end="url(#arrowhead)" />
          <path v-for="(edge, i) in form.edges" :key="`edge-${i}`" :d="edgePath(storedEdge(edge))" :stroke="edgeStroke(edge)" stroke-width="2.5" fill="none" marker-end="url(#arrowhead)" />
        </svg>
        <div v-for="node in form.nodes" :key="node.id" class="node-card" :class="{ selected: selectedNodeId === node.id, 'is-error': nodeHasError(node), 'start-trigger': node.type === 'START_TRIGGER' }" :style="{ left: node.x + 'px', top: node.y + 'px', borderColor: getNodeColor(node.type) }" :data-node-id="node.id" @mousedown="startDrag($event, node)" @click.stop="selectNode(node)">
          <div class="node-header" :style="{ background: getNodeColor(node.type) }">
            <span>{{ getNodeLabel(node.type) }}</span>
            <el-button link size="small" @click.stop="removeNode(node.id)" style="color: #fff"><el-icon><Delete /></el-icon></el-button>
          </div>
          <div class="node-body">
            <div class="node-title" :title="node.label || getNodeLabel(node.type)">{{ node.label || getNodeLabel(node.type) }}</div>
            <div v-for="(line, index) in nodeSummaryLines(node)" :key="`${node.id}-summary-${index}`" class="node-summary" :title="line">{{ line }}</div>
            <div class="node-status"><span :class="['status-dot', nodeStatus(node).tone]"></span><span>{{ nodeStatus(node).label }}</span></div>
          </div>
          <div class="node-ports"><span v-for="side in connectorSides" :key="`${node.id}-${side}`" class="port" :class="`port-${side}`" :data-node-id="node.id" :data-port="side" @mousedown.stop="startConnect($event, node, side)"></span></div>
        </div>
          </div>
        </div>
      </div>
        <div class="canvas-controls" @mousedown.stop @click.stop>
          <el-button class="zoom-value" text size="small" :disabled="canvasZoom === 1" aria-label="Reset zoom" @click="resetCanvasZoom">{{ Math.round(canvasZoom * 100) }}%</el-button>
          <el-button size="small" @click="fitCanvas">&#36866;&#37197;</el-button>
          <el-button size="small" @click="centerCanvas">&#23621;&#20013;</el-button>
        </div>
      </div>

      <div class="designer-right">
        <h4>流程信息</h4>
        <el-form :model="form" label-width="60px" size="small" class="pipeline-info-form">
          <el-row :gutter="8">
            <el-col :span="12"><el-form-item label="编码"><el-input v-model="form.template_code" :disabled="!!currentTpl" placeholder="code" size="small" /></el-form-item></el-col>
            <el-col :span="12"><el-form-item label="名称"><el-input v-model="form.name" placeholder="流程名称" size="small" /></el-form-item></el-col>
          </el-row>
          <el-form-item label="描述" class="compact-item"><el-input v-model="form.description" type="textarea" :rows="2" placeholder="流程用途说明" size="small" /></el-form-item>
          <el-row :gutter="8" v-if="currentTpl">
            <el-col :span="12"><el-form-item label="版本" class="compact-item"><el-input v-model="form.version" disabled size="small"><template #prepend>v</template></el-input></el-form-item></el-col>
            <el-col :span="12"><el-form-item label="变更" class="compact-item"><el-input v-model="form.change_note" placeholder="更新原因" size="small" /></el-form-item></el-col>
          </el-row>
        </el-form>
        <el-divider style="margin: 8px 0" />
        <h4>节点配置</h4>
        <div v-if="!selectedNode" class="empty-tip"><el-icon><Aim /></el-icon><p>点击画布上的节点进行配置</p></div>
        <div v-else>
          <el-form label-width="80px" size="small">
            <el-form-item label="ID"><el-input :model-value="selectedNode.id" disabled /></el-form-item>
            <el-form-item label="&#33410;&#28857;&#31867;&#22411;"><el-input :model-value="getNodeLabel(selectedNode.type)" disabled /></el-form-item>
            <el-form-item v-if="selectedNode.type !== 'START_TRIGGER'" label="&#31867;&#22411;&#35828;&#26126;"><el-input model-value="&#33410;&#28857;&#39034;&#24207;&#30001;&#30011;&#24067;&#36830;&#32447;&#20915;&#23450;" disabled /></el-form-item>
            <template v-if="(selectedNode.type as string) === 'START_TRIGGER'">
              <el-form-item label="&#35302;&#21457;&#26041;&#24335;"><el-select v-model="startTriggerMode" clearable placeholder="&#36873;&#25321;&#35302;&#21457;&#26041;&#24335;" style="width:100%" @change="changeStartTriggerMode"><el-option v-for="option in startTriggerModeOptions" :key="option.value" :label="option.label" :value="option.value" :disabled="option.disabled" /></el-select></el-form-item>
              <template v-if="startTriggerMode === 'SCHEDULE'">
                <el-form-item label="&#35843;&#24230;&#35745;&#21010;"><div class="schedule-plan-summary"><template v-if="scheduledTemplateTriggers.length"><el-tag v-for="trigger in scheduledTemplateTriggers.slice(0, 2)" :key="trigger.trigger_code" :type="trigger.is_active ? 'success' : 'info'">{{ schedulePlanSummary(trigger) }}</el-tag><span v-if="scheduledTemplateTriggers.length > 2" class="muted">已配置 {{ scheduledTemplateTriggers.length }} 项计划</span></template><span v-else-if="!isSchedulePlanDirty" class="muted">暂未配置</span><el-tag v-if="isSchedulePlanDirty" type="warning">{{ schedulePlanLabel(scheduledPlanSchedule) }}｜待保存</el-tag></div></el-form-item>
                <el-form-item v-if="scheduledTemplateTriggers.length > 1" label="调整计划"><el-select v-model="selectedScheduledTriggerCode" style="width:100%"><el-option v-for="trigger in scheduledTemplateTriggers" :key="trigger.trigger_code" :label="schedulePlanSummary(trigger)" :value="trigger.trigger_code" /></el-select></el-form-item>
                <el-form-item label="执行计划"><ScheduleSelector v-model:schedule="scheduledPlanSchedule" :show-start-time="false" :allow-advanced="false" :allow-manual="false" :show-hint="false" /></el-form-item>
                <el-form-item label="计划状态"><el-switch v-model="scheduledPlanEnabled" active-text="启用" inactive-text="停用" /></el-form-item>
                <div class="start-trigger-hint">选择后会立即预览；点击保存后才会创建或更新该流程的调度计划。</div>
                <el-button type="primary" plain style="width: 100%" :disabled="!scheduledPlanSchedule" :loading="schedulePlanSaving" @click="saveInlineSchedulePlan">{{ selectedScheduledPlan ? '保存调度计划' : '创建调度计划' }}</el-button>
              </template>
              <template v-else-if="startTriggerMode === 'PLATFORM_EVENT'">
                <el-form-item v-if="platformEventTriggers.length > 1" label="&#24050;&#37197;&#20107;&#20214;"><el-select v-model="selectedPlatformEventTriggerCode" clearable placeholder="&#36873;&#25321;&#24050;&#26377;&#24179;&#21488;&#20107;&#20214;" style="width:100%" @change="syncSelectedPlatformEventTrigger"><el-option v-for="trigger in platformEventTriggers" :key="trigger.trigger_code" :label="trigger.trigger_name" :value="trigger.trigger_code" /></el-select></el-form-item>
                <el-form-item label="&#20107;&#20214;&#20998;&#31867;"><el-select v-model="platformEventCategory" clearable placeholder="&#36873;&#25321;&#20107;&#20214;&#20998;&#31867;" style="width:100%" @change="changePlatformEventCategory"><el-option v-for="category in platformEventCategories" :key="category.category" :label="category.category_name" :value="category.category" /></el-select></el-form-item>
                <el-form-item label="&#20107;&#20214;&#26469;&#28304;"><el-select v-model="platformEventSource" clearable :disabled="!platformEventCategory" placeholder="&#20808;&#36873;&#25321;&#20107;&#20214;&#20998;&#31867;" style="width:100%" @change="changePlatformEventSource"><el-option v-for="source in platformEventSources" :key="source.source" :label="source.source_name" :value="source.source" /></el-select></el-form-item>
                <el-form-item label="&#20855;&#20307;&#20107;&#20214;"><el-select v-model="platformEventType" clearable :disabled="!platformEventSource" placeholder="&#20808;&#36873;&#25321;&#20107;&#20214;&#26469;&#28304;" style="width:100%" @change="changePlatformEventType"><el-option v-for="event in platformEventOptions" :key="event.event_type" :label="event.event_name" :value="event.event_type" /></el-select></el-form-item>
                <el-form-item label="&#31579;&#36873;&#23383;&#27573;"><el-select v-model="platformEventFilterField" clearable :disabled="!platformEventType" placeholder="&#19981;&#31579;&#36873;&#21017;&#30041;&#31354;" style="width:100%"><el-option v-for="field in platformEventFilterFields" :key="field" :label="field" :value="field" /></el-select></el-form-item>
                <el-form-item label="&#23383;&#27573;&#20540;"><el-input v-model.trim="platformEventFilterValue" :disabled="!platformEventFilterField" placeholder="&#36755;&#20837;&#31579;&#36873;&#20540;" /></el-form-item>
                <el-form-item label="&#21551;&#29992;&#29366;&#24577;"><el-switch v-model="platformEventEnabled" active-text="&#21551;&#29992;" inactive-text="&#20572;&#29992;" /></el-form-item>
                <div class="start-trigger-hint">&#24179;&#21488;&#20107;&#20214;&#30001;&#31995;&#32479;&#20869;&#37096;&#21457;&#24067;&#12290;&#25968;&#25454;&#21464;&#26356;&#26159;&#24179;&#21488;&#20107;&#20214;&#30340;&#19968;&#31867;&#65292;&#24403;&#21069;&#21487;&#35746;&#38405;&#25968;&#25454;&#20179;&#24211;&#30340;&#20837;&#20179;&#21516;&#27493;&#23436;&#25104;&#21644;&#20837;&#20179;&#25968;&#25454;&#21464;&#26356;&#20107;&#20214;&#12290;</div>
                <el-button type="primary" plain style="width: 100%" :disabled="!currentTpl || !selectedPlatformEventDefinition" :loading="platformEventSaving" @click="savePlatformEventTrigger">{{ selectedPlatformEventTrigger ? '&#20445;&#23384;&#24179;&#21488;&#20107;&#20214;' : '&#21019;&#24314;&#24179;&#21488;&#20107;&#20214;' }}</el-button>
              </template>
              <template v-else>
                <el-form-item v-if="startTriggerNeedsResource" label="&#26469;&#28304;&#31995;&#32479;"><el-select v-model="startTriggerSystemId" clearable filterable placeholder="&#36873;&#25321;&#26469;&#28304;&#31995;&#32479;" style="width:100%" @change="changeStartTriggerSystem"><el-option v-for="system in systems" :key="system.id" :label="system.system_name" :value="system.id" /></el-select></el-form-item>
                <el-form-item v-if="startTriggerNeedsResource" label="&#26469;&#28304;&#36164;&#28304;"><el-select v-model="startTriggerResourceId" clearable filterable :disabled="!startTriggerSystemId" placeholder="&#20808;&#36873;&#25321;&#26469;&#28304;&#31995;&#32479;" style="width:100%" @change="changeStartTriggerResource"><el-option v-for="resource in startTriggerResources" :key="resource.id" :label="resource.resource_name" :value="resource.id" /></el-select></el-form-item>
                <el-form-item label="&#24050;&#32465;&#35302;&#21457;&#22120;"><el-select v-model="selectedStartTriggerCode" clearable filterable :loading="triggerLoading" placeholder="&#25353;&#19978;&#36848;&#26465;&#20214;&#36873;&#25321;&#24050;&#32465;&#35302;&#21457;&#22120;" style="width:100%"><el-option v-for="trigger in filteredStartTriggers" :key="trigger.trigger_code" :label="trigger.trigger_name" :value="trigger.trigger_code"><span>{{ trigger.trigger_name }}</span><span style="float:right;color:#909399">{{ trigger.is_active ? '已启用' : '已停用' }}</span></el-option></el-select></el-form-item>
                <div class="start-trigger-hint">一个流程可绑定多个触发器；实际绑定以触发器配置为准。数据变更触发正在建设中。</div>
                <el-button type="primary" plain style="width: 100%; margin-top: 8px" @click="openStartTriggerConfig">配置触发器</el-button>
              </template>
            </template>
            <template v-else-if="(selectedNode.type as string) === 'CONNECTOR'">
              <el-form-item label="系统"><el-select :model-value="selectedNode.config?.system_id" @change="(v: any) => { if (selectedNode) { const cfg = selectedNode.config || {}; cfg.system_id = v; cfg.system_code = systems.find(x=>x.id===v)?.system_code || ''; selectedNode.config = cfg } }" clearable placeholder="选择系统" style="width:100%"><el-option v-for="s in systems" :key="s.id" :label="`${s.system_code} - ${s.system_name}`" :value="s.id" /></el-select></el-form-item>
              <el-form-item label="资源"><el-select :model-value="selectedNode.config?.resource_id" @change="selectConnectorResource" clearable placeholder="选择资源" style="width:100%" :loading="resourcesLoading"><el-option v-for="r in resourcesOf(selectedNode.config?.system_id as number | null | undefined)" :key="r.id" :label="`${r.resource_code} - ${r.resource_name}`" :value="r.id" /></el-select></el-form-item>
              <el-form-item v-if="selectedNode.config?.adapter_code === 'FEISHU_BITABLE_PULL_ADAPTER'" label="数据对象"><el-select v-model="selectedNode.config.bitable_table_id" clearable filterable placeholder="选择具体多维表格" style="width:100%" @visible-change="(v: boolean) => v && selectedNode && loadBitableTablesForNode(Number(selectedNode.config?.resource_id) || null)"><el-option v-for="item in bitableTableOptions" :key="item.id" :label="`${item.object_code} - ${item.object_name}`" :value="item.id" /></el-select></el-form-item>
              <el-form-item v-if="selectedNode.config?.adapter_code === 'BEISEN_REPORT_PULL_ADAPTER'" label="北森报表"><el-select v-model="selectedNode.config.data_object_id" clearable filterable placeholder="选择待入职人员报表" style="width:100%" @visible-change="(v: boolean) => v && selectedNode && loadResourceDataObjects(Number(selectedNode.config?.resource_id) || null)"><el-option v-for="item in resourceDataObjects" :key="item.id" :label="`${item.object_code} - ${item.object_name}`" :value="item.id" /></el-select></el-form-item>
              <el-form-item label="????"><el-input :model-value="connectorParamsText" @update:model-value="updateConnectorParams" type="textarea" :rows="3" placeholder="{&quot;key&quot;: &quot;value&quot;}" /></el-form-item>
            </template>
            <template v-else-if="(selectedNode.type as string) === 'CAPABILITY'">
              <el-form-item label="系统"><el-select :model-value="selectedNode.config?.system_id" clearable placeholder="选择系统" style="width:100%" @change="selectCapabilitySystem"><el-option v-for="item in capabilitySystems" :key="item.system_id" :label="item.system_name" :value="item.system_id" /></el-select></el-form-item>
              <el-form-item label="对象"><el-select :model-value="selectedNode.config?.object_code" clearable placeholder="选择业务对象" style="width:100%" @change="selectCapabilityObject"><el-option v-for="item in capabilityObjects" :key="item" :label="item" :value="item" /></el-select></el-form-item>
              <el-form-item label="操作"><el-select :model-value="selectedNode.config?.capability_id" clearable placeholder="选择业务能力" style="width:100%" @change="selectCapabilityOperation"><el-option v-for="item in capabilityOperations" :key="item.capability_id" :label="capabilityOptionLabel(item)" :value="item.capability_id" /></el-select></el-form-item>
              <div class="text-muted">显示已启用的只读业务能力；待验证能力可编排，发布或执行前仍需验证成功。</div>
            </template>
            <template v-else-if="(selectedNode.type as string) === 'CAPABILITY_LOOKUP'">
              <el-form-item label="业务系统"><el-select :model-value="selectedNode.config?.system_id" clearable placeholder="选择飞书招聘系统" style="width:100%" @change="selectCapabilitySystem"><el-option v-for="item in capabilitySystems" :key="item.system_id" :label="item.system_name" :value="item.system_id" /></el-select></el-form-item>
              <el-form-item label="业务对象"><el-select :model-value="selectedNode.config?.object_code" clearable placeholder="选择 Offer" style="width:100%" @change="selectCapabilityObject"><el-option v-for="item in capabilityObjects" :key="item" :label="item" :value="item" /></el-select></el-form-item>
              <el-form-item label="Offer 能力"><el-select :model-value="selectedNode.config?.capability_id" clearable placeholder="选择 Offer 查询能力" style="width:100%" @change="selectCapabilityOperation"><el-option v-for="item in capabilityOperations" :key="item.capability_id" :label="capabilityOptionLabel(item)" :value="item.capability_id" /></el-select></el-form-item>
              <div class="text-muted">待验证能力可先编排，发布或执行前仍需验证成功。</div>
              <el-form-item label="投递记录 ID"><el-select v-model="selectedNode.config.lookup_field" allow-create filterable placeholder="选择北森来源字段" style="width:100%"><el-option label="投递记录 ID (application_id)" value="application_id" /></el-select></el-form-item>
              <el-form-item label="失败策略"><el-select v-model="selectedNode.config.failure_policy" style="width:100%"><el-option label="单人失败继续" value="CONTINUE" /><el-option label="遇到失败停止" value="STOP" /></el-select></el-form-item>
            </template>
            <template v-else-if="(selectedNode.type as string) === 'RECORD_MERGE'">
              <el-form-item label="Offer 字段映射"><div class="field-mappings"><div v-for="(mapping, index) in offerMappings" :key="index" class="mapping-row"><el-select v-model="mapping.source" filterable placeholder="选择 Offer 字段" style="width:130px"><el-option v-for="field in offerFieldOptions" :key="field.code" :label="field.label" :value="field.code" /></el-select><span class="mapping-arrow">→</span><el-select v-model="mapping.target" filterable placeholder="选择目标资产字段" style="width:130px"><el-option v-for="column in targetAssetColumns" :key="column.column_code" :label="column.column_label" :value="column.column_code" /></el-select><el-button link size="small" type="danger" @click="removeOfferMapping(index)"><el-icon><Delete /></el-icon></el-button></div><el-button size="small" @click="addOfferMapping">+ 添加 Offer 字段</el-button></div></el-form-item>
              <div class="text-muted">只补全空字段，北森原始字段保持优先。</div>
            </template>
            <template v-else-if="(selectedNode.type as string) === 'WAREHOUSE_ASSET_SINK'">
              <WarehouseAssetSinkConfig v-model="selectedNode.config" />
            </template>
            <template v-else-if="(selectedNode.type as string) === 'LOOP_RESOURCE' || selectedNode.type === 'LOOP'">
              <el-form-item label="系统"><el-select :model-value="selectedNode.config?.system_id" @change="(v: any) => { if (selectedNode) { const cfg = selectedNode.config || {}; cfg.system_id = v; cfg.system_code = systems.find(x=>x.id===v)?.system_code || ''; selectedNode.config = cfg } }" clearable placeholder="选择系统" style="width:100%"><el-option v-for="s in systems" :key="s.id" :label="`${s.system_code} - ${s.system_name}`" :value="s.id" /></el-select></el-form-item>
              <el-form-item label="资源"><el-select :model-value="selectedNode.config?.resource_id" @change="(v: any) => { if (selectedNode) { const cfg = selectedNode.config || {}; cfg.resource_id = v; const r = allResources.find(x=>x.id===v); if(r){cfg.resource_name=r.resource_name;cfg.resource_code=r.resource_code;cfg.adapter_code=r.adapter_code||null} selectedNode.config = cfg } }" clearable placeholder="选择资源" style="width:100%" :loading="resourcesLoading"><el-option v-for="r in resourcesOf(selectedNode.config?.system_id as number | null | undefined)" :key="r.id" :label="`${r.resource_code} - ${r.resource_name}`" :value="r.id" /></el-select></el-form-item>
              <el-form-item label="输入变量"><el-input v-model="selectedNode.config.loop_input" placeholder="${previous_step.data}" /></el-form-item>
              <el-form-item label="并发数"><el-input-number v-model="selectedNode.config.max_concurrency" :min="1" :max="100" /></el-form-item>
            </template>
            <template v-else-if="(selectedNode.type as string) === 'APPROVAL'">
              <el-form-item label="Approval mode"><el-select v-model="selectedNode.config.approval_mode" style="width:100%"><el-option label="Single approver" value="SINGLE" /><el-option label="Any approver" value="ANY" /><el-option label="All approvers" value="ALL" /></el-select></el-form-item>
              <el-form-item label="Approval reason"><el-input v-model="selectedNode.config.reason" type="textarea" :rows="2" /></el-form-item>
              <el-form-item label="Action summary"><el-input v-model="selectedNode.config.action_summary" type="textarea" :rows="2" /></el-form-item>
              <el-form-item label="Approvers JSON"><el-input :model-value="approvalApproversText" @update:model-value="updateApprovalApprovers" type="textarea" :rows="4" placeholder="[{&quot;user_id&quot;: 1, &quot;user_name&quot;: &quot;Approver&quot;}]" /></el-form-item>
            </template>
            <template v-else-if="(selectedNode.type as string) === 'NOTIFY'">
              <el-form-item label="通知模板"><el-select v-model="selectedNode.config.template_id" filterable placeholder="选择通知模板" style="width:100%" @visible-change="(v: boolean) => v && loadNotifyTemplates()"><el-option v-for="t in notifyTemplates" :key="t.id" :label="t.template_name" :value="t.id" /></el-select></el-form-item>
              <el-form-item label="接收人"><el-input v-model="selectedNode.config.receivers" placeholder="open_id 逗号分隔" /></el-form-item>
            </template>
            <template v-else-if="selectedNode.type === 'BRANCH'">
              <el-form-item label="匹配方式"><el-radio-group v-model="branchConditionAst.mode"><el-radio value="ALL">同时满足</el-radio><el-radio value="ANY">满足任一</el-radio></el-radio-group></el-form-item>
              <el-form-item v-for="(rule, index) in branchConditionAst.rules" :key="index" :label="`条件 ${index + 1}`"><div class="mapping-row"><el-select v-model="rule.left_field_id" filterable placeholder="上游字段" style="width:150px"><el-option v-for="field in upstreamFields" :key="field.name" :label="field.name" :value="field.name" /></el-select><el-select v-model="rule.operator" style="width:125px"><el-option label="等于" value="EQ" /><el-option label="不等于" value="NE" /><el-option label="包含" value="CONTAINS" /><el-option label="大于" value="GT" /><el-option label="大于等于" value="GTE" /><el-option label="小于" value="LT" /><el-option label="小于等于" value="LTE" /><el-option label="为空" value="IS_EMPTY" /><el-option label="不为空" value="NOT_EMPTY" /></el-select><el-input v-if="!['IS_EMPTY','NOT_EMPTY'].includes(rule.operator)" v-model="rule.right" placeholder="固定值" style="width:150px" /><el-button link type="danger" @click="removeBranchRule(index)">删除</el-button></div></el-form-item>
              <el-button size="small" @click="addBranchRule">添加条件</el-button>
              <el-alert title="条件只可选择上游字段、运算符和固定值；不支持代码或表达式。" type="info" :closable="false" style="margin-top: 10px" />
              <el-form-item v-for="edge in selectedBranchEdges" :key="`${edge.from}-${edge.to}`" :label="`? ${branchTargetName(edge.to)}`" style="margin-top: 10px">
                <el-select :model-value="branchRouteForEdge(edge)" @update:model-value="updateBranchEdgeRoute(edge, $event as string)" style="width: 100%">
                  <el-option v-for="option in branchRouteOptions" :key="option.value" :label="option.label" :value="option.value" />
                </el-select>
              </el-form-item>
            </template>
            <template v-else-if="(selectedNode.type as string) === 'TRANSFORM'">
              <MappingWorkspace
                :model-value="transformMappingDocument"
                :policy="transformMappingPolicy"
                :compatibility="transformMappingCompatibility"
                :source-fields="transformSourceFields"
                :target-fields="transformTargetFields"
                @update:model-value="onTransformMappingChange"
              />
              <div v-if="transformMappingMigrationHint" class="mapping-migration-hint">{{ transformMappingMigrationHint }}</div>
              <div v-if="transformMappingLossyBlocked" class="mapping-lossy-blocked">当前映射包含无法无损回写 Legacy v1 的规则或字段，保存已阻断；请保留原配置或确认迁移为 component_v1。</div>
            </template>
            <template v-else><el-form-item v-for="(schema, key) in (getNodeSchema(selectedNode.type) || {})" :key="key" :label="key"><el-input :model-value="stringifyConfig(selectedNode.config?.[key])" @update:model-value="(v: string) => updateNodeConfig(key, v)" :placeholder="schema" type="textarea" :rows="2" /></el-form-item></template>
          </el-form>
        </div>
      </div>
    </div>

    <el-dialog v-model="versionsVisible" title="版本历史" width="640px">
      <el-table :data="versions" stripe border>
        <el-table-column prop="version" label="版本" width="120"><template #default="{ row }"><el-tag size="small">v{{ row.version }}</el-tag></template></el-table-column>
        <el-table-column prop="change_note" label="变更说明" /><el-table-column prop="created_by" label="操作人" width="120" />
        <el-table-column prop="created_at" label="时间" width="180"><template #default="{ row }">{{ formatDateTime(row.created_at) }}</template></el-table-column>
        <el-table-column label="操作" width="100"><template #default="{ row }"><el-button size="small" link type="warning" @click="rollbackTo(row)">回滚到此版</el-button></template></el-table-column>
      </el-table>
    </el-dialog>
    <el-drawer v-model="dryRunVisible" title="试运行结果" size="520px">
      <el-alert type="info" :closable="false" show-icon title="试运行只执行可读节点；通知、审批、等待及落库节点会被安全跳过。" />
      <el-empty v-if="!dryRunResult?.node_results?.length" description="暂无可展示的节点结果" />
      <el-timeline v-else class="dry-run-results">
        <el-timeline-item v-for="item in dryRunResult.node_results" :key="item.node_id" :type="item.status === 'SKIPPED_SIDE_EFFECT' ? 'warning' : item.status === 'FAILED' ? 'danger' : 'success'">
          <div class="dry-run-result-title">
            <strong>{{ item.node_id }}</strong>
            <el-tag size="small" :type="item.status === 'SKIPPED_SIDE_EFFECT' ? 'warning' : item.status === 'FAILED' ? 'danger' : 'success'">{{ item.status === 'SKIPPED_SIDE_EFFECT' ? '已安全跳过' : item.status === 'FAILED' ? '执行失败' : '执行完成' }}</el-tag>
          </div>
          <div v-if="item.output_summary?.row_count !== undefined" class="dry-run-result-meta">处理记录：{{ item.output_summary.row_count }} 条</div>
          <div v-if="item.message" class="dry-run-result-message">{{ item.message }}</div>
          <div v-if="item.suggested_action" class="dry-run-result-action">建议：{{ item.suggested_action }}</div>
        </el-timeline-item>
      </el-timeline>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { formatDateTime } from '@/utils/datetime'
import { ref, reactive, computed, nextTick, onBeforeUnmount, onMounted, watch, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Connection, MagicStick, Share, Refresh, Delete, Aim, Box, Document, DataBoard, BellFilled, TrendCharts, UserFilled, Setting, Warning, Clock, Edit, FolderOpened, Key, Grid } from '@element-plus/icons-vue'
import { pipelineTemplateApi, ucpApi, type PipelineTemplate, type PipelineNode, type PipelineEdge, type NodeTypeMeta } from '@/api/ucp'
import { listAssets, listAssetColumns, type Asset, type AssetColumn } from '@/api/warehouse'
import ScheduleSelector from '@/components/common/ScheduleSelector.vue'
import MappingWorkspace from '@/components/mapping/MappingWorkspace.vue'
import WarehouseAssetSinkConfig from '@/components/ucp/WarehouseAssetSinkConfig.vue'
import {
  createEmptyDocument,
  type MappingCaller,
  type MappingCompatibility,
  type MappingDocument,
  type MappingRule,
  type MappingRuleType,
  type MappingCallerPolicy,
} from '@/api/mapping'

interface SystemItem { id: number; system_code: string; system_name: string }
interface ResourceItem { id: number; resource_code: string; resource_name: string; system_id: number; adapter_code?: string | null }
interface VersionItem { id: number; version: string; change_note: string | null; created_by: string; created_at: string | null }
interface ResourceDataObject { id: number; object_code: string; object_name: string; is_active: boolean }

const nodeTypes = ref<NodeTypeMeta[]>([])
const fixedNodeTypes = computed(() => nodeTypes.value.filter((nodeType) => nodeType.type === 'START_TRIGGER'))
const paletteNodeTypes = computed(() => nodeTypes.value.filter((nodeType) => nodeType.palette && nodeType.type !== 'START_TRIGGER'))
const ICON_MAP: Record<string, any> = { Connection, MagicStick, Share, Refresh, Delete, Aim, Box, Document, Plus, DataBoard, BellFilled, TrendCharts, UserFilled, Setting, Warning, Clock, Edit, FolderOpened, Key, Grid }
function resolveIcon(name: string) { return ICON_MAP[name] || Box }

async function loadNodeTypes(): Promise<void> {
  try {
    const meta = await pipelineTemplateApi.nodeTypes()
    nodeTypes.value = meta.node_types
  } catch {
    nodeTypes.value = []
    ElMessage.error('Unable to load pipeline node catalog')
  }
}

const systems = ref<SystemItem[]>([]); const allResources = ref<ResourceItem[]>([]); const resourcesLoading = ref(false)
const capabilityCatalog = ref<any[]>([])
const capabilitySystems = computed(() => Array.from(new Map(capabilityCatalog.value.map(item => [item.system_id, item])).values()))
const capabilityObjects = computed(() => Array.from(new Set(capabilityCatalog.value.filter(item => item.system_id === selectedNode.value?.config?.system_id).map(item => item.object_code))))
const capabilityOperations = computed(() => capabilityCatalog.value.filter(item => item.system_id === selectedNode.value?.config?.system_id && item.object_code === selectedNode.value?.config?.object_code))
async function loadSystemsAndResources(): Promise<void> {
  try { resourcesLoading.value = true; const [sysRes, resRes, capabilityRes] = await Promise.all([ucpApi.systems(), ucpApi.resources({}), ucpApi.capabilityCatalog({ include_unverified: true })]); systems.value = sysRes.items as SystemItem[]; allResources.value = resRes.items as ResourceItem[]; capabilityCatalog.value = capabilityRes }
  catch (e: unknown) { ElMessage.warning(`加载系统/资源失败: ${e instanceof Error ? e.message : String(e)}`) }
  finally { resourcesLoading.value = false }
}
function resourcesOf(systemId: number | undefined | null): ResourceItem[] { if (!systemId) return []; return allResources.value.filter((r) => r.system_id === systemId) }
function capabilityOptionLabel(item: any): string { return item.verification_status === 'VERIFIED' ? item.operation_name : `${item.operation_name}（待验证）` }
function selectConnectorResource(value: number): void {
  if (!selectedNode.value) return
  const resource = allResources.value.find((item) => item.id === value)
  selectedNode.value.config = {
    ...(selectedNode.value.config || {}), resource_id: value,
    resource_name: resource?.resource_name || '', resource_code: resource?.resource_code || '',
    adapter_code: resource?.adapter_code || null, data_object_id: null,
  }
  resourceDataObjects.value = []
  if (resource?.adapter_code === 'BEISEN_REPORT_PULL_ADAPTER') void loadResourceDataObjects(value)
}
function selectCapabilitySystem(value: number) { if (!selectedNode.value) return; selectedNode.value.config = { ...(selectedNode.value.config || {}), system_id: value, object_code: null, capability_id: null, capability_name: '' } }
function selectCapabilityObject(value: string) { if (!selectedNode.value) return; selectedNode.value.config = { ...(selectedNode.value.config || {}), object_code: value, capability_id: null, capability_name: '' } }
function selectCapabilityOperation(value: number) { if (!selectedNode.value) return; const item = capabilityCatalog.value.find(row => row.capability_id === value); if (item) selectedNode.value.config = { ...(selectedNode.value.config || {}), capability_id: value, capability_name: item.operation_name, operation_id: item.operation_id, operation_version: item.operation_version } }
interface OfferFieldMapping { source: string; target: string }
interface OfferFieldOption { code: string; label: string }
const publishedAssets = ref<Asset[]>([])
const targetAssetColumns = ref<AssetColumn[]>([])
const offerMappings = computed<OfferFieldMapping[]>(() => {
  const mappings = (selectedNode.value?.config as Record<string, unknown> | undefined)?.field_mapping
  return Array.isArray(mappings) ? mappings as OfferFieldMapping[] : []
})
function offerCapabilityForMerge(): Record<string, any> | null {
  const mergeNode = selectedNode.value
  if (!mergeNode) return null
  const upstream = findUpstreamNode(mergeNode.id)
  const inputKey = String(mergeNode.config?.input_key || '')
  const sourceNodeId = inputKey.match(/^\$\{([^.}]+)/)?.[1]
  const sourceNode = upstream || form.nodes.find(node => node.id === sourceNodeId)
  const capabilityId = Number(sourceNode?.config?.capability_id || 0)
  return capabilityCatalog.value.find(item => item.capability_id === capabilityId) || null
}
const offerFieldOptions = computed<OfferFieldOption[]>(() => {
  const properties = offerCapabilityForMerge()?.output_schema?.properties
  if (!properties || typeof properties !== 'object') return []
  return Object.entries(properties as Record<string, Record<string, unknown>>).map(([code, schema]) => ({
    code,
    label: String(schema?.label || code),
  }))
})
async function loadPublishedAssets(): Promise<void> { try { publishedAssets.value = (await listAssets({ page: 1, page_size: 200, asset_status: 'published' })).items } catch { publishedAssets.value = [] } }
async function loadTargetAssetColumns(value: string): Promise<void> { try { targetAssetColumns.value = (await listAssetColumns(value)).columns } catch { targetAssetColumns.value = [] } }
async function selectTargetAsset(value: string): Promise<void> { if (!selectedNode.value) return; const config: Record<string, any> = { ...(selectedNode.value.config || {}), target_asset: value, period_field: null, field_whitelist: [] }; delete config.primary_key; selectedNode.value.config = config; await loadTargetAssetColumns(value) }
function addOfferMapping(): void { if (!selectedNode.value) return; const config = { ...(selectedNode.value.config || {}) } as Record<string, unknown>; config.field_mapping = [...offerMappings.value, { source: offerFieldOptions.value[0]?.code || '', target: targetAssetColumns.value[0]?.column_code || '' }]; selectedNode.value.config = config }
function removeOfferMapping(index: number): void { if (!selectedNode.value) return; const config = { ...(selectedNode.value.config || {}) } as Record<string, unknown>; config.field_mapping = offerMappings.value.filter((_, itemIndex) => itemIndex !== index); selectedNode.value.config = config }

const currentTpl = ref<PipelineTemplate | null>(null)
const form = reactive<{ template_code: string; name: string; description: string; version: string; change_note: string; nodes: PipelineNode[]; edges: PipelineEdge[] }>({ template_code: '', name: '', description: '', version: '1.0.0', change_note: '', nodes: [], edges: [] })
const selectedNodeId = ref<string | null>(null); const selectedNode = computed(() => form.nodes.find((n) => n.id === selectedNodeId.value) || null)
const selectedBranchEdges = computed(() => selectedNode.value?.type === 'BRANCH' ? form.edges.filter((edge) => edge.from === selectedNode.value?.id) : [])
const branchRouteOptions = [
  { value: 'TRUE', label: '?????True?' },
  { value: 'FALSE', label: '?????False?' },
]
function branchRouteExpression(branchId: string, route: string): string {
  return `BRANCH_${route}:${branchId}`
}
function branchRouteForEdge(edge: PipelineEdge): string {
  const branchId = selectedNode.value?.id || edge.from
  if (edge.condition?.trim() === branchRouteExpression(branchId, 'TRUE')) return 'TRUE'
  if (edge.condition?.trim() === branchRouteExpression(branchId, 'FALSE')) return 'FALSE'
  return ''
}
function updateBranchEdgeRoute(edge: PipelineEdge, route: string): void {
  const branchId = selectedNode.value?.id || edge.from
  edge.condition = branchRouteExpression(branchId, route)
}
function branchTargetName(nodeId: string): string {
  const target = form.nodes.find((node) => node.id === nodeId)
  return target?.label || target?.id || nodeId
}
const nodeMetadata = computed(() => new Map(nodeTypes.value.map((nodeType) => [nodeType.type, nodeType])))
const templateTriggers = ref<any[]>([])
const triggerLoading = ref(false)
const startTriggerModeOptions: Array<{ value: string; label: string; disabled?: boolean }> = [
  { value: 'WEBHOOK', label: 'Webhook 触发' },
  { value: 'SCHEDULE', label: '定时执行' },
  { value: 'MANUAL', label: '人工启动' },
  { value: 'PLATFORM_EVENT', label: '平台事件' },
]
const startTriggerMode = ref('')
const startTriggerSystemId = ref<number | null>(null)
const startTriggerResourceId = ref<number | null>(null)
const selectedStartTriggerCode = ref('')
const selectedScheduledTriggerCode = ref('')
const scheduledPlanSchedule = ref('')
const scheduledPlanEnabled = ref(false)
const schedulePlanSaving = ref(false)
const platformEventCatalog = ref<any[]>([])
const platformEventCategory = ref('')
const platformEventSource = ref('')
const platformEventType = ref('')
const platformEventFilterField = ref('')
const platformEventFilterValue = ref('')
const platformEventEnabled = ref(false)
const selectedPlatformEventTriggerCode = ref('')
const platformEventSaving = ref(false)
const startTriggerNeedsResource = computed(() => startTriggerMode.value === 'WEBHOOK')
const startTriggerResources = computed(() => resourcesOf(startTriggerSystemId.value))
const scheduledTemplateTriggers = computed(() => templateTriggers.value.filter((trigger) => trigger.trigger_type === 'SCHEDULE'))
const selectedScheduledPlan = computed(() => scheduledTemplateTriggers.value.find((trigger) => trigger.trigger_code === selectedScheduledTriggerCode.value))
const platformEventTriggers = computed(() => templateTriggers.value.filter((trigger) => trigger.trigger_type === 'PLATFORM_EVENT'))
const selectedPlatformEventTrigger = computed(() => platformEventTriggers.value.find((trigger) => trigger.trigger_code === selectedPlatformEventTriggerCode.value))
const platformEventCategories = computed(() => Array.from(new Map(platformEventCatalog.value.filter((event) => event.enabled).map((event) => [event.category, event])).values()))
const platformEventSources = computed(() => Array.from(new Map(platformEventCatalog.value.filter((event) => event.enabled && event.category === platformEventCategory.value).map((event) => [event.source, event])).values()))
const platformEventOptions = computed(() => platformEventCatalog.value.filter((event) => event.enabled && event.category === platformEventCategory.value && (!platformEventSource.value || event.source === platformEventSource.value)))
const selectedPlatformEventDefinition = computed(() => platformEventCatalog.value.find((event) => event.event_type === platformEventType.value))
const platformEventFilterFields = computed<string[]>(() => selectedPlatformEventDefinition.value?.filter_fields || [])
const knownScheduleLabels: Record<string, string> = { '0 6 * * *': '每日 06:00', '0 0 * * *': '每日 00:00', '0 */6 * * *': '每 6 小时' }
function schedulePlanLabel(value: string): string { return knownScheduleLabels[value] || (value.startsWith('每日 ') || value.startsWith('每周') || value.startsWith('每月') || value === '每小时整点' || value === '每 6 小时' ? value : '自定义计划') }
function schedulePlanValue(trigger: any): string { return schedulePlanLabel(String(trigger?.schedule_config?.cron || '')) }
function schedulePlanSummary(trigger: any): string { return `${schedulePlanLabel(String(trigger.schedule_config?.cron || ''))}｜${trigger.is_active ? '已启用' : '已停用'}` }
const isSchedulePlanDirty = computed(() => Boolean(scheduledPlanSchedule.value) && (!selectedScheduledPlan.value || scheduledPlanSchedule.value !== schedulePlanValue(selectedScheduledPlan.value) || scheduledPlanEnabled.value !== Boolean(selectedScheduledPlan.value.is_active)))
function syncSelectedSchedulePlan(): void {
  const trigger = selectedScheduledPlan.value
  scheduledPlanSchedule.value = trigger ? schedulePlanValue(trigger) : ''
  scheduledPlanEnabled.value = trigger ? Boolean(trigger.is_active) : false
}
watch(selectedScheduledPlan, syncSelectedSchedulePlan, { immediate: true })
function syncSelectedPlatformEventTrigger(): void {
  const trigger = selectedPlatformEventTrigger.value
  platformEventType.value = trigger?.platform_event_type || ''
  const definition = platformEventCatalog.value.find((event) => event.event_type === platformEventType.value)
  platformEventCategory.value = definition?.category || ''
  platformEventSource.value = definition?.source || ''
  const rule = trigger?.filter_rule || {}
  platformEventFilterField.value = String(rule.path || '').replace(/^\$\./, '')
  platformEventFilterValue.value = rule.value == null ? '' : String(rule.value)
  platformEventEnabled.value = trigger ? Boolean(trigger.is_active) : false
}
watch([selectedPlatformEventTrigger, platformEventCatalog], syncSelectedPlatformEventTrigger, { immediate: true })
function syncStartTriggerModeFromTemplate(): void {
  const trigger = scheduledTemplateTriggers.value[0] || platformEventTriggers.value[0] || templateTriggers.value[0]
  startTriggerMode.value = trigger?.trigger_type || ''
  selectedStartTriggerCode.value = trigger?.trigger_code || ''
  selectedScheduledTriggerCode.value = startTriggerMode.value === 'SCHEDULE' ? trigger?.trigger_code || '' : ''
  selectedPlatformEventTriggerCode.value = startTriggerMode.value === 'PLATFORM_EVENT' ? trigger?.trigger_code || '' : ''
  if (startTriggerMode.value === 'SCHEDULE') syncSelectedSchedulePlan()
  if (startTriggerMode.value === 'PLATFORM_EVENT') syncSelectedPlatformEventTrigger()
}
const filteredStartTriggers = computed(() => templateTriggers.value.filter((trigger) => {
  if (startTriggerMode.value && trigger.trigger_type !== startTriggerMode.value) return false
  if (startTriggerResourceId.value && trigger.source_resource_id !== startTriggerResourceId.value) return false
  if (!startTriggerSystemId.value) return true
  const resource = allResources.value.find((item) => item.id === trigger.source_resource_id)
  return resource?.system_id === startTriggerSystemId.value
}))
function startTriggerTypeLabel(value: string): string { return startTriggerModeOptions.find((item) => item.value === value)?.label || value }
function resetStartTriggerSelection(): void { startTriggerSystemId.value = null; startTriggerResourceId.value = null; selectedStartTriggerCode.value = '' }
function changeStartTriggerMode(): void { resetStartTriggerSelection(); if (startTriggerMode.value === 'SCHEDULE') { selectedScheduledTriggerCode.value = scheduledTemplateTriggers.value[0]?.trigger_code || ''; syncSelectedSchedulePlan() }; if (startTriggerMode.value === 'PLATFORM_EVENT') { selectedPlatformEventTriggerCode.value = platformEventTriggers.value[0]?.trigger_code || ''; syncSelectedPlatformEventTrigger() } }
function changeStartTriggerSystem(): void { startTriggerResourceId.value = null; selectedStartTriggerCode.value = '' }
function changeStartTriggerResource(): void { selectedStartTriggerCode.value = '' }
function changePlatformEventCategory(): void { platformEventSource.value = platformEventSources.value[0]?.source || ''; platformEventType.value = ''; platformEventFilterField.value = ''; platformEventFilterValue.value = '' }
function changePlatformEventSource(): void { platformEventType.value = ''; platformEventFilterField.value = ''; platformEventFilterValue.value = '' }
function changePlatformEventType(): void { platformEventFilterField.value = ''; platformEventFilterValue.value = '' }
function openStartTriggerConfig(): void {
  if (!currentTpl.value) { ElMessage.warning('请先保存流程，再配置实际触发器'); return }
  if (['SCHEDULE', 'PLATFORM_EVENT'].includes(startTriggerMode.value)) return
  router.push({ path: '/ucp/events/triggers', query: { template_code: form.template_code, trigger_type: startTriggerMode.value || 'WEBHOOK' } })
}
function scheduleTriggerCode(): string { return `${form.template_code.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 52)}_SCHEDULE` }
function platformEventTriggerCode(): string { return `${form.template_code.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 45)}_PLATFORM_EVENT` }
async function saveInlineSchedulePlan(): Promise<void> {
  if (!currentTpl.value || !scheduledPlanSchedule.value) return
  const existing = selectedScheduledPlan.value
  const payload = {
    trigger_code: existing?.trigger_code || scheduleTriggerCode(), trigger_name: existing?.trigger_name || `${form.name || form.template_code}定时执行`, pipeline_template_code: form.template_code,
    trigger_type: 'SCHEDULE', source_resource_object_id: null, filter_rule: existing?.filter_rule || {}, schedule_config: { ...(existing?.schedule_config || {}), cron: scheduledPlanSchedule.value, timezone: 'Asia/Shanghai' },
    input_schema: existing?.input_schema || {}, idempotency_expression: existing?.idempotency_expression || null, failure_policy: existing?.failure_policy || 'RETRY', run_as_type: existing?.run_as_type || 'SERVICE_ACCOUNT', service_account_code: existing?.service_account_code || null, is_active: scheduledPlanEnabled.value,
  }
  schedulePlanSaving.value = true
  try {
    if (existing) await ucpApi.updatePipelineTrigger(existing.trigger_code, payload)
    else await ucpApi.createPipelineTrigger(payload)
    await loadTemplateTriggers(form.template_code)
    selectedScheduledTriggerCode.value = existing?.trigger_code || payload.trigger_code
    ElMessage.success('调度计划已保存')
  } catch (error: any) { ElMessage.error(error?.response?.data?.detail || '调度计划保存失败') } finally { schedulePlanSaving.value = false }
}
async function savePlatformEventTrigger(): Promise<void> {
  if (!currentTpl.value || !selectedPlatformEventDefinition.value) return
  const existing = selectedPlatformEventTrigger.value
  const filter_rule = platformEventFilterField.value ? { path: `$.${platformEventFilterField.value}`, op: 'eq', value: platformEventFilterValue.value } : {}
  const payload = {
    trigger_code: existing?.trigger_code || platformEventTriggerCode(), trigger_name: existing?.trigger_name || `${form.name || form.template_code}${selectedPlatformEventDefinition.value.event_name}`,
    pipeline_template_code: form.template_code, trigger_type: 'PLATFORM_EVENT', platform_event_type: platformEventType.value, source_resource_object_id: null,
    filter_rule, schedule_config: {}, input_schema: existing?.input_schema || {}, idempotency_expression: existing?.idempotency_expression || null,
    failure_policy: existing?.failure_policy || 'RETRY', run_as_type: existing?.run_as_type || 'SERVICE_ACCOUNT', service_account_code: existing?.service_account_code || null, is_active: platformEventEnabled.value,
  }
  platformEventSaving.value = true
  try {
    if (existing) await ucpApi.updatePipelineTrigger(existing.trigger_code, payload)
    else await ucpApi.createPipelineTrigger(payload)
    await loadTemplateTriggers(form.template_code)
    selectedPlatformEventTriggerCode.value = existing?.trigger_code || payload.trigger_code
    ElMessage.success('平台事件已保存')
  } catch (error: any) { ElMessage.error(error?.response?.data?.detail || '平台事件保存失败') } finally { platformEventSaving.value = false }
}
const connectorParamsText = computed(() => JSON.stringify(selectedNode.value?.config?.params || {}, null, 2))
function updateConnectorParams(value: string): void {
  if (!selectedNode.value) return
  try {
    const params = value.trim() ? JSON.parse(value) : {}
    if (!params || Array.isArray(params) || typeof params !== 'object') throw new Error('params must be an object')
    selectedNode.value.config = { ...(selectedNode.value.config || {}), params }
  } catch {
    ElMessage.error('Connector parameters must be a JSON object')
  }
}

const approvalApproversText = computed(() => JSON.stringify(selectedNode.value?.config?.approvers || [], null, 2))
function updateApprovalApprovers(value: string): void {
  if (!selectedNode.value) return
  try {
    const approvers = value.trim() ? JSON.parse(value) : []
    if (!Array.isArray(approvers) || !approvers.every((item) => item && typeof item === 'object')) throw new Error('approvers must be an array')
    selectedNode.value.config = { ...(selectedNode.value.config || {}), approvers }
  } catch {
    ElMessage.error('Approvers must be a JSON array')
  }
}
const canvasRef = ref<HTMLElement | null>(null); const canvasW = 2000; const canvasH = 1200
const MIN_CANVAS_ZOOM = 0.5
const MAX_CANVAS_ZOOM = 1.4
const canvasZoom = ref(1)
const NODE_CARD_WIDTH = 188
const NODE_CARD_HEIGHT = 96
const NODE_GAP_X = 92
const NODE_GAP_Y = 146
const EDGE_ANCHOR_GAP = 7
type AnchorSide = 'left' | 'right' | 'top' | 'bottom'
const connectorSides: AnchorSide[] = ['left', 'right', 'top', 'bottom']

const isCanvasPanning = ref(false)
let canvasPan: { startX: number; startY: number; scrollLeft: number; scrollTop: number; didPan: boolean } | null = null
let suppressCanvasClick = false
function startCanvasPan(event: MouseEvent): void {
  const viewport = canvasRef.value
  const target = event.target instanceof Element ? event.target : null
  if (!viewport || event.button !== 0 || target?.closest('[data-node-id]')) return
  canvasPan = { startX: event.clientX, startY: event.clientY, scrollLeft: viewport.scrollLeft, scrollTop: viewport.scrollTop, didPan: false }
  window.addEventListener('mousemove', onCanvasPanMove)
  window.addEventListener('mouseup', onCanvasPanEnd)
}
function onCanvasPanMove(event: MouseEvent): void {
  const viewport = canvasRef.value
  if (!canvasPan || !viewport) return
  const deltaX = event.clientX - canvasPan.startX
  const deltaY = event.clientY - canvasPan.startY
  if (!canvasPan.didPan && Math.hypot(deltaX, deltaY) < 3) return
  canvasPan.didPan = true
  isCanvasPanning.value = true
  viewport.scrollLeft = Math.max(0, canvasPan.scrollLeft - deltaX)
  viewport.scrollTop = Math.max(0, canvasPan.scrollTop - deltaY)
}
function onCanvasPanEnd(): void {
  const didPan = canvasPan?.didPan || false
  canvasPan = null
  isCanvasPanning.value = false
  window.removeEventListener('mousemove', onCanvasPanMove)
  window.removeEventListener('mouseup', onCanvasPanEnd)
  if (didPan) {
    suppressCanvasClick = true
    window.setTimeout(() => { suppressCanvasClick = false }, 0)
  }
}
function onCanvasClick(): void {
  if (suppressCanvasClick) { suppressCanvasClick = false; return }
  deselectNode()
}

let dragNode: PipelineNode | null = null; let dragOffset = { x: 0, y: 0 }
function startDrag(e: MouseEvent, node: PipelineNode): void { dragNode = node; const point = canvasPoint(e.clientX, e.clientY); dragOffset.x = point.x - node.x; dragOffset.y = point.y - node.y; window.addEventListener('mousemove', onDragMove); window.addEventListener('mouseup', onDragEnd) }
function canvasPoint(clientX: number, clientY: number): { x: number; y: number } {
  const viewport = canvasRef.value
  if (!viewport) return { x: 0, y: 0 }
  const rect = viewport.getBoundingClientRect()
  return { x: (clientX - rect.left + viewport.scrollLeft) / canvasZoom.value, y: (clientY - rect.top + viewport.scrollTop) / canvasZoom.value }
}
function onDragMove(e: MouseEvent): void { if (!dragNode || !canvasRef.value) return; const point = canvasPoint(e.clientX, e.clientY); dragNode.x = Math.max(0, Math.min(canvasW - NODE_CARD_WIDTH, point.x - dragOffset.x)); dragNode.y = Math.max(0, Math.min(canvasH - NODE_CARD_HEIGHT, point.y - dragOffset.y)) }
function onDragEnd(): void { dragNode = null; window.removeEventListener('mousemove', onDragMove); window.removeEventListener('mouseup', onDragEnd) }

let connectFrom: { node: PipelineNode; side: AnchorSide } | null = null; interface DrawingEdge { fromNodeId: string; fromSide: AnchorSide; endX: number; endY: number }
const drawingEdges = ref<DrawingEdge[]>([])
function startConnect(e: MouseEvent, node: PipelineNode, side: AnchorSide): void { connectFrom = { node, side }; window.addEventListener('mousemove', onConnectMove); window.addEventListener('mouseup', onConnectEnd) }
function onConnectMove(e: MouseEvent): void { if (!connectFrom || !canvasRef.value) return; const point = canvasPoint(e.clientX, e.clientY); drawingEdges.value = [{ fromNodeId: connectFrom.node.id, fromSide: connectFrom.side, endX: point.x, endY: point.y }] }
function onConnectEnd(e: MouseEvent): void { window.removeEventListener('mousemove', onConnectMove); window.removeEventListener('mouseup', onConnectEnd); if (!connectFrom || !canvasRef.value) { drawingEdges.value = []; connectFrom = null; return }; const targetEl = document.elementFromPoint(e.clientX, e.clientY); const nodeCard = targetEl?.closest?.('[data-node-id]'); if (nodeCard) { const targetId = nodeCard.getAttribute('data-node-id') || ''; if (targetId && targetId !== connectFrom.node.id) { const exist = form.edges.find((ed: PipelineEdge) => (ed.from === connectFrom!.node.id && ed.to === targetId) || (ed.from === targetId && ed.to === connectFrom!.node.id)); const newEdge: PipelineEdge = { from: connectFrom.node.id, to: targetId }; if (!exist && form.nodes.find((node) => node.id === newEdge.to)?.type !== 'START_TRIGGER') form.edges.push(newEdge as any) } }; drawingEdges.value = []; connectFrom = null }

function onPaletteDragStart(e: DragEvent, type: string): void { e.dataTransfer?.setData('nodeType', type) }
function onCanvasDrop(e: DragEvent): void { if (!canvasRef.value) return; const type = e.dataTransfer?.getData('nodeType'); if (!type) return; if (type === 'START_TRIGGER' && form.nodes.some((node) => node.type === 'START_TRIGGER')) { ElMessage.warning('每个流程只能添加一个流程起点'); return }; const point = canvasPoint(e.clientX, e.clientY); const newNode: any = { id: type === 'START_TRIGGER' ? 'start_trigger' : `node_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, type, label: '', x: Math.max(0, point.x - NODE_CARD_WIDTH / 2), y: Math.max(0, point.y - NODE_CARD_HEIGHT / 2), config: type === 'START_TRIGGER' ? { mode: 'OR', trigger_types: ['WEBHOOK', 'SCHEDULE', 'MANUAL', 'PLATFORM_EVENT'], management_path: '/ucp/events/triggers' } : {} }; form.nodes.push(newNode); selectedNodeId.value = newNode.id }
function selectNode(node: PipelineNode): void {
  selectedNodeId.value = node.id
  if (node.type === 'CONNECTOR' && node.config?.resource_id && (node.config?.adapter_code === 'BEISEN_REPORT_PULL_ADAPTER' || node.config?.data_object_id)) {
    void loadResourceDataObjects(Number(node.config.resource_id))
  }
}
function deselectNode(): void { selectedNodeId.value = null }
function removeNode(id: string): void { if (form.nodes.find((node) => node.id === id)?.type === 'START_TRIGGER') return; form.nodes = form.nodes.filter((n) => n.id !== id); form.edges = form.edges.filter((e: any) => e.from !== id && e.to !== id); if (selectedNodeId.value === id) selectedNodeId.value = null }

function getNodeMetadata(type: string): NodeTypeMeta | undefined { return nodeMetadata.value.get(type as PipelineNode['type']) }
function getNodeColor(type: string): string { return getNodeMetadata(type)?.color || '#dcdfe6' }
function getNodeLabel(type: string): string { return getNodeMetadata(type)?.label || type }
type CanvasNodeStatus = { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }
function nodeSummaryLines(node: PipelineNode): string[] {
  const config = (node.config || {}) as Record<string, any>
  if (node.type === 'TRANSFORM') {
    const document = config.mapping_component as MappingDocument | undefined
    const legacy = config.mapping as Record<string, any> | undefined
    const rules = document?.ruleSet?.rules || legacy?.rules || []
    return [`${Array.isArray(rules) ? rules.length : 0} 条映射规则`, config.storageMode === 'component_v1' || document ? 'component_v1' : 'legacy_v1']
  }
  if (node.type === 'START_TRIGGER') {
    if (startTriggerMode.value === 'SCHEDULE') return ['定时执行', scheduledPlanSchedule.value ? schedulePlanLabel(scheduledPlanSchedule.value) : '尚未配置计划']
    if (startTriggerMode.value === 'PLATFORM_EVENT') {
      const event = selectedPlatformEventDefinition.value
      return ['平台事件', event ? `${event.source_name} · ${event.event_name}` : '请选择具体事件']
    }
    const trigger = templateTriggers.value.find((item) => item.trigger_type === startTriggerMode.value) || templateTriggers.value[0]
    return [startTriggerMode.value ? startTriggerTypeLabel(startTriggerMode.value) : '尚未配置触发方式', trigger?.trigger_name || '点击节点完成配置']
  }
  if (node.type === 'CONNECTOR') return [config.system_code || '未选择系统', config.resource_name || config.resource_code || '未选择资源']
  if (String(node.type).includes('CAPABILITY')) return [config.capability_name || config.operation_name || '未选择业务能力', config.object_code || '等待配置']
  if (node.type === 'RECORD_MERGE') return [`${Array.isArray(config.field_mapping) ? config.field_mapping.length : 0} 条合并规则`, config.primary_key || config.merge_key || '等待配置主键']
  if (node.type === 'WAREHOUSE_ASSET_SINK') return [config.target_asset_name || config.target_asset || '未选择目标资产', config.write_mode === 'upsert' ? '追加或更新' : config.write_mode || '等待配置写入策略']
  if (node.type === 'BRANCH') return [config.condition || '未设置判断条件', '配置分支路由']
  if (node.type === 'APPROVAL') return [config.approval_mode || '单人审批', config.action_summary || '等待配置审批内容']
  if (node.type === 'NOTIFY') return [config.template_code || '未选择通知模板', Array.isArray(config.receivers) && config.receivers.length ? `${config.receivers.length} 位接收人` : '未设置接收人']
  return [Object.keys(config).length ? `${Object.keys(config).length} 项配置` : '等待配置', '']
}
function nodeStatus(node: PipelineNode): CanvasNodeStatus {
  if (node.type === 'START_TRIGGER') {
    if (startTriggerMode.value === 'SCHEDULE' && isSchedulePlanDirty.value) return { label: '待保存', tone: 'warning' }
    if (startTriggerMode.value === 'PLATFORM_EVENT' && platformEventType.value && !selectedPlatformEventTrigger.value) return { label: '待保存', tone: 'warning' }
    return templateTriggers.value.length ? { label: '已配置', tone: 'success' } : { label: '待配置', tone: 'warning' }
  }
  if (nodeHasError(node)) return { label: '待配置', tone: 'danger' }
  return { label: '已配置', tone: 'success' }
}
function getNodeSchema(type: string): Record<string, string> { return getNodeMetadata(type)?.config_schema || {} }
function stringifyConfig(v: any): string { if (v === undefined || v === null) return ''; if (Array.isArray(v)) return v.join(', '); return String(v) }
function updateNodeConfig(key: string, value: string): void { if (!selectedNode.value) return; const cfg = { ...(selectedNode.value.config || {}) } as Record<string, any>; if (value === '') { delete cfg[key] } else if (value.includes(',')) { cfg[key] = value.split(',').map((s: string) => s.trim()) } else { cfg[key] = value }; selectedNode.value.config = cfg }
async function loadBitableTablesForNode(resourceId: number | null | undefined) {
  if (!resourceId) { bitableTableOptions.value = []; return }
  try { bitableTableOptions.value = (await (ucpApi as any).bitableTables(resourceId, { is_active: true })).items || [] }
  catch { bitableTableOptions.value = [] }
}
function nodeHasError(node: PipelineNode): boolean {
  const type = node.type as string
  if (type === 'CAPABILITY') return !node.config?.capability_id
  if (type === 'TRANSFORM') {
    const config = (node.config || {}) as Record<string, any>
    const document = config.mapping_component as MappingDocument | undefined
    const legacy = config.mapping as Record<string, any> | undefined
    const rules = document?.ruleSet?.rules || legacy?.rules
    return !Array.isArray(rules) || (config.storageMode !== 'component_v1' && config.mapping_component && !config.mapping)
  }
  if (type === 'BRANCH') {
    const outgoing = form.edges.filter((edge) => edge.from === node.id)
    const expected = new Set([branchRouteExpression(node.id, 'TRUE'), branchRouteExpression(node.id, 'FALSE')])
    return !((node.config as any)?.condition_ast?.rules?.length) || outgoing.length !== 2 || new Set(outgoing.map((edge) => edge.condition?.trim() || '')).size !== 2 || !outgoing.every((edge) => expected.has(edge.condition?.trim() || ''))
  }
  if (type !== 'CONNECTOR') return false
  if (!node.config?.system_id || !node.config?.resource_id) return true
  if (node.config?.adapter_code === 'FEISHU_BITABLE_PULL_ADAPTER') return !node.config?.bitable_table_id
  if (node.config?.adapter_code === 'BEISEN_REPORT_PULL_ADAPTER') return !node.config?.data_object_id
  return false
}


// ===== TRANSFORM 字段映射 =====
const bitableTableOptions = ref<any[]>([])
const resourceDataObjects = ref<ResourceDataObject[]>([])
async function loadResourceDataObjects(resourceId: number | null | undefined): Promise<void> {
  if (!resourceId) { resourceDataObjects.value = []; return }
  try { resourceDataObjects.value = ((await ucpApi.resourceDataObjects(resourceId)).items || []).filter((item: ResourceDataObject) => item.is_active) }
  catch { resourceDataObjects.value = [] }
}
const upstreamFields = ref<{ name: string; type: string }[]>([])
const upstreamSourceName = ref('')
const transformMappingDocument = ref<MappingDocument>(createEmptyDocument('ucp_transform', 'UCP Transform'))
const transformMappingCompatibility = ref<MappingCompatibility | null>(null)
const transformMappingStorageMode = ref<'legacy_v1' | 'component_v1'>('component_v1')
const transformLegacyMappingSnapshot = ref<Record<string, any> | null>(null)
const transformLegacyMode = ref<'strict' | 'mapped_plus_same_name'>('strict')

function mappingCatalogField(field: any): { code: string; label: string; type: string } | null {
  const code = String(field?.code ?? field?.field_id ?? field?.name ?? '')
  if (!code) return null
  return { code, label: String(field?.label ?? field?.column_label ?? code), type: String(field?.type ?? field?.data_type ?? 'string') }
}
function catalogFields(value: unknown): Array<{ code: string; label: string; type?: string }> {
  if (!Array.isArray(value)) return []
  return value.map((field) => mappingCatalogField(field)).filter(Boolean) as Array<{ code: string; label: string; type?: string }>
}
function mappingRuleFromLegacy(rawRule: any, index: number): MappingRule | null {
  if (!rawRule || (rawRule.source_kind !== undefined && rawRule.source_kind !== 'upstream_field')) return null
  if (typeof rawRule.source_field_id !== 'string' || typeof rawRule.target_field_id !== 'string') return null
  return {
    id: `legacy_${index}`,
    type: 'field',
    enabled: true,
    displayOrder: index,
    sourceFields: [rawRule.source_field_id],
    targetFields: [rawRule.target_field_id],
    config: { mode: 'rename' },
  }
}
function documentFromTransformConfig(config: Record<string, any>): { document: MappingDocument; compatibility: MappingCompatibility; storageMode: 'legacy_v1' | 'component_v1'; snapshot: Record<string, any> | null } {
  const component = config.mapping_component
  if (component && typeof component === 'object') {
    const document = JSON.parse(JSON.stringify(component)) as MappingDocument
    const legacySnapshot = config.legacy_mapping_snapshot && typeof config.legacy_mapping_snapshot === 'object'
      ? config.legacy_mapping_snapshot
      : config.mapping
    const snapshot = legacySnapshot && typeof legacySnapshot === 'object' ? JSON.parse(JSON.stringify(legacySnapshot)) : null
    return {
      document,
      storageMode: 'component_v1',
      snapshot,
      compatibility: { sourceFormat: 'ucp_transform_component_v1', readable: true, writable: true, requiresMigration: false, lossyFields: [], unknownFields: snapshot ? { legacy_mapping_snapshot: snapshot } : {} },
    }
  }
  const legacy = config.mapping
  if (!legacy || typeof legacy !== 'object') {
    return {
      document: createEmptyDocument('ucp_transform', 'UCP Transform'),
      storageMode: 'component_v1',
      snapshot: null,
      compatibility: { sourceFormat: 'ucp_transform_component_v1', readable: true, writable: true, requiresMigration: false, lossyFields: [], unknownFields: {} },
    }
  }
  const rawRules = Array.isArray(legacy.rules) ? legacy.rules : []
  const rules = rawRules.map(mappingRuleFromLegacy).filter(Boolean) as MappingRule[]
  const lossyFields = [
    ...(legacy.version !== 1 ? ['mapping.version'] : []),
    ...(!['strict', 'mapped_plus_same_name'].includes(legacy.mode ?? 'strict') ? ['mapping.mode'] : []),
    ...(!Array.isArray(legacy.rules) ? ['mapping.rules'] : []),
    ...rawRules.flatMap((rule: any, index: number) => mappingRuleFromLegacy(rule, index) ? [] : [`rules[${index}]`]),
  ]
  const unknownFields: Record<string, any> = {}
  for (const key of Object.keys(legacy)) {
    if (!['version', 'mode', 'source_operation_id', 'source_schema_hash', 'target_operation_id', 'target_schema_hash', 'target_field_catalog', 'rules'].includes(key)) unknownFields[`mapping.${key}`] = legacy[key]
  }
  rawRules.forEach((rule: any, index: number) => {
    if (!rule || typeof rule !== 'object') return
    for (const key of Object.keys(rule)) {
      if (!['source_field_id', 'target_field_id', 'source_kind'].includes(key)) unknownFields[`rules[${index}].${key}`] = rule[key]
    }
  })
  const sourceAsset = legacy.source_operation_id == null ? null : String(legacy.source_operation_id)
  const targetAsset = legacy.target_operation_id == null ? null : String(legacy.target_operation_id)
  const document: MappingDocument = {
    mappingSchemaVersion: 1,
    ruleSet: {
      code: sourceAsset || 'ucp_transform', name: targetAsset || 'UCP Transform', sourceAsset, targetAsset,
      sourceSchemaHash: String(legacy.source_schema_hash || ''), targetSchemaHash: String(legacy.target_schema_hash || ''), rules,
    },
  }
  const snapshot = JSON.parse(JSON.stringify(legacy))
  unknownFields.legacy_mapping_snapshot = snapshot
  unknownFields.__legacy_mapping_mode__ = legacy.mode || 'strict'
  return {
    document,
    storageMode: 'legacy_v1',
    snapshot,
    compatibility: { sourceFormat: 'ucp_transform_legacy_v1', readable: true, writable: lossyFields.length === 0, requiresMigration: lossyFields.length > 0, lossyFields, unknownFields },
  }
}
function selectedTransformConfig(): Record<string, any> | null {
  return selectedNode.value?.type === 'TRANSFORM' ? (selectedNode.value.config || {}) as Record<string, any> : null
}
function transformTargetCatalog(): Array<{ code: string; label: string; type?: string }> {
  const config = selectedTransformConfig()
  const downstream = selectedNode.value && form.edges.filter((edge) => edge.from === selectedNode.value?.id).map((edge) => form.nodes.find((node) => node.id === edge.to)).find(Boolean)
  const downstreamCatalog = catalogFields(downstream?.config?.input_field_catalog || downstream?.config?.target_field_catalog || downstream?.config?.field_catalog)
  const fromAsset = targetAssetColumns.value.map((column) => ({ code: column.column_code, label: column.column_label, type: column.data_type }))
  if (downstreamCatalog.length) return downstreamCatalog
  if (fromAsset.length) return fromAsset
  return catalogFields(config?.target_field_catalog || config?.mapping?.target_field_catalog || transformMappingDocument.value.ruleSet.rules.flatMap((rule) => rule.targetFields.map((code) => ({ code }))))
}
const transformSourceFields = computed(() => upstreamFields.value.map((field) => ({ code: field.name, label: field.name, type: field.type })))
const transformTargetFields = computed(() => transformTargetCatalog())
const transformMappingCaller = computed<MappingCaller>(() => selectedTransformConfig()?.mapping_caller === 'workflow' ? 'workflow' : 'ucp_transform')
const transformMappingPolicy = computed<MappingCallerPolicy>(() => {
  const config = selectedTransformConfig() || {}
  const source = transformSourceFields.value
  const target = transformTargetFields.value
  const policy = config.mapping_policy && typeof config.mapping_policy === 'object' ? config.mapping_policy : {}
  return {
    caller: transformMappingCaller.value,
    allowedRuleTypes: (Array.isArray(policy.allowedRuleTypes) ? policy.allowedRuleTypes : ['field', 'value_map', 'reference_lookup', 'identity_with_overrides', 'type_convert', 'format', 'split_merge']) as MappingRuleType[],
    source: { assetId: transformMappingDocument.value.ruleSet.sourceAsset || null, schemaHash: transformMappingDocument.value.ruleSet.sourceSchemaHash || 'runtime', allowedFieldIds: source.map((field) => field.code) },
    target: { assetId: transformMappingDocument.value.ruleSet.targetAsset || null, schemaHash: transformMappingDocument.value.ruleSet.targetSchemaHash || 'runtime', allowedFieldIds: target.map((field) => field.code), readonlyFieldIds: [], protectedKeyFieldIds: [] },
    referenceLookup: { allowedDatasetIds: Array.isArray(policy.allowedReferenceDatasetIds) ? policy.allowedReferenceDatasetIds : [], allowedFieldIds: Array.isArray(policy.allowedReferenceFieldIds) ? policy.allowedReferenceFieldIds : [], maxRules: Number(policy.maxReferenceRules || 20) },
    effects: { allowPreview: true, allowSave: true, allowPublish: false, allowExecute: true, allowRebuild: false },
    legacy: { sourceFormat: transformMappingCompatibility.value?.sourceFormat || null, allowLegacyRead: true, allowLegacyWrite: transformMappingStorageMode.value === 'legacy_v1', allowMigration: true },
    metadata: { policyVersion: 1, permissionScope: 'ucp.pipelines', issuedAt: new Date().toISOString() },
  }
})
const transformMappingLossyBlocked = computed(() => transformMappingStorageMode.value === 'legacy_v1' && transformMappingCompatibility.value?.writable === false)
const transformMappingMigrationHint = computed(() => {
  if (transformMappingStorageMode.value === 'component_v1') return transformLegacyMappingSnapshot.value ? '已迁移到 component_v1：运行时只执行 mapping_component，legacy_mapping_snapshot 仅用于回滚/兼容。' : '当前使用 component_v1 公共映射文档。'
  if (transformMappingCompatibility.value?.requiresMigration) return '当前为 Legacy v1 只读回显，存在无法无损表达的旧字段；请迁移到 component_v1 后再保存。'
  return '当前为 Legacy v1 兼容回显；仅 field 规则且无损时可继续保存旧结构。'
})

// 从 edges 中找到流入当前节点的上游节点
function findUpstreamNode(nodeId: string): PipelineNode | null {
  const edge = form.edges.find((e: any) => e.to === nodeId)
  if (!edge) return null
  return form.nodes.find((n: any) => n.id === edge.from) || null
}

// 加载上游节点的字段列表
async function loadUpstreamFields(nodeId: string) {
  upstreamFields.value = []
  upstreamSourceName.value = ''
  const upstream = findUpstreamNode(nodeId)
  if (!upstream) return
  const upstreamCatalog = catalogFields(upstream.config?.output_field_catalog || upstream.config?.field_catalog || upstream.config?.mapping_source_catalog)
  if (upstreamCatalog.length) {
    upstreamFields.value = upstreamCatalog.map((field) => ({ name: field.code, type: field.type || 'string' }))
    upstreamSourceName.value = `(${upstream.label || upstream.id})`
    return
  }
  if ((upstream.type as string) !== 'CONNECTOR') return
  const adapterCode = upstream.config?.adapter_code
  if (!adapterCode) return
  upstreamSourceName.value = `(${upstream.config?.resource_name || adapterCode})`
  try {
    const schema = await (ucpApi as any).adapterSchema?.(adapterCode)
    if (schema?.categories) upstreamFields.value = schema.categories.flatMap((c: any) => (c.fields || []).map((f: any) => ({ name: f.name, type: f.type || 'string' })))
  } catch { /* 上游 schema 未就绪 */ }
}

function syncTransformMappingContext(): void {
  const config = selectedTransformConfig()
  if (!config) return
  const result = documentFromTransformConfig(config)
  transformMappingDocument.value = result.document
  transformMappingCompatibility.value = result.compatibility
  transformMappingStorageMode.value = config.storageMode === 'component_v1' || config.mapping_component ? 'component_v1' : result.storageMode
  transformLegacyMappingSnapshot.value = result.snapshot
  transformLegacyMode.value = result.snapshot?.mode === 'mapped_plus_same_name' ? 'mapped_plus_same_name' : 'strict'
}
function isLegacyWritableDocument(document: MappingDocument): boolean {
  return document.ruleSet.rules.every((rule) => rule.type === 'field' && rule.sourceFields.length === 1 && rule.targetFields.length === 1 && (rule.config as any)?.mode === 'rename')
}
function legacyRulesFromDocument(document: MappingDocument, snapshot: Record<string, any> | null): Record<string, any>[] {
  const snapshotRules = Array.isArray(snapshot?.rules) ? snapshot.rules : []
  return document.ruleSet.rules.map((rule, index) => ({
    ...(snapshotRules[index] && typeof snapshotRules[index] === 'object' ? JSON.parse(JSON.stringify(snapshotRules[index])) : {}),
    source_field_id: rule.sourceFields[0],
    target_field_id: rule.targetFields[0],
    source_kind: 'upstream_field',
  }))
}
function writeTransformMappingConfig(document: MappingDocument): void {
  if (!selectedNode.value || selectedNode.value.type !== 'TRANSFORM') return
  const config = { ...(selectedNode.value.config || {}) } as Record<string, any>
  const compatibility = transformMappingCompatibility.value
  const canUseLegacy = transformMappingStorageMode.value === 'legacy_v1' && isLegacyWritableDocument(document) && compatibility?.writable !== false
  const sourceCatalog = transformSourceFields.value.map((field, ordinal) => ({ field_id: field.code, label: field.label, type: field.type || 'string', sensitive: false, parent_field_id: null, ordinal }))
  const targetCatalog = transformTargetFields.value.map((field, ordinal) => ({ field_id: field.code, label: field.label, type: field.type || 'string', sensitive: false, parent_field_id: null, ordinal }))
  if (canUseLegacy) {
    const legacy = transformLegacyMappingSnapshot.value ? JSON.parse(JSON.stringify(transformLegacyMappingSnapshot.value)) : {}
    legacy.version = 1
    legacy.mode = transformLegacyMode.value
    legacy.source_schema_hash = document.ruleSet.sourceSchemaHash
    legacy.target_schema_hash = document.ruleSet.targetSchemaHash
    if (!Array.isArray(legacy.target_field_catalog)) legacy.target_field_catalog = targetCatalog
    legacy.rules = legacyRulesFromDocument(document, transformLegacyMappingSnapshot.value)
    config.mapping = legacy
    delete config.mapping_component
    delete config.legacy_mapping_snapshot
    config.storageMode = 'legacy_v1'
  } else {
    config.mapping_component = JSON.parse(JSON.stringify(document))
    config.storageMode = 'component_v1'
    if (transformLegacyMappingSnapshot.value) {
      config.mapping = JSON.parse(JSON.stringify(transformLegacyMappingSnapshot.value))
      config.legacy_mapping_snapshot = JSON.parse(JSON.stringify(transformLegacyMappingSnapshot.value))
    }
  }
  config.mapping_source_catalog = sourceCatalog
  config.mapping_target_catalog = targetCatalog
  selectedNode.value.config = config
  transformMappingStorageMode.value = canUseLegacy ? 'legacy_v1' : 'component_v1'
  transformMappingDocument.value = document
}
function onTransformMappingChange(document: MappingDocument): void {
  document = JSON.parse(JSON.stringify(document)) as MappingDocument
  const hasNonFieldRule = document.ruleSet.rules.some((rule) => rule.type !== 'field')
  if (hasNonFieldRule) transformMappingStorageMode.value = 'component_v1'
  if (transformMappingCompatibility.value?.writable === false && !selectedTransformConfig()?.mapping_component && !hasNonFieldRule) return
  writeTransformMappingConfig(document)
}
// ===== NOTIFY 通知模板 =====
const notifyTemplates = ref<Array<{ id: number; template_name: string; template_code: string }>>([])
async function loadNotifyTemplates() { try { const r = await (ucpApi as any).listNotificationTemplates?.({ is_active: 1, limit: 200 }); notifyTemplates.value = r?.items || [] } catch {} }

// ===== BRANCH 结构化条件 =====
const branchConditionAst = computed<any>(() => {
  const config = selectedNode.value?.config || {}
  if (!config.condition_ast) config.condition_ast = { version: 1, mode: 'ALL', rules: [] }
  config.condition_field_catalog = upstreamFields.value.map((field, ordinal) => ({ field_id: field.name, label: field.name, type: field.type || 'string', sensitive: false, parent_field_id: null, ordinal }))
  return config.condition_ast
})
function addBranchRule() { branchConditionAst.value.rules.push({ left_field_id: '', operator: 'EQ', right: '' }) }
function removeBranchRule(index: number) { branchConditionAst.value.rules.splice(index, 1) }

// 监听节点选中，同步映射
watch(selectedNodeId, async (newId) => {
  if (!newId) { upstreamFields.value = []; upstreamSourceName.value = ''; transformMappingCompatibility.value = null; transformLegacyMappingSnapshot.value = null; return }
  await loadUpstreamFields(newId)
  if (selectedNode.value?.type === 'TRANSFORM') syncTransformMappingContext()
  const node = selectedNode.value
  if ((node?.type as string) === 'START_TRIGGER') resetStartTriggerSelection()
  if ((node?.type as string) === 'RECORD_MERGE') {
    const sinkNode = form.nodes.find(item => (item.type as string) === 'WAREHOUSE_ASSET_SINK')
    const targetAsset = String(sinkNode?.config?.target_asset || '')
    if (targetAsset) await loadTargetAssetColumns(targetAsset)
  }
})
interface EdgeAnchor { x: number; y: number; side: AnchorSide }
interface CoordEdge { fromX: number; fromY: number; toX: number; toY: number; fromSide: AnchorSide; toSide: AnchorSide }
function nodeAnchor(node: PipelineNode, side: AnchorSide): EdgeAnchor { if (side === 'left') return { x: node.x - EDGE_ANCHOR_GAP, y: node.y + NODE_CARD_HEIGHT / 2, side }; if (side === 'right') return { x: node.x + NODE_CARD_WIDTH + EDGE_ANCHOR_GAP, y: node.y + NODE_CARD_HEIGHT / 2, side }; if (side === 'top') return { x: node.x + NODE_CARD_WIDTH / 2, y: node.y - EDGE_ANCHOR_GAP, side }; return { x: node.x + NODE_CARD_WIDTH / 2, y: node.y + NODE_CARD_HEIGHT + EDGE_ANCHOR_GAP, side } }
function edgeAnchors(from: PipelineNode, to: PipelineNode): { from: EdgeAnchor; to: EdgeAnchor } { const fromCenterX = from.x + NODE_CARD_WIDTH / 2; const fromCenterY = from.y + NODE_CARD_HEIGHT / 2; const toCenterX = to.x + NODE_CARD_WIDTH / 2; const toCenterY = to.y + NODE_CARD_HEIGHT / 2; const deltaX = toCenterX - fromCenterX; const deltaY = toCenterY - fromCenterY; if (Math.abs(deltaX) >= Math.abs(deltaY)) return deltaX >= 0 ? { from: nodeAnchor(from, 'right'), to: nodeAnchor(to, 'left') } : { from: nodeAnchor(from, 'left'), to: nodeAnchor(to, 'right') }; return deltaY >= 0 ? { from: nodeAnchor(from, 'bottom'), to: nodeAnchor(to, 'top') } : { from: nodeAnchor(from, 'top'), to: nodeAnchor(to, 'bottom') } }
function storedEdge(e: PipelineEdge): CoordEdge { const from = form.nodes.find((node) => node.id === e.from); const to = form.nodes.find((node) => node.id === e.to); if (!from || !to) return { fromX: 0, fromY: 0, toX: 0, toY: 0, fromSide: 'right', toSide: 'left' }; const anchors = edgeAnchors(from, to); return { fromX: anchors.from.x, fromY: anchors.from.y, toX: anchors.to.x, toY: anchors.to.y, fromSide: anchors.from.side, toSide: anchors.to.side } }
function edgePath(e: DrawingEdge | CoordEdge): string { const isDrawing = 'fromNodeId' in e; const source = isDrawing ? form.nodes.find((node) => node.id === (e as DrawingEdge).fromNodeId) : null; const fromSide = isDrawing ? (e as DrawingEdge).fromSide : (e as CoordEdge).fromSide; const anchor = source ? nodeAnchor(source, fromSide) : null; const fromX = anchor?.x ?? (e as CoordEdge).fromX; const fromY = anchor?.y ?? (e as CoordEdge).fromY; const toX = isDrawing ? (e as DrawingEdge).endX : (e as CoordEdge).toX; const toY = isDrawing ? (e as DrawingEdge).endY : (e as CoordEdge).toY; if (Math.abs(fromX - toX) < 0.5 || Math.abs(fromY - toY) < 0.5) return `M${fromX},${fromY} L${toX},${toY}`; return fromSide === 'top' || fromSide === 'bottom' ? `M${fromX},${fromY} V${fromY + (toY - fromY) / 2} H${toX} V${toY}` : `M${fromX},${fromY} H${fromX + (toX - fromX) / 2} V${toY} H${toX}` }
function edgeStroke(edge: PipelineEdge): string { return selectedNodeId.value && (edge.from === selectedNodeId.value || edge.to === selectedNodeId.value) ? '#409eff' : '#64748b' }
function legacyAutoLayout(notify = true): void {
  const byId = new Map(form.nodes.map((node) => [node.id, node]))
  const incoming = new Map(form.nodes.map((node) => [node.id, 0]))
  const levels = new Map<string, number>()
  for (const edge of form.edges) incoming.set(edge.to, (incoming.get(edge.to) || 0) + 1)
  const queue = form.nodes.filter((node) => node.type === 'START_TRIGGER' || incoming.get(node.id) === 0)
  queue.forEach((node) => levels.set(node.id, node.type === 'START_TRIGGER' ? 0 : 1))
  for (let index = 0; index < queue.length; index += 1) {
    const node = queue[index]
    const level = levels.get(node.id) || 0
    for (const edge of form.edges.filter((item) => item.from === node.id)) {
      const nextLevel = Math.max(levels.get(edge.to) || 0, level + 1)
      levels.set(edge.to, nextLevel)
      incoming.set(edge.to, (incoming.get(edge.to) || 1) - 1)
      if (incoming.get(edge.to) === 0 && byId.has(edge.to)) queue.push(byId.get(edge.to)!)
    }
  }
  const columns = new Map<number, PipelineNode[]>()
  form.nodes.forEach((node) => { const level = levels.get(node.id) ?? 1; columns.set(level, [...(columns.get(level) || []), node]) })
  columns.forEach((nodes, level) => nodes.forEach((node, index) => { node.x = 48 + level * (NODE_CARD_WIDTH + NODE_GAP_X); node.y = 96 + index * NODE_GAP_Y }))
  void nextTick(centerCanvas)
  if (notify) ElMessage.success('流程已整理')
}
type SmartLayoutDirection = 'horizontal' | 'vertical' | 'mixed'
type LayoutAxis = 'horizontal' | 'vertical'
interface AxisEdge { from: PipelineNode; to: PipelineNode; axis: LayoutAxis }

function edgeAxis(from: PipelineNode, to: PipelineNode): LayoutAxis {
  return Math.abs(to.x - from.x) >= Math.abs(to.y - from.y) ? 'horizontal' : 'vertical'
}

function hasPathDirectionTurn(): boolean {
  const incoming = new Map(form.nodes.map((node) => [node.id, 0]))
  const outgoing = new Map<string, AxisEdge[]>()
  form.edges.forEach((edge) => {
    const from = form.nodes.find((node) => node.id === edge.from)
    const to = form.nodes.find((node) => node.id === edge.to)
    if (!from || !to) return
    incoming.set(to.id, (incoming.get(to.id) || 0) + 1)
    outgoing.set(from.id, [...(outgoing.get(from.id) || []), { from, to, axis: edgeAxis(from, to) }])
  })
  const roots = form.nodes.filter((node) => node.type === 'START_TRIGGER' || incoming.get(node.id) === 0)
  const visit = (nodeId: string, previousAxis?: LayoutAxis, path = new Set<string>()): boolean => {
    if (path.has(nodeId)) return false
    const nextPath = new Set(path).add(nodeId)
    return (outgoing.get(nodeId) || []).some((edge) => (previousAxis && previousAxis !== edge.axis) || visit(edge.to.id, edge.axis, nextPath))
  }
  return roots.some((node) => visit(node.id)) || form.nodes.some((node) => visit(node.id))
}

function normalizeAxisRun(nodes: PipelineNode[], axis: LayoutAxis): boolean {
  if (nodes.length < 2) return false
  const crossAxis = axis === 'horizontal' ? 'y' : 'x'
  const mainAxis = axis === 'horizontal' ? 'x' : 'y'
  const crossValue = nodes.reduce((total, node) => total + node[crossAxis], 0) / nodes.length
  let changed = false
  nodes.forEach((node) => {
    if (Math.abs(node[crossAxis] - crossValue) >= 0.5) { node[crossAxis] = crossValue; changed = true }
  })
  if (nodes.length < 3) return changed
  const ordered = [...nodes].sort((left, right) => left[mainAxis] - right[mainAxis])
  const first = ordered[0][mainAxis]
  const last = ordered[ordered.length - 1][mainAxis]
  const minGap = axis === 'horizontal' ? NODE_CARD_WIDTH + NODE_GAP_X : NODE_CARD_HEIGHT + NODE_GAP_Y
  const gap = Math.abs(last - first) < minGap * (ordered.length - 1) ? minGap : (last - first) / (ordered.length - 1)
  ordered.forEach((node, index) => {
    const position = first + gap * index
    if (Math.abs(node[mainAxis] - position) >= 0.5) { node[mainAxis] = position; changed = true }
  })
  return changed
}

function normalizeSameAxisRuns(): boolean {
  const axisEdges: AxisEdge[] = form.edges.flatMap((edge) => {
    const from = form.nodes.find((node) => node.id === edge.from)
    const to = form.nodes.find((node) => node.id === edge.to)
    return from && to ? [{ from, to, axis: edgeAxis(from, to) }] : []
  })
  let changed = false
  ;(['horizontal', 'vertical'] as LayoutAxis[]).forEach((axis) => {
    const remaining = axisEdges.filter((edge) => edge.axis === axis)
    while (remaining.length) {
      const component = [remaining.shift()!]
      const nodeIds = new Set([component[0].from.id, component[0].to.id])
      let expanded = true
      while (expanded) {
        expanded = false
        for (let index = 0; index < remaining.length;) {
          const edge = remaining[index]
          if (nodeIds.has(edge.from.id) || nodeIds.has(edge.to.id)) { component.push(edge); nodeIds.add(edge.from.id); nodeIds.add(edge.to.id); remaining.splice(index, 1); expanded = true } else index += 1
        }
      }
      changed = normalizeAxisRun(form.nodes.filter((node) => nodeIds.has(node.id)), axis) || changed
    }
  })
  return changed
}

function inferSmartLayoutDirection(): SmartLayoutDirection {
  if (hasPathDirectionTurn()) return 'mixed'
  let horizontalDistance = 0
  let verticalDistance = 0
  let linkedEdges = 0
  form.edges.forEach((edge) => {
    const from = form.nodes.find((node) => node.id === edge.from)
    const to = form.nodes.find((node) => node.id === edge.to)
    if (!from || !to) return
    horizontalDistance += Math.abs(to.x - from.x)
    verticalDistance += Math.abs(to.y - from.y)
    linkedEdges += 1
  })
  if (!linkedEdges) return 'horizontal'
  if (horizontalDistance > verticalDistance * 1.35) return 'horizontal'
  if (verticalDistance > horizontalDistance * 1.35) return 'vertical'
  return 'mixed'
}
function repairMixedLayout(): boolean {
  let changed = normalizeSameAxisRuns()
  for (let pass = 0; pass < 3; pass += 1) {
    const ordered = [...form.nodes].sort((left, right) => left.y - right.y || left.x - right.x)
    ordered.forEach((node, index) => ordered.slice(0, index).forEach((other) => {
      const overlaps = node.x < other.x + NODE_CARD_WIDTH && node.x + NODE_CARD_WIDTH > other.x && node.y < other.y + NODE_CARD_HEIGHT && node.y + NODE_CARD_HEIGHT > other.y
      if (!overlaps) return
      const moveRight = other.x + NODE_CARD_WIDTH + 32 - node.x
      const moveDown = other.y + NODE_CARD_HEIGHT + 32 - node.y
      if (moveRight <= moveDown) node.x = Math.min(canvasW - NODE_CARD_WIDTH, node.x + moveRight)
      else node.y = Math.min(canvasH - NODE_CARD_HEIGHT, node.y + moveDown)
      changed = true
    }))
  }
  return changed
}
function autoLayout(notify = true): void {
  const direction = inferSmartLayoutDirection()
  if (direction === 'horizontal') {
    legacyAutoLayout(notify)
    return
  }
  if (direction === 'mixed') {
    const repaired = repairMixedLayout()
    void nextTick(centerCanvas)
    if (notify) ElMessage.success(repaired ? '\u5df2\u4fdd\u7559\u5f53\u524d\u5e03\u5c40\u5e76\u6d88\u9664\u91cd\u53e0' : '\u5df2\u4fdd\u7559\u5f53\u524d\u6df7\u5408\u5e03\u5c40')
    return
  }
  const byId = new Map(form.nodes.map((node) => [node.id, node]))
  const incoming = new Map(form.nodes.map((node) => [node.id, 0]))
  const levels = new Map<string, number>()
  for (const edge of form.edges) incoming.set(edge.to, (incoming.get(edge.to) || 0) + 1)
  const queue = form.nodes.filter((node) => node.type === 'START_TRIGGER' || incoming.get(node.id) === 0)
  queue.forEach((node) => levels.set(node.id, node.type === 'START_TRIGGER' ? 0 : 1))
  for (let index = 0; index < queue.length; index += 1) {
    const node = queue[index]
    const level = levels.get(node.id) || 0
    for (const edge of form.edges.filter((item) => item.from === node.id)) {
      const nextLevel = Math.max(levels.get(edge.to) || 0, level + 1)
      levels.set(edge.to, nextLevel)
      incoming.set(edge.to, (incoming.get(edge.to) || 1) - 1)
      if (incoming.get(edge.to) === 0 && byId.has(edge.to)) queue.push(byId.get(edge.to)!)
    }
  }
  const rows = new Map<number, PipelineNode[]>()
  form.nodes.forEach((node) => { const level = levels.get(node.id) ?? 1; rows.set(level, [...(rows.get(level) || []), node]) })
  rows.forEach((nodes, level) => nodes.sort((left, right) => left.x - right.x).forEach((node, index) => { node.x = 48 + index * (NODE_CARD_WIDTH + NODE_GAP_X); node.y = 96 + level * (NODE_CARD_HEIGHT + NODE_GAP_Y) }))
  void nextTick(centerCanvas)
  if (notify) ElMessage.success('\u5df2\u6309\u4e0a\u4e0b\u65b9\u5411\u667a\u80fd\u5e03\u5c40')
}
function hasCanvasOverlap(): boolean {
  return form.nodes.some((node, index) => form.nodes.slice(index + 1).some((other) => node.x < other.x + NODE_CARD_WIDTH && node.x + NODE_CARD_WIDTH > other.x && node.y < other.y + NODE_CARD_HEIGHT && node.y + NODE_CARD_HEIGHT > other.y))
}
function setCanvasZoom(value: number, recenter = true): boolean {
  const nextZoom = Math.min(MAX_CANVAS_ZOOM, Math.max(MIN_CANVAS_ZOOM, Number(value.toFixed(2))))
  if (nextZoom === canvasZoom.value) return false
  canvasZoom.value = nextZoom
  if (recenter) void nextTick(centerCanvas)
  return true
}
function onCanvasWheel(event: WheelEvent): void {
  const viewport = canvasRef.value
  if (!viewport || event.deltaY === 0) return
  const currentZoom = canvasZoom.value
  const nextZoom = currentZoom * Math.exp(-event.deltaY * 0.001)
  if (!setCanvasZoom(nextZoom, false)) return
  const rect = viewport.getBoundingClientRect()
  const pointerX = event.clientX - rect.left
  const pointerY = event.clientY - rect.top
  const workflowX = (viewport.scrollLeft + pointerX) / currentZoom
  const workflowY = (viewport.scrollTop + pointerY) / currentZoom
  void nextTick(() => {
    viewport.scrollLeft = Math.max(0, workflowX * canvasZoom.value - pointerX)
    viewport.scrollTop = Math.max(0, workflowY * canvasZoom.value - pointerY)
  })
}
function resetCanvasZoom(): void { setCanvasZoom(1) }
function fitCanvas(): void {
  if (!canvasRef.value || !form.nodes.length) return
  const minX = Math.min(...form.nodes.map((node) => node.x))
  const maxX = Math.max(...form.nodes.map((node) => node.x + NODE_CARD_WIDTH))
  const minY = Math.min(...form.nodes.map((node) => node.y))
  const maxY = Math.max(...form.nodes.map((node) => node.y + NODE_CARD_HEIGHT))
  const viewport = canvasRef.value
  setCanvasZoom(Math.min((viewport.clientWidth - 64) / (maxX - minX), (viewport.clientHeight - 64) / (maxY - minY), 1))
}
function centerCanvas(): void {
  if (!canvasRef.value || !form.nodes.length) return
  const minX = Math.min(...form.nodes.map((node) => node.x))
  const maxX = Math.max(...form.nodes.map((node) => node.x + NODE_CARD_WIDTH))
  const minY = Math.min(...form.nodes.map((node) => node.y))
  const maxY = Math.max(...form.nodes.map((node) => node.y + NODE_CARD_HEIGHT))
  const viewport = canvasRef.value
  const left = Math.max(0, ((minX + maxX) * canvasZoom.value) / 2 - viewport.clientWidth / 2)
  const top = Math.max(0, ((minY + maxY) * canvasZoom.value) / 2 - viewport.clientHeight / 2)
  if (typeof viewport.scrollTo === 'function') viewport.scrollTo({ left, top, behavior: 'smooth' })
  else { viewport.scrollLeft = left; viewport.scrollTop = top }
}

async function loadTemplateTriggers(templateCode: string): Promise<void> { triggerLoading.value = true; try { templateTriggers.value = (await ucpApi.pipelineTriggers({ pipeline_template_code: templateCode })).items || []; syncStartTriggerModeFromTemplate() } catch { templateTriggers.value = []; syncStartTriggerModeFromTemplate() } finally { triggerLoading.value = false } }
async function openDesigner(tpl: PipelineTemplate): Promise<void> { currentTpl.value = tpl; form.template_code = tpl.template_code; form.name = tpl.name; form.description = tpl.description || ''; form.version = /^\d+\.\d+$/.test(tpl.version) ? `${tpl.version}.0` : tpl.version; form.change_note = ''; form.nodes = JSON.parse(JSON.stringify(tpl.nodes)); form.edges = JSON.parse(JSON.stringify(tpl.edges)); selectedNodeId.value = null; await Promise.all([loadSystemsAndResources(), loadTemplateTriggers(tpl.template_code)]); if (hasCanvasOverlap()) autoLayout(false); const sinkNode = form.nodes.find(node => (node.type as string) === 'WAREHOUSE_ASSET_SINK'); const targetAsset = String(sinkNode?.config?.target_asset || ''); if (targetAsset) await loadTargetAssetColumns(targetAsset); else targetAssetColumns.value = []; void nextTick(fitCanvas) }

/*
async function loadPendingHireTemplate(): Promise<void> {
  try {
    const existing = await pipelineTemplateApi.get('PENDING_HIRE_OFFER_ENRICHMENT')
    await openDesigner(existing)
    ElMessage.success('\u5df2\u6253\u5f00\u5f85\u5165\u804c\u4eba\u5458\u8865\u5168\u6a21\u677f\uff0c\u8bf7\u5b8c\u6210\u914d\u7f6e\u540e\u4fdd\u5b58')
    return
  } catch (error: unknown) {
    const status = (error as { response?: { status?: number } }).response?.status
    if (status !== 404) {
      ElMessage.error(`\u52a0\u8f7d\u6a21\u677f\u5931\u8d25: ${error instanceof Error ? error.message : String(error)}`)
      return
    }
  }

  currentTpl.value = null
  form.template_code = 'PENDING_HIRE_OFFER_ENRICHMENT'
  form.name = '待入职人员入仓及 Offer 薪酬补充'
  form.description = '选择待入职来源、投递记录 ID、Offer 能力和目标数据资产后保存。'
  form.version = '1.0.0'
  form.nodes = [
    { id: 'read_pending', type: 'CONNECTOR' as any, x: 80, y: 180, label: '读取待入职人员', config: {} },
    { id: 'lookup_offer', type: 'CAPABILITY_LOOKUP' as any, x: 340, y: 180, label: '按投递记录 ID 查询 Offer', config: { input_key: '${read_pending.result.data}', lookup_field: 'application_id', parameter_name: 'application_id' } },
    { id: 'merge_offer', type: 'RECORD_MERGE' as any, x: 630, y: 180, label: '补全 Offer 字段', config: { input_key: '${lookup_offer.result.data}', field_mapping: [] } },
    { id: 'write_asset', type: 'WAREHOUSE_ASSET_SINK' as any, x: 890, y: 180, label: '写入待入职人员资产', config: { input_key: '${merge_offer.result.data}', write_mode: 'upsert', field_whitelist: [] } },
  ]
  form.edges = [{ from: 'read_pending', to: 'lookup_offer' }, { from: 'lookup_offer', to: 'merge_offer' }, { from: 'merge_offer', to: 'write_asset' }]
  selectedNodeId.value = null
  ElMessage.success('已加载待入职人员补全模板，请依次选择来源、业务能力和目标资产')
}
*/

const saving = ref(false)
function normalizeTransformStorageModes(): void {
  for (const node of form.nodes.filter((item) => item.type === 'TRANSFORM')) {
    const config = { ...(node.config || {}) } as Record<string, any>
    if (config.mapping_component && typeof config.mapping_component === 'object') {
      config.storageMode = 'component_v1'
      if (!config.legacy_mapping_snapshot && config.mapping && typeof config.mapping === 'object') {
        config.legacy_mapping_snapshot = JSON.parse(JSON.stringify(config.mapping))
      }
    } else if (config.mapping && typeof config.mapping === 'object') {
      config.storageMode = 'legacy_v1'
      delete config.legacy_mapping_snapshot
    } else {
      config.storageMode = 'component_v1'
      config.mapping_component = createEmptyDocument('ucp_transform', 'UCP Transform')
    }
    node.config = config
  }
}
function normalizeWarehouseSinkConfigs(): void {
  for (const node of form.nodes.filter((item) => (item.type as string) === 'WAREHOUSE_ASSET_SINK')) {
    const config = node.config as Record<string, any>
    for (const [textKey, valueKey] of [['mapping_text', 'mapping'], ['validations_text', 'validations']] as const) {
      const source = config[textKey]
      if (typeof source !== 'string') continue
      try {
        const value = source.trim() ? JSON.parse(source) : []
        if (!Array.isArray(value)) throw new Error('必须是数组')
        config[valueKey] = value
      } catch (error) {
        throw new Error(`${textKey === 'mapping_text' ? '字段映射' : '校验规则'} JSON 格式无效：${error instanceof Error ? error.message : String(error)}`)
      }
    }
    if (config.write_mode === 'period_full_snapshot' && !config.period_field) {
      throw new Error('按期间全量快照必须选择期间字段')
    }
  }
}
async function saveTemplate(): Promise<void> { if (!form.template_code || !form.name) { ElMessage.error('编码和名称必填'); return }; saving.value = true; try { const blockedTransform = form.nodes.find((node) => { if (node.type !== 'TRANSFORM') return false; const result = documentFromTransformConfig((node.config || {}) as Record<string, any>); return result.compatibility.writable === false && !node.config?.mapping_component }); if (blockedTransform) throw new Error(`TRANSFORM 节点 ${blockedTransform.id} 存在有损字段，已阻断保存`); normalizeTransformStorageModes(); normalizeWarehouseSinkConfigs(); const dangerous = form.nodes.filter((node) => (node.type as string) === 'WAREHOUSE_ASSET_SINK' && ['replace', 'period_full_snapshot'].includes(String(node.config?.write_mode))); if (dangerous.length) await ElMessageBox.confirm(`以下节点将执行破坏性写入：${dangerous.map((node) => `${node.id} → ${node.config?.target_asset || '未选择资产'}`).join('；')}。确认保存？`, '危险写入确认', { type: 'warning' }); if (currentTpl.value) { const saved = await pipelineTemplateApi.update(currentTpl.value.template_code, { name: form.name, description: form.description, nodes: form.nodes, edges: form.edges, change_note: form.change_note || undefined }); currentTpl.value = { ...saved, nodes: form.nodes, edges: form.edges }; form.version = saved.version; ElMessage.success('已保存，新版本已创建') } else { const created = await pipelineTemplateApi.create({ template_code: form.template_code, name: form.name, description: form.description, nodes: form.nodes, edges: form.edges }); currentTpl.value = { ...created, nodes: form.nodes, edges: form.edges }; ElMessage.success('已创建') } } catch (e: unknown) { const detail = (e as { response?: { data?: { detail?: unknown } } }).response?.data?.detail; ElMessage.error(`保存失败: ${typeof detail === 'string' ? detail : e instanceof Error ? e.message : String(e)}`) } finally { saving.value = false } }

const dryRunVisible = ref(false)
const dryRunResult = ref<Awaited<ReturnType<typeof ucpApi.runPipeline>> | null>(null)
async function dryRun(): Promise<void> {
  if (!form.template_code) { ElMessage.error('请先保存后再试运行'); return }
  try {
    dryRunResult.value = await ucpApi.runPipeline(form.template_code, { dry_run: true })
    dryRunVisible.value = true
  } catch (e: unknown) { ElMessage.error(`试运行失败: ${e instanceof Error ? e.message : String(e)}`) }
}

const versionsVisible = ref(false); const versions = ref<VersionItem[]>([]) as Ref<VersionItem[]>
async function viewVersions(tpl: PipelineTemplate): Promise<void> { try { const list = (await pipelineTemplateApi.versions(tpl.template_code)) as unknown as VersionItem[]; versions.value = list; versionsVisible.value = true } catch (e: unknown) { ElMessage.error(`加载版本失败: ${e instanceof Error ? e.message : String(e)}`) } }
async function rollbackTo(row: VersionItem): Promise<void> { if (!currentTpl.value) { ElMessage.warning('请先打开流程设计'); return }; try { await ElMessageBox.confirm('确认回滚到此版本? 将创建新版本快照.', '提示', { type: 'warning' }); await pipelineTemplateApi.rollback(currentTpl.value.template_code, row.id); ElMessage.success('已回滚'); versionsVisible.value = false } catch {} }

const route = useRoute()
const router = useRouter()
async function loadPlatformEventCatalog(): Promise<void> { try { platformEventCatalog.value = (await ucpApi.platformEventCatalog()).items || [] } catch { platformEventCatalog.value = []; ElMessage.error('平台事件目录加载失败') } }
onMounted(async () => { await Promise.all([loadNodeTypes(), loadSystemsAndResources(), loadPublishedAssets(), loadPlatformEventCatalog()]); const tplCode = route.query.code as string | undefined; if (tplCode) { try { const tpl = await pipelineTemplateApi.get(tplCode); if (tpl) await openDesigner(tpl) } catch {} } })
onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onCanvasPanMove)
  window.removeEventListener('mouseup', onCanvasPanEnd)
})
</script>

<style scoped>
.pipeline-designer-page { height: 100%; display: flex; flex-direction: column; background: var(--color-bg-page) }
.designer-toolbar { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: var(--color-bg-card); border-bottom: 1px solid var(--color-border); flex-shrink: 0 }
.toolbar-left { display: flex; align-items: center; gap: 12px } .toolbar-title { font-size: 16px; font-weight: 600; color: var(--color-text-primary) } .toolbar-right { display: flex; gap: 8px }
.designer-body { display: grid; grid-template-columns: 220px 1fr 320px; flex: 1; min-height: 0; gap: 0 }
.designer-left, .designer-right { background: #fafafa; padding: 12px; overflow: auto; border-right: 1px solid #ebeef5 } .designer-right { border-right: none; border-left: 1px solid #ebeef5 }
.designer-left h4, .designer-right h4 { margin: 0 0 8px; font-size: 14px } .summary-heading { display: flex; align-items: center; justify-content: space-between; } .trigger-row { display: flex; align-items: center; gap: 6px; padding: 5px 0; font-size: 12px; }
.node-palette-item { background: #fff; border: 1px solid #dcdfe6; border-radius: 4px; padding: 8px; margin-bottom: 6px; cursor: grab; display: flex; align-items: center; gap: 6px }
.node-palette-item:hover { background: #f0f9ff } .node-palette-item small { margin-left: auto; color: #909399 }
.canvas-viewport { position: relative; min-width: 0; min-height: 0; overflow: hidden; background: #fafbfc }.designer-canvas { position: relative; width: 100%; height: 100%; min-width: 0; overflow: auto; cursor: grab; background-image: radial-gradient(circle, #e4e7ed 1px, transparent 1px); background-size: 20px 20px }.designer-canvas.is-panning { cursor: grabbing; user-select: none }
.canvas-scaler { position: relative; min-width: 100%; min-height: 100% }.canvas-content { position: relative; transform-origin: top left }.canvas-controls { position: absolute; right: 18px; bottom: 18px; z-index: 8; display: flex; align-items: center; gap: 6px; padding: 6px; background: rgba(255,255,255,.96); border: 1px solid #dbe3ee; border-radius: 8px; box-shadow: 0 4px 12px rgba(15,23,42,.14) }.zoom-value { min-width: 42px; text-align: center; color: #475569; font-size: 12px; font-variant-numeric: tabular-nums }
.edge-layer { position: absolute; top: 0; left: 0; pointer-events: none }
.node-card { position: absolute; width: 188px; height: 96px; box-sizing: border-box; overflow: visible; background: #fff; border: 2px solid #dcdfe6; border-radius: 8px; box-shadow: 0 2px 6px rgba(15,23,42,.08); cursor: move; user-select: none }
.node-card.start-trigger { width: 188px; height: 96px }
.node-card.selected { box-shadow: 0 0 0 3px rgba(64,158,255,.3) } .node-card.is-error { border-color: #f56c6c!important; box-shadow: 0 0 0 2px rgba(245,108,108,.2) }
.node-header { height: 30px; box-sizing: border-box; padding: 6px 8px; color: #fff; border-radius: 6px 6px 0 0; font-size: 12px; font-weight: 600; display: flex; justify-content: space-between; align-items: center }
.node-body { height: 62px; box-sizing: border-box; padding: 6px 8px; font-size: 12px; display: flex; flex-direction: column; gap: 2px }
.node-title, .node-summary { overflow: hidden; text-overflow: ellipsis; white-space: nowrap } .node-title { color: #1f2937; font-weight: 600 } .node-summary { color: #64748b; font-size: 11px; line-height: 16px; min-height: 16px }
.node-status { margin-top: auto; display: flex; align-items: center; gap: 5px; color: #64748b; font-size: 11px }.status-dot { width: 6px; height: 6px; border-radius: 50%; background: #94a3b8 }.status-dot.success { background: #22c55e }.status-dot.warning { background: #f59e0b }.status-dot.danger { background: #ef4444 }
.start-trigger-hint { margin-top: -2px; color: #909399; font-size: 12px; line-height: 1.5 } .schedule-plan-summary { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-height: 24px }
.node-ports { position: absolute; inset: 0; pointer-events: none } .port { position: absolute; width: 10px; height: 10px; box-sizing: border-box; background: #22c55e; border: 2px solid #fff; border-radius: 50%; cursor: crosshair; pointer-events: auto } .port-left { left: -7px; top: calc(50% - 5px) } .port-right { right: -7px; top: calc(50% - 5px) } .port-top { top: -7px; left: calc(50% - 5px) } .port-bottom { bottom: -7px; left: calc(50% - 5px) } .port:hover { background: #409eff; transform: scale(1.3) }
.empty-tip { text-align: center; padding: 60px 0; color: #c0c4cc } .empty-tip p { margin: 8px 0 0; font-size: 13px }
.pipeline-info-form :deep(.el-form-item) { margin-bottom: 8px } .pipeline-info-form .compact-item :deep(.el-form-item) { margin-bottom: 0 }
.field-mappings { margin-bottom: 8px } .mapping-row { display: flex; align-items: center; gap: 6px; margin-bottom: 6px } .mapping-arrow { color: #909399; font-size: 14px }
.upstream-ref { background: #f5f7fa; border-radius: 4px; padding: 8px; max-height: 200px; overflow: auto }
.upstream-ref.empty { color: #c0c4cc; font-size: 12px; text-align: center }
.upstream-title { font-size: 12px; color: #909399; margin-bottom: 6px }
.upstream-field { display: flex; justify-content: space-between; align-items: center; padding: 3px 6px; cursor: pointer; border-radius: 3px; font-size: 12px }
.upstream-field:hover { background: #ecf5ff } .upstream-field small { color: #909399 }
.mapping-migration-hint, .mapping-lossy-blocked { margin-top: 8px; padding: 8px 10px; border-radius: 4px; font-size: 12px; line-height: 1.5 }
.mapping-migration-hint { color: #7c5c00; background: #fdf6ec; border: 1px solid #faecd8 }
.mapping-lossy-blocked { color: #b42318; background: #fef3f2; border: 1px solid #fecdca }
.condition-hints { background: #f5f7fa; border-radius: 4px; padding: 8px; margin-top: 4px } .hint-title { font-size: 12px; color: #909399; margin-bottom: 4px }
</style>
