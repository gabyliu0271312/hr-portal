import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import ColorPicker from './ColorPicker.vue';
import { PERFORMANCE_LEVEL_COLORS } from './performanceColorOptions';
const wrappers = [];
function mountPicker(value = PERFORMANCE_LEVEL_COLORS[0].value) {
    const wrapper = mount(ColorPicker, {
        attachTo: document.body,
        props: { modelValue: value },
    });
    wrappers.push(wrapper);
    return wrapper;
}
afterEach(() => {
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
    document.body.innerHTML = '';
});
describe('ColorPicker', () => {
    it('opens the fixed 12-color palette with target icons', async () => {
        const wrapper = mountPicker();
        const trigger = wrapper.get('.performance-color-picker-trigger');
        expect(trigger.attributes('aria-expanded')).toBe('false');
        expect(trigger.find('[data-icon="ExpandDownFilled"]').exists()).toBe(true);
        expect(trigger.attributes('style')).toContain('rgb(253, 226, 226)');
        await trigger.trigger('click');
        const panel = document.body.querySelector('.performance-color-picker-popover');
        expect(panel).not.toBeNull();
        expect(trigger.attributes('aria-expanded')).toBe('true');
        expect(panel.querySelectorAll('.performance-color-swatch')).toHaveLength(12);
        expect(panel.querySelector('[data-icon="DoneOutlined"]')).not.toBeNull();
        expect(panel.querySelectorAll('.performance-color-swatch.active')).toHaveLength(1);
    });
    it('selects a color, closes, and keeps it active after reopening', async () => {
        const wrapper = mountPicker();
        const trigger = wrapper.get('.performance-color-picker-trigger');
        await trigger.trigger('click');
        const swatches = document.body.querySelectorAll('.performance-color-swatch');
        swatches[3].click();
        await wrapper.vm.$nextTick();
        expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['rgb(183, 237, 177)']);
        expect(document.body.querySelector('.performance-color-picker-popover')).toBeNull();
        await wrapper.setProps({ modelValue: 'rgb(183, 237, 177)' });
        expect(trigger.attributes('style')).toContain('rgb(217, 245, 214)');
        await trigger.trigger('click');
        const reopened = document.body.querySelectorAll('.performance-color-swatch');
        expect(reopened[3].classList.contains('active')).toBe(true);
        expect(reopened[3].querySelector('[data-icon="DoneOutlined"]')).not.toBeNull();
    });
});
