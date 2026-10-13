import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import LevelConfigEditor from './LevelConfigEditor.vue';
const levels = [
    { color: 'rgb(251, 191, 188)', code: '', name: '', quantifiedScore: '', value: '' },
    { color: 'rgb(254, 212, 164)', code: '', name: '', quantifiedScore: '', value: '' },
    { color: 'rgb(248, 230, 171)', code: '', name: '', quantifiedScore: '', value: '' },
];
function pointerEvent(type, values) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { value }])));
    return event;
}
function keyEvent(key) {
    return new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
}
describe('LevelConfigEditor', () => {
    it('renders the level controls and adds an inline level', async () => {
        const wrapper = mount(LevelConfigEditor, { props: { levels } });
        expect(wrapper.findAll('.level-row')).toHaveLength(3);
        expect(wrapper.find('[data-drag-handle]').attributes('role')).toBe('button');
        expect(wrapper.find('[data-drag-handle]').attributes('tabindex')).toBe('0');
        expect(wrapper.find('[data-icon="DragOutlined"]').exists()).toBe(true);
        expect(wrapper.find('[data-icon="DeleteTrashOutlined"]').exists()).toBe(true);
        expect(wrapper.find('[data-icon="ExpandDownFilled"]').exists()).toBe(true);
        expect(wrapper.find('input[type="color"]').exists()).toBe(false);
        expect(wrapper.findAll('.level-row[draggable="true"]')).toHaveLength(0);
        expect(wrapper.findAll('.performance-number-input')).toHaveLength(3);
        expect(wrapper.findAll('[data-icon="UpBoldOutlined"]')).toHaveLength(3);
        expect(wrapper.findAll('[data-icon="DownBoldOutlined"]')).toHaveLength(3);
        expect(wrapper.findAll('[data-step="0.1"]')).toHaveLength(3);
        await wrapper.findAll('[data-icon="UpBoldOutlined"]')[0].trigger('click');
        const levelsAfterStep = wrapper.emitted('update:levels')?.at(-1)?.[0];
        expect(levelsAfterStep[0].value).toBe('0.1');
        await wrapper.findAll('.performance-number-input input')[0].setValue('-2');
        const levelsAfterNegative = wrapper.emitted('update:levels')?.at(-1)?.[0];
        expect(levelsAfterNegative[0].value).toBe('0');
        await wrapper.get('.add-level-button').trigger('click');
        expect(wrapper.emitted('add')).toHaveLength(1);
        const added = wrapper.emitted('update:levels')?.at(-1)?.[0];
        expect(added).toHaveLength(4);
        expect(added[3].id).toBe('review-level-new-1');
    });
    it('adds quantified score inputs while keeping value inputs', async () => {
        const wrapper = mount(LevelConfigEditor, { props: { levels, quantified: true } });
        expect(wrapper.attributes('data-quantified')).toBe('true');
        expect(wrapper.findAll('.performance-number-input')).toHaveLength(6);
        expect(wrapper.findAll('input[required]')).toHaveLength(3);
        expect(wrapper.findAll('input[aria-label$="量化分"]')).toHaveLength(3);
        expect(wrapper.findAll('input[aria-label$="量化值"]')).toHaveLength(3);
        await wrapper.find('input[aria-label="第1个等级量化分"]').setValue('2.5');
        const updated = wrapper.emitted('update:levels')?.at(-1)?.[0];
        expect(updated[0].quantifiedScore).toBe('2.5');
        expect(updated[0].value).toBe('');
        await wrapper.get('.add-level-button').trigger('click');
        const added = wrapper.emitted('update:levels')?.at(-1)?.[0];
        expect(added).toHaveLength(4);
        expect(added[3].quantifiedScore).toBe('');
        await wrapper.setProps({ levels: added });
        expect(wrapper.findAll('.performance-number-input')).toHaveLength(8);
    });
    it('reorders only from the drag handle and preserves stable level identity', async () => {
        const wrapper = mount(LevelConfigEditor, {
            props: { levels, errors: [true, false, false] },
        });
        expect(wrapper.findAll('.error-text')).toHaveLength(1);
        const rows = wrapper.findAll('.level-row');
        rows.forEach((row, index) => {
            vi.spyOn(row.element, 'getBoundingClientRect').mockReturnValue({ top: index * 44, left: 0, right: 760, bottom: index * 44 + 32, width: 760, height: 32, x: 0, y: index * 44, toJSON: () => ({}) });
        });
        const handle = wrapper.findAll('[data-drag-handle]')[0];
        await handle.trigger('pointerdown', { button: 0, pointerId: 1, clientX: 10, clientY: 10 });
        window.dispatchEvent(pointerEvent('pointermove', { pointerId: 1, clientX: 10, clientY: 70 }));
        window.dispatchEvent(pointerEvent('pointerup', { pointerId: 1, clientX: 10, clientY: 70 }));
        await wrapper.vm.$nextTick();
        expect(wrapper.emitted('reorder')).toEqual([[0, 1]]);
        const reordered = wrapper.emitted('update:levels')?.at(-1)?.[0];
        expect(reordered.map(({ id: _id, ...level }) => level)).toEqual([levels[1], levels[0], levels[2]]);
        expect(reordered.map((level) => level.id)).toEqual(['review-level-2', 'review-level-1', 'review-level-3']);
    });
    it('caps levels at ten and reports the minimum-level delete error', async () => {
        const tenLevels = Array.from({ length: 10 }, (_, index) => ({ ...levels[0], id: `level-${index + 1}`, code: String(index + 1) }));
        const capped = mount(LevelConfigEditor, { props: { levels: tenLevels } });
        expect(capped.get('.add-level-button').attributes('disabled')).toBeDefined();
        await capped.get('.add-level-button').trigger('click');
        expect(capped.emitted('add')).toBeUndefined();
        const twoLevels = tenLevels.slice(0, 2);
        const minimum = mount(LevelConfigEditor, { props: { levels: twoLevels } });
        await minimum.findAll('.performance-icon-button')[0].trigger('click');
        expect(minimum.emitted('update:levels')?.at(-1)?.[0]).toHaveLength(1);
        expect(minimum.get('.mt-1.text-R-500').text()).toBe('无法删除，需保留至少两个非隐藏型等级');
    });
    it('supports keyboard grab, move, drop and announcement', async () => {
        const wrapper = mount(LevelConfigEditor, { props: { levels } });
        const handle = wrapper.findAll('[data-drag-handle]')[0];
        handle.element.dispatchEvent(keyEvent('Enter'));
        handle.element.dispatchEvent(keyEvent('ArrowDown'));
        await wrapper.vm.$nextTick();
        handle.element.dispatchEvent(keyEvent('Enter'));
        await wrapper.vm.$nextTick();
        expect(wrapper.emitted('reorder')).toEqual([[0, 1]]);
        expect(wrapper.find('.performance-sortable-list__announcement').text()).toContain('position 2');
    });
});
