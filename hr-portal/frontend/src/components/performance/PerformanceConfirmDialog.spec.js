import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import PerformanceConfirmDialog from './PerformanceConfirmDialog.vue';
function mountDialog(props = {}) {
    return mount(PerformanceConfirmDialog, {
        attachTo: document.body,
        props: { modelValue: true, ...props },
    });
}
afterEach(() => {
    document.body.innerHTML = '';
    document.body.style.overflow = '';
});
describe('PerformanceConfirmDialog', () => {
    it('renders the captured warning composition and exact actions', async () => {
        const wrapper = mountDialog();
        await flushPromises();
        const dialog = document.querySelector('.performance-confirm-dialog');
        expect(dialog?.getAttribute('role')).toBe('alertdialog');
        expect(document.querySelector('.performance-confirm-dialog__header')?.textContent).toContain('后续配置项目将无法使用该模板，确定删除吗？');
        expect(document.querySelector('.performance-confirm-dialog__icon path')?.getAttribute('d')).toContain('M23 12c0 6.075');
        expect(Array.from(document.querySelectorAll('.performance-confirm-dialog__button')).map(button => button.textContent)).toEqual(['保留', '删除']);
        expect(document.querySelector('[data-source-state-id="user-snapspec-20260831-template-delete-confirm"]')).not.toBeNull();
        wrapper.unmount();
    });
    it('cancels without confirming and supports Escape', async () => {
        const wrapper = mountDialog();
        await flushPromises();
        document.querySelector('.performance-confirm-dialog__button--cancel').click();
        expect(wrapper.emitted('update:modelValue')).toEqual([[false]]);
        expect(wrapper.emitted('confirm')).toBeUndefined();
        await wrapper.setProps({ modelValue: true });
        await document.querySelector('.performance-confirm-dialog')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(wrapper.emitted('update:modelValue')).toEqual([[false], [false]]);
        wrapper.unmount();
    });
    it('emits confirm once and disables both actions while deleting', async () => {
        const wrapper = mountDialog({ loading: true });
        await flushPromises();
        const buttons = Array.from(document.querySelectorAll('.performance-confirm-dialog__button'));
        expect(buttons.every(button => button.disabled)).toBe(true);
        await wrapper.setProps({ loading: false });
        document.querySelector('.performance-confirm-dialog__button--danger').click();
        expect(wrapper.emitted('confirm')).toHaveLength(1);
        wrapper.unmount();
    });
    it('traps keyboard focus and restores it after closing', async () => {
        const opener = document.createElement('button');
        document.body.appendChild(opener);
        opener.focus();
        const wrapper = mountDialog();
        await flushPromises();
        const dialog = document.querySelector('.performance-confirm-dialog');
        const cancel = document.querySelector('.performance-confirm-dialog__button--cancel');
        const confirm = document.querySelector('.performance-confirm-dialog__button--danger');
        expect(document.activeElement).toBe(cancel);
        confirm.focus();
        dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
        expect(document.activeElement).toBe(cancel);
        cancel.focus();
        dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
        expect(document.activeElement).toBe(confirm);
        await wrapper.setProps({ modelValue: false });
        await flushPromises();
        expect(document.activeElement).toBe(opener);
        wrapper.unmount();
    });
});
