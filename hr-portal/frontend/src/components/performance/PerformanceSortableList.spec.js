import { h } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import PerformanceSortableList from './PerformanceSortableList.vue';
const items = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }];
function pointerEvent(type, values) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { value }])));
    return event;
}
function keyEvent(key) {
    return new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
}
function mountList() {
    return mount(PerformanceSortableList, {
        props: { items, itemKey: 'id', gap: 8 },
        slots: {
            default: ({ item, index, dragging, over, itemStyle }) => h('div', {
                'data-sortable-index': index,
                'data-dragging': dragging,
                'data-over': over,
                style: itemStyle,
            }, [h('div', { 'data-drag-handle': true, role: 'button', tabindex: 0 }, item.label)]),
        },
    });
}
describe('PerformanceSortableList', () => {
    it('reorders by pointer movement and keeps drag scope on the handle', async () => {
        const wrapper = mountList();
        const rows = wrapper.findAll('[data-sortable-index]');
        rows.forEach((row, index) => {
            vi.spyOn(row.element, 'getBoundingClientRect').mockReturnValue({ top: index * 44, left: 0, right: 760, bottom: index * 44 + 32, width: 760, height: 32, x: 0, y: index * 44, toJSON: () => ({}) });
        });
        await rows[0].find('[data-drag-handle]').trigger('pointerdown', { button: 0, pointerId: 1, clientX: 10, clientY: 10 });
        window.dispatchEvent(pointerEvent('pointermove', { pointerId: 1, clientX: 10, clientY: 70 }));
        await wrapper.vm.$nextTick();
        window.dispatchEvent(pointerEvent('pointermove', { pointerId: 1, clientX: 10, clientY: 70 }));
        await wrapper.vm.$nextTick();
        expect(wrapper.find('[data-sortable-index="0"]').attributes('style')).toContain('position: fixed');
        expect(wrapper.find('[data-sortable-index="0"]').attributes('style')).toContain('z-index: 5000');
        expect(wrapper.find('[data-sortable-preview]').exists()).toBe(false);
        expect(wrapper.find('[data-sortable-placeholder]').exists()).toBe(true);
        expect(wrapper.find('[data-sortable-index="1"]').attributes('style')).toContain('translate(0, -40px)');
        expect(wrapper.find('[data-sortable-index="2"]').attributes('style') || '').not.toContain('translate');
        window.dispatchEvent(pointerEvent('pointerup', { pointerId: 1, clientX: 10, clientY: 70 }));
        expect(wrapper.emitted('reorder')).toEqual([[0, 1]]);
        expect(wrapper.emitted('drag-start')).toEqual([[0]]);
        expect(wrapper.emitted('drag-end')).toEqual([[0, 1]]);
    });
    it('cancels a pointer interaction that never crosses the drag threshold', async () => {
        const wrapper = mountList();
        const handle = wrapper.find('[data-drag-handle]');
        await handle.trigger('pointerdown', { button: 0, pointerId: 2, clientX: 10, clientY: 10 });
        window.dispatchEvent(pointerEvent('pointerup', { pointerId: 2, clientX: 11, clientY: 11 }));
        expect(wrapper.emitted('reorder')).toBeUndefined();
        expect(wrapper.emitted('drag-cancel')).toEqual([[0]]);
    });
    it('cancels when the pointer is released outside the list', async () => {
        const wrapper = mountList();
        const rows = wrapper.findAll('[data-sortable-index]');
        rows.forEach((row, index) => {
            vi.spyOn(row.element, 'getBoundingClientRect').mockReturnValue({ top: index * 44, left: 0, right: 760, bottom: index * 44 + 32, width: 760, height: 32, x: 0, y: index * 44, toJSON: () => ({}) });
        });
        const handle = wrapper.find('[data-drag-handle]');
        await handle.trigger('pointerdown', { button: 0, pointerId: 3, clientX: 10, clientY: 10 });
        window.dispatchEvent(pointerEvent('pointermove', { pointerId: 3, clientX: 10, clientY: 50 }));
        window.dispatchEvent(pointerEvent('pointermove', { pointerId: 3, clientX: 900, clientY: 50 }));
        window.dispatchEvent(pointerEvent('pointerup', { pointerId: 3, clientX: 900, clientY: 50 }));
        expect(wrapper.emitted('reorder')).toBeUndefined();
        expect(wrapper.emitted('drag-cancel')).toEqual([[0]]);
    });
    it('keeps upper rows still when lifting the last item and avoids two-sided displacement', async () => {
        const lastWrapper = mountList();
        const lastRows = lastWrapper.findAll('[data-sortable-index]');
        lastRows.forEach((row, index) => {
            vi.spyOn(row.element, 'getBoundingClientRect').mockReturnValue({ top: index * 44, left: 0, right: 760, bottom: index * 44 + 32, width: 760, height: 32, x: 0, y: index * 44, toJSON: () => ({}) });
        });
        const lastHandle = lastRows[2].find('[data-drag-handle]');
        await lastHandle.trigger('pointerdown', { button: 0, pointerId: 4, clientX: 10, clientY: 98 });
        window.dispatchEvent(pointerEvent('pointermove', { pointerId: 4, clientX: 10, clientY: 94 }));
        await lastWrapper.vm.$nextTick();
        expect(lastRows[0].attributes('style') || '').not.toContain('translate');
        expect(lastRows[1].attributes('style') || '').not.toContain('translate');
        window.dispatchEvent(pointerEvent('pointerup', { pointerId: 4, clientX: 10, clientY: 94 }));
        const middleWrapper = mountList();
        const middleRows = middleWrapper.findAll('[data-sortable-index]');
        middleRows.forEach((row, index) => {
            vi.spyOn(row.element, 'getBoundingClientRect').mockReturnValue({ top: index * 44, left: 0, right: 760, bottom: index * 44 + 32, width: 760, height: 32, x: 0, y: index * 44, toJSON: () => ({}) });
        });
        const middleHandle = middleRows[1].find('[data-drag-handle]');
        await middleHandle.trigger('pointerdown', { button: 0, pointerId: 5, clientX: 10, clientY: 54 });
        window.dispatchEvent(pointerEvent('pointermove', { pointerId: 5, clientX: 10, clientY: 58 }));
        await middleWrapper.vm.$nextTick();
        expect(middleRows[0].attributes('style') || '').not.toContain('translate');
        expect([middleRows[0].attributes('style') || '', middleRows[2].attributes('style') || ''].filter((style) => style.includes('translate')).length).toBeLessThan(2);
        window.dispatchEvent(pointerEvent('pointerup', { pointerId: 5, clientX: 10, clientY: 58 }));
    });
    it('transfers downward impact when the active trailing edge crosses each row center', async () => {
        const wrapper = mountList();
        const rows = wrapper.findAll('[data-sortable-index]');
        rows.forEach((row, index) => {
            vi.spyOn(row.element, 'getBoundingClientRect').mockReturnValue({ top: index * 44, left: 0, right: 760, bottom: index * 44 + 32, width: 760, height: 32, x: 0, y: index * 44, toJSON: () => ({}) });
        });
        await rows[0].find('[data-drag-handle]').trigger('pointerdown', { button: 0, pointerId: 6, clientX: 10, clientY: 10 });
        window.dispatchEvent(pointerEvent('pointermove', { pointerId: 6, clientX: 10, clientY: 20 }));
        await wrapper.vm.$nextTick();
        expect(rows[1].attributes('style') || '').not.toContain('translate');
        expect(rows[2].attributes('style') || '').not.toContain('translate');
        expect(wrapper.attributes('data-impact-index')).toBe('0');
        await new Promise((resolve) => requestAnimationFrame(() => resolve()));
        await wrapper.vm.$nextTick();
        window.dispatchEvent(pointerEvent('pointermove', { pointerId: 6, clientX: 10, clientY: 40 }));
        await wrapper.vm.$nextTick();
        expect(rows[1].attributes('style')).toContain('translate(0, -40px)');
        expect(rows[1].attributes('style')).toContain('transform 0.2s');
        expect(rows[2].attributes('style') || '').not.toContain('translate');
        expect(wrapper.attributes('data-impact-index')).toBe('1');
        window.dispatchEvent(pointerEvent('pointermove', { pointerId: 6, clientX: 10, clientY: 84 }));
        await wrapper.vm.$nextTick();
        expect(rows[1].attributes('style')).toContain('translate(0, -40px)');
        expect(rows[2].attributes('style')).toContain('translate(0, -40px)');
        expect(wrapper.attributes('data-impact-index')).toBe('2');
        window.dispatchEvent(pointerEvent('pointerup', { pointerId: 6, clientX: 10, clientY: 84 }));
        expect(wrapper.emitted('reorder')).toEqual([[0, 2]]);
    });
    it('keeps lower rows in place while a middle row moves upward', async () => {
        const wrapper = mountList();
        const rows = wrapper.findAll('[data-sortable-index]');
        rows.forEach((row, index) => {
            vi.spyOn(row.element, 'getBoundingClientRect').mockReturnValue({ top: index * 44, left: 0, right: 760, bottom: index * 44 + 32, width: 760, height: 32, x: 0, y: index * 44, toJSON: () => ({}) });
        });
        await rows[1].find('[data-drag-handle]').trigger('pointerdown', { button: 0, pointerId: 7, clientX: 10, clientY: 54 });
        window.dispatchEvent(pointerEvent('pointermove', { pointerId: 7, clientX: 10, clientY: 50 }));
        await wrapper.vm.$nextTick();
        expect(rows[0].attributes('style') || '').not.toContain('translate');
        expect(rows[2].attributes('style') || '').not.toContain('translate');
        await new Promise((resolve) => requestAnimationFrame(() => resolve()));
        await wrapper.vm.$nextTick();
        window.dispatchEvent(pointerEvent('pointermove', { pointerId: 7, clientX: 10, clientY: 20 }));
        await wrapper.vm.$nextTick();
        expect(rows[0].attributes('style')).toContain('translate(0, 40px)');
        expect(rows[2].attributes('style') || '').not.toContain('translate');
        expect(wrapper.attributes('data-impact-index')).toBe('0');
        window.dispatchEvent(pointerEvent('pointerup', { pointerId: 7, clientX: 10, clientY: 20 }));
        expect(wrapper.emitted('reorder')).toEqual([[1, 0]]);
    });
    it('moves only the crossed upper range when dragging the last row upward', async () => {
        const wrapper = mountList();
        const rows = wrapper.findAll('[data-sortable-index]');
        rows.forEach((row, index) => {
            vi.spyOn(row.element, 'getBoundingClientRect').mockReturnValue({ top: index * 44, left: 0, right: 760, bottom: index * 44 + 32, width: 760, height: 32, x: 0, y: index * 44, toJSON: () => ({}) });
        });
        await rows[2].find('[data-drag-handle]').trigger('pointerdown', { button: 0, pointerId: 7, clientX: 10, clientY: 98 });
        window.dispatchEvent(pointerEvent('pointermove', { pointerId: 7, clientX: 10, clientY: 94 }));
        await wrapper.vm.$nextTick();
        expect(rows[0].attributes('style') || '').not.toContain('translate');
        expect(rows[1].attributes('style') || '').not.toContain('translate');
        window.dispatchEvent(pointerEvent('pointermove', { pointerId: 7, clientX: 10, clientY: 55 }));
        await wrapper.vm.$nextTick();
        expect(rows[0].attributes('style') || '').not.toContain('translate');
        expect(rows[1].attributes('style')).toContain('translate(0, 40px)');
        expect(wrapper.attributes('data-impact-index')).toBe('1');
        window.dispatchEvent(pointerEvent('pointermove', { pointerId: 7, clientX: 10, clientY: 10 }));
        await wrapper.vm.$nextTick();
        expect(rows[0].attributes('style')).toContain('translate(0, 40px)');
        expect(rows[1].attributes('style')).toContain('translate(0, 40px)');
        expect(wrapper.attributes('data-impact-index')).toBe('0');
        window.dispatchEvent(pointerEvent('pointerup', { pointerId: 7, clientX: 10, clientY: 10 }));
        expect(wrapper.emitted('reorder')).toEqual([[2, 0]]);
    });
    it('uses the dragged row height for the placeholder and displacement', async () => {
        const wrapper = mountList();
        const rows = wrapper.findAll('[data-sortable-index]');
        const heights = [56, 40, 72];
        const tops = [0, 64, 112];
        rows.forEach((row, index) => {
            vi.spyOn(row.element, 'getBoundingClientRect').mockReturnValue({ top: tops[index], left: 0, right: 760, bottom: tops[index] + heights[index], width: 760, height: heights[index], x: 0, y: tops[index], toJSON: () => ({}) });
        });
        await rows[0].find('[data-drag-handle]').trigger('pointerdown', { button: 0, pointerId: 8, clientX: 10, clientY: 10 });
        window.dispatchEvent(pointerEvent('pointermove', { pointerId: 8, clientX: 10, clientY: 20 }));
        await wrapper.vm.$nextTick();
        window.dispatchEvent(pointerEvent('pointermove', { pointerId: 8, clientX: 10, clientY: 80 }));
        await wrapper.vm.$nextTick();
        expect(wrapper.find('[data-sortable-placeholder]').attributes('style')).toContain('height: 56px');
        expect(wrapper.find('[data-sortable-placeholder]').attributes('style')).toContain('margin-bottom: 8px');
        expect(rows[1].attributes('style')).toContain('translate(0, -64px)');
        expect(rows[2].attributes('style') || '').not.toContain('translate');
        window.dispatchEvent(pointerEvent('pointercancel', { pointerId: 8, clientX: 10, clientY: 20 }));
    });
    it('cancels an active pointer drag on pointercancel', async () => {
        const wrapper = mountList();
        const rows = wrapper.findAll('[data-sortable-index]');
        rows.forEach((row, index) => {
            vi.spyOn(row.element, 'getBoundingClientRect').mockReturnValue({ top: index * 44, left: 0, right: 760, bottom: index * 44 + 32, width: 760, height: 32, x: 0, y: index * 44, toJSON: () => ({}) });
        });
        await rows[0].find('[data-drag-handle]').trigger('pointerdown', { button: 0, pointerId: 9, clientX: 10, clientY: 10 });
        window.dispatchEvent(pointerEvent('pointermove', { pointerId: 9, clientX: 10, clientY: 70 }));
        window.dispatchEvent(pointerEvent('pointercancel', { pointerId: 9, clientX: 10, clientY: 70 }));
        expect(wrapper.emitted('reorder')).toBeUndefined();
        expect(wrapper.emitted('drag-cancel')).toEqual([[0]]);
        expect(wrapper.find('[data-sortable-placeholder]').exists()).toBe(false);
    });
    it('commits a keyboard reorder with Space and restores the handle focus', async () => {
        const wrapper = mountList();
        const handle = wrapper.find('[data-drag-handle]');
        handle.element.dispatchEvent(keyEvent(' '));
        handle.element.dispatchEvent(keyEvent('ArrowDown'));
        await wrapper.vm.$nextTick();
        wrapper.findAll('[data-drag-handle]')[1].element.dispatchEvent(keyEvent(' '));
        await wrapper.vm.$nextTick();
        expect(wrapper.emitted('reorder')).toEqual([[0, 1]]);
        expect(wrapper.find('.performance-sortable-list__announcement').text()).toContain('position 2');
    });
    it('cancels a keyboard drag with Escape', async () => {
        const wrapper = mountList();
        const handle = wrapper.find('[data-drag-handle]');
        handle.element.dispatchEvent(keyEvent('Enter'));
        handle.element.dispatchEvent(keyEvent('ArrowDown'));
        await wrapper.vm.$nextTick();
        handle.element.dispatchEvent(keyEvent('Escape'));
        expect(wrapper.emitted('reorder')).toBeUndefined();
        expect(wrapper.emitted('drag-cancel')).toEqual([[0]]);
    });
});
