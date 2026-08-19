import { config, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import PerformanceTemplateWorkflowSettings from './PerformanceTemplateWorkflowSettings.vue';
import PerformanceWorkflowStageIcon from './PerformanceWorkflowStageIcon.vue';
import workflowSource from './PerformanceTemplateWorkflowSettings.vue?raw';
config.global.stubs = { Teleport: true };
describe('PerformanceTemplateWorkflowSettings', () => {
    it('keeps the right-panel title at the standard node label after a custom name edit', async () => {
        const wrapper = mount(PerformanceTemplateWorkflowSettings);
        const evaluationNode = wrapper.findAll('.stage-node').find(node => node.text().includes('评估型环节'));
        await evaluationNode?.trigger('click');
        expect(wrapper.get('.panel-title').text()).toBe('评估型环节');
        await wrapper.get('.panel-scroll input').setValue('自定义评估名称');
        expect(wrapper.get('.panel-title').text()).toBe('评估型环节');
        expect(wrapper.get('.panel-scroll input').element.value).toBe('自定义评估名称');
    });
    it('preserves the panel content width by removing native scrollbar occupation', () => {
        expect(workflowSource).toContain('.panel-scroll{flex:1 1 auto;min-height:0;overflow:auto;scrollbar-width:none}');
        expect(workflowSource).toContain('.panel-scroll::-webkit-scrollbar{width:0;height:0}');
        expect(workflowSource).toContain('.config-panel{display:flex;flex-direction:column;overflow:hidden}');
    });
    it('renders the icon and title in one row with an independent executor row', () => {
        const wrapper = mount(PerformanceTemplateWorkflowSettings);
        const resultNode = wrapper.findAll('.stage-node').find(node => node.text().includes('绩效结果查看环节'));
        expect(resultNode?.find('.node-title-row').find('.node-title').text()).toBe('绩效结果查看环节');
        expect(resultNode?.find('.node-title-row').find('.node-icon').exists()).toBe(true);
        expect(resultNode?.find('.node-executor').text()).toBe('执行人：被评估人');
        expect(resultNode?.element.children[0].classList.contains('node-title-row')).toBe(true);
        expect(resultNode?.element.children[1].classList.contains('node-executor')).toBe(true);
        expect(workflowSource).toContain('width:max-content');
        expect(workflowSource).toContain('text-overflow:ellipsis');
    });
    it.each([
        ['evaluation', 3],
        ['work_summary', 3],
        ['reviewer_360_invite', 5],
        ['reviewer_360_confirm', 4],
        ['calibration', 3],
        ['result_communication', 4],
        ['result_view', 4],
        ['result_reconsideration', 3],
    ])('renders the captured SVG paths for %s', (type, pathCount) => {
        const icon = mount(PerformanceWorkflowStageIcon, { props: { type } });
        expect(icon.get('svg').classes()).toContain('stage-icon');
        expect(icon.findAll('path')).toHaveLength(pathCount);
        expect(icon.text()).toBe('');
    });
    it('opens the add-stage popover on hover and closes it after leaving', async () => {
        vi.useFakeTimers();
        const wrapper = mount(PerformanceTemplateWorkflowSettings);
        const connector = wrapper.get('.flow-connector');
        await connector.trigger('mouseenter');
        expect(wrapper.find('.stage-popover').exists()).toBe(true);
        await connector.trigger('mouseleave');
        vi.advanceTimersByTime(120);
        await wrapper.vm.$nextTick();
        expect(wrapper.find('.stage-popover').exists()).toBe(false);
        wrapper.unmount();
        vi.useRealTimers();
    });
    it('shows the captured trash icon for deletable nodes without selecting them', async () => {
        const wrapper = mount(PerformanceTemplateWorkflowSettings);
        await wrapper.get('.flow-connector').trigger('mouseenter');
        await wrapper.findAll('.popover-stage').find(option => option.text().includes('工作总结环节'))?.trigger('click');
        const workSummaryNode = wrapper.findAll('.stage-node').find(node => node.text().includes('工作总结环节'));
        const resultNode = wrapper.findAll('.stage-node').find(node => node.text().includes('绩效结果查看环节'));
        const deleteButton = workSummaryNode?.get('.delete-node');
        expect(deleteButton?.attributes('aria-label')).toBe('删除工作总结环节');
        expect(deleteButton?.get('svg').attributes('width')).toBe('16');
        expect(deleteButton?.get('path').attributes('d')).toContain('M8 4a2 2 0 0 1 2-2h4');
        expect(resultNode?.find('.delete-node').exists()).toBe(false);
        expect(workflowSource).toContain('.stage-node:hover .delete-node');
    });
    it('applies the captured node and trash-button hover states without a dead pointer gap', () => {
        expect(workflowSource).toContain('.stage-node:hover,.stage-node:focus-visible{border-color:#3370ff;background:rgba(51,112,255,.08);color:#3370ff}');
        expect(workflowSource).toContain('height:25px');
        expect(workflowSource).toContain('.delete-node::before{position:absolute;top:0;bottom:0;left:-4px;width:4px;content:""}');
        expect(workflowSource).toContain('.delete-node:hover,.delete-node:focus-visible{background-color:rgba(31,35,41,.2)}');
    });
    it('shows the delete button only while the pointer hovers the node', async () => {
        const wrapper = mount(PerformanceTemplateWorkflowSettings);
        await wrapper.get('.flow-connector').trigger('mouseenter');
        await wrapper.findAll('.popover-stage').find(option => option.text().includes('工作总结环节'))?.trigger('click');
        const workSummaryNode = wrapper.findAll('.stage-node').find(node => node.text().includes('工作总结环节'));
        expect(workSummaryNode?.classes()).toContain('selected');
        expect(workSummaryNode?.find('.delete-node').exists()).toBe(true);
        expect(workflowSource).toContain('.stage-node:hover .delete-node{visibility:visible;opacity:1;pointer-events:auto}');
        expect(workflowSource).not.toContain('.stage-node.selected .delete-node');
        expect(workflowSource).not.toContain('.stage-node:focus-within .delete-node');
    });
    it('protects the last evaluation node and allows deletion only when more than one exists', async () => {
        const wrapper = mount(PerformanceTemplateWorkflowSettings);
        const evaluationNodes = () => wrapper.findAll('.stage-node').filter(node => node.text().includes('评估型环节'));
        expect(evaluationNodes()).toHaveLength(1);
        expect(evaluationNodes()[0].find('.delete-node').exists()).toBe(false);
        await wrapper.get('.flow-connector').trigger('mouseenter');
        await wrapper.findAll('.popover-stage').find(option => option.text().includes('评估型环节'))?.trigger('click');
        expect(evaluationNodes()).toHaveLength(2);
        expect(evaluationNodes().every(node => node.find('.delete-node').exists())).toBe(true);
        await evaluationNodes()[0].get('.delete-node').trigger('click');
        expect(evaluationNodes()).toHaveLength(1);
        expect(evaluationNodes()[0].find('.delete-node').exists()).toBe(false);
    });
    it('does not expose the built-in result-view node in the add-stage popover', async () => {
        const wrapper = mount(PerformanceTemplateWorkflowSettings);
        await wrapper.get('.flow-connector').trigger('mouseenter');
        expect(wrapper.get('.stage-popover').text()).not.toContain('绩效结果查看环节');
    });
    it.each([
        '工作总结环节',
        '360°邀请环节',
        '360°确认环节',
        '校准环节',
        '结果沟通环节',
    ])('removes %s from the add-stage popover after it has been added', async (label) => {
        const wrapper = mount(PerformanceTemplateWorkflowSettings);
        await wrapper.get('.flow-connector').trigger('mouseenter');
        await wrapper.findAll('.popover-stage').find(option => option.text().includes(label))?.trigger('click');
        await wrapper.get('.flow-connector').trigger('mouseenter');
        expect(wrapper.get('.stage-popover').text()).not.toContain(label);
        expect(wrapper.get('.stage-popover').text()).toContain('评估型环节');
    });
    it('keeps evaluation available after adding another evaluation node', async () => {
        const wrapper = mount(PerformanceTemplateWorkflowSettings);
        await wrapper.get('.flow-connector').trigger('mouseenter');
        await wrapper.findAll('.popover-stage').find(option => option.text().includes('评估型环节'))?.trigger('click');
        await wrapper.get('.flow-connector').trigger('mouseenter');
        expect(wrapper.get('.stage-popover').text()).toContain('评估型环节');
    });
    it('makes a single-instance stage available again after deleting it', async () => {
        const wrapper = mount(PerformanceTemplateWorkflowSettings);
        await wrapper.get('.flow-connector').trigger('mouseenter');
        await wrapper.findAll('.popover-stage').find(option => option.text().includes('工作总结环节'))?.trigger('click');
        const workSummaryNode = wrapper.findAll('.stage-node').find(node => node.text().includes('工作总结环节'));
        await workSummaryNode?.get('.delete-node').trigger('click');
        await wrapper.get('.flow-connector').trigger('mouseenter');
        expect(wrapper.get('.stage-popover').text()).toContain('工作总结环节');
        expect(workflowSource).toContain("type !== 'evaluation' && hasNodeType(type)");
    });
    it('offers result reconsideration only from the connector after result view', async () => {
        const wrapper = mount(PerformanceTemplateWorkflowSettings);
        const connectors = wrapper.findAll('button.flow-connector');
        await connectors[0].trigger('mouseenter');
        expect(wrapper.get('.stage-popover').text()).not.toContain('结果复议处理');
        await connectors[connectors.length - 1].trigger('mouseenter');
        const options = wrapper.findAll('.popover-stage');
        expect(options).toHaveLength(1);
        expect(options[0].text()).toBe('结果复议处理');
        expect(options[0].findAll('path')).toHaveLength(3);
        expect(workflowSource).toContain('.popover-icon :deep(.stage-icon){width:16px;height:16px}');
    });
    it('sizes both regular and result-reconsideration popovers from their current options', async () => {
        const wrapper = mount(PerformanceTemplateWorkflowSettings);
        const connectors = wrapper.findAll('button.flow-connector');
        await connectors[0].trigger('mouseenter');
        expect(wrapper.findAll('.popover-stage').length).toBeGreaterThan(1);
        await connectors[connectors.length - 1].trigger('mouseenter');
        expect(wrapper.findAll('.popover-stage')).toHaveLength(1);
        expect(wrapper.get('.popover-stage').text()).toBe('结果复议处理');
        expect(workflowSource).not.toContain('height:327px');
        expect(workflowSource).toContain('.stage-popover{position:absolute;top:0;left:0;overflow:visible;width:313px;box-sizing:border-box');
        expect(workflowSource).toContain('.stage-popover-content{overflow:auto;max-height:inherit');
        expect(workflowSource).toContain('.popover-stage:last-child{margin-bottom:0}');
    });
    it('anchors the popover and original arrow to the active add circle with viewport avoidance', async () => {
        Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
        let addTop = 58;
        const makeRect = (left, top, width, height) => ({
            x: left,
            y: top,
            top,
            right: left + width,
            bottom: top + height,
            left,
            width,
            height,
            toJSON: () => ({}),
        });
        const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
            if (this.classList.contains('workflow-canvas'))
                return makeRect(0, 50, 960, 250);
            if (this.classList.contains('add-circle'))
                return makeRect(464, addTop, 16, 16);
            if (this.classList.contains('stage-popover'))
                return makeRect(490, 50, 313, 143);
            return makeRect(0, 0, 0, 0);
        });
        const wrapper = mount(PerformanceTemplateWorkflowSettings, { attachTo: document.body });
        const connector = wrapper.get('.flow-connector');
        await connector.trigger('mouseenter');
        const popover = wrapper.get('.stage-popover');
        window.dispatchEvent(new Event('resize'));
        await wrapper.vm.$nextTick();
        expect(popover.attributes('style')).toContain('translate3d(490px, 50px, 0)');
        expect(popover.get('.popover-arrow').attributes('style')).toContain('top: 16px');
        wrapper.unmount();
        addTop = 276;
        const bottomWrapper = mount(PerformanceTemplateWorkflowSettings, { attachTo: document.body });
        await bottomWrapper.get('.flow-connector').trigger('mouseenter');
        const bottomPopover = bottomWrapper.get('.stage-popover');
        expect(bottomPopover.attributes('style')).toContain('translate3d(490px, 157px, 0)');
        expect(bottomPopover.get('.popover-arrow').attributes('style')).toContain('top: 127px');
        expect(bottomPopover.get('.popover-arrow').attributes('width')).toBe('8');
        expect(bottomPopover.get('.popover-arrow').attributes('height')).toBe('16');
        expect(bottomPopover.get('.popover-arrow path').attributes('d')).toBe('M-.5 8v8h1c0-1.553.664-3.033 1.825-4.065l3.166-2.814a1.5 1.5 0 000-2.242L2.325 4.065A5.438 5.438 0 01.5 0h-1v8z');
        expect(workflowSource).not.toContain('top:112px;left:calc(50% + 24px)');
        expect(workflowSource).not.toContain('Math.min(Math.max(addCenterY - top, 16)');
        expect(workflowSource).toContain('useTopArrow ? 16 : Math.max(16, popoverHeight - 16)');
        expect(workflowSource).toContain('addRect.right + 10 + window.scrollX');
        expect(workflowSource).toContain('@scroll.passive="updatePopoverPosition"');
        expect(workflowSource).toContain("window.addEventListener('resize', updatePopoverPosition)");
        expect(workflowSource).toContain("window.addEventListener('scroll', updatePopoverPosition, true)");
        rectSpy.mockRestore();
        bottomWrapper.unmount();
    });
    it('adds result reconsideration directly after result view and removes both following add actions', async () => {
        const wrapper = mount(PerformanceTemplateWorkflowSettings);
        const connectors = wrapper.findAll('button.flow-connector');
        await connectors[connectors.length - 1].trigger('mouseenter');
        await wrapper.get('.popover-stage').trigger('click');
        const nodes = wrapper.findAll('.stage-node');
        const resultViewIndex = nodes.findIndex(node => node.text().includes('绩效结果查看环节'));
        const reconsiderationNode = nodes[resultViewIndex + 1];
        expect(reconsiderationNode.text()).toContain('结果复议处理');
        expect(reconsiderationNode.findAll('.node-icon path')).toHaveLength(3);
        expect(nodes[resultViewIndex].element.nextElementSibling?.classList).toContain('flow-connector--passive');
        expect(reconsiderationNode.element.nextElementSibling?.classList).toContain('flow-connector--passive');
        expect(wrapper.findAll('button.flow-connector')).toHaveLength(2);
    });
    it('restores the result-view add action after deleting result reconsideration', async () => {
        const wrapper = mount(PerformanceTemplateWorkflowSettings);
        let connectors = wrapper.findAll('button.flow-connector');
        await connectors[connectors.length - 1].trigger('mouseenter');
        await wrapper.get('.popover-stage').trigger('click');
        const reconsiderationNode = wrapper.findAll('.stage-node').find(node => node.text().includes('结果复议处理'));
        await reconsiderationNode?.get('.delete-node').trigger('click');
        connectors = wrapper.findAll('button.flow-connector');
        expect(connectors).toHaveLength(3);
        await connectors[connectors.length - 1].trigger('mouseenter');
        expect(wrapper.get('.stage-popover').text()).toContain('结果复议处理');
    });
});
