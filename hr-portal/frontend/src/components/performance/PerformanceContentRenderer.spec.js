import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import PerformanceContentRenderer from "./PerformanceContentRenderer.vue";
import PerformanceRichTextToolbar from "./PerformanceRichTextToolbar.vue";
const content = {
  type: "work_summary",
  name: "\u5DE5\u4F5C\u603B\u7ED3",
  description: "\u672C\u5468\u4EA7\u51FA",
  items: [{ id: "item-1", label: "\u672C\u5468\u5DE5\u4F5C", richText: "<p>\u5B8C\u6210\u9879\u76EE</p>" }]
};
describe("performance content shared primitives", () => {
  it("renders configured content with the shared readonly toolbar", () => {
    const wrapper = mount(PerformanceContentRenderer, { props: { content } });
    const toolbar = wrapper.getComponent(PerformanceRichTextToolbar);
    expect(toolbar.props("readonly")).toBe(true);
    expect(toolbar.findAll("button")).toHaveLength(0);
    expect(wrapper.get(".performance-assessment-rich-text-field__label").text()).toContain("\u672C\u5468\u5DE5\u4F5C");
    expect(wrapper.get(".content-renderer-editor__body").html()).toContain("<p>\u5B8C\u6210\u9879\u76EE</p>");
  });
  it("keeps the item selection frame in the same layout box as its hover frame", () => {
    const wrapper = mount(PerformanceContentRenderer, { props: { content, interactive: true, selectedItemId: "item-1" } });
    const item = wrapper.get('[data-content-item-id="item-1"]');
    expect(item.classes()).toContain("content-renderer-item--selected");
    expect(item.classes()).toContain("content-renderer-item--interactive");
  });
  it("uses item required settings for text items regardless of content type", async () => {
    const custom = { type: "custom", name: "\u6587\u672C\u578B\u586B\u5199\u9898", description: "", items: [{ id: "text-item", label: "\u586B\u5199\u9898\u540D\u79F0", richText: "" }] };
    const wrapper = mount(PerformanceContentRenderer, { props: { content: custom, interactive: true, itemSettings: { "text-item": { mode: "fill", required: true } } } });
    expect(wrapper.get(".performance-assessment-rich-text-field__label i").text()).toBe("*");
    await wrapper.setProps({ itemSettings: { "text-item": { mode: "fill", required: false } } });
    expect(wrapper.find(".performance-assessment-rich-text-field__label i").exists()).toBe(false);
  });
  it("renders rating levels from the selected rule snapshot", () => {
    const rating = { type: "rating", name: "\u8BC4\u5206\u8BC4\u7EA7", description: "", items: [{ id: "annual", label: "\u5E74\u5EA6\u7EFC\u5408\u8BC4\u7EA7" }], options: [{ id: "s", label: "\u5353\u8D8A" }, { id: "a", label: "\u7B26\u5408\u9884\u671F" }] };
    const wrapper = mount(PerformanceContentRenderer, { props: { content: rating } });
    expect(wrapper.findAll(".content-renderer-rating")).toHaveLength(1);
    expect(wrapper.findAll(".content-renderer-rating__levels .performance-rating-control__option").map((item) => item.text())).toEqual(["\u5353\u8D8A", "\u7B26\u5408\u9884\u671F"]);
    expect(wrapper.text()).not.toContain("1\u661F");
  });
  it("renders dropdown mode from the same rating snapshot", () => {
    const rating = { type: "rating", name: "\u8BC4\u5206\u8BC4\u7EA7", description: "", ratingDisplayMode: "\u4E0B\u62C9\u6837\u5F0F", items: [{ id: "annual", label: "\u5E74\u5EA6\u7EFC\u5408\u8BC4\u7EA7" }], options: [{ id: "s", label: "\u5353\u8D8A" }, { id: "a", label: "\u7B26\u5408\u9884\u671F" }] };
    const wrapper = mount(PerformanceContentRenderer, { props: { content: rating } });
    expect(wrapper.get(".performance-rating-control").classes()).toContain("is-dropdown");
    expect(wrapper.get(".rating-select-preview").text()).toContain("\u8BF7\u9009\u62E9\u7B49\u7EA7");
    expect(wrapper.find(".performance-rating-control__labels").exists()).toBe(false);
  });
  it("keeps the six commands and icon contract in editable mode", () => {
    const wrapper = mount(PerformanceRichTextToolbar, { props: { active: { bold: true } } });
    expect(wrapper.findAll("button")).toHaveLength(6);
    expect(wrapper.findAll("button").map((button) => button.attributes("data-icon"))).toEqual([
      "BoldOutlined",
      "ItalicOutlined",
      "UnderlineOutlined",
      "OrderListOutlined",
      "DisorderListOutlined",
      "GlobalLinkOutlined"
    ]);
    expect(wrapper.find('button[data-icon="BoldOutlined"]').classes()).toContain("active");
  });
});
