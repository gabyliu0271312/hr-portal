import { computed, defineComponent, h, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import PerformanceRichTextBox from './PerformanceRichTextBox.vue';
import { ArrowDown, ArrowUp, CircleCheckFilled, Close, Delete, Edit, Plus } from '@element-plus/icons-vue';
import { ElEmpty } from 'element-plus';
import PerformanceAssessmentEditorModal from './PerformanceAssessmentEditorModal.vue';
import PerformanceExpandButton from './PerformanceExpandButton.vue';
import PerformanceDragHandle from './PerformanceDragHandle.vue';
import PerformanceSortableList from './PerformanceSortableList.vue';
import PerformanceFormField from './PerformanceFormField.vue';
import PerformanceAssessmentSelect from './PerformanceAssessmentSelect.vue';
import PerformanceOptionNavigator from './PerformanceOptionNavigator.vue';
import DownBoldOutlinedIcon from './DownBoldOutlinedIcon.vue';
import PerformanceSwitch from './PerformanceSwitch.vue';
import PerformanceRadioGroup from './PerformanceRadioGroup.vue';
import PerformanceCheckbox from './PerformanceCheckbox.vue';
const props = withDefaults(defineProps(), { ratingOptions: () => [], tagOptions: () => [], initialContents: () => [], availableContents: () => [], allowedTypes: () => ['work_summary', 'rating', 'custom'] });
const emit = defineEmits();
const drawerRef = ref(null), modalRef = ref(null), modalCloseRef = ref(null), createMenuRef = ref(null);
const groupVisible = ref(true), activeType = ref(null), submitted = ref(false), itemSubmitted = ref(false), success = ref(false), draggedIndex = ref(null), dragAnnouncement = ref(''), editingCreatedId = ref(null), expandedIds = ref(new Set());
const items = ref([]), created = ref([]);
const drawerContents = computed(() => {
    const byId = new Map();
    props.availableContents.forEach(content => {
        const id = content.content_id || content.id;
        if (id)
            byId.set(id, { ...content, id, content_id: id });
    });
    created.value.forEach(content => {
        const id = content.content_id || content.id;
        if (id)
            byId.set(id, { ...content, id, content_id: id });
    });
    return [...byId.values()];
});
const workSummaryItems = ref([]);
const workSummarySortableListRef = ref(null);
const draft = reactive({ name: '', description: '', itemName: '', hint: '', richText: '', ratingOptionId: '', questionType: 'text', tagOptionId: '', defaultAll: false });
let idCounter = 0, contentCounter = 0, successTimer = null;
const nextId = () => `assessment-content-${++idCounter}`;
const nextContentId = () => `content-${Date.now()}-${++contentCounter}`;
const activeLabel = computed(() => ({ work_summary: '工作总结', rating: '评分评级', custom: '自定义' }[activeType.value] || ''));
const selectedRating = computed(() => props.ratingOptions.find(item => item.id === draft.ratingOptionId) || null);
const selectedTag = computed(() => props.tagOptions.find(item => item.id === draft.tagOptionId) || null);
const ratingPreviewOptions = computed(() => (selectedRating.value?.levels || []).map((level, index) => ({ id: `rating-preview-${index}`, label: level })));
const ratingPreviewLayoutPolicy = { viewportWidth: 336, viewportHeight: 32, optionMinWidth: 48, optionHeight: 32, connectorMinWidth: 12, connectorMaxWidth: 48, overflowGap: 12, naturalMax: 5, distributedMax: 10 };
const controlsVisible = computed(() => activeType.value === 'work_summary' && workSummaryItems.value.length >= 2);
const allExpanded = computed(() => created.value.length > 0 && expandedIds.value.size === created.value.length);
const itemInvalid = computed(() => (submitted.value || itemSubmitted.value) && !draft.itemName.trim() && !items.value.length);
watch(() => props.open, open => { if (open) {
    created.value = props.initialContents.map(content => { const id = content.content_id || content.id || nextId(); return { ...content, id, content_id: id, items: content.items.map(item => ({ ...item })) }; });
    void nextTick(() => drawerRef.value?.focus());
}
else
    activeType.value = null; }, { immediate: true });
watch(() => draft.questionType, () => { draft.tagOptionId = ''; draft.defaultAll = false; itemSubmitted.value = false; });
function resetDraft() { Object.assign(draft, { name: '', description: '', itemName: '', hint: '', richText: '', ratingOptionId: '', questionType: 'text', tagOptionId: '', defaultAll: false }); items.value = []; workSummaryItems.value = []; submitted.value = false; itemSubmitted.value = false; draggedIndex.value = null; dragAnnouncement.value = ''; }
function closeDrawer() { activeType.value = null; emit('update:open', false); }
function contentKey(content) { return content.content_id || content.id; }
function isContentSelected(id) { return created.value.some(content => contentKey(content) === id); }
function toggleAvailableContent(content) {
    const id = contentKey(content);
    if (isContentSelected(id))
        return;
    created.value.push({ ...content, id, content_id: id, items: content.items.map(item => ({ ...item })) });
}
function finishDrawer() { emit('confirm', created.value.map(content => ({ ...content, content_id: content.content_id || content.id }))); emit('update:open', false); }
function openModal(type, content) {
    resetDraft();
    editingCreatedId.value = content?.id || null;
    activeType.value = type;
    if (content) {
        Object.assign(draft, { name: content.name, description: content.description, ratingOptionId: content.ratingOptionId || '', questionType: content.questionType || 'text', tagOptionId: content.tagOptionId || '', defaultAll: !!content.defaultAll });
        if (type === 'work_summary')
            workSummaryItems.value = (content.items.length ? content.items : [{ id: nextId(), label: '', hint: '', richText: '' }]).map(item => ({ id: item.id, label: item.label, hint: item.hint, richText: item.richText || '' }));
        else if (type === 'custom' && content.questionType === 'text') {
            const item = content.items[0];
            Object.assign(draft, { itemName: item?.label || '', hint: item?.hint || '', richText: item?.richText || '' });
        }
        else
            items.value = content.items.map(item => ({ id: item.id, label: item.label, hint: item.hint }));
    }
    else if (type === 'work_summary')
        workSummaryItems.value.push(createWorkSummaryItem());
    void nextTick(() => modalCloseRef.value?.focus());
}
function closeModal() { activeType.value = null; editingCreatedId.value = null; resetDraft(); void nextTick(() => drawerRef.value?.focus()); }
function toggleExpanded(id) { const next = new Set(expandedIds.value); next.has(id) ? next.delete(id) : next.add(id); expandedIds.value = next; }
function toggleAllExpanded() { expandedIds.value = allExpanded.value ? new Set() : new Set(created.value.map(item => item.id)); }
function editCreated(content) { openModal(content.type, content); }
const __VLS_exposed = { openEditor: (content) => openModal(content.type, content) };
defineExpose(__VLS_exposed);
function addItem() {
    if (activeType.value === 'work_summary') {
        workSummaryItems.value.push(createWorkSummaryItem());
        return;
    }
    if (activeType.value === 'rating') {
        if (!selectedRating.value) {
            itemSubmitted.value = true;
            return;
        }
        if (!items.value.some(i => i.id === selectedRating.value.id))
            items.value.push({ id: selectedRating.value.id, label: selectedRating.value.label, hint: '' });
        draft.ratingOptionId = '';
        return;
    }
    if (activeType.value === 'custom' && draft.questionType === 'tag') {
        if (!selectedTag.value) {
            itemSubmitted.value = true;
            return;
        }
        items.value.push({ id: nextId(), label: selectedTag.value.label, hint: '' });
        draft.tagOptionId = '';
        draft.defaultAll = false;
        return;
    }
    if (!draft.itemName.trim()) {
        itemSubmitted.value = true;
        return;
    }
    items.value.push({ id: nextId(), label: draft.itemName.trim(), hint: draft.hint.trim() });
    draft.itemName = '';
    draft.hint = '';
    draft.richText = '';
    itemSubmitted.value = false;
}
function createWorkSummaryItem() { return { id: nextId(), label: '', hint: '', richText: '' }; }
function removeWorkSummaryItem(index) { if (!controlsVisible.value)
    return; workSummaryItems.value.splice(index, 1); }
function startSummaryPointerDrag(event) { workSummarySortableListRef.value?.startPointerDrag(event); }
function reorderWorkSummary(from, to) {
    if (from === to)
        return;
    const next = workSummaryItems.value.slice();
    const [item] = next.splice(from, 1);
    if (!item)
        return;
    next.splice(to, 0, item);
    workSummaryItems.value = next;
}
function startSummarySort(index) {
    draggedIndex.value = index;
    dragAnnouncement.value = `You have lifted the item from position ${index + 1}`;
}
function finishSummarySort(from, to) {
    draggedIndex.value = null;
    dragAnnouncement.value = `You have moved the item from position ${from + 1} to position ${to + 1}`;
}
function cancelSummarySort(index) {
    draggedIndex.value = null;
    dragAnnouncement.value = `You have cancelled dragging item in position ${index + 1}`;
}
function validItem() { if (activeType.value === 'rating')
    return !!(selectedRating.value || items.value.length); if (activeType.value === 'custom' && draft.questionType === 'tag')
    return !!(selectedTag.value || items.value.length); if (activeType.value === 'work_summary')
    return workSummaryItems.value.length > 0 && workSummaryItems.value.every(item => !!item.label.trim()); return !!(draft.itemName.trim() || items.value.length); }
function confirmContent() {
    submitted.value = true;
    if (!activeType.value || !draft.name.trim() || !validItem())
        return;
    const finalItems = activeType.value === 'work_summary' ? workSummaryItems.value.map(({ id, label, hint, richText }) => ({ id, label: label.trim(), hint: hint.trim(), richText })) : [...items.value];
    if (activeType.value === 'custom' && draft.questionType === 'text' && draft.itemName.trim())
        finalItems.push({ id: nextId(), label: draft.itemName.trim(), hint: draft.hint.trim() });
    if (activeType.value === 'rating' && selectedRating.value && !finalItems.some(i => i.id === selectedRating.value.id))
        finalItems.push({ id: selectedRating.value.id, label: selectedRating.value.label, hint: '' });
    if (activeType.value === 'custom' && draft.questionType === 'tag' && selectedTag.value)
        finalItems.push({ id: selectedTag.value.id, label: selectedTag.value.label, hint: '' });
    const nextContent = { type: activeType.value, name: draft.name.trim(), description: draft.description.trim(), items: finalItems, ratingOptionId: activeType.value === 'rating' ? selectedRating.value?.id : undefined, questionType: activeType.value === 'custom' ? draft.questionType : undefined, tagOptionId: activeType.value === 'custom' && draft.questionType === 'tag' ? selectedTag.value?.id : undefined, defaultAll: activeType.value === 'custom' && draft.questionType === 'tag' ? draft.defaultAll : undefined };
    if (editingCreatedId.value) {
        const index = created.value.findIndex(item => item.id === editingCreatedId.value);
        if (index >= 0)
            created.value[index] = { id: editingCreatedId.value, ...nextContent };
    }
    else {
        const contentId = nextContentId();
        created.value.push({ id: contentId, content_id: contentId, ...nextContent });
    }
    activeType.value = null;
    editingCreatedId.value = null;
    resetDraft();
    success.value = true;
    if (successTimer)
        clearTimeout(successTimer);
    successTimer = setTimeout(() => success.value = false, 2200);
    void nextTick(() => drawerRef.value?.focus());
}
function focusables(root) { return root ? Array.from(root.querySelectorAll('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),[contenteditable="true"],[tabindex]:not([tabindex="-1"])')).filter(e => e.offsetParent !== null || import.meta.env.MODE === 'test') : []; }
function trapTab(event, root) { const list = focusables(root); if (!list.length)
    return; const first = list[0], last = list[list.length - 1]; if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
}
else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
} }
function onDrawerKeydown(event) { if (activeType.value)
    return; if (event.key === 'Escape') {
    event.preventDefault();
    closeDrawer();
}
else if (event.key === 'Tab')
    trapTab(event, drawerRef.value); }
