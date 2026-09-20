import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import PerformanceAssessmentContentLayers from "./PerformanceAssessmentContentLayers.vue";
const ratingOptions = [
  { id: "duplicate", label: "\u7EE9\u6548\u8BC4\u7EA7", description: "7\u6863\u7EE9\u6548\u7B49\u7EA7", disabled: true, disabledReason: "\u6A21\u677F\u4E2D\u5DF2\u5B58\u5728\u8BE5\u8BC4\u4F30\u9879", displayMode: "\u6807\u7B7E\u6837\u5F0F" },
  { id: "annual", label: "\u5E74\u5EA6\u7EFC\u5408\u8BC4\u7EA7", displayMode: "\u6807\u7B7E\u6837\u5F0F", levels: ["1\u661F", "2\u661F", "3\u661F-", "3\u661F", "3\u661F+", "4\u661F", "5\u661F"] },
  { id: "dropdown", label: "\u5B63\u5EA6\u8BC4\u7EA7", description: "\u4E0B\u62C9\u8BC4\u7EA7\u89C4\u5219", displayMode: "\u4E0B\u62C9\u6837\u5F0F", levels: ["\u4F18\u79C0", "\u826F\u597D", "\u5F85\u6539\u8FDB"] }
];
const tagOptions = [
  { id: "contribution", label: "\u4EF7\u503C\u8D21\u732E", description: "\u57FA\u4E8E\u89D2\u8272\u804C\u8D23\u9884\u671F\uFF0C\u8BC4\u4F30\u5B9E\u9645\u4EA7\u51FA\u548C\u8D21\u732E", defaultFields: [{ label: "\u505A\u5F97\u597D\u7684", content: "\u8BF7\u586B\u5199\u505A\u5F97\u597D\u7684\u5185\u5BB9" }, { label: "\u5F85\u6539\u8FDB\u7684", content: "\u8BF7\u586B\u5199\u5F85\u6539\u8FDB\u7684\u5185\u5BB9" }] }
];
function mountLayers() {
  return mount(PerformanceAssessmentContentLayers, {
    props: { open: true, ratingOptions, tagOptions },
    global: { stubs: { Teleport: true, Transition: false } },
    attachTo: document.body
  });
}
async function openType(wrapper, label) {
  await wrapper.get(".create-button").trigger("click");
  const option = wrapper.findAll('.create-menu [role="menuitem"]').find((item) => item.text() === label);
  expect(option).toBeDefined();
  await option.trigger("click");
}
function modalInputs(wrapper) {
  return wrapper.findAll('.config-pane input[type="text"], .config-pane input:not([type])');
}
function selectEditorContents(editor) {
  const range = document.createRange();
  range.selectNodeContents(editor);
  const selection = document.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  editor.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
}
function placeCaretAtEnd(node, editor) {
  const range = document.createRange();
  range.selectNodeContents(node);
  range.collapse(false);
  const selection = document.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  editor.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
}
function placeCaretInEmptyLeaf(editor) {
  editor.focus();
  const leaf = editor.querySelector('[data-enter="true"]');
  expect(leaf).toBeInstanceOf(HTMLElement);
  const range = document.createRange();
  range.selectNodeContents(leaf);
  range.collapse(false);
  const selection = document.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  editor.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
}
afterEach(() => {
  document.body.innerHTML = "";
});
describe("PerformanceAssessmentContentLayers", () => {
  it("renders the measured drawer and reveals the three types only from the create menu", async () => {
    const wrapper = mountLayers();
    expect(wrapper.get(".assessment-drawer").attributes("role")).toBe("dialog");
    expect(wrapper.get("#assessment-drawer-title").text()).toBe("\u9009\u62E9\u8BC4\u4F30\u5185\u5BB9");
    expect(wrapper.get(".visibility-row").text()).toContain("\u8BC4\u4F30\u5185\u5BB9\u5206\u4EBA\u7FA4\u53EF\u89C1");
    expect(wrapper.find(".create-menu").exists()).toBe(false);
    await wrapper.get(".create-button").trigger("click");
    expect(wrapper.findAll('.create-menu [role="menuitem"]').map((item) => item.text())).toEqual(["\u5DE5\u4F5C\u603B\u7ED3", "\u8BC4\u5206\u8BC4\u7EA7", "\u81EA\u5B9A\u4E49"]);
    expect(wrapper.find(".content-modal").exists()).toBe(false);
  });
  it("toggles group settings without removing the drawer empty state", async () => {
    const wrapper = mountLayers();
    const toggle = wrapper.get('[role="switch"][aria-label="\u8BC4\u4F30\u5185\u5BB9\u5206\u4EBA\u7FA4\u53EF\u89C1"]');
    expect(toggle.attributes("aria-checked")).toBe("true");
    await toggle.trigger("click");
    expect(wrapper.get('[role="switch"][aria-label="\u8BC4\u4F30\u5185\u5BB9\u5206\u4EBA\u7FA4\u53EF\u89C1"]').attributes("aria-checked")).toBe("false");
    expect(wrapper.text()).not.toContain("\u8BBE\u7F6E\u5206\u7EC4");
    expect(wrapper.get(".empty-state").text()).toContain("\u6682\u65E0\u5185\u5BB9");
  });
  it.each([
    ["\u5DE5\u4F5C\u603B\u7ED3", "\u65B0\u5EFA\u5DE5\u4F5C\u603B\u7ED3", "650px"],
    ["\u8BC4\u5206\u8BC4\u7EA7", "\u65B0\u5EFA\u8BC4\u5206\u8BC4\u7EA7", "559px"],
    ["\u81EA\u5B9A\u4E49", "\u65B0\u5EFA\u81EA\u5B9A\u4E49", "722px"]
  ])("opens the %s 1080px two-column modal", async (label, title, height) => {
    const wrapper = mountLayers();
    await openType(wrapper, label);
    expect(wrapper.get(".modal-header h2").text()).toBe(title);
    expect(wrapper.get(".modal-body").findAll(":scope > div")).toHaveLength(2);
    expect(wrapper.get(".content-modal").classes()).toContain(`content-modal--${label === "\u5DE5\u4F5C\u603B\u7ED3" ? "work_summary" : label === "\u8BC4\u5206\u8BC4\u7EA7" ? "rating" : "custom"}`);
    expect(wrapper.get(".content-modal").attributes("role")).toBe("dialog");
    expect(height).toMatch(/px$/);
  });
  it("keeps confirm enabled and shows inline errors only after an invalid submit", async () => {
    const wrapper = mountLayers();
    await openType(wrapper, "\u5DE5\u4F5C\u603B\u7ED3");
    const confirm = wrapper.get(".modal-footer .button--primary");
    expect(confirm.attributes("disabled")).toBeUndefined();
    expect(wrapper.findAll(".field-error")).toHaveLength(0);
    await confirm.trigger("click");
    expect(wrapper.findAll(".field-error").map((item) => item.text())).toEqual(["\u6B64\u9879\u4E3A\u5FC5\u586B", "\u6B64\u9879\u4E3A\u5FC5\u586B"]);
    expect(wrapper.find(".success-toast").exists()).toBe(false);
  });
  it("captures duplicate rating disabled state and recovers through an enabled option", async () => {
    const wrapper = mountLayers();
    await openType(wrapper, "\u8BC4\u5206\u8BC4\u7EA7");
    await modalInputs(wrapper)[0].setValue("\u8BC4\u7EA7\u5185\u5BB9");
    await wrapper.get(".select-shell > button").trigger("click");
    const options = wrapper.findAll('.option-menu [role="option"]');
    expect(options[0].attributes("disabled")).toBeDefined();
    expect(options[0].attributes("title")).toBe("\u6A21\u677F\u4E2D\u5DF2\u5B58\u5728\u8BE5\u8BC4\u4F30\u9879");
    await options[0].trigger("click");
    expect(wrapper.get(".select-shell > button").text()).toContain("\u8BF7\u9009\u62E9");
    await options[1].trigger("click");
    expect(wrapper.get(".select-shell > button").text()).toContain("\u5E74\u5EA6\u7EFC\u5408\u8BC4\u7EA7");
    await wrapper.get(".select-shell > button").trigger("click");
    expect(wrapper.findAll('.option-menu [role="option"]')[1].classes()).toContain("selected");
    expect(wrapper.findAll('.option-menu [role="option"]')[1].find(".option-check").exists()).toBe(true);
    expect(wrapper.findAll(".rating-preview .performance-rating-control__option").map((item) => item.text())).toEqual(["1\u661F", "2\u661F", "3\u661F-", "3\u661F", "3\u661F+", "4\u661F", "5\u661F"]);
  });
  it("replaces the previous rating selection and persists only the final rule snapshot", async () => {
    const wrapper = mountLayers();
    await openType(wrapper, "\u8BC4\u5206\u8BC4\u7EA7");
    await modalInputs(wrapper)[0].setValue("\u8BC4\u7EA7\u5185\u5BB9");
    await wrapper.get(".select-shell > button").trigger("click");
    await wrapper.findAll('.option-menu [role="option"]')[1].trigger("click");
    await wrapper.get(".add-button").trigger("click");
    expect(wrapper.get(".select-shell > button").text()).toContain("\u5E74\u5EA6\u7EFC\u5408\u8BC4\u7EA7");
    await wrapper.get(".select-shell > button").trigger("click");
    await wrapper.findAll('.option-menu [role="option"]')[2].trigger("click");
    await wrapper.get(".modal-footer .button--primary").trigger("click");
    await wrapper.get(".drawer-footer .button--primary").trigger("click");
    const contents = wrapper.emitted("confirm")?.[0]?.[0];
    expect(contents[0].ratingOptionId).toBe("dropdown");
    expect(contents[0].ratingDisplayMode).toBe("\u4E0B\u62C9\u6837\u5F0F");
    expect(contents[0].items).toEqual([{ id: "dropdown", label: "\u5B63\u5EA6\u8BC4\u7EA7", hint: "" }]);
    expect(contents[0].options?.map((option) => option.label)).toEqual(["\u4F18\u79C0", "\u826F\u597D", "\u5F85\u6539\u8FDB"]);
  });
  it("renders rating preview according to the selected option display mode", async () => {
    const wrapper = mountLayers();
    await openType(wrapper, "\u8BC4\u5206\u8BC4\u7EA7");
    await modalInputs(wrapper)[0].setValue("\u5B63\u5EA6\u8BC4\u7EA7\u5185\u5BB9");
    await wrapper.get(".select-shell > button").trigger("click");
    await wrapper.findAll('.option-menu [role="option"]')[2].trigger("click");
    expect(wrapper.find(".rating-select-preview").exists()).toBe(true);
    expect(wrapper.find(".rating-select-preview").text()).toContain("\u8BF7\u9009\u62E9\u7B49\u7EA7");
    expect(wrapper.find(".rating-preview .performance-rating-control__labels").exists()).toBe(false);
  });
  it("adds, deletes and reorders work-summary items", async () => {
    const wrapper = mountLayers();
    await openType(wrapper, "\u5DE5\u4F5C\u603B\u7ED3");
    expect(wrapper.findAll(".saved-item")).toHaveLength(1);
    expect(wrapper.find(".saved-item .drag-icon").exists()).toBe(false);
    expect(wrapper.find(".saved-item .item-card__actions button").exists()).toBe(false);
    await wrapper.get(".add-button").trigger("click");
    expect(wrapper.findAll(".saved-item")).toHaveLength(2);
    expect(wrapper.findAll(".field-error")).toHaveLength(0);
    expect(wrapper.findAll(".text-preview > strong").map((item) => item.text())).toEqual(["\u672A\u547D\u540D\u586B\u5199\u9898", "\u672A\u547D\u540D\u586B\u5199\u9898"]);
    await wrapper.findAll(".saved-item")[0].get('input[placeholder="\u8BF7\u8F93\u5165"]').setValue("First item");
    await wrapper.findAll(".saved-item")[1].get('input[placeholder="\u8BF7\u8F93\u5165"]').setValue("Second item");
    expect(wrapper.findAll('.saved-item input[placeholder="\u8BF7\u8F93\u5165"]').map((item) => item.element.value)).toEqual(["First item", "Second item"]);
    const firstHeading = wrapper.findAll(".saved-item .config-box__heading")[0];
    expect(firstHeading.attributes("data-drag-enabled")).toBe("true");
    expect(firstHeading.attributes("data-rbd-drag-handle-draggable-id")).toBe("form-array-list-draggable-default.entries.assessment-content-1");
    expect(firstHeading.get("svg").attributes("data-icon")).toBe("DragOutlined");
    const sortable = wrapper.findComponent({ name: "PerformanceSortableList" });
    sortable.vm.$emit("reorder", 0, 1);
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll('.saved-item input[placeholder="\u8BF7\u8F93\u5165"]').map((item) => item.element.value)).toEqual(["Second item", "First item"]);
    expect(wrapper.findAll(".text-preview > strong").map((item) => item.text())).toEqual(["Second item", "First item"]);
    await wrapper.findAll(".saved-item .item-card__actions button")[1].trigger("click");
    expect(wrapper.findAll(".saved-item")).toHaveLength(1);
    expect(wrapper.find(".saved-item .drag-icon").exists()).toBe(false);
    expect(wrapper.find(".saved-item .item-card__actions button").exists()).toBe(false);
  });
  it("renders tag fixtures and default-all fields without product hardcoding", async () => {
    const wrapper = mountLayers();
    await openType(wrapper, "\u81EA\u5B9A\u4E49");
    await modalInputs(wrapper)[0].setValue("\u81EA\u5B9A\u4E49\u5185\u5BB9");
    await wrapper.get('input[type="radio"][value="tag"]').setValue();
    await wrapper.get(".select-shell > button").trigger("click");
    await wrapper.get('.option-menu [role="option"]').trigger("click");
    expect(wrapper.get(".tag-preview").text()).toContain("\u4EF7\u503C\u8D21\u732E");
    const toggle = wrapper.get('[role="switch"][aria-label="\u9ED8\u8BA4\u5168\u90E8\u586B\u5199"]');
    await toggle.trigger("click");
    expect(wrapper.findAll(".tag-checks input:checked")).toHaveLength(2);
    expect(wrapper.get(".performance-rich-text-box.is-readonly").text()).toContain("\u5F85\u6539\u8FDB\u7684");
    await wrapper.get(".modal-footer .button--primary").trigger("click");
    await wrapper.get(".drawer-footer .button--primary").trigger("click");
    const contents = wrapper.emitted("confirm")?.[0]?.[0];
    expect(contents[0].items[0].options).toEqual([
      { id: "contribution-0", label: "\u505A\u5F97\u597D\u7684", placeholder: "\u8BF7\u586B\u5199\u505A\u5F97\u597D\u7684\u5185\u5BB9" },
      { id: "contribution-1", label: "\u5F85\u6539\u8FDB\u7684", placeholder: "\u8BF7\u586B\u5199\u5F85\u6539\u8FDB\u7684\u5185\u5BB9" }
    ]);
  });
  it("supports rich-text toolbar states and link popover", async () => {
    const wrapper = mountLayers();
    await openType(wrapper, "\u5DE5\u4F5C\u603B\u7ED3");
    const toolbar = wrapper.get('[role="toolbar"]');
    expect(toolbar.findAll("button").map((button) => button.attributes("aria-label"))).toEqual(["\u7C97\u4F53", "\u659C\u4F53", "\u4E0B\u5212\u7EBF", "\u6709\u5E8F\u5217\u8868", "\u65E0\u5E8F\u5217\u8868", "\u8D85\u94FE\u63A5"]);
    const editor = wrapper.get('[contenteditable="true"]').element;
    placeCaretInEmptyLeaf(editor);
    await toolbar.findAll("button")[0].trigger("click");
    expect(toolbar.findAll("button")[0].classes()).toContain("active");
    await toolbar.findAll("button")[5].trigger("click");
    expect(wrapper.find(".link-popover").exists()).toBe(true);
  });
  it("renders captured toolbar tooltip copy in a fixed overlay above its button", async () => {
    const wrapper = mountLayers();
    await openType(wrapper, "\u5DE5\u4F5C\u603B\u7ED3");
    const buttons = wrapper.get('[role="toolbar"]').findAll("button");
    vi.spyOn(buttons[0].element, "getBoundingClientRect").mockReturnValue({ top: 411, left: 990, width: 24, height: 24, right: 1014, bottom: 435, x: 990, y: 411, toJSON: () => ({}) });
    await buttons[0].trigger("mouseenter");
    let tooltip = wrapper.get(".rich-toolbar-tooltip");
    expect(tooltip.text()).toContain("\u7C97\u4F53(Ctrl+B)");
    expect(tooltip.text()).toContain("Markdown: **\u6587\u672C** \u7A7A\u683C");
    expect(tooltip.attributes("style")).toContain("left: 1002px");
    expect(tooltip.attributes("style")).toContain("top: 401px");
    expect(buttons[0].attributes("title")).toBeUndefined();
    expect(buttons[0].attributes("data-tooltip")).toBeUndefined();
    await buttons[0].trigger("mouseleave");
    vi.spyOn(buttons[4].element, "getBoundingClientRect").mockReturnValue({ top: 411, left: 1118, width: 24, height: 24, right: 1142, bottom: 435, x: 1118, y: 411, toJSON: () => ({}) });
    await buttons[4].trigger("mouseenter");
    tooltip = wrapper.get(".rich-toolbar-tooltip");
    expect(tooltip.text()).toContain("\u65E0\u5E8F\u5217\u8868(Ctrl+Shift+8)");
    expect(tooltip.text()).toContain("Markdown: - \u7A7A\u683C");
  });
  it.each([
    ["\u7C97\u4F53", "fontWeight", "bold"],
    ["\u659C\u4F53", "fontStyle", "italic"],
    ["\u4E0B\u5212\u7EBF", "textDecoration", "underline"]
  ])("applies pending %s formatting when typing into an empty editor", async (label, styleProperty, expectedStyle) => {
    const wrapper = mountLayers();
    await openType(wrapper, "\u5DE5\u4F5C\u603B\u7ED3");
    const editor = wrapper.get('[contenteditable="true"]').element;
    placeCaretInEmptyLeaf(editor);
    const button = wrapper.get(`[aria-label="${label}"]`);
    await button.trigger("click");
    expect(button.classes()).toContain("active");
    editor.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertText", data: "Probe" }));
    await wrapper.vm.$nextTick();
    const leaf = editor.querySelector(".ace-line > span:not([data-enter])");
    expect(leaf.textContent).toBe("Probe");
    expect(leaf.style[styleProperty]).toBe(expectedStyle);
    if (expectedStyle === "underline") expect(leaf.classList).toContain("underline");
    expect(editor.querySelectorAll('[data-enter="true"]')).toHaveLength(1);
    expect(wrapper.get(`[aria-label="${label}"]`).classes()).toContain("active");
  });
  it.each([
    ["\u6709\u5E8F\u5217\u8868", "ol.list-number1.r-list-number"],
    ["\u65E0\u5E8F\u5217\u8868", "ul.list-bullet1.r-list-bullet"]
  ])("keeps first input inside the captured empty %s DOM", async (label, selector) => {
    const wrapper = mountLayers();
    await openType(wrapper, "\u5DE5\u4F5C\u603B\u7ED3");
    let editor = wrapper.get('[contenteditable="true"]').element;
    placeCaretInEmptyLeaf(editor);
    const button = wrapper.get(`[aria-label="${label}"]`);
    await button.trigger("click");
    editor = wrapper.get('[contenteditable="true"]').element;
    const item = editor.querySelector(`.ace-line.list-div > ${selector} > li`);
    expect(item).not.toBeNull();
    const endLeaf = item.querySelector(':scope > span[data-enter="true"]');
    expect(editor.querySelectorAll('li > [data-enter="true"]')).toHaveLength(1);
    expect(editor.querySelector("br")).toBeNull();
    placeCaretInEmptyLeaf(editor);
    expect(document.getSelection()?.rangeCount).toBe(1);
    const firstInput = new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertText", data: "Probe" });
    editor.dispatchEvent(firstInput);
    await wrapper.vm.$nextTick();
    expect(firstInput.defaultPrevented).toBe(true);
    expect(item.querySelector(":scope > span:not([data-enter])")?.textContent).toBe("Probe");
    expect(endLeaf.textContent).toBe("\u200B");
    expect(item.querySelectorAll(":scope > span")).toHaveLength(2);
    expect(editor.querySelectorAll(":scope > .ace-line")).toHaveLength(1);
    expect(wrapper.get(`[aria-label="${label}"]`).classes()).toContain("active");
  });
  it("applies toolbar formats to every selected line and keeps list types mutually exclusive", async () => {
    const wrapper = mountLayers();
    await openType(wrapper, "\u5DE5\u4F5C\u603B\u7ED3");
    let editor = wrapper.get('[contenteditable="true"]').element;
    editor.innerHTML = [
      '<div class="ace-line" data-node="true" dir="auto"><span data-string="true" data-leaf="true">Alpha line</span></div>',
      '<div class="ace-line" data-node="true" dir="auto"><span data-string="true" data-leaf="true">Beta line</span></div>',
      '<div class="ace-line" data-node="true" dir="auto"><span data-string="true" data-leaf="true">Gamma line</span></div>'
    ].join("");
    editor.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await wrapper.vm.$nextTick();
    editor = wrapper.get('[contenteditable="true"]').element;
    selectEditorContents(editor);
    const buttons = () => wrapper.get('[role="toolbar"]').findAll("button");
    await buttons()[0].trigger("click");
    editor = wrapper.get('[contenteditable="true"]').element;
    selectEditorContents(editor);
    await buttons()[1].trigger("click");
    editor = wrapper.get('[contenteditable="true"]').element;
    selectEditorContents(editor);
    await buttons()[2].trigger("click");
    editor = wrapper.get('[contenteditable="true"]').element;
    selectEditorContents(editor);
    await wrapper.vm.$nextTick();
    expect({
      html: editor.innerHTML,
      strong: editor.querySelectorAll("strong").length,
      em: editor.querySelectorAll("em").length,
      underline: editor.querySelectorAll("u").length
    }).toMatchObject({ strong: 3, em: 3, underline: 3 });
    expect(buttons().slice(0, 3).map((button) => button.classes().includes("active"))).toEqual([true, true, true]);
    selectEditorContents(editor);
    await buttons()[3].trigger("click");
    editor = wrapper.get('[contenteditable="true"]').element;
    selectEditorContents(editor);
    await wrapper.vm.$nextTick();
    expect(editor.querySelectorAll(":scope > .ace-line.list-div > ol.r-list-number")).toHaveLength(3);
    expect(Array.from(editor.querySelectorAll("ol")).map((list) => list.getAttribute("start"))).toEqual(["1", "2", "3"]);
    expect(buttons()[3].classes()).toContain("active");
    expect(buttons()[4].classes()).not.toContain("active");
    selectEditorContents(editor);
    await buttons()[4].trigger("click");
    editor = wrapper.get('[contenteditable="true"]').element;
    selectEditorContents(editor);
    await wrapper.vm.$nextTick();
    const unorderedLists = editor.querySelectorAll(":scope > .ace-line.list-div > ul.r-list-bullet");
    expect(unorderedLists).toHaveLength(3);
    expect(Array.from(unorderedLists).every((list) => list.querySelectorAll(":scope > li").length === 1)).toBe(true);
    expect(editor.querySelectorAll("ol")).toHaveLength(0);
    expect(buttons()[3].classes()).not.toContain("active");
    expect(buttons()[4].classes()).toContain("active");
    expect(buttons()[4].get("svg").attributes("data-icon")).toBe("DisorderListOutlined");
    selectEditorContents(editor);
    await buttons()[5].trigger("click");
    expect(wrapper.find(".link-popover").exists()).toBe(true);
  });
  it("continues the active list type when Enter creates a new line", async () => {
    const wrapper = mountLayers();
    await openType(wrapper, "\u5DE5\u4F5C\u603B\u7ED3");
    let editor = wrapper.get('[contenteditable="true"]').element;
    editor.innerHTML = '<div class="ace-line" data-node="true" dir="auto"><span data-string="true" data-leaf="true">First line</span></div>';
    editor.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await wrapper.vm.$nextTick();
    editor = wrapper.get('[contenteditable="true"]').element;
    selectEditorContents(editor);
    await wrapper.get('[aria-label="\u65E0\u5E8F\u5217\u8868"]').trigger("click");
    editor = wrapper.get('[contenteditable="true"]').element;
    const firstItem = editor.querySelector("ul > li");
    placeCaretAtEnd(firstItem, editor);
    editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    await wrapper.vm.$nextTick();
    editor = wrapper.get('[contenteditable="true"]').element;
    placeCaretAtEnd(editor.querySelector("ul:last-child > li"), editor);
    await wrapper.vm.$nextTick();
    expect({ html: editor.innerHTML, count: editor.querySelectorAll(":scope > .ace-line.list-div > ul.r-list-bullet").length }).toMatchObject({ count: 2 });
    expect(editor.querySelectorAll(":scope > .ace-line.list-div > ul.r-list-bullet > li")).toHaveLength(2);
    expect(wrapper.get('[aria-label="\u65E0\u5E8F\u5217\u8868"]').classes()).toContain("active");
  });
  it("discards a cancelled draft, ignores mask clicks and returns focus to the drawer", async () => {
    const wrapper = mountLayers();
    await openType(wrapper, "\u5DE5\u4F5C\u603B\u7ED3");
    await modalInputs(wrapper)[0].setValue("\u4E34\u65F6\u540D\u79F0");
    await wrapper.get(".modal-layer").trigger("mousedown");
    expect(wrapper.find(".content-modal").exists()).toBe(true);
    await wrapper.get(".modal-footer .button--secondary").trigger("click");
    expect(wrapper.find(".content-modal").exists()).toBe(false);
    expect(document.activeElement).toBe(wrapper.get(".assessment-drawer").element);
    await openType(wrapper, "\u5DE5\u4F5C\u603B\u7ED3");
    expect(modalInputs(wrapper)[0].element.value).toBe("");
  });
  it("traps focus, handles Escape, creates a session item and emits only on drawer confirm", async () => {
    const wrapper = mountLayers();
    await openType(wrapper, "\u5DE5\u4F5C\u603B\u7ED3");
    const close = wrapper.get(".modal-header .icon-button").element;
    const confirm = wrapper.get(".modal-footer .button--primary").element;
    confirm.focus();
    await wrapper.get(".content-modal").trigger("keydown", { key: "Tab" });
    expect(document.activeElement).toBe(close);
    await wrapper.get(".content-modal").trigger("keydown", { key: "Escape" });
    expect(wrapper.find(".content-modal").exists()).toBe(false);
    await openType(wrapper, "\u5DE5\u4F5C\u603B\u7ED3");
    await wrapper.get('input[placeholder="\u8BF7\u8F93\u5165\u540D\u79F0"]').setValue("\u8865\u91C7-\u786E\u8BA4\u56DE\u586B");
    await wrapper.get('input[placeholder="\u8BF7\u8F93\u5165"]').setValue("\u672C\u5468\u5DE5\u4F5C\u4EA7\u51FA");
    await wrapper.get(".modal-footer .button--primary").trigger("click");
    expect(wrapper.get(".success-toast").text()).toContain("\u65B0\u5EFA\u6210\u529F");
    expect(wrapper.get(".created-item").text()).toContain("\u8865\u91C7-\u786E\u8BA4\u56DE\u586B");
    expect(wrapper.emitted("confirm")).toBeUndefined();
    await wrapper.get(".drawer-footer .button--primary").trigger("click");
    expect(wrapper.emitted("confirm")?.[0]?.[0]).toEqual(expect.arrayContaining([expect.objectContaining({ type: "work_summary", name: "\u8865\u91C7-\u786E\u8BA4\u56DE\u586B" })]));
  });
  it("shows shared library content as selectable in another stage", async () => {
    const wrapper = mount(PerformanceAssessmentContentLayers, {
      props: {
        open: true,
        availableContents: [{ id: "shared-work", type: "work_summary", name: "\u5171\u4EAB\u5DE5\u4F5C\u603B\u7ED3", description: "", items: [{ id: "shared-item", label: "\u5171\u4EAB\u586B\u5199\u9879", hint: "" }] }],
        initialContents: []
      },
      global: { stubs: { Teleport: true, Transition: false } },
      attachTo: document.body
    });
    const checkbox = wrapper.get('.created-item input[type="checkbox"]');
    expect(checkbox.element.checked).toBe(false);
    expect(checkbox.attributes("disabled")).toBeUndefined();
    await checkbox.setValue(true);
    expect(checkbox.element.checked).toBe(true);
    expect(checkbox.attributes("disabled")).toBeUndefined();
    expect(wrapper.get(".created-item").text()).toContain("\u5171\u4EAB\u5DE5\u4F5C\u603B\u7ED3");
  });
  it("deduplicates shared content by content id and allows selecting an unbound item", async () => {
    const shared = { id: "content-1", content_id: "content-1", type: "work_summary", name: "\u5171\u4EAB\u5DE5\u4F5C\u603B\u7ED3", description: "", items: [{ id: "item-1", label: "\u586B\u5199\u9879", hint: "" }] };
    const wrapper = mount(PerformanceAssessmentContentLayers, {
      props: { open: true, initialContents: [{ ...shared, id: "local-id" }], availableContents: [shared] },
      global: { stubs: { Teleport: true, Transition: false } },
      attachTo: document.body
    });
    expect(wrapper.findAll(".created-item")).toHaveLength(1);
    const checked = wrapper.get('.created-item input[type="checkbox"]');
    expect(checked.attributes("disabled")).toBeDefined();
    const unbound = mount(PerformanceAssessmentContentLayers, {
      props: { open: true, initialContents: [], availableContents: [shared] },
      global: { stubs: { Teleport: true, Transition: false } },
      attachTo: document.body
    });
    const checkbox = unbound.get('.created-item input[type="checkbox"]');
    expect(checkbox.attributes("disabled")).toBeUndefined();
    await checkbox.trigger("click");
    expect(unbound.emitted("confirm")).toBeUndefined();
    await unbound.get(".drawer-footer .button--primary").trigger("click");
    expect(unbound.emitted("confirm")?.[0]?.[0]).toEqual([expect.objectContaining({ content_id: "content-1", name: "\u5171\u4EAB\u5DE5\u4F5C\u603B\u7ED3" })]);
  });
  it("keeps multiple same-name work summaries with unique content ids", async () => {
    const wrapper = mountLayers();
    for (let index = 0; index < 2; index += 1) {
      await openType(wrapper, "\u5DE5\u4F5C\u603B\u7ED3");
      await wrapper.get('input[placeholder="\u8BF7\u8F93\u5165\u540D\u79F0"]').setValue("\u540C\u540D\u5DE5\u4F5C\u603B\u7ED3");
      await wrapper.get('input[placeholder="\u8BF7\u8F93\u5165"]').setValue("\u540C\u540D\u586B\u5199\u9879");
      await wrapper.get(".modal-footer .button--primary").trigger("click");
    }
    expect(wrapper.findAll(".created-item")).toHaveLength(2);
    await wrapper.get(".drawer-footer .button--primary").trigger("click");
    const contents = wrapper.emitted("confirm")?.[0]?.[0];
    expect(contents.map((content) => content.name)).toEqual(["\u540C\u540D\u5DE5\u4F5C\u603B\u7ED3", "\u540C\u540D\u5DE5\u4F5C\u603B\u7ED3"]);
    expect(new Set(contents.map((content) => content.content_id)).size).toBe(2);
  });
  it("supports editing a created item and toggling drawer expansion states", async () => {
    const probe = mountLayers();
    await probe.get(".create-button").trigger("click");
    await probe.findAll('.create-menu [role="menuitem"]')[0].trigger("click");
    await probe.findAll(".config-pane input")[0].setValue("summary");
    await probe.findAll(".saved-item input")[0].setValue("item");
    await probe.get(".modal-footer .button--primary").trigger("click");
    expect(probe.get(".created-item input").attributes("disabled")).toBeDefined();
    expect(probe.findAll(".expand-all-button")).toHaveLength(1);
    expect(probe.get(".created-item .performance-expand-button").attributes("aria-expanded")).toBe("false");
    await probe.get(".created-item .performance-expand-button").trigger("click");
    expect(probe.get(".created-item .performance-expand-button").attributes("aria-expanded")).toBe("true");
    expect(probe.get(".created-item__details").text()).toContain("item");
    await probe.get(".created-item__edit").trigger("click");
    expect(probe.findAll(".config-pane input")[0].element.value).toBe("summary");
  });
  it("captures edit and expansion state without relying on localized labels", async () => {
    const wrapper = mountLayers();
    await wrapper.get(".create-button").trigger("click");
    await wrapper.findAll('.create-menu [role="menuitem"]')[0].trigger("click");
    await wrapper.findAll(".config-pane input")[0].setValue("summary");
    await wrapper.findAll(".saved-item input")[0].setValue("item");
    await wrapper.get(".modal-footer .button--primary").trigger("click");
    expect(wrapper.get(".created-item input").attributes("disabled")).toBeDefined();
    await wrapper.get(".created-item .performance-expand-button").trigger("click");
    expect(wrapper.get(".created-item__details").text()).toContain("item");
    await wrapper.get(".created-item__edit").trigger("click");
    expect(wrapper.findAll(".config-pane input")[0].element.value).toBe("summary");
  });
});
