const itemSettingsCapabilities = {
  "work-summary": { hideName: false, mode: true, required: true },
  "custom-text": { hideName: true, mode: true, required: true },
  "custom-tag": { hideName: true, hideDescription: true, mode: true, required: true },
  rating: { hideName: true, mode: false, required: true, levelRules: true },
  "evaluation-work-summary": { hideName: false, mode: true, required: true, viewResults: true },
  "evaluation-custom-tag": { hideName: true, hideDescription: true, mode: true, required: true, viewResults: true },
  "result-view-item": { hideName: false, mode: false, required: false },
  "result-view-tag": { hideName: true, hideDescription: true, mode: false, required: false, allowView: true }
};
function getItemSettingsVariant(content, item) {
  if (content.type === "rating") return "rating";
  if (content.type === "custom") return (item?.questionType || content.questionType || "text") === "tag" ? "custom-tag" : "custom-text";
  return "work-summary";
}
function supportsEvaluationView(content, item) {
  const variant = getItemSettingsVariant(content, item);
  return variant === "work-summary" || variant === "custom-tag";
}
function getRootSettingsCapabilities(content) {
  return { allowMultiple: content.type === "work_summary", allowUnknown: content.type === "rating" };
}
const genericRule = {
  visibleSlots: ["fill", "reference"],
  forbiddenSlots: ["adjustment", "view"],
  rootSettingsEnabled: false,
  itemSettingsEnabled: false,
  rootSettingsVariant: "generic-root",
  itemSettingsVariant: "generic-item",
  allowedContentTypes: ["work_summary", "rating", "custom"]
};
const stageContentRules = {
  work_summary: {
    ...genericRule,
    visibleSlots: ["fill"],
    forbiddenSlots: ["reference", "adjustment", "view"],
    rootSettingsEnabled: true,
    itemSettingsEnabled: true,
    rootSettingsVariant: "work-summary-root",
    itemSettingsVariant: "work-summary-item"
  },
  reviewer_360_invite: genericRule,
  reviewer_360_confirm: genericRule,
  evaluation: {
    ...genericRule,
    itemSettingsEnabled: true,
    itemSettingsVariant: "evaluation-item"
  },
  calibration: {
    ...genericRule,
    visibleSlots: ["adjustment", "reference"],
    forbiddenSlots: ["fill", "view"]
  },
  result_communication: genericRule,
  result_view: {
    ...genericRule,
    visibleSlots: ["view"],
    forbiddenSlots: ["fill", "reference", "adjustment"],
    itemSettingsEnabled: true,
    itemSettingsVariant: "result-view-item",
    allowedContentTypes: ["work_summary", "rating", "custom"]
  },
  result_reconsideration: {
    ...genericRule,
    rootSettingsVariant: "appeal-root"
  }
};
const contentSlotLabels = {
  fill: "\u914D\u7F6E\u586B\u5199\u5185\u5BB9",
  reference: "\u914D\u7F6E\u53C2\u8003\u5185\u5BB9",
  adjustment: "\u914D\u7F6E\u4F9B\u8C03\u6574\u5185\u5BB9",
  view: "\u914D\u7F6E\u67E5\u770B\u5185\u5BB9"
};
function getStageContentRule(nodeType) {
  return stageContentRules[nodeType || ""] || genericRule;
}
function getStageContentTabs(nodeType) {
  return getStageContentRule(nodeType).visibleSlots.map((key) => ({ key, label: contentSlotLabels[key] }));
}
export {
  contentSlotLabels,
  getItemSettingsVariant,
  getRootSettingsCapabilities,
  getStageContentRule,
  getStageContentTabs,
  itemSettingsCapabilities,
  supportsEvaluationView,
  stageContentRules
};
