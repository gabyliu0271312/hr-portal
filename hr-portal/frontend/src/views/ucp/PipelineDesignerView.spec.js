import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
    nodeTypes: vi.fn(), getTemplate: vi.fn(), systems: vi.fn(), resources: vi.fn(), capabilityCatalog: vi.fn(), resourceDataObjects: vi.fn(),
    pipelineTriggers: vi.fn(), platformEventCatalog: vi.fn(), listAssets: vi.fn(), listAssetColumns: vi.fn(),
}));
vi.mock('@/api/ucp', () => ({
    pipelineTemplateApi: { nodeTypes: mocks.nodeTypes, get: mocks.getTemplate },
    ucpApi: {
        systems: mocks.systems, resources: mocks.resources, capabilityCatalog: mocks.capabilityCatalog, resourceDataObjects: mocks.resourceDataObjects,
        pipelineTriggers: mocks.pipelineTriggers, platformEventCatalog: mocks.platformEventCatalog,
    },
}));
vi.mock('@/api/warehouse', () => ({ listAssets: mocks.listAssets, listAssetColumns: mocks.listAssetColumns }));
vi.mock('@/components/mapping/MappingWorkspace.vue', () => ({ default: { name: 'MappingWorkspace', props: ['modelValue', 'policy', 'compatibility', 'sourceFields', 'targetFields'], emits: ['update:modelValue'], template: '<div class="mapping-workspace-stub" :data-caller="policy.caller" :data-source-format="compatibility?.sourceFormat || \'\'">MappingWorkspace</div>' } }));
vi.mock('element-plus', () => ({ ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() }, ElMessageBox: { confirm: vi.fn() } }));
vi.mock('vue-router', () => ({ useRoute: () => ({ query: { code: 'PIPELINE_DEMO' } }), useRouter: () => ({ push: vi.fn() }) }));
const { default: PipelineDesignerView } = await import('./PipelineDesignerView.vue');
const stubs = {
    'el-button': { props: ['disabled', 'loading'], template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>' },
    'el-divider': true, 'el-icon': true, 'el-skeleton': true, 'el-tag': true, 'el-dialog': true,
    'el-form': { template: '<form><slot /></form>' }, 'el-form-item': { template: '<div><slot /></div>' },
    'el-row': true, 'el-col': true, 'el-table': true, 'el-table-column': true, 'el-input-number': true,
    'el-input': { inheritAttrs: false, props: ['modelValue'], template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' },
    'el-switch': { template: '<input type="checkbox" />' },
    'el-select': { props: ['modelValue', 'disabled'], template: '<select :value="modelValue" :disabled="disabled" @change="$emit(\'update:modelValue\', $event.target.value); $emit(\'change\')"><slot /></select>' },
    'el-option': { props: ['label', 'value'], template: '<option :value="value">{{ label }}</option>' },
    ScheduleSelector: { template: '<div />' },
};
function mountView() {
    return mount(PipelineDesignerView, { global: { stubs, directives: { loading: {} } } });
}
describe('PipelineDesignerView canvas interaction', () => {
    beforeEach(() => {
        Object.values(mocks).forEach((mock) => mock.mockReset());
        mocks.nodeTypes.mockResolvedValue({ node_types: [
                { type: 'START_TRIGGER', label: '流程起点', color: '#1f9d7a', palette: true, config_schema: {} },
                { type: 'CONNECTOR', label: '资源调用', color: '#409eff', palette: true, config_schema: {} },
            ] });
        mocks.getTemplate.mockResolvedValue({
            template_code: 'PIPELINE_DEMO', name: '演示流程', description: '', version: '1.0.0',
            nodes: [
                { id: 'start', type: 'START_TRIGGER', x: 48, y: 96, label: '流程起点', config: {} },
                { id: 'source', type: 'CONNECTOR', x: 145, y: 96, label: '资源调用', config: { system_code: '北森', resource_name: '待入职报表' } },
            ],
            edges: [{ from: 'start', to: 'source' }],
        });
        mocks.systems.mockResolvedValue({ items: [] });
        mocks.resources.mockResolvedValue({ items: [] });
        mocks.capabilityCatalog.mockResolvedValue([]);
        mocks.resourceDataObjects.mockResolvedValue({ items: [] });
        mocks.pipelineTriggers.mockResolvedValue({ items: [{ trigger_code: 'MANUAL_DEMO', trigger_type: 'MANUAL', trigger_name: '人工启动', is_active: true }] });
        mocks.platformEventCatalog.mockResolvedValue({ items: [{ category: 'DATA_CHANGE', category_name: '数据变更', source: 'DATA_WAREHOUSE', source_name: '数据仓库', event_type: 'datasource_sync_completed', event_name: '入仓同步完成', enabled: true, filter_fields: ['table_name'] }] });
        mocks.listAssets.mockResolvedValue({ items: [] });
        mocks.listAssetColumns.mockResolvedValue({ items: [] });
    });
    it('keeps the start card fixed and moves platform-event controls to the right panel', async () => {
        const wrapper = mountView();
        await flushPromises();
        await flushPromises();
        const startCard = wrapper.get('.node-card.start-trigger');
        expect(startCard.find('select').exists()).toBe(false);
        expect(startCard.find('input').exists()).toBe(false);
        expect(startCard.findAll('.port')).toHaveLength(4);
        expect(startCard.attributes('style')).toContain('left: 48px');
        expect(wrapper.findAll('.node-card')[1].attributes('style')).toContain('left: 328px');
        await startCard.trigger('click');
        const triggerMode = wrapper.findAll('select')[0];
        await triggerMode.setValue('PLATFORM_EVENT');
        await flushPromises();
        expect(wrapper.findAll('select').length).toBeGreaterThanOrEqual(4);
        expect(wrapper.text()).toContain('数据变更');
        expect(wrapper.find('.node-card.start-trigger').text()).toContain('平台事件');
        expect(wrapper.get('.canvas-controls').findAll('button')).toHaveLength(3);
    });
    it('mounts MappingWorkspace for TRANSFORM and rehydrates legacy v1 without changing the canvas', async () => {
        mocks.getTemplate.mockResolvedValue({
            template_code: 'PIPELINE_TRANSFORM_LEGACY', name: 'Legacy transform', description: '', version: '1.0.0',
            nodes: [
                { id: 'start', type: 'START_TRIGGER', x: 48, y: 96, label: '流程起点', config: {} },
                { id: 'source', type: 'CONNECTOR', x: 328, y: 96, label: '来源', config: { output_field_catalog: [{ field_id: 'employee_no', label: '工号', type: 'string' }] } },
                { id: 'transform', type: 'TRANSFORM', x: 608, y: 96, label: '转换', config: { mapping: { version: 1, mode: 'strict', source_schema_hash: 'source', target_schema_hash: 'target', target_field_catalog: [{ field_id: 'staff_code', label: '员工编码', type: 'string' }], rules: [{ source_field_id: 'employee_no', target_field_id: 'staff_code', source_kind: 'upstream_field' }] }, retry: { max_attempts: 3 }, input_key: '${source.data}' } },
            ],
            edges: [{ from: 'start', to: 'source' }, { from: 'source', to: 'transform' }],
        });
        const wrapper = mountView();
        await flushPromises();
        await flushPromises();
        await wrapper.findAll('.node-card')[2].trigger('click');
        await flushPromises();
        const workspace = wrapper.get('.mapping-workspace-stub');
        expect(workspace.attributes('data-caller')).toBe('ucp_transform');
        expect(workspace.attributes('data-source-format')).toBe('ucp_transform_legacy_v1');
        expect(wrapper.text()).toContain('Legacy v1');
        const node = wrapper.vm.form.nodes.find((item) => item.id === 'transform');
        expect(node.config.retry).toEqual({ max_attempts: 3 });
        expect(node.config.input_key).toBe('${source.data}');
    });
    it('keeps lossless field rules in legacy_v1 and preserves legacy rule extensions', async () => {
        mocks.getTemplate.mockResolvedValue({
            template_code: 'PIPELINE_TRANSFORM_FIELD', name: 'Legacy field transform', description: '', version: '1.0.0',
            nodes: [
                { id: 'start', type: 'START_TRIGGER', x: 48, y: 96, label: '流程起点', config: {} },
                { id: 'source', type: 'CONNECTOR', x: 328, y: 96, label: '来源', config: { output_field_catalog: [{ field_id: 'employee_no', label: '工号', type: 'string' }] } },
                { id: 'transform', type: 'TRANSFORM', x: 608, y: 96, label: '转换', config: { mapping: { version: 1, mode: 'strict', extension: { owner: 'hr' }, rules: [{ source_field_id: 'employee_no', target_field_id: 'staff_code', source_kind: 'upstream_field', audit_tag: 'keep-me' }] }, retry: { max_attempts: 2 } } },
            ],
            edges: [{ from: 'start', to: 'source' }, { from: 'source', to: 'transform' }],
        });
        const wrapper = mountView();
        await flushPromises();
        await flushPromises();
        await wrapper.findAll('.node-card')[2].trigger('click');
        await flushPromises();
        const workspace = wrapper.getComponent({ name: 'MappingWorkspace' });
        const document = JSON.parse(JSON.stringify(workspace.props('modelValue')));
        document.ruleSet.rules[0].targetFields = ['employee_code'];
        await workspace.vm.$emit('update:modelValue', document);
        await flushPromises();
        const node = wrapper.vm.form.nodes.find((item) => item.id === 'transform');
        expect(node.config.storageMode).toBe('legacy_v1');
        expect(node.config.mapping_component).toBeUndefined();
        expect(node.config.legacy_mapping_snapshot).toBeUndefined();
        expect(node.config.mapping.extension).toEqual({ owner: 'hr' });
        expect(node.config.mapping.rules[0]).toMatchObject({ target_field_id: 'employee_code', audit_tag: 'keep-me' });
        expect(node.config.retry).toEqual({ max_attempts: 2 });
    });
    it('writes component_v1 and preserves legacy snapshot when a non-field rule is selected', async () => {
        mocks.getTemplate.mockResolvedValue({
            template_code: 'PIPELINE_TRANSFORM_COMPONENT', name: 'Component transform', description: '', version: '1.0.0',
            nodes: [
                { id: 'start', type: 'START_TRIGGER', x: 48, y: 96, label: '流程起点', config: {} },
                { id: 'source', type: 'CONNECTOR', x: 328, y: 96, label: '来源', config: { output_field_catalog: [{ field_id: 'status', label: '状态', type: 'string' }] } },
                { id: 'transform', type: 'TRANSFORM', x: 608, y: 96, label: '转换', config: { mapping: { version: 1, rules: [{ source_field_id: 'status', target_field_id: 'status', source_kind: 'upstream_field' }] }, failure_policy: 'RETRY' } },
            ],
            edges: [{ from: 'start', to: 'source' }, { from: 'source', to: 'transform' }],
        });
        const wrapper = mountView();
        await flushPromises();
        await flushPromises();
        await wrapper.findAll('.node-card')[2].trigger('click');
        await flushPromises();
        const workspace = wrapper.getComponent({ name: 'MappingWorkspace' });
        const document = workspace.props('modelValue');
        document.ruleSet.rules[0] = { ...document.ruleSet.rules[0], type: 'value_map', config: { mappings: { active: '在职' }, unmatched: 'keep' } };
        await workspace.vm.$emit('update:modelValue', document);
        await flushPromises();
        const node = wrapper.vm.form.nodes.find((item) => item.id === 'transform');
        expect(node.config.storageMode).toBe('component_v1');
        expect(node.config.mapping_component).toEqual(document);
        expect(node.config.legacy_mapping_snapshot).toBeTruthy();
        expect(node.config.mapping.rules).toHaveLength(1);
        expect(node.config.failure_policy).toBe('RETRY');
    });
    it('treats an empty TRANSFORM as a writable component_v1 document', async () => {
        mocks.getTemplate.mockResolvedValue({
            template_code: 'PIPELINE_TRANSFORM_EMPTY', name: 'Empty transform', description: '', version: '1.0.0',
            nodes: [
                { id: 'start', type: 'START_TRIGGER', x: 48, y: 96, label: '流程起点', config: {} },
                { id: 'transform', type: 'TRANSFORM', x: 328, y: 96, label: '转换', config: { retry: { max_attempts: 1 } } },
            ],
            edges: [{ from: 'start', to: 'transform' }],
        });
        const wrapper = mountView();
        await flushPromises();
        await flushPromises();
        await wrapper.findAll('.node-card')[1].trigger('click');
        await flushPromises();
        const workspace = wrapper.get('.mapping-workspace-stub');
        expect(workspace.attributes('data-source-format')).toBe('ucp_transform_component_v1');
        expect(wrapper.text()).not.toContain('保存已阻断');
        const node = wrapper.vm.form.nodes.find((item) => item.id === 'transform');
        expect(node.config.retry).toEqual({ max_attempts: 1 });
    });
    it('loads enabled unverified capabilities for lookup configuration', async () => {
        mocks.getTemplate.mockResolvedValue({
            template_code: 'PENDING_HIRE_OFFER_ENRICHMENT', name: 'Offer 补充', description: '', version: '1.0.0',
            nodes: [
                { id: 'start', type: 'START_TRIGGER', x: 48, y: 96, label: '流程起点', config: {} },
                { id: 'lookup', type: 'CAPABILITY_LOOKUP', x: 328, y: 96, label: '逐条查询', config: {} },
            ], edges: [{ from: 'start', to: 'lookup' }],
        });
        mocks.capabilityCatalog.mockResolvedValue([{
                capability_id: 8, system_id: 2, system_name: '招聘系统', object_code: 'OFFER', operation_name: '按投递记录 ID 查询 Offer', verification_status: 'NOT_TESTED',
            }]);
        const wrapper = mountView();
        await flushPromises();
        await flushPromises();
        await wrapper.findAll('.node-card')[1].trigger('click');
        await flushPromises();
        expect(mocks.capabilityCatalog).toHaveBeenCalledWith({ include_unverified: true });
        expect(wrapper.text()).toContain('招聘系统');
        expect(wrapper.text()).toContain('待验证能力可先编排，发布或执行前仍需验证成功。');
    });
    it('rehydrates a saved schedule trigger when reopening the pipeline', async () => {
        mocks.pipelineTriggers.mockResolvedValue({ items: [{
                    trigger_code: 'SCHEDULE_OFFER_ENRICHMENT', trigger_type: 'SCHEDULE', trigger_name: '每天同步',
                    schedule_config: { cron: '0 6 * * *' }, is_active: true,
                }] });
        const wrapper = mountView();
        await flushPromises();
        await flushPromises();
        await wrapper.get('.node-card.start-trigger').trigger('click');
        await flushPromises();
        expect(wrapper.findAll('select')[0].element.value).toBe('SCHEDULE');
        expect(wrapper.get('.node-card.start-trigger').text()).toContain('每日 06:00');
    });
    it('preloads persisted Beisen report options on connector selection', async () => {
        mocks.getTemplate.mockResolvedValue({
            template_code: 'PENDING_HIRE_OFFER_ENRICHMENT', name: 'Offer 补充', description: '', version: '1.0.0',
            nodes: [
                { id: 'start', type: 'START_TRIGGER', x: 48, y: 96, label: '流程起点', config: {} },
                { id: 'source', type: 'CONNECTOR', x: 328, y: 96, label: '资源调用', config: { system_id: 1, resource_id: 1, adapter_code: 'BEISEN_REPORT_PULL_ADAPTER', data_object_id: 1 } },
            ], edges: [{ from: 'start', to: 'source' }],
        });
        mocks.resourceDataObjects.mockResolvedValue({ items: [{ id: 1, object_code: 'PENDING_HIRE_REPORT', object_name: '待入职人员报表', is_active: true }] });
        const wrapper = mountView();
        await flushPromises();
        await flushPromises();
        await wrapper.findAll('.node-card')[1].trigger('click');
        await flushPromises();
        expect(mocks.resourceDataObjects).toHaveBeenCalledWith(1);
        expect(wrapper.text()).toContain('PENDING_HIRE_REPORT - 待入职人员报表');
    });
    it('zooms around the pointer with the mouse wheel and keeps only reset, fit, and center controls', async () => {
        const wrapper = mountView();
        await flushPromises();
        await flushPromises();
        const canvas = wrapper.get('.designer-canvas');
        Object.defineProperty(canvas.element, 'getBoundingClientRect', { configurable: true, value: () => ({ left: 20, top: 30, right: 820, bottom: 630, width: 800, height: 600 }) });
        Object.defineProperty(canvas.element, 'clientWidth', { configurable: true, value: 800 });
        Object.defineProperty(canvas.element, 'clientHeight', { configurable: true, value: 600 });
        await wrapper.get('.zoom-value').trigger('click');
        await flushPromises();
        canvas.element.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100, clientX: 220, clientY: 230 }));
        await flushPromises();
        expect(wrapper.get('.zoom-value').text()).toBe('111%');
        expect(canvas.element.scrollLeft).toBeCloseTo(22, 0);
        expect(canvas.element.scrollTop).toBeCloseTo(22, 0);
        expect(wrapper.get('.canvas-controls').findAll('button')).toHaveLength(3);
    });
    it('pans only from an empty canvas area while controls remain in the fixed viewport overlay', async () => {
        const wrapper = mountView();
        await flushPromises();
        await flushPromises();
        const canvas = wrapper.get('.designer-canvas');
        const viewport = canvas.element;
        viewport.scrollLeft = 300;
        viewport.scrollTop = 250;
        canvas.element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 500, clientY: 400 }));
        window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 460, clientY: 370 }));
        await flushPromises();
        expect(wrapper.get('.designer-canvas').classes()).toContain('is-panning');
        expect(viewport.scrollLeft).toBe(340);
        expect(viewport.scrollTop).toBe(280);
        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        await flushPromises();
        expect(wrapper.get('.designer-canvas').classes()).not.toContain('is-panning');
        expect(wrapper.get('.canvas-controls').element.parentElement?.classList.contains('canvas-viewport')).toBe(true);
        expect(wrapper.get('.canvas-controls').element.parentElement?.classList.contains('designer-canvas')).toBe(false);
    });
    it('uses the single layout action to align and evenly distribute a vertical workflow without selection', async () => {
        mocks.getTemplate.mockResolvedValue({
            template_code: 'PIPELINE_VERTICAL_LAYOUT', name: 'Vertical layout', description: '', version: '1.0.0',
            nodes: [
                { id: 'start', type: 'START_TRIGGER', x: 80, y: 60, label: 'Start', config: {} },
                { id: 'source', type: 'CONNECTOR', x: 130, y: 360, label: 'Source', config: {} },
                { id: 'sink', type: 'CONNECTOR', x: 20, y: 760, label: 'Sink', config: {} },
            ],
            edges: [{ from: 'start', to: 'source' }, { from: 'source', to: 'sink' }],
        });
        const wrapper = mountView();
        await flushPromises();
        await flushPromises();
        await wrapper.find('.toolbar-right button').trigger('click');
        await flushPromises();
        const cards = wrapper.findAll('.node-card');
        expect(cards[0].attributes('style')).toContain('left: 48px');
        expect(cards[0].attributes('style')).toContain('top: 96px');
        expect(cards[1].attributes('style')).toContain('left: 48px');
        expect(cards[1].attributes('style')).toContain('top: 338px');
        expect(cards[2].attributes('style')).toContain('left: 48px');
        expect(cards[2].attributes('style')).toContain('top: 580px');
    });
    it('uses the single layout action to organize an ambiguous diagonal workflow', async () => {
        mocks.getTemplate.mockResolvedValue({
            template_code: 'PIPELINE_MIXED_LAYOUT', name: 'Mixed layout', description: '', version: '1.0.0',
            nodes: [
                { id: 'start', type: 'START_TRIGGER', x: 48, y: 96, label: 'Start', config: {} },
                { id: 'source', type: 'CONNECTOR', x: 348, y: 396, label: 'Source', config: {} },
            ],
            edges: [{ from: 'start', to: 'source' }],
        });
        const wrapper = mountView();
        await flushPromises();
        await flushPromises();
        await wrapper.find('.toolbar-right button').trigger('click');
        await flushPromises();
        const cards = wrapper.findAll('.node-card');
        expect(cards[0].attributes('style')).toContain('left: 48px');
        expect(cards[0].attributes('style')).toContain('top: 96px');
        expect(cards[1].attributes('style')).toContain('left: 328px');
        expect(cards[1].attributes('style')).toContain('top: 96px');
    });
    it('renders persisted edges with a visible directional marker', async () => {
        const wrapper = mountView();
        await flushPromises();
        await flushPromises();
        const marker = wrapper.get('marker#arrowhead');
        expect(marker.attributes('viewBox')).toBe('0 0 10 10');
        expect(marker.attributes('refX')).toBe('10');
        expect(wrapper.find('path[marker-end="url(#arrowhead)"]').exists()).toBe(true);
    });
    it('routes persisted edges through visible vertical and reverse-direction anchors after manual movement', async () => {
        mocks.getTemplate.mockResolvedValue({
            template_code: 'PIPELINE_VERTICAL', name: 'Vertical flow', description: '', version: '1.0.0',
            nodes: [
                { id: 'start', type: 'START_TRIGGER', x: 48, y: 96, label: 'Start', config: {} },
                { id: 'source', type: 'CONNECTOR', x: 48, y: 300, label: 'Source', config: {} },
            ],
            edges: [{ from: 'start', to: 'source' }],
        });
        const vertical = mountView();
        await flushPromises();
        await flushPromises();
        expect(vertical.find('path[marker-end="url(#arrowhead)"]').attributes('d')).toBe('M142,199 L142,293');
        vertical.unmount();
        mocks.getTemplate.mockResolvedValue({
            template_code: 'PIPELINE_REVERSE', name: 'Reverse flow', description: '', version: '1.0.0',
            nodes: [
                { id: 'start', type: 'START_TRIGGER', x: 350, y: 96, label: 'Start', config: {} },
                { id: 'source', type: 'CONNECTOR', x: 48, y: 96, label: 'Source', config: {} },
            ],
            edges: [{ from: 'start', to: 'source' }],
        });
        const reverse = mountView();
        await flushPromises();
        await flushPromises();
        expect(reverse.find('path[marker-end="url(#arrowhead)"]').attributes('d')).toBe('M343,144 L243,144');
    });
    it('re-routes a persisted edge to vertical anchors when a user drags a node below its source', async () => {
        const wrapper = mountView();
        await flushPromises();
        await flushPromises();
        const canvas = wrapper.get('.designer-canvas');
        Object.defineProperty(canvas.element, 'getBoundingClientRect', { configurable: true, value: () => ({ left: 0, top: 0, right: 1000, bottom: 700, width: 1000, height: 700 }) });
        await wrapper.get('.zoom-value').trigger('click');
        await flushPromises();
        const sourceCard = wrapper.findAll('.node-card')[1];
        sourceCard.element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 422, clientY: 144 }));
        window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 142, clientY: 348 }));
        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        await flushPromises();
        expect(wrapper.find('path[marker-end="url(#arrowhead)"]').attributes('d')).toBe('M142,199 L142,293');
    });
    it(`preserves U-shaped turns while aligning same-axis runs`, async () => {
        mocks.getTemplate.mockResolvedValue({
            template_code: 'PIPELINE_U_LAYOUT', name: 'U layout', description: '', version: '1.0.0',
            nodes: [
                { id: 'start', type: 'START_TRIGGER', x: 48, y: 96, label: 'Start', config: {} },
                { id: 'down', type: 'CONNECTOR', x: 48, y: 350, label: 'Down', config: {} },
                { id: 'across', type: 'CONNECTOR', x: 380, y: 350, label: 'Across', config: {} },
                { id: 'up', type: 'CONNECTOR', x: 380, y: 96, label: 'Up', config: {} },
            ],
            edges: [{ from: 'start', to: 'down' }, { from: 'down', to: 'across' }, { from: 'across', to: 'up' }],
        });
        const wrapper = mountView();
        await flushPromises();
        await flushPromises();
        await wrapper.find('.toolbar-right button').trigger('click');
        await flushPromises();
        const cards = wrapper.findAll('.node-card');
        expect(cards[0].attributes('style')).toContain('left: 48px');
        expect(cards[1].attributes('style')).toContain('left: 48px');
        expect(cards[1].attributes('style')).toContain('top: 350px');
        expect(cards[2].attributes('style')).toContain('left: 380px');
        expect(cards[2].attributes('style')).toContain('top: 350px');
        expect(cards[3].attributes('style')).toContain('left: 380px');
        expect(cards[3].attributes('style')).toContain('top: 96px');
        const uPaths = wrapper.findAll(`path[marker-end='url(#arrowhead)']`);
        expect(uPaths).toHaveLength(3);
        expect(uPaths.every((path) => (path.attributes('d') || '').includes(' L'))).toBe(true);
    });
    it(`distributes a vertical run evenly and straightens its arrows`, async () => {
        mocks.getTemplate.mockResolvedValue({
            template_code: 'PIPELINE_VERTICAL_EVEN', name: 'Vertical even', description: '', version: '1.0.0',
            nodes: [
                { id: 'start', type: 'START_TRIGGER', x: 80, y: 60, label: 'Start', config: {} },
                { id: 'one', type: 'CONNECTOR', x: 130, y: 360, label: 'One', config: {} },
                { id: 'two', type: 'CONNECTOR', x: 20, y: 760, label: 'Two', config: {} },
                { id: 'three', type: 'CONNECTOR', x: 110, y: 1040, label: 'Three', config: {} },
            ],
            edges: [{ from: 'start', to: 'one' }, { from: 'one', to: 'two' }, { from: 'two', to: 'three' }],
        });
        const wrapper = mountView();
        await flushPromises();
        await flushPromises();
        await wrapper.find('.toolbar-right button').trigger('click');
        await flushPromises();
        const cards = wrapper.findAll('.node-card');
        const top = cards.map((card) => Number((card.attributes('style') || '').match(/top: ([\d.]+)px/)?.[1] || 0));
        const [first = 0, second = 0, third = 0, fourth = 0] = top;
        expect(second - first).toBe(third - second);
        expect(third - second).toBe(fourth - third);
        const verticalPaths = wrapper.findAll(`path[marker-end='url(#arrowhead)']`);
        expect(verticalPaths).toHaveLength(3);
        expect(verticalPaths.every((path) => (path.attributes('d') || '').includes(' L'))).toBe(true);
    });
});