function onModalKeydown(event) { if (event.key === 'Escape') {
    event.preventDefault();
    closeModal();
}
else if (event.key === 'Tab') {
    const active = document.activeElement;
    const root = event.currentTarget;
    if (!event.shiftKey && active?.classList.contains('button--primary')) {
        event.preventDefault();
        (root?.querySelector('.performance-editor-modal__close') || modalCloseRef.value)?.focus();
        return;
    }
    trapTab(event, root);
} }
onBeforeUnmount(() => { if (successTimer)
    clearTimeout(successTimer); });
const CreateMenu = defineComponent({ props: { allowedTypes: { type: Array, default: () => ['work_summary', 'rating', 'custom'] } }, emits: ['select'], setup(p, { emit: e, expose }) { const open = ref(false), button = ref(null); expose({ focus: () => button.value?.focus() }); return () => h('div', { class: 'create-anchor' }, [h('button', { ref: button, class: 'button button--secondary create-button', type: 'button', 'aria-expanded': String(open.value), 'aria-haspopup': 'menu', onClick: () => open.value = !open.value }, [h(Plus), h('span', '新建')]), open.value ? h('div', { class: 'create-menu', role: 'menu' }, p.allowedTypes.map(type => h('button', { type: 'button', role: 'menuitem', onClick: () => { open.value = false; e('select', type); } }, type === 'work_summary' ? '工作总结' : type === 'rating' ? '评分评级' : '自定义'))) : null]); } });
const editorIcons = {
    bold: 'M5 2.709C5 2.317 5.317 2 5.709 2h6.734a5.317 5.317 0 0 1 3.686 9.148 5.671 5.671 0 0 1-2.623 10.7H5.71a.709.709 0 0 1-.71-.707V2.71Zm2 7.798h5.443a3.19 3.19 0 0 0 3.19-3.19c0-1.762-1.428-3.317-3.19-3.317H7v6.507Zm0 2.126v7.09h6.507a3.544 3.544 0 0 0 0-7.09H7Z',
    italic: 'M14.825 5.077 11.19 18.923h4.052a1.038 1.038 0 1 1 0 2.077H4.954a1.038 1.038 0 1 1 0-2.077h4.053l3.636-13.846H8.591A1.038 1.038 0 1 1 8.59 3h10.287a1.038 1.038 0 0 1 0 2.077h-4.053Z',
    underline: 'M7.361 3.052a.99.99 0 0 0-.989-.994.998.998 0 0 0-.999.994v5.765c0 4.205 2.601 7.29 6.627 7.29s6.627-3.085 6.627-7.29V3.052a.996.996 0 0 0-.996-.994.992.992 0 0 0-.992.994v5.765c0 3.003-1.763 5.302-4.639 5.302-2.876 0-4.639-2.299-4.639-5.302V3.052ZM3.054 19.42a.988.988 0 0 0-.994.988 1 1 0 0 0 .994 1h17.892a1 1 0 0 0 .994-1.002.987.987 0 0 0-.994-.986H3.054Z',
    ordered: 'M4.577 1.809a.543.543 0 0 0-.819-.469l-.502.296-.004.003-.309.187c-.342.207-.858.519-1.142.701a.573.573 0 0 0-.261.485c0 .482.544.774.948.522.227-.141.465-.287.642-.395v3.478a.723.723 0 1 0 1.447 0V1.81Zm-.899 7.128c-1.233 0-2.056.817-2.056 1.84a.25.25 0 0 0 .25.251h.891a.259.259 0 0 0 .26-.259c0-.32.227-.589.608-.589a.62.62 0 0 1 .428.15.52.52 0 0 1 .16.396c0 .315-.188.579-.538.949l-1.815 1.968a.672.672 0 0 0 .494 1.127h3.003a.63.63 0 0 0 0-1.26H3.744l.933-1.047c.61-.652.99-1.127.99-1.834a1.57 1.57 0 0 0-.563-1.226c-.356-.3-.852-.466-1.426-.466Zm.015 7.429c-1.006 0-1.692.478-1.946 1.178a.541.541 0 0 0 .107.553c.122.137.307.22.503.22a.773.773 0 0 0 .478-.18c.125-.098.23-.222.312-.33.096-.124.257-.224.511-.224.21 0 .37.063.472.152a.46.46 0 0 1 .16.359v.002a.503.503 0 0 1-.165.391.71.71 0 0 1-.483.16h-.14a.606.606 0 1 0 0 1.213h.168c.275 0 .468.074.59.178a.538.538 0 0 1 .186.42.554.554 0 0 1-.185.435c-.122.107-.314.184-.583.184-.32 0-.528-.114-.644-.264a1.776 1.776 0 0 0-.308-.323.766.766 0 0 0-.47-.174.678.678 0 0 0-.504.22.549.549 0 0 0-.114.55c.244.717.926 1.22 2.012 1.22.602 0 1.161-.168 1.575-.478.416-.311.683-.768.676-1.323-.01-.69-.376-1.122-.793-1.332.34-.231.63-.644.621-1.224-.019-.962-.92-1.583-2.036-1.583ZM8 4a1 1 0 0 1 1-1h13a1 1 0 1 1 0 2H9a1 1 0 0 1-1-1Zm0 8a1 1 0 0 1 1-1h13a1 1 0 0 1 0 2H9a1 1 0 0 1-1-1Zm0 8a1 1 0 0 1 1-1h13a1 1 0 0 1 0 2H9a1 1 0 0 1-1-1Z',
    unordered: 'M3.5 5.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM9 3a1 1 0 0 0 0 2h13a1 1 0 1 0 0-2H9Zm0 8a1 1 0 1 0 0 2h13a1 1 0 1 0 0-2H9Zm-1 9a1 1 0 0 1 1-1h13a1 1 0 1 1 0 2H9a1 1 0 0 1-1-1Zm-3-8a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm-1.5 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z',
    link: 'M18.849 2.699a5.037 5.037 0 0 0-7.1.97L8.97 7.372a4.784 4.784 0 0 0 .957 6.699l.972.729a1 1 0 0 0 1.2-1.6l-.972-.73a2.784 2.784 0 0 1-.557-3.898l2.777-3.703a3.037 3.037 0 1 1 4.8 3.72l-1.429 1.786a1 1 0 1 0 1.562 1.25l1.43-1.788a5.037 5.037 0 0 0-.862-7.138ZM5.152 21.301a5.037 5.037 0 0 0 7.1-.97l2.777-3.703a4.784 4.784 0 0 0-.957-6.699L13.1 9.2a1 1 0 0 0-1.2 1.6l.973.73a2.784 2.784 0 0 1 .556 3.898l-2.777 3.703a3.037 3.037 0 1 1-4.8-3.72l1.429-1.786a1 1 0 1 0-1.562-1.25l-1.43 1.787a5.037 5.037 0 0 0 .863 7.14Z'
};
const editorIconNames = { bold: 'BoldOutlined', italic: 'ItalicOutlined', underline: 'UnderlineOutlined', ordered: 'OrderListOutlined', unordered: 'DisorderListOutlined', link: 'GlobalLinkOutlined' };
const EditorIcon = defineComponent({ props: { name: { type: String, required: true } }, setup(p) { return () => h('svg', { width: '1em', height: '1em', viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true', 'data-icon': editorIconNames[p.name] || `${p.name[0].toUpperCase()}${p.name.slice(1)}Outlined` }, [h('path', { d: editorIcons[p.name], fill: 'currentColor' })]); } });
const RichTextBox = defineComponent({ props: { modelValue: { type: String, default: '' }, placeholder: { type: String, default: '请输入内容' }, readonly: Boolean, fields: { type: Array, default: () => [] } }, emits: ['update:modelValue'], setup(p, { emit: e }) {
        const editor = ref(null), linkOpen = ref(false), url = ref(''), selection = ref(null);
        const active = reactive({ bold: false, italic: false, underline: false, insertOrderedList: false, insertUnorderedList: false });
        const pendingMarks = reactive({ bold: false, italic: false, underline: false });
        const tooltip = ref(null);
        const commands = [
            { command: 'bold', label: '粗体', tooltip: '粗体(Ctrl+B)', markdown: 'Markdown: **文本** 空格' },
            { command: 'italic', label: '斜体', tooltip: '斜体(Ctrl+I)', markdown: 'Markdown: *文本* 空格' },
            { command: 'underline', label: '下划线', tooltip: '下划线(Ctrl+U)', markdown: 'Markdown: ~文本~ 空格' },
            { command: 'insertOrderedList', label: '有序列表', tooltip: '有序列表(Ctrl+Shift+7)', markdown: 'Markdown: 1. 空格' },
            { command: 'insertUnorderedList', label: '无序列表', tooltip: '无序列表(Ctrl+Shift+8)', markdown: 'Markdown: - 空格' },
            { command: 'link', label: '超链接', tooltip: '超链接(Ctrl+K)' },
        ];
        const emptyHtml = '<div class="ace-line" data-node="true" dir="auto"><span data-string="true" data-enter="true" data-leaf="true">\u200b</span></div>';
        const directList = (block) => Array.from(block.children).find(child => child.tagName === 'OL' || child.tagName === 'UL');
        const selectedBlocks = (range) => {
            if (range.collapsed) {
                const start = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
                const block = start?.closest('.ace-line');
                return block instanceof HTMLElement && block.parentElement === editor.value ? [block] : [];
            }
            return Array.from(editor.value?.children || []).filter((node) => {
                if (!(node instanceof HTMLElement) || !node.classList.contains('ace-line'))
                    return false;
                try {
                    return range.intersectsNode(node);
                }
                catch {
                    return false;
                }
            });
        };
        const selectedTextNodes = (range) => {
            if (!editor.value)
                return [];
            const nodes = [];
            const walker = document.createTreeWalker(editor.value, NodeFilter.SHOW_TEXT);
            let node = walker.nextNode();
            while (node) {
                const text = node;
                if (text.data.replace(/\u200b/g, '').trim()) {
                    try {
                        if (range.intersectsNode(text))
                            nodes.push(text);
                    }
                    catch { /* stale selection */ }
                }
                node = walker.nextNode();
            }
            return nodes;
        };
        const hasMark = (node, state) => {
            let element = node.parentElement;
            while (element && editor.value?.contains(element)) {
                if (state === 'bold' && (/^(STRONG|B)$/.test(element.tagName) || element.style.fontWeight === 'bold' || Number(element.style.fontWeight) >= 600))
                    return true;
                if (state === 'italic' && (/^(EM|I)$/.test(element.tagName) || element.style.fontStyle === 'italic'))
                    return true;
                if (state === 'underline' && (element.tagName === 'U' || element.classList.contains('underline') || element.style.textDecoration.includes('underline')))
                    return true;
                element = element.parentElement;
            }
            return false;
        };
        const styleState = (range) => {
            if (!range || !editor.value || !editor.value.contains(range.startContainer) || !editor.value.contains(range.endContainer))
                return;
            const textNodes = selectedTextNodes(range);
            const caretText = range.collapsed && range.startContainer instanceof Text && range.startContainer.data.replace(/\u200b/g, '').length ? range.startContainer : null;
            if (caretText) {
                pendingMarks.bold = hasMark(caretText, 'bold');
                pendingMarks.italic = hasMark(caretText, 'italic');
                pendingMarks.underline = hasMark(caretText, 'underline');
            }
            const isEmptyCaret = range.collapsed && !caretText;
            active.bold = isEmptyCaret ? pendingMarks.bold : textNodes.length > 0 && textNodes.every(node => hasMark(node, 'bold'));
            active.italic = isEmptyCaret ? pendingMarks.italic : textNodes.length > 0 && textNodes.every(node => hasMark(node, 'italic'));
            active.underline = isEmptyCaret ? pendingMarks.underline : textNodes.length > 0 && textNodes.every(node => hasMark(node, 'underline'));
            const blocks = selectedBlocks(range);
            active.insertOrderedList = blocks.length > 0 && blocks.every(block => directList(block)?.tagName === 'OL');
            active.insertUnorderedList = blocks.length > 0 && blocks.every(block => directList(block)?.tagName === 'UL');
        };
        const rememberSelection = () => { const current = document.getSelection(); if (!current?.rangeCount || !editor.value?.contains(current.anchorNode))
            return; selection.value = current.getRangeAt(0).cloneRange(); styleState(selection.value); };
        const restoreSelection = () => { if (!selection.value)
            return; const current = document.getSelection(); current?.removeAllRanges(); current?.addRange(selection.value); };
        const emitHtml = () => { if (editor.value)
            e('update:modelValue', editor.value.innerHTML); };
        const selectedFragment = () => { restoreSelection(); const current = document.getSelection(); return current?.rangeCount ? current.getRangeAt(0) : null; };
        const restoreBlockSelection = (blocks, collapsed) => {
            if (!blocks.length)
                return;
            editor.value?.focus({ preventScroll: true });
            const range = document.createRange();
            const endLeaf = collapsed ? blocks[0].querySelector('[data-enter="true"]') : null;
            const endText = endLeaf?.firstChild;
            if (collapsed && endText instanceof Text) {
                range.setStart(endText, endText.length);
                range.collapse(true);
            }
            else {
                range.selectNodeContents(blocks[0]);
                if (collapsed)
                    range.collapse(false);
                else if (blocks.length > 1)
                    range.setEnd(blocks[blocks.length - 1], blocks[blocks.length - 1].childNodes.length);
            }
            const current = document.getSelection();
            current?.removeAllRanges();
            current?.addRange(range);
            selection.value = range.cloneRange();
            styleState(range);
        };
        const toggleMark = (tag) => {
            const range = selectedFragment();
            if (!range)
                return;
            if (range.collapsed) {
                const state = tag === 'strong' ? 'bold' : tag === 'em' ? 'italic' : 'underline';
                pendingMarks[state] = !pendingMarks[state];
                active[state] = pendingMarks[state];
                editor.value?.focus({ preventScroll: true });
                restoreSelection();
                return;
            }
            const blocks = selectedBlocks(range), nodes = selectedTextNodes(range), selector = tag === 'strong' ? 'strong,b' : tag === 'em' ? 'em,i' : 'u';
            if (!nodes.length)
                return;
            const state = tag === 'strong' ? 'bold' : tag === 'em' ? 'italic' : 'underline';
            const removeMark = nodes.every(node => hasMark(node, state));
            if (removeMark) {
                nodes.forEach(node => {
                    const wrapper = node.parentElement?.closest(selector);
                    if (wrapper && editor.value?.contains(wrapper)) {
                        wrapper.replaceWith(...Array.from(wrapper.childNodes));
                        return;
                    }
                    const leaf = node.parentElement;
                    if (!leaf || !editor.value?.contains(leaf))
                        return;
                    if (state === 'bold')
                        leaf.style.removeProperty('font-weight');
                    if (state === 'italic')
                        leaf.style.removeProperty('font-style');
                    if (state === 'underline') {
                        leaf.style.removeProperty('text-decoration');
                        leaf.classList.remove('underline');
                    }
                    if (!leaf.getAttribute('style'))
                        leaf.removeAttribute('style');
                });
            }
            else {
                nodes.filter(node => !hasMark(node, state)).reverse().forEach(node => {
                    let start = node === range.startContainer ? range.startOffset : 0;
                    let end = node === range.endContainer ? range.endOffset : node.length;
                    start = Math.max(0, Math.min(start, node.length));
                    end = Math.max(start, Math.min(end, node.length));
                    if (end < node.length)
                        node.splitText(end);
                    const selected = start > 0 ? node.splitText(start) : node;
                    const wrapper = document.createElement(tag);
                    selected.parentNode?.insertBefore(wrapper, selected);
                    wrapper.appendChild(selected);
                });
            }
            restoreBlockSelection(blocks, false);
            emitHtml();
        };
        const emptyLeaf = () => { const leaf = document.createElement('span'); leaf.dataset.string = 'true'; leaf.dataset.enter = 'true'; leaf.dataset.leaf = 'true'; leaf.textContent = '\u200b'; return leaf; };
        const ensureEndLeaf = (item) => { if (item.querySelector('[data-enter="true"]'))
            return; const leaf = document.createElement('span'); leaf.dataset.string = 'true'; leaf.dataset.enter = 'true'; leaf.dataset.leaf = 'true'; leaf.textContent = '\u200b'; item.appendChild(leaf); };
        const plainBlock = (source) => { const block = document.createElement('div'); block.className = 'ace-line'; block.dataset.node = 'true'; block.dir = 'auto'; if (source)
            while (source.firstChild)
                block.appendChild(source.firstChild); if (!block.childNodes.length)
            block.appendChild(emptyLeaf()); return block; };
        const blockListWrapper = (type, source) => {
            const list = document.createElement(type.toLowerCase());
            list.className = type === 'OL' ? 'list-number1 r-list r-list-number' : 'list-bullet1 r-list r-list-bullet';
            const item = document.createElement('li');
            if (source)
                while (source.firstChild)
                    item.appendChild(source.firstChild);
            if (!item.childNodes.length)
                item.appendChild(emptyLeaf());
            ensureEndLeaf(item);
            list.appendChild(item);
            const block = document.createElement('div');
            block.className = 'ace-line list-div';
            block.dataset.node = 'true';
            block.dir = 'auto';
            block.appendChild(list);
            if (type === 'OL')
                block.classList.add('list-start-number1', 'ol-id-captured');
            return block;
        };
        const renumberOrderedLists = () => {
            let start = 0;
            Array.from(editor.value?.children || []).forEach(node => {
                if (!(node instanceof HTMLElement))
                    return;
                const list = directList(node);
                if (list?.tagName !== 'OL') {
                    start = 0;
                    return;
                }
                start += 1;
                list.setAttribute('start', String(start));
                list.setAttribute('data-start', String(start));
                const item = list.querySelector(':scope > li');
                item?.setAttribute('start', String(start));
                item?.setAttribute('data-start', String(start));
                if (start === 1)
                    list.setAttribute('data-origin-start', '1');
                else
                    list.removeAttribute('data-origin-start');
            });
        };
        const toggleList = (type) => {
            const range = selectedFragment();
            if (!range)
                return;
            const blocks = selectedBlocks(range);
            if (!blocks.length)
                return;
            const collapsed = range.collapsed, removeList = blocks.every(block => directList(block)?.tagName === type);
            const replacements = blocks.map(block => {
                const list = directList(block), source = list?.querySelector(':scope > li') || block;
                const replacement = removeList ? plainBlock(source) : blockListWrapper(type, source);
                block.replaceWith(replacement);
                return replacement;
            });
            renumberOrderedLists();
            restoreBlockSelection(replacements, collapsed);
            emitHtml();
        };
        const markStyles = (leaf) => {
            if (pendingMarks.bold)
                leaf.style.fontWeight = 'bold';
            if (pendingMarks.italic)
                leaf.style.fontStyle = 'italic';
            if (pendingMarks.underline) {
                leaf.style.textDecoration = 'underline';
                leaf.classList.add('underline');
            }
        };
        const leafMatchesPending = (leaf) => {
            const text = leaf.firstChild;
            if (!(text instanceof Text))
                return false;
            return hasMark(text, 'bold') === pendingMarks.bold && hasMark(text, 'italic') === pendingMarks.italic && hasMark(text, 'underline') === pendingMarks.underline;
        };
        const insertPendingText = (event) => {
            if (event.inputType !== 'insertText' || !event.data)
                return;
            const currentSelection = document.getSelection();
            const range = currentSelection?.rangeCount ? currentSelection.getRangeAt(0) : null;
            if (!range || !range.collapsed || !editor.value?.contains(range.startContainer))
                return;
            const currentElement = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
            const currentLeaf = currentElement?.closest('[data-leaf="true"]');
            const hasPendingMark = pendingMarks.bold || pendingMarks.italic || pendingMarks.underline;
            if (!hasPendingMark && !currentLeaf?.dataset.enter)
                return;
            if (currentLeaf && !currentLeaf.dataset.enter && leafMatchesPending(currentLeaf))
                return;
            event.preventDefault();
            const leaf = document.createElement('span');
            leaf.dataset.string = 'true';
            leaf.dataset.leaf = 'true';
            leaf.textContent = event.data;
            markStyles(leaf);
            const endLeaf = currentLeaf?.dataset.enter === 'true' ? currentLeaf : null;
            if (endLeaf)
                endLeaf.before(leaf);
            else
                range.insertNode(leaf);
            const nextRange = document.createRange();
            nextRange.selectNodeContents(leaf);
            nextRange.collapse(false);
            currentSelection?.removeAllRanges();
            currentSelection?.addRange(nextRange);
            selection.value = nextRange.cloneRange();
            emitHtml();
            styleState(nextRange);
        };
        const showTooltip = (command, event) => { const rect = event.currentTarget.getBoundingClientRect(); tooltip.value = { title: command.tooltip, markdown: command.markdown, x: rect.left + rect.width / 2, y: rect.top - 10 }; };
        const hideTooltip = () => { tooltip.value = null; };
        const applyLink = () => { const range = selectedFragment(); if (!range || !url.value.trim())
            return; const anchor = document.createElement('a'); anchor.href = url.value.trim(); anchor.target = '_blank'; anchor.rel = 'noreferrer'; anchor.appendChild(range.extractContents()); range.insertNode(anchor); emitHtml(); linkOpen.value = false; editor.value?.focus(); };
        const keyHandler = (event) => { if (event.key === 'Enter') {
            event.preventDefault();
            const range = selectedFragment();
            const current = range ? selectedBlocks(range)[0] : null;
            if (!current)
                return;
            const list = directList(current);
            const block = list ? blockListWrapper(list.tagName) : plainBlock();
            current.after(block);
            renumberOrderedLists();
            restoreBlockSelection([block], true);
            emitHtml();
        } rememberSelection(); };
        const syncStateFromContent = () => {
            if (!editor.value)
                return;
            const text = Array.from(editor.value.querySelectorAll('[data-leaf="true"]')).map(leaf => leaf.firstChild).find(node => node instanceof Text && node.data.replace(/\u200b/g, '').length);
            if (text instanceof Text) {
                pendingMarks.bold = hasMark(text, 'bold');
                pendingMarks.italic = hasMark(text, 'italic');
                pendingMarks.underline = hasMark(text, 'underline');
                active.bold = pendingMarks.bold;
                active.italic = pendingMarks.italic;
                active.underline = pendingMarks.underline;
            }
            const blocks = Array.from(editor.value.children).filter((node) => node instanceof HTMLElement && node.classList.contains('ace-line'));
            active.insertOrderedList = blocks.length > 0 && blocks.every(block => directList(block)?.tagName === 'OL');
            active.insertUnorderedList = blocks.length > 0 && blocks.every(block => directList(block)?.tagName === 'UL');
        };
        onMounted(() => { if (editor.value) {
            editor.value.innerHTML = p.modelValue || emptyHtml;
            syncStateFromContent();
            document.addEventListener('selectionchange', rememberSelection);
        } });
        onBeforeUnmount(() => document.removeEventListener('selectionchange', rememberSelection));
        watch(() => p.modelValue, value => { if (editor.value && !editor.value.matches(':focus') && value !== editor.value.innerHTML)
            editor.value.innerHTML = value || emptyHtml; });
        /*
        return()=>h('div',{class:['rich-editor',{'rich-editor--readonly':p.readonly}]},[h('div',{class:'rich-toolbar',role:p.readonly?undefined:'toolbar','aria-label':p.readonly?undefined:'富文本格式'},commands.map(([cmd,label])=>{const isActive=cmd==='link'?linkOpen.value:active[cmd as keyof typeof active];return p.readonly?h('span',{class:'rich-toolbar-icon'},[h(EditorIcon,{name:cmd==='insertOrderedList'?'ordered':cmd==='insertUnorderedList'?'unordered':cmd})]):h('button',{type:'button',class:{active:isActive},title:label,'aria-label':label,'aria-pressed':cmd==='link'?undefined:String(!!isActive),onMousedown:(event:MouseEvent)=>{event.preventDefault();rememberSelection()},onClick:()=>cmd==='link'?(restoreSelection(),linkOpen.value=!linkOpen.value):cmd==='insertOrderedList'?toggleList('OL'):cmd==='insertUnorderedList'?toggleList('UL'):toggleMark(cmd==='bold'?'strong':cmd==='italic'?'em':'u')},[h(EditorIcon,{name:cmd==='insertOrderedList'?'ordered':cmd==='insertUnorderedList'?'unordered':cmd})])}),linkOpen.value?h('div',{class:'link-popover'},[h('input',{value:url.value,placeholder:'请输入链接地址',onInput:(event:Event)=>url.value=(event.target as HTMLInputElement).value}),h('button',{type:'button',onClick:applyLink},'应用')]):null]),p.readonly?h('div',{class:'default-content'},p.fields.map(field=>h('div',[h('span',field.label),h('p',field.content)])):h('div',{ref:editor,class:'rich-input ace-editor',contenteditable:'true','data-slate-editor':'true','data-zone-container':'*','data-placeholder':p.placeholder,spellcheck:'false',onInput:emitHtml,onKeyup:rememberSelection,onMouseup:rememberSelection,onFocus:rememberSelection}))])
        */
        return () => h('div', { class: ['rich-editor-host', { 'rich-editor-host--readonly': p.readonly }] }, [
            h(PerformanceRichTextBox, {
                readonly: p.readonly,
                active,
                onBeforeCommand: rememberSelection,
                onCommand: (cmd) => {
                    if (cmd === 'link') {
                        restoreSelection();
                        linkOpen.value = !linkOpen.value;
                    }
                    else if (cmd === 'insertOrderedList')
                        toggleList('OL');
                    else if (cmd === 'insertUnorderedList')
                        toggleList('UL');
                    else
                        toggleMark(cmd === 'bold' ? 'strong' : cmd === 'italic' ? 'em' : 'u');
                },
            }, { default: () => [
                    /*
                    h('div',{class:['rich-toolbar','next-remix-rich-text-editor-toolbar'],role:p.readonly?undefined:'toolbar','aria-label':p.readonly?undefined:'富文本格式'},commands.map((command)=>{
                      const cmd=command.command,label=command.label
                      const isActive=cmd==='link'?linkOpen.value:active[cmd as keyof typeof active]
                      const iconName=cmd==='insertOrderedList'?'ordered':cmd==='insertUnorderedList'?'unordered':cmd
                      const click=()=>cmd==='link'?(restoreSelection(),linkOpen.value=!linkOpen.value):cmd==='insertOrderedList'?toggleList('OL'):cmd==='insertUnorderedList'?toggleList('UL'):toggleMark(cmd==='bold'?'strong':cmd==='italic'?'em':'u')
                      const pluginKey=cmd==='link'?'hyperlink':cmd
                      return p.readonly?h('span',{class:'rich-toolbar-icon'},[h(EditorIcon,{name:iconName})]):h('button',{type:'button',class:{active:isActive},'plugin-key':pluginKey,'plugin-disabled':'false','aria-label':label,'aria-pressed':cmd==='link'?undefined:String(!!isActive),onMousedown:(event:MouseEvent)=>{event.preventDefault();rememberSelection()},onMouseenter:(event:MouseEvent)=>showTooltip(command,event),onMouseleave:hideTooltip,onFocus:(event:FocusEvent)=>showTooltip(command,event),onBlur:hideTooltip,onClick:click},[h(EditorIcon,{name:iconName})])
                    })),
                    */
                    linkOpen.value ? h('div', { class: 'link-popover' }, [h('input', { value: url.value, placeholder: '请输入链接地址', onInput: (event) => url.value = event.target.value }), h('button', { type: 'button', onClick: applyLink }, '应用')]) : null,
                    p.readonly ? h('div', { class: 'default-content' }, p.fields.map(field => h('div', [h('span', field.label), h('p', field.content)]))) : h('div', { class: 'next-remix-rich-text-editor-content' }, [h('div', { ref: editor, class: 'rich-input ace-editor zone-container editor-kit-container next-remix-rich-text-editor-textarea notranslate chrome window chrome88', contenteditable: 'true', 'data-zone-id': '0', 'data-zone-container': '*', 'data-slate-editor': 'true', 'data-placeholder': p.placeholder, spellcheck: 'false', onBeforeinput: insertPendingText, onInput: emitHtml, onKeydown: keyHandler, onKeyup: rememberSelection, onMouseup: rememberSelection, onFocus: rememberSelection })]),
                ] }),
        ]);
    } });
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({ ratingOptions: () => [], tagOptions: () => [], initialContents: () => [], availableContents: () => [], allowedTypes: () => ['work_summary', 'rating', 'custom'] });
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['modal-slot']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-slot']} */ ;
/** @type {__VLS_StyleScopedClasses['assessment-layer']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-layer']} */ ;
/** @type {__VLS_StyleScopedClasses['assessment-layer']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-header']} */ ;
/** @type {__VLS_StyleScopedClasses['drawer-header']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-header']} */ ;
/** @type {__VLS_StyleScopedClasses['icon-button']} */ ;
/** @type {__VLS_StyleScopedClasses['icon-button']} */ ;
/** @type {__VLS_StyleScopedClasses['icon-button']} */ ;
/** @type {__VLS_StyleScopedClasses['visibility-row']} */ ;
/** @type {__VLS_StyleScopedClasses['toggle']} */ ;
/** @type {__VLS_StyleScopedClasses['toggle--on']} */ ;
/** @type {__VLS_StyleScopedClasses['button--secondary']} */ ;
/** @type {__VLS_StyleScopedClasses['button--secondary']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-state']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-state']} */ ;
/** @type {__VLS_StyleScopedClasses['create-button']} */ ;
/** @type {__VLS_StyleScopedClasses['create-menu']} */ ;
/** @type {__VLS_StyleScopedClasses['create-menu']} */ ;
/** @type {__VLS_StyleScopedClasses['drawer-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['create-button']} */ ;
/** @type {__VLS_StyleScopedClasses['created-list']} */ ;
/** @type {__VLS_StyleScopedClasses['created-item']} */ ;
/** @type {__VLS_StyleScopedClasses['created-item']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-layer']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-header']} */ ;
/** @type {__VLS_StyleScopedClasses['config-pane']} */ ;
/** @type {__VLS_StyleScopedClasses['field-label']} */ ;
/** @type {__VLS_StyleScopedClasses['form-field']} */ ;
/** @type {__VLS_StyleScopedClasses['form-field']} */ ;
/** @type {__VLS_StyleScopedClasses['form-field']} */ ;
/** @type {__VLS_StyleScopedClasses['form-field']} */ ;
/** @type {__VLS_StyleScopedClasses['form-field']} */ ;
/** @type {__VLS_StyleScopedClasses['invalid']} */ ;
/** @type {__VLS_StyleScopedClasses['saved-item']} */ ;
/** @type {__VLS_StyleScopedClasses['saved-item']} */ ;
/** @type {__VLS_StyleScopedClasses['type-field']} */ ;
/** @type {__VLS_StyleScopedClasses['type-field']} */ ;
/** @type {__VLS_StyleScopedClasses['type-field']} */ ;
/** @type {__VLS_StyleScopedClasses['type-field']} */ ;
/** @type {__VLS_StyleScopedClasses['select-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['select-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['select-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['select-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['option-menu']} */ ;
/** @type {__VLS_StyleScopedClasses['option-menu']} */ ;
/** @type {__VLS_StyleScopedClasses['option-menu']} */ ;
/** @type {__VLS_StyleScopedClasses['option-menu']} */ ;
/** @type {__VLS_StyleScopedClasses['option-menu']} */ ;
/** @type {__VLS_StyleScopedClasses['add-button']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-name']} */ ;
/** @type {__VLS_StyleScopedClasses['rich-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['rich-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['rich-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['rich-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['rich-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['rich-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['rich-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['rich-input']} */ ;
/** @type {__VLS_StyleScopedClasses['link-popover']} */ ;
/** @type {__VLS_StyleScopedClasses['rating-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['tag-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['tag-checks']} */ ;
/** @type {__VLS_StyleScopedClasses['default-content']} */ ;
/** @type {__VLS_StyleScopedClasses['default-content']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-footer']} */ ;
/** @type {__VLS_StyleScopedClasses['success-toast']} */ ;
/** @type {__VLS_StyleScopedClasses['content-modal']} */ ;
/** @type {__VLS_StyleScopedClasses['expand-all-button']} */ ;
/** @type {__VLS_StyleScopedClasses['expand-all-button']} */ ;
/** @type {__VLS_StyleScopedClasses['expand-all-button']} */ ;
/** @type {__VLS_StyleScopedClasses['created-item']} */ ;
/** @type {__VLS_StyleScopedClasses['created-item']} */ ;
/** @type {__VLS_StyleScopedClasses['created-item']} */ ;
/** @type {__VLS_StyleScopedClasses['created-item__actions']} */ ;
/** @type {__VLS_StyleScopedClasses['created-item__actions']} */ ;
/** @type {__VLS_StyleScopedClasses['created-item__actions']} */ ;
/** @type {__VLS_StyleScopedClasses['created-item__actions']} */ ;
// CSS variable injection 
// CSS variable injection end 
const __VLS_0 = {}.Teleport;
/** @type {[typeof __VLS_components.Teleport, typeof __VLS_components.Teleport, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    to: "body",
}));
const __VLS_2 = __VLS_1({
    to: "body",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
if (__VLS_ctx.open) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "assessment-layer" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.aside, __VLS_intrinsicElements.aside)({
        ...{ onKeydown: (__VLS_ctx.onDrawerKeydown) },
        ref: "drawerRef",
        ...{ class: "assessment-drawer" },
        role: "dialog",
        'aria-modal': "true",
        'aria-labelledby': "assessment-drawer-title",
        tabindex: "-1",
    });
    /** @type {typeof __VLS_ctx.drawerRef} */ ;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
        ...{ class: "drawer-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
        id: "assessment-drawer-title",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.closeDrawer) },
        ...{ class: "icon-button" },
        type: "button",
        'aria-label': "关闭选择评估内容",
    });
    const __VLS_4 = {}.Close;
    /** @type {[typeof __VLS_components.Close, ]} */ ;
    // @ts-ignore
    const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({}));
    const __VLS_6 = __VLS_5({}, ...__VLS_functionalComponentArgsRest(__VLS_5));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({
        ...{ class: "drawer-body" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "visibility-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "visibility-title" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    /** @type {[typeof PerformanceSwitch, ]} */ ;
    // @ts-ignore
    const __VLS_8 = __VLS_asFunctionalComponent(PerformanceSwitch, new PerformanceSwitch({
        modelValue: (__VLS_ctx.groupVisible),
        'aria-label': "评估内容分人群可见",
    }));
    const __VLS_9 = __VLS_8({
        modelValue: (__VLS_ctx.groupVisible),
        'aria-label': "评估内容分人群可见",
    }, ...__VLS_functionalComponentArgsRest(__VLS_8));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    if (__VLS_ctx.groupVisible) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ class: "button button--secondary" },
            type: "button",
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
        ...{ class: "divider" },
    });
    if (__VLS_ctx.drawerContents.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "drawer-actions" },
        });
        const __VLS_11 = {}.CreateMenu;
        /** @type {[typeof __VLS_components.CreateMenu, ]} */ ;
        // @ts-ignore
        const __VLS_12 = __VLS_asFunctionalComponent(__VLS_11, new __VLS_11({
            ...{ 'onSelect': {} },
            ref: "createMenuRef",
            allowedTypes: (props.allowedTypes),
        }));
        const __VLS_13 = __VLS_12({
            ...{ 'onSelect': {} },
            ref: "createMenuRef",
            allowedTypes: (props.allowedTypes),
        }, ...__VLS_functionalComponentArgsRest(__VLS_12));
        let __VLS_15;
        let __VLS_16;
        let __VLS_17;
        const __VLS_18 = {
            onSelect: (__VLS_ctx.openModal)
        };
        /** @type {typeof __VLS_ctx.createMenuRef} */ ;
        var __VLS_19 = {};
        var __VLS_14;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.toggleAllExpanded) },
            ...{ class: "plain-button expand-all-button" },
            type: "button",
            'aria-expanded': (__VLS_ctx.allExpanded),
        });
        if (!__VLS_ctx.allExpanded) {
            const __VLS_21 = {}.ArrowDown;
            /** @type {[typeof __VLS_components.ArrowDown, ]} */ ;
            // @ts-ignore
            const __VLS_22 = __VLS_asFunctionalComponent(__VLS_21, new __VLS_21({}));
            const __VLS_23 = __VLS_22({}, ...__VLS_functionalComponentArgsRest(__VLS_22));
        }
        else {
            const __VLS_25 = {}.ArrowUp;
            /** @type {[typeof __VLS_components.ArrowUp, ]} */ ;
            // @ts-ignore
            const __VLS_26 = __VLS_asFunctionalComponent(__VLS_25, new __VLS_25({}));
            const __VLS_27 = __VLS_26({}, ...__VLS_functionalComponentArgsRest(__VLS_26));
        }
        (__VLS_ctx.allExpanded ? '全部收起' : '全部展开');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "created-list" },
            'aria-label': "评估内容",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
        for (const [content] of __VLS_getVForSourceType((__VLS_ctx.drawerContents))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
                key: (content.id),
                ...{ class: "created-item" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
                ...{ onChange: (...[$event]) => {
                        if (!(__VLS_ctx.open))
                            return;
                        if (!(__VLS_ctx.drawerContents.length))
                            return;
                        __VLS_ctx.toggleAvailableContent(content);
                    } },
                type: "checkbox",
                checked: (__VLS_ctx.isContentSelected(content.id)),
                disabled: (__VLS_ctx.isContentSelected(content.id)),
                'aria-label': (content.name),
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
            (content.name);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "created-item__actions" },
            });
            /** @type {[typeof PerformanceExpandButton, ]} */ ;
            // @ts-ignore
            const __VLS_29 = __VLS_asFunctionalComponent(PerformanceExpandButton, new PerformanceExpandButton({
                ...{ 'onToggle': {} },
                expanded: (__VLS_ctx.expandedIds.has(content.id)),
                label: (`${__VLS_ctx.expandedIds.has(content.id) ? '收起' : '展开'}${content.name}`),
            }));
            const __VLS_30 = __VLS_29({
                ...{ 'onToggle': {} },
                expanded: (__VLS_ctx.expandedIds.has(content.id)),
                label: (`${__VLS_ctx.expandedIds.has(content.id) ? '收起' : '展开'}${content.name}`),
            }, ...__VLS_functionalComponentArgsRest(__VLS_29));
            let __VLS_32;
            let __VLS_33;
            let __VLS_34;
            const __VLS_35 = {
                onToggle: (...[$event]) => {
                    if (!(__VLS_ctx.open))
                        return;
                    if (!(__VLS_ctx.drawerContents.length))
                        return;
                    __VLS_ctx.toggleExpanded(content.id);
                }
            };
            var __VLS_31;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.open))
                            return;
                        if (!(__VLS_ctx.drawerContents.length))
                            return;
                        __VLS_ctx.editCreated(content);
                    } },
                ...{ class: "created-item__edit" },
                type: "button",
                'aria-label': (`缂栬緫${content.name}`),
            });
            const __VLS_36 = {}.Edit;
            /** @type {[typeof __VLS_components.Edit, ]} */ ;
            // @ts-ignore
            const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({}));
            const __VLS_38 = __VLS_37({}, ...__VLS_functionalComponentArgsRest(__VLS_37));
            if (__VLS_ctx.expandedIds.has(content.id)) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "created-item__details" },
                });
                for (const [item] of __VLS_getVForSourceType((content.items))) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        key: (item.id),
                        ...{ class: "created-item__detail" },
                    });
                    (item.label);
                }
            }
        }
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "empty-state" },
            'aria-label': "评估内容列表",
        });
        const __VLS_40 = {}.ElEmpty;
        /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
        // @ts-ignore
        const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
            imageSize: (112),
            description: "暂无内容",
        }));
        const __VLS_42 = __VLS_41({
            imageSize: (112),
            description: "暂无内容",
        }, ...__VLS_functionalComponentArgsRest(__VLS_41));
        const __VLS_44 = {}.CreateMenu;
        /** @type {[typeof __VLS_components.CreateMenu, ]} */ ;
        // @ts-ignore
        const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
            ...{ 'onSelect': {} },
            ref: "createMenuRef",
            allowedTypes: (props.allowedTypes),
        }));
        const __VLS_46 = __VLS_45({
            ...{ 'onSelect': {} },
            ref: "createMenuRef",
            allowedTypes: (props.allowedTypes),
        }, ...__VLS_functionalComponentArgsRest(__VLS_45));
        let __VLS_48;
        let __VLS_49;
        let __VLS_50;
        const __VLS_51 = {
            onSelect: (__VLS_ctx.openModal)
        };
        /** @type {typeof __VLS_ctx.createMenuRef} */ ;
        var __VLS_52 = {};
        var __VLS_47;
    }
    if (__VLS_ctx.drawerContents.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.footer, __VLS_intrinsicElements.footer)({
            ...{ class: "drawer-footer" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.finishDrawer) },
            ...{ class: "button button--primary" },
            type: "button",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.closeDrawer) },
            ...{ class: "button button--secondary" },
            type: "button",
        });
    }
}
/** @type {[typeof PerformanceAssessmentEditorModal, typeof PerformanceAssessmentEditorModal, ]} */ ;
// @ts-ignore
const __VLS_54 = __VLS_asFunctionalComponent(PerformanceAssessmentEditorModal, new PerformanceAssessmentEditorModal({
    ...{ 'onClose': {} },
    ...{ 'onConfirm': {} },
    ...{ 'onKeydown': {} },
    open: (!!__VLS_ctx.activeType),
    type: (__VLS_ctx.activeType || 'work_summary'),
    label: (__VLS_ctx.activeLabel),
    mode: (__VLS_ctx.editingCreatedId ? 'edit' : 'create'),
    sorting: (__VLS_ctx.draggedIndex !== null),
    chrome: (false),
}));
const __VLS_55 = __VLS_54({
    ...{ 'onClose': {} },
    ...{ 'onConfirm': {} },
    ...{ 'onKeydown': {} },
    open: (!!__VLS_ctx.activeType),
    type: (__VLS_ctx.activeType || 'work_summary'),
    label: (__VLS_ctx.activeLabel),
    mode: (__VLS_ctx.editingCreatedId ? 'edit' : 'create'),
    sorting: (__VLS_ctx.draggedIndex !== null),
    chrome: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_54));
