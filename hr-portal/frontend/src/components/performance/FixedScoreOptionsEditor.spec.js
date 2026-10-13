import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import FixedScoreOptionsEditor from './FixedScoreOptionsEditor.vue';
const options = [{ id: 'one', value: '0.01' }, { id: 'two', value: '0.02' }];
function pointerEvent(type, values) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { value }])));
    return event;
}
describe('FixedScoreOptionsEditor', () => {
    it('renders fixed score rows with the shared handle and validates decimal precision', async () => {
        const wrapper = mount(FixedScoreOptionsEditor, { props: { options } });
        expect(wrapper.findAll('.fixed-score-option-row')).toHaveLength(2);
        expect(wrapper.findAll('[data-drag-handle]')).toHaveLength(2);
        expect(wrapper.find('[data-icon="DeleteTrashOutlined"]').exists()).toBe(false);
        const input = wrapper.find('input');
        await input.setValue('0.022');
        const invalidOptions = wrapper.emitted('update:options')?.at(-1)?.[0];
        await wrapper.setProps({ options: invalidOptions });
        expect(wrapper.find('.fixed-score-option-error').text()).toBe('最多支持2位小数');
        await wrapper.find('input').setValue('0.01');
        const recoveredOptions = wrapper.emitted('update:options')?.at(-1)?.[0];
        await wrapper.setProps({ options: recoveredOptions });
        expect(wrapper.find('.fixed-score-option-error').exists()).toBe(false);
    });
    it('reorders variable-height rows and preserves stable option ids', async () => {
        const wrapper = mount(FixedScoreOptionsEditor, { props: { options } });
        const rows = wrapper.findAll('.fixed-score-option-row');
        rows.forEach((row, index) => {
            vi.spyOn(row.element, 'getBoundingClientRect').mockReturnValue({ top: index * 48, left: 0, right: 400, bottom: index * 48 + (index === 0 ? 40 : 72), width: 400, height: index === 0 ? 40 : 72, x: 0, y: index * 48, toJSON: () => ({}) });
        });
        await rows[0].find('[data-drag-handle]').trigger('pointerdown', { button: 0, pointerId: 1, clientX: 10, clientY: 10 });
        window.dispatchEvent(pointerEvent('pointermove', { pointerId: 1, clientX: 10, clientY: 80 }));
        window.dispatchEvent(pointerEvent('pointerup', { pointerId: 1, clientX: 10, clientY: 80 }));
        await wrapper.vm.$nextTick();
        const reordered = wrapper.emitted('update:options')?.at(-1)?.[0];
        await wrapper.setProps({ options: reordered });
        expect(wrapper.findAll('.fixed-score-option-row')[0].find('input').element.value).toBe('0.02');
    });
    it('shows delete only after adding a third option', async () => {
        const wrapper = mount(FixedScoreOptionsEditor, { props: { options } });
        await wrapper.find('.add-fixed-score-button').trigger('click');
        const added = wrapper.emitted('update:options')?.at(-1)?.[0];
        await wrapper.setProps({ options: added });
        expect(wrapper.findAll('.fixed-score-option-row')).toHaveLength(3);
        expect(wrapper.findAll('.fixed-score-option-row .performance-icon-button')).toHaveLength(3);
    });
    it('validates numeric duplicates and the maximum while allowing negative values', async () => {
        const wrapper = mount(FixedScoreOptionsEditor, {
            props: {
                options: [
                    { id: 'first', value: '1' },
                    { id: 'second', value: '1.00' },
                    { id: 'negative', value: '-1.25' },
                ],
            },
        });
        expect(wrapper.findAll('.fixed-score-option-error').map((item) => item.text())).toEqual(['分值重复', '分值重复']);
        await wrapper.setProps({ options: [
                { id: 'first', value: '1' },
                { id: 'second', value: '1.00' },
                { id: 'too-large', value: '1000000000000001' },
            ] });
        expect(wrapper.findAll('.fixed-score-option-error').map((item) => item.text())).toEqual(['分值重复', '分值重复', '不可超过 1,000,000,000,000,000']);
    });
    it('disables adding after twenty options', async () => {
        const twenty = Array.from({ length: 20 }, (_, index) => ({ id: `option-${index + 1}`, value: String(index + 1) }));
        const wrapper = mount(FixedScoreOptionsEditor, { props: { options: twenty } });
        const addButton = wrapper.get('.add-fixed-score-button');
        expect(addButton.attributes('disabled')).toBeDefined();
        await addButton.trigger('click');
        expect(wrapper.emitted('add')).toBeUndefined();
    });
});