let __VLS_57;
let __VLS_58;
let __VLS_59;
const __VLS_60 = {
    onClose: (__VLS_ctx.closeModal)
};
const __VLS_61 = {
    onConfirm: (__VLS_ctx.confirmContent)
};
const __VLS_62 = {
    onKeydown: (__VLS_ctx.onModalKeydown)
};
__VLS_56.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
    ...{ class: "modal-header" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
    id: (`${__VLS_ctx.activeType}-title`),
});
(__VLS_ctx.activeLabel);
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.closeModal) },
    ref: "modalCloseRef",
    ...{ class: "icon-button" },
    type: "button",
    'aria-label': (`关闭新建${__VLS_ctx.activeLabel}`),
});
/** @type {typeof __VLS_ctx.modalCloseRef} */ ;
const __VLS_63 = {}.Close;
/** @type {[typeof __VLS_components.Close, ]} */ ;
// @ts-ignore
const __VLS_64 = __VLS_asFunctionalComponent(__VLS_63, new __VLS_63({}));
const __VLS_65 = __VLS_64({}, ...__VLS_functionalComponentArgsRest(__VLS_64));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "modal-body" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "config-pane" },
});
/** @type {[typeof PerformanceFormField, ]} */ ;
// @ts-ignore
const __VLS_67 = __VLS_asFunctionalComponent(PerformanceFormField, new PerformanceFormField({
    modelValue: (__VLS_ctx.draft.name),
    label: "名称",
    required: true,
    placeholder: "请输入名称",
    invalid: (__VLS_ctx.submitted && !__VLS_ctx.draft.name.trim()),
}));
const __VLS_68 = __VLS_67({
    modelValue: (__VLS_ctx.draft.name),
    label: "名称",
    required: true,
    placeholder: "请输入名称",
    invalid: (__VLS_ctx.submitted && !__VLS_ctx.draft.name.trim()),
}, ...__VLS_functionalComponentArgsRest(__VLS_67));
/** @type {[typeof PerformanceFormField, ]} */ ;
// @ts-ignore
const __VLS_70 = __VLS_asFunctionalComponent(PerformanceFormField, new PerformanceFormField({
    modelValue: (__VLS_ctx.draft.description),
    label: "描述",
    textarea: true,
    placeholder: "请输入描述",
}));
const __VLS_71 = __VLS_70({
    modelValue: (__VLS_ctx.draft.description),
    label: "描述",
    textarea: true,
    placeholder: "请输入描述",
}, ...__VLS_functionalComponentArgsRest(__VLS_70));
__VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
    ...{ class: "section-title" },
});
if (__VLS_ctx.activeType === 'work_summary') {
    /** @type {[typeof PerformanceSortableList, typeof PerformanceSortableList, ]} */ ;
    // @ts-ignore
    const __VLS_73 = __VLS_asFunctionalComponent(PerformanceSortableList, new PerformanceSortableList({
        ...{ 'onReorder': {} },
        ...{ 'onDragStart': {} },
        ...{ 'onDragEnd': {} },
        ...{ 'onDragCancel': {} },
        items: (__VLS_ctx.workSummaryItems),
        itemKey: "id",
        gap: (8),
        ...{ class: "work-summary-list" },
        ref: "workSummarySortableListRef",
        dataRbdDroppableId: "form-array-list-droppable-default.entries",
        dataRbdDroppableContextId: "0",
    }));
    const __VLS_74 = __VLS_73({
        ...{ 'onReorder': {} },
        ...{ 'onDragStart': {} },
        ...{ 'onDragEnd': {} },
        ...{ 'onDragCancel': {} },
        items: (__VLS_ctx.workSummaryItems),
        itemKey: "id",
        gap: (8),
        ...{ class: "work-summary-list" },
        ref: "workSummarySortableListRef",
        dataRbdDroppableId: "form-array-list-droppable-default.entries",
        dataRbdDroppableContextId: "0",
    }, ...__VLS_functionalComponentArgsRest(__VLS_73));
    let __VLS_76;
    let __VLS_77;
    let __VLS_78;
    const __VLS_79 = {
        onReorder: (__VLS_ctx.reorderWorkSummary)
    };
    const __VLS_80 = {
        onDragStart: (__VLS_ctx.startSummarySort)
    };
    const __VLS_81 = {
        onDragEnd: (__VLS_ctx.finishSummarySort)
    };
    const __VLS_82 = {
        onDragCancel: (__VLS_ctx.cancelSummarySort)
    };
    /** @type {typeof __VLS_ctx.workSummarySortableListRef} */ ;
    var __VLS_83 = {};
    __VLS_75.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_75.slots;
        const [{ item, index, dragging, itemStyle }] = __VLS_getSlotParams(__VLS_thisSlot);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "config-box item-card saved-item" },
            ...{ class: ({ 'is-dragging': dragging }) },
            ...{ style: (itemStyle) },
            'data-item-index': (index),
            'data-sortable-index': (index),
            'data-rbd-draggable-context-id': (__VLS_ctx.controlsVisible ? '0' : undefined),
            'data-rbd-draggable-id': (__VLS_ctx.controlsVisible ? `form-array-list-draggable-default.entries.${item.id}` : undefined),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "config-box__heading" },
            'data-drag-enabled': (__VLS_ctx.controlsVisible ? 'true' : undefined),
            'data-rbd-drag-handle-draggable-id': (__VLS_ctx.controlsVisible ? `form-array-list-draggable-default.entries.${item.id}` : undefined),
            'data-rbd-drag-handle-context-id': (__VLS_ctx.controlsVisible ? '0' : undefined),
            'aria-describedby': (__VLS_ctx.controlsVisible ? 'rbd-hidden-text-0-hidden-text-0' : undefined),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "item-card__title" },
        });
        if (__VLS_ctx.controlsVisible) {
            /** @type {[typeof PerformanceDragHandle, ]} */ ;
            // @ts-ignore
            const __VLS_85 = __VLS_asFunctionalComponent(PerformanceDragHandle, new PerformanceDragHandle({
                ...{ 'onPointerdown': {} },
                label: (`拖拽填写项 ${index + 1} 调整顺序`),
                dragging: (dragging),
            }));
            const __VLS_86 = __VLS_85({
                ...{ 'onPointerdown': {} },
                label: (`拖拽填写项 ${index + 1} 调整顺序`),
                dragging: (dragging),
            }, ...__VLS_functionalComponentArgsRest(__VLS_85));
            let __VLS_88;
            let __VLS_89;
            let __VLS_90;
            const __VLS_91 = {
                onPointerdown: (__VLS_ctx.startSummaryPointerDrag)
            };
            var __VLS_87;
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "item-card__actions" },
        });
        if (__VLS_ctx.controlsVisible) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onPointerdown: () => { } },
                ...{ onMousedown: () => { } },
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.activeType === 'work_summary'))
                            return;
                        if (!(__VLS_ctx.controlsVisible))
                            return;
                        __VLS_ctx.removeWorkSummaryItem(index);
                    } },
                type: "button",
                'aria-label': (`删除${item.label.trim() || '空白填写项'}`),
            });
            const __VLS_92 = {}.Delete;
            /** @type {[typeof __VLS_components.Delete, ]} */ ;
            // @ts-ignore
            const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({}));
            const __VLS_94 = __VLS_93({}, ...__VLS_functionalComponentArgsRest(__VLS_93));
        }
        /** @type {[typeof PerformanceFormField, ]} */ ;
        // @ts-ignore
        const __VLS_96 = __VLS_asFunctionalComponent(PerformanceFormField, new PerformanceFormField({
            modelValue: (item.label),
            inside: true,
            label: "填写题名称",
            required: true,
            placeholder: "请输入",
            invalid: (__VLS_ctx.submitted && !item.label.trim()),
        }));
        const __VLS_97 = __VLS_96({
            modelValue: (item.label),
            inside: true,
            label: "填写题名称",
            required: true,
            placeholder: "请输入",
            invalid: (__VLS_ctx.submitted && !item.label.trim()),
        }, ...__VLS_functionalComponentArgsRest(__VLS_96));
        /** @type {[typeof PerformanceFormField, ]} */ ;
        // @ts-ignore
        const __VLS_99 = __VLS_asFunctionalComponent(PerformanceFormField, new PerformanceFormField({
            modelValue: (item.hint),
            inside: true,
            label: "提示",
            textarea: true,
            placeholder: "请输入填写提示",
        }));
        const __VLS_100 = __VLS_99({
            modelValue: (item.hint),
            inside: true,
            label: "提示",
            textarea: true,
            placeholder: "请输入填写提示",
        }, ...__VLS_functionalComponentArgsRest(__VLS_99));
    }
    var __VLS_75;
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "config-box" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "config-box__heading" },
    });
    (__VLS_ctx.activeType === 'rating' ? '评估项' : '填写项');
    if (__VLS_ctx.activeType === 'rating') {
        /** @type {[typeof PerformanceAssessmentSelect, ]} */ ;
        // @ts-ignore
        const __VLS_102 = __VLS_asFunctionalComponent(PerformanceAssessmentSelect, new PerformanceAssessmentSelect({
            ...{ 'onUpdate:modelValue': {} },
            ...{ class: "inside-select" },
            label: "评估项",
            required: true,
            placeholder: "请选择",
            options: (__VLS_ctx.ratingOptions),
            modelValue: (__VLS_ctx.draft.ratingOptionId),
            invalid: (__VLS_ctx.submitted && !__VLS_ctx.selectedRating && !__VLS_ctx.items.length),
            emptyText: "暂无评估项",
        }));
        const __VLS_103 = __VLS_102({
            ...{ 'onUpdate:modelValue': {} },
            ...{ class: "inside-select" },
            label: "评估项",
            required: true,
            placeholder: "请选择",
            options: (__VLS_ctx.ratingOptions),
            modelValue: (__VLS_ctx.draft.ratingOptionId),
            invalid: (__VLS_ctx.submitted && !__VLS_ctx.selectedRating && !__VLS_ctx.items.length),
            emptyText: "暂无评估项",
        }, ...__VLS_functionalComponentArgsRest(__VLS_102));
        let __VLS_105;
        let __VLS_106;
        let __VLS_107;
        const __VLS_108 = {
            'onUpdate:modelValue': (...[$event]) => {
                if (!!(__VLS_ctx.activeType === 'work_summary'))
                    return;
                if (!(__VLS_ctx.activeType === 'rating'))
                    return;
                __VLS_ctx.draft.ratingOptionId = $event;
                __VLS_ctx.submitted = false;
            }
        };
        var __VLS_104;
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.fieldset, __VLS_intrinsicElements.fieldset)({
            ...{ class: "type-field" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.legend, __VLS_intrinsicElements.legend)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.i, __VLS_intrinsicElements.i)({});
        /** @type {[typeof PerformanceRadioGroup, ]} */ ;
        // @ts-ignore
        const __VLS_109 = __VLS_asFunctionalComponent(PerformanceRadioGroup, new PerformanceRadioGroup({
            modelValue: (__VLS_ctx.draft.questionType),
            options: ([{ value: 'text', label: '文本型填写题' }, { value: 'tag', label: '标签型填写题' }]),
            name: "custom-question-type",
            'aria-label': "填写题类型",
            gap: (24),
        }));
        const __VLS_110 = __VLS_109({
            modelValue: (__VLS_ctx.draft.questionType),
            options: ([{ value: 'text', label: '文本型填写题' }, { value: 'tag', label: '标签型填写题' }]),
            name: "custom-question-type",
            'aria-label': "填写题类型",
            gap: (24),
        }, ...__VLS_functionalComponentArgsRest(__VLS_109));
        if (__VLS_ctx.draft.questionType === 'text') {
            /** @type {[typeof PerformanceFormField, ]} */ ;
            // @ts-ignore
            const __VLS_112 = __VLS_asFunctionalComponent(PerformanceFormField, new PerformanceFormField({
                ...{ 'onUpdate:modelValue': {} },
                modelValue: (__VLS_ctx.draft.itemName),
                inside: true,
                label: "填写题名称",
                required: true,
                placeholder: "请输入",
                invalid: (__VLS_ctx.itemInvalid),
            }));
            const __VLS_113 = __VLS_112({
                ...{ 'onUpdate:modelValue': {} },
                modelValue: (__VLS_ctx.draft.itemName),
                inside: true,
                label: "填写题名称",
                required: true,
                placeholder: "请输入",
                invalid: (__VLS_ctx.itemInvalid),
            }, ...__VLS_functionalComponentArgsRest(__VLS_112));
            let __VLS_115;
            let __VLS_116;
            let __VLS_117;
            const __VLS_118 = {
                'onUpdate:modelValue': (...[$event]) => {
                    if (!!(__VLS_ctx.activeType === 'work_summary'))
                        return;
                    if (!!(__VLS_ctx.activeType === 'rating'))
                        return;
                    if (!(__VLS_ctx.draft.questionType === 'text'))
                        return;
                    __VLS_ctx.itemSubmitted = false;
                }
            };
            var __VLS_114;
            /** @type {[typeof PerformanceFormField, ]} */ ;
            // @ts-ignore
            const __VLS_119 = __VLS_asFunctionalComponent(PerformanceFormField, new PerformanceFormField({
                modelValue: (__VLS_ctx.draft.hint),
                inside: true,
                label: "提示",
                textarea: true,
                placeholder: "请输入填写提示",
            }));
            const __VLS_120 = __VLS_119({
                modelValue: (__VLS_ctx.draft.hint),
                inside: true,
                label: "提示",
                textarea: true,
                placeholder: "请输入填写提示",
            }, ...__VLS_functionalComponentArgsRest(__VLS_119));
        }
        else {
            /** @type {[typeof PerformanceAssessmentSelect, ]} */ ;
            // @ts-ignore
            const __VLS_122 = __VLS_asFunctionalComponent(PerformanceAssessmentSelect, new PerformanceAssessmentSelect({
                ...{ 'onUpdate:modelValue': {} },
                ...{ class: "inside-select" },
                label: "标签型填写题",
                required: true,
                placeholder: "请选择",
                options: (__VLS_ctx.tagOptions),
                modelValue: (__VLS_ctx.draft.tagOptionId),
                invalid: (__VLS_ctx.submitted && !__VLS_ctx.selectedTag && !__VLS_ctx.items.length),
                emptyText: "暂无标签题",
            }));
            const __VLS_123 = __VLS_122({
                ...{ 'onUpdate:modelValue': {} },
                ...{ class: "inside-select" },
                label: "标签型填写题",
                required: true,
                placeholder: "请选择",
                options: (__VLS_ctx.tagOptions),
                modelValue: (__VLS_ctx.draft.tagOptionId),
                invalid: (__VLS_ctx.submitted && !__VLS_ctx.selectedTag && !__VLS_ctx.items.length),
                emptyText: "暂无标签题",
            }, ...__VLS_functionalComponentArgsRest(__VLS_122));
            let __VLS_125;
            let __VLS_126;
            let __VLS_127;
            const __VLS_128 = {
                'onUpdate:modelValue': (...[$event]) => {
                    if (!!(__VLS_ctx.activeType === 'work_summary'))
                        return;
                    if (!!(__VLS_ctx.activeType === 'rating'))
                        return;
                    if (!!(__VLS_ctx.draft.questionType === 'text'))
                        return;
                    __VLS_ctx.draft.tagOptionId = $event;
                    __VLS_ctx.draft.defaultAll = false;
                    __VLS_ctx.submitted = false;
                }
            };
            var __VLS_124;
            if (__VLS_ctx.selectedTag) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "default-all" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
                /** @type {[typeof PerformanceSwitch, ]} */ ;
                // @ts-ignore
                const __VLS_129 = __VLS_asFunctionalComponent(PerformanceSwitch, new PerformanceSwitch({
                    modelValue: (__VLS_ctx.draft.defaultAll),
                    'aria-label': "默认全部填写",
                }));
                const __VLS_130 = __VLS_129({
                    modelValue: (__VLS_ctx.draft.defaultAll),
                    'aria-label': "默认全部填写",
                }, ...__VLS_functionalComponentArgsRest(__VLS_129));
            }
        }
    }
}
if (__VLS_ctx.controlsVisible) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        id: "rbd-hidden-text-0-hidden-text-0",
        ...{ class: "drag-instruction" },
        'aria-hidden': "true",
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "sr-only" },
    'aria-live': "assertive",
});
(__VLS_ctx.dragAnnouncement);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "add-area" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.addItem) },
    ...{ class: "add-button" },
    type: "button",
});
const __VLS_132 = {}.Plus;
/** @type {[typeof __VLS_components.Plus, ]} */ ;
// @ts-ignore
const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({}));
const __VLS_134 = __VLS_133({}, ...__VLS_functionalComponentArgsRest(__VLS_133));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "preview-pane" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "preview-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
    ...{ class: "preview-name" },
});
(__VLS_ctx.draft.name.trim() || '未命名名称');
if (__VLS_ctx.draft.description) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "preview-description" },
    });
    (__VLS_ctx.draft.description);
}
if (__VLS_ctx.activeType === 'rating' && __VLS_ctx.selectedRating) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "rating-preview" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.selectedRating.label);
    if (__VLS_ctx.selectedRating.displayMode !== '下拉样式') {
        /** @type {[typeof PerformanceOptionNavigator, ]} */ ;
        // @ts-ignore
        const __VLS_136 = __VLS_asFunctionalComponent(PerformanceOptionNavigator, new PerformanceOptionNavigator({
            options: (__VLS_ctx.ratingPreviewOptions),
            label: "标签样式预览",
            appearanceVariant: "rating-preview",
            layoutPolicy: (__VLS_ctx.ratingPreviewLayoutPolicy),
            interactive: (false),
        }));
        const __VLS_137 = __VLS_136({
            options: (__VLS_ctx.ratingPreviewOptions),
            label: "标签样式预览",
            appearanceVariant: "rating-preview",
            layoutPolicy: (__VLS_ctx.ratingPreviewLayoutPolicy),
            interactive: (false),
        }, ...__VLS_functionalComponentArgsRest(__VLS_136));
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "rating-select-preview" },
            'aria-label': "下拉样式预览",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        /** @type {[typeof DownBoldOutlinedIcon, ]} */ ;
        // @ts-ignore
        const __VLS_139 = __VLS_asFunctionalComponent(DownBoldOutlinedIcon, new DownBoldOutlinedIcon({
            ...{ class: "rating-select-preview__arrow" },
            size: (12),
        }));
        const __VLS_140 = __VLS_139({
            ...{ class: "rating-select-preview__arrow" },
            size: (12),
        }, ...__VLS_functionalComponentArgsRest(__VLS_139));
    }
}
else if (__VLS_ctx.activeType === 'custom' && __VLS_ctx.draft.questionType === 'tag' && __VLS_ctx.selectedTag) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "tag-preview" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.selectedTag.label);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    (__VLS_ctx.selectedTag.description);
    if (__VLS_ctx.draft.defaultAll) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "tag-checks" },
        });
        for (const [field] of __VLS_getVForSourceType((__VLS_ctx.selectedTag.defaultFields || []))) {
            /** @type {[typeof PerformanceCheckbox, ]} */ ;
            // @ts-ignore
            const __VLS_142 = __VLS_asFunctionalComponent(PerformanceCheckbox, new PerformanceCheckbox({
                key: (field.label),
                modelValue: (true),
                label: (field.label),
                disabled: true,
            }));
            const __VLS_143 = __VLS_142({
                key: (field.label),
                modelValue: (true),
                label: (field.label),
                disabled: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_142));
        }
    }
    if (__VLS_ctx.draft.defaultAll) {
        const __VLS_145 = {}.RichTextBox;
        /** @type {[typeof __VLS_components.RichTextBox, ]} */ ;
        // @ts-ignore
        const __VLS_146 = __VLS_asFunctionalComponent(__VLS_145, new __VLS_145({
            readonly: true,
            fields: (__VLS_ctx.selectedTag.defaultFields || []),
        }));
        const __VLS_147 = __VLS_146({
            readonly: true,
            fields: (__VLS_ctx.selectedTag.defaultFields || []),
        }, ...__VLS_functionalComponentArgsRest(__VLS_146));
    }
}
else if (__VLS_ctx.activeType === 'work_summary') {
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.workSummaryItems))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            key: (`preview-${item.id}`),
            ...{ class: "text-preview" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (item.label.trim() || '未命名填写题');
        const __VLS_149 = {}.RichTextBox;
        /** @type {[typeof __VLS_components.RichTextBox, ]} */ ;
        // @ts-ignore
        const __VLS_150 = __VLS_asFunctionalComponent(__VLS_149, new __VLS_149({
            key: (`editor-${item.id}`),
            modelValue: (item.richText),
            placeholder: (item.hint || '请输入内容'),
        }));
        const __VLS_151 = __VLS_150({
            key: (`editor-${item.id}`),
            modelValue: (item.richText),
            placeholder: (item.hint || '请输入内容'),
        }, ...__VLS_functionalComponentArgsRest(__VLS_150));
    }
}
else if (__VLS_ctx.activeType !== 'rating') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "text-preview" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.draft.itemName.trim() || '未命名填写题');
    const __VLS_153 = {}.RichTextBox;
    /** @type {[typeof __VLS_components.RichTextBox, ]} */ ;
    // @ts-ignore
    const __VLS_154 = __VLS_asFunctionalComponent(__VLS_153, new __VLS_153({
        modelValue: (__VLS_ctx.draft.richText),
        placeholder: (__VLS_ctx.draft.hint || '请输入内容'),
    }));
    const __VLS_155 = __VLS_154({
        modelValue: (__VLS_ctx.draft.richText),
        placeholder: (__VLS_ctx.draft.hint || '请输入内容'),
    }, ...__VLS_functionalComponentArgsRest(__VLS_154));
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.footer, __VLS_intrinsicElements.footer)({
    ...{ class: "modal-footer" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.closeModal) },
    ...{ class: "button button--secondary" },
    type: "button",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.confirmContent) },
    ...{ class: "button button--primary" },
    type: "button",
});
var __VLS_56;
const __VLS_157 = {}.Transition;
/** @type {[typeof __VLS_components.Transition, typeof __VLS_components.Transition, ]} */ ;
// @ts-ignore
const __VLS_158 = __VLS_asFunctionalComponent(__VLS_157, new __VLS_157({
    name: "toast",
}));
const __VLS_159 = __VLS_158({
    name: "toast",
}, ...__VLS_functionalComponentArgsRest(__VLS_158));
__VLS_160.slots.default;
if (__VLS_ctx.success) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "success-toast" },
        role: "status",
    });
    const __VLS_161 = {}.CircleCheckFilled;
    /** @type {[typeof __VLS_components.CircleCheckFilled, ]} */ ;
    // @ts-ignore
    const __VLS_162 = __VLS_asFunctionalComponent(__VLS_161, new __VLS_161({}));
    const __VLS_163 = __VLS_162({}, ...__VLS_functionalComponentArgsRest(__VLS_162));
}
var __VLS_160;
var __VLS_3;
/** @type {__VLS_StyleScopedClasses['assessment-layer']} */ ;
/** @type {__VLS_StyleScopedClasses['assessment-drawer']} */ ;
/** @type {__VLS_StyleScopedClasses['drawer-header']} */ ;
/** @type {__VLS_StyleScopedClasses['icon-button']} */ ;
/** @type {__VLS_StyleScopedClasses['drawer-body']} */ ;
/** @type {__VLS_StyleScopedClasses['visibility-row']} */ ;
/** @type {__VLS_StyleScopedClasses['visibility-title']} */ ;
/** @type {__VLS_StyleScopedClasses['button']} */ ;
/** @type {__VLS_StyleScopedClasses['button--secondary']} */ ;
/** @type {__VLS_StyleScopedClasses['divider']} */ ;
/** @type {__VLS_StyleScopedClasses['drawer-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['plain-button']} */ ;
/** @type {__VLS_StyleScopedClasses['expand-all-button']} */ ;
/** @type {__VLS_StyleScopedClasses['created-list']} */ ;
/** @type {__VLS_StyleScopedClasses['created-item']} */ ;
/** @type {__VLS_StyleScopedClasses['created-item__actions']} */ ;
/** @type {__VLS_StyleScopedClasses['created-item__edit']} */ ;
/** @type {__VLS_StyleScopedClasses['created-item__details']} */ ;
/** @type {__VLS_StyleScopedClasses['created-item__detail']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-state']} */ ;
/** @type {__VLS_StyleScopedClasses['drawer-footer']} */ ;
/** @type {__VLS_StyleScopedClasses['button']} */ ;
/** @type {__VLS_StyleScopedClasses['button--primary']} */ ;
/** @type {__VLS_StyleScopedClasses['button']} */ ;
/** @type {__VLS_StyleScopedClasses['button--secondary']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-header']} */ ;
/** @type {__VLS_StyleScopedClasses['icon-button']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-body']} */ ;
/** @type {__VLS_StyleScopedClasses['config-pane']} */ ;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['work-summary-list']} */ ;
/** @type {__VLS_StyleScopedClasses['config-box']} */ ;
/** @type {__VLS_StyleScopedClasses['item-card']} */ ;
/** @type {__VLS_StyleScopedClasses['saved-item']} */ ;
/** @type {__VLS_StyleScopedClasses['config-box__heading']} */ ;
/** @type {__VLS_StyleScopedClasses['item-card__title']} */ ;
/** @type {__VLS_StyleScopedClasses['item-card__actions']} */ ;
/** @type {__VLS_StyleScopedClasses['config-box']} */ ;
/** @type {__VLS_StyleScopedClasses['config-box__heading']} */ ;
/** @type {__VLS_StyleScopedClasses['inside-select']} */ ;
/** @type {__VLS_StyleScopedClasses['type-field']} */ ;
/** @type {__VLS_StyleScopedClasses['inside-select']} */ ;
/** @type {__VLS_StyleScopedClasses['default-all']} */ ;
/** @type {__VLS_StyleScopedClasses['drag-instruction']} */ ;
/** @type {__VLS_StyleScopedClasses['sr-only']} */ ;
/** @type {__VLS_StyleScopedClasses['add-area']} */ ;
/** @type {__VLS_StyleScopedClasses['add-button']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-pane']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-label']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-name']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-description']} */ ;
/** @type {__VLS_StyleScopedClasses['rating-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['rating-select-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['rating-select-preview__arrow']} */ ;
/** @type {__VLS_StyleScopedClasses['tag-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['tag-checks']} */ ;
/** @type {__VLS_StyleScopedClasses['text-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['text-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-footer']} */ ;
/** @type {__VLS_StyleScopedClasses['button']} */ ;
/** @type {__VLS_StyleScopedClasses['button--secondary']} */ ;
/** @type {__VLS_StyleScopedClasses['button']} */ ;
/** @type {__VLS_StyleScopedClasses['button--primary']} */ ;
/** @type {__VLS_StyleScopedClasses['success-toast']} */ ;
// @ts-ignore
var __VLS_20 = __VLS_19, __VLS_53 = __VLS_52, __VLS_84 = __VLS_83;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ArrowDown: ArrowDown,
            ArrowUp: ArrowUp,
            CircleCheckFilled: CircleCheckFilled,
            Close: Close,
            Delete: Delete,
            Edit: Edit,
            Plus: Plus,
            ElEmpty: ElEmpty,
            PerformanceAssessmentEditorModal: PerformanceAssessmentEditorModal,
            PerformanceExpandButton: PerformanceExpandButton,
            PerformanceDragHandle: PerformanceDragHandle,
            PerformanceSortableList: PerformanceSortableList,
            PerformanceFormField: PerformanceFormField,
            PerformanceAssessmentSelect: PerformanceAssessmentSelect,
            PerformanceOptionNavigator: PerformanceOptionNavigator,
            DownBoldOutlinedIcon: DownBoldOutlinedIcon,
            PerformanceSwitch: PerformanceSwitch,
            PerformanceRadioGroup: PerformanceRadioGroup,
            PerformanceCheckbox: PerformanceCheckbox,
            drawerRef: drawerRef,
            modalCloseRef: modalCloseRef,
            createMenuRef: createMenuRef,
            groupVisible: groupVisible,
            activeType: activeType,
            submitted: submitted,
            itemSubmitted: itemSubmitted,
            success: success,
            draggedIndex: draggedIndex,
            dragAnnouncement: dragAnnouncement,
            editingCreatedId: editingCreatedId,
            expandedIds: expandedIds,
            items: items,
            drawerContents: drawerContents,
            workSummaryItems: workSummaryItems,
            workSummarySortableListRef: workSummarySortableListRef,
            draft: draft,
            activeLabel: activeLabel,
            selectedRating: selectedRating,
            selectedTag: selectedTag,
            ratingPreviewOptions: ratingPreviewOptions,
            ratingPreviewLayoutPolicy: ratingPreviewLayoutPolicy,
            controlsVisible: controlsVisible,
            allExpanded: allExpanded,
            itemInvalid: itemInvalid,
            closeDrawer: closeDrawer,
            isContentSelected: isContentSelected,
            toggleAvailableContent: toggleAvailableContent,
            finishDrawer: finishDrawer,
            openModal: openModal,
            closeModal: closeModal,
            toggleExpanded: toggleExpanded,
            toggleAllExpanded: toggleAllExpanded,
            editCreated: editCreated,
            addItem: addItem,
            removeWorkSummaryItem: removeWorkSummaryItem,
            startSummaryPointerDrag: startSummaryPointerDrag,
            reorderWorkSummary: reorderWorkSummary,
            startSummarySort: startSummarySort,
            finishSummarySort: finishSummarySort,
            cancelSummarySort: cancelSummarySort,
            confirmContent: confirmContent,
            onDrawerKeydown: onDrawerKeydown,
            onModalKeydown: onModalKeydown,
            CreateMenu: CreateMenu,
            RichTextBox: RichTextBox,
        };
    },
    __typeEmits: {},
    __typeProps: {},
    props: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {
            ...__VLS_exposed,
        };
    },
    __typeEmits: {},
    __typeProps: {},
    props: {},
});
; /* PartiallyEnd: #4569/main.vue */
