import { defineComponent, h, ref } from "vue";
const CyclesProjectsIcon = defineComponent({
  name: "CyclesProjectsIcon",
  setup() {
    return () => h("svg", {
      viewBox: "0 0 16 16",
      xmlns: "http://www.w3.org/2000/svg",
      width: 18,
      height: 18,
      fill: "currentColor",
      "aria-hidden": "true",
      "data-icon": "CyclesProjectsOutlined"
    }, [
      h("path", {
        "fill-rule": "evenodd",
        "clip-rule": "evenodd",
        d: "M8.32 1.173l6.477 3.533a.333.333 0 010 .586L8.319 8.825a.667.667 0 01-.638 0L1.203 5.292a.333.333 0 010-.586l6.478-3.533a.667.667 0 01.638 0zM8 7.48L3.45 5 8 2.517l4.549 2.481-4.55 2.481z"
      }),
      h("path", {
        d: "M7.69 11.922L1.355 8.59a.667.667 0 01.621-1.18L8 10.58l6.023-3.17a.667.667 0 11.62 1.18l-6.332 3.333a.664.664 0 01-.622 0z"
      }),
      h("path", {
        d: "M1.356 11.589l6.333 3.333a.664.664 0 00.622 0l6.333-3.333a.667.667 0 00-.621-1.18L8 13.58l-6.023-3.17a.667.667 0 00-.62 1.18z"
      })
    ]);
  }
});
const SeatsIcon = defineComponent({
  name: "SeatsIcon",
  setup() {
    return () => h("svg", {
      viewBox: "0 0 18 18",
      xmlns: "http://www.w3.org/2000/svg",
      width: 18,
      height: 18,
      fill: "currentColor",
      "aria-hidden": "true",
      "data-icon": "SeatsOutlined"
    }, [
      h("path", {
        "fill-rule": "evenodd",
        "clip-rule": "evenodd",
        d: "M2 2.25h14c.483 0 .875.336.875.75v12c0 .414-.392.75-.875.75H2c-.483 0-.875-.336-.875-.75V3c0-.414.392-.75.875-.75zm.625 1.5v10.5h12.75V3.75H2.625zm1.5 4.5H6.75c.207 0 .375.168.375.375v.75a.375.375 0 01-.375.375H4.125a.375.375 0 01-.375-.375v-.75c0-.207.168-.375.375-.375zm0 3h5.25c.207 0 .375.168.375.375v.75a.375.375 0 01-.375.375h-5.25a.375.375 0 01-.375-.375v-.75c0-.207.168-.375.375-.375zM10.5 4.875h3.375c.207 0 .375.168.375.375v4.125a.375.375 0 01-.375.375H10.5a.375.375 0 01-.375-.375V5.25c0-.207.168-.375.375-.375zm1.125 1.5V8.25h1.125V6.375h-1.125z"
      })
    ]);
  }
});
const TemplatesIcon = defineComponent({
  name: "TemplatesIcon",
  setup() {
    return () => h("svg", {
      viewBox: "0 0 16 16",
      xmlns: "http://www.w3.org/2000/svg",
      width: 18,
      height: 18,
      fill: "currentColor",
      "aria-hidden": "true",
      "data-icon": "TemplatesOutlined"
    }, [
      h("path", {
        d: "M2.667.666h10.666c.368 0 .667.298.667.667v7.333h-1.333V1.999H3.333v12h4v1.334H2.667A.667.667 0 012 14.666V1.333c0-.369.298-.667.667-.667z"
      }),
      h("path", {
        d: "M14.56 11.259a.333.333 0 000-.472l-.472-.471a.333.333 0 00-.472 0l-2.592 2.593-1.179-1.179a.333.333 0 00-.471 0l-.472.471a.333.333 0 000 .472l1.886 1.886a.333.333 0 00.471 0l3.3-3.3zM4.667 5c0-.185.149-.334.333-.334h6c.184 0 .333.15.333.333v.667a.333.333 0 01-.333.333H5a.333.333 0 01-.333-.333v-.667zm0 2.666c0-.184.149-.333.333-.333h3.333c.184 0 .334.149.334.333v.667c0 .184-.15.333-.334.333H5a.333.333 0 01-.333-.333v-.667z"
      })
    ]);
  }
});
const MetricManagementIcon = defineComponent({
  name: "MetricManagementIcon",
  setup() {
    return () => h("svg", {
      viewBox: "0 0 16 16",
      xmlns: "http://www.w3.org/2000/svg",
      width: 18,
      height: 18,
      fill: "none",
      "aria-hidden": "true",
      "data-icon": "MetricManagementOutlined"
    }, [
      h("path", {
        "fill-rule": "evenodd",
        "clip-rule": "evenodd",
        d: "M2 2.667A.667.667 0 002 4h12a.667.667 0 000-1.333H2zm0 4.666a.667.667 0 000 1.333h5.45c.237-.5.56-.95.951-1.333h-6.4zM2 12h5.194c.143.482.362.93.643 1.333H2.001A.667.667 0 012 12zm6.334-.247c.135.5.379.965.715 1.36l.78-.086a.722.722 0 01.74.428l.347.793c.471.107.96.114 1.434.02l.356-.813a.721.721 0 01.74-.428l.856.094c.32-.375.559-.812.699-1.285l-.492-.675a.722.722 0 010-.85l.449-.616a3.507 3.507 0 00-.818-1.326l-.694.076a.722.722 0 01-.74-.428l-.262-.598a3.462 3.462 0 00-1.623.022l-.252.576a.722.722 0 01-.74.428l-.62-.068c-.384.394-.67.872-.835 1.397l.391.537a.722.722 0 010 .85l-.431.592zm4.5-.92c0 .644-.517 1.167-1.155 1.167a1.161 1.161 0 01-1.155-1.167c0-.644.517-1.167 1.155-1.167a1.16 1.16 0 011.155 1.167z",
        fill: "currentColor"
      })
    ]);
  }
});
const EvaluationQuestionsIcon = defineComponent({
  name: "EvaluationQuestionsIcon",
  setup() {
    return () => h("svg", {
      viewBox: "0 0 16 16",
      xmlns: "http://www.w3.org/2000/svg",
      width: 18,
      height: 18,
      "aria-hidden": "true",
      "data-icon": "EvaluationQuestionsOutlined"
    }, [
      h("path", {
        "fill-rule": "evenodd",
        "clip-rule": "evenodd",
        d: "M5.036 1.516C5 1.587 5 1.681 5 1.867v1.467H1.867c-.187 0-.28 0-.352.036a.333.333 0 00-.145.146c-.037.071-.037.165-.037.351v.267c0 .187 0 .28.037.351a.333.333 0 00.145.146c.072.036.165.036.352.036H5v1.467c0 .187 0 .28.036.351a.333.333 0 00.146.146c.071.036.165.036.351.036H5.8c.187 0 .28 0 .351-.036a.333.333 0 00.146-.146c.036-.071.036-.164.036-.351V4.667h7.8c.187 0 .28 0 .352-.036a.334.334 0 00.145-.146c.037-.071.037-.164.037-.351v-.267c0-.186 0-.28-.037-.351a.334.334 0 00-.145-.146c-.072-.036-.165-.036-.352-.036h-7.8V1.867c0-.186 0-.28-.036-.351a.333.333 0 00-.146-.146c-.071-.036-.164-.036-.351-.036h-.267c-.186 0-.28 0-.351.036a.333.333 0 00-.146.146zm4.63 8.351c0-.186 0-.28.037-.351a.333.333 0 01.146-.146c.07-.036.164-.036.35-.036h.268c.186 0 .28 0 .35.036a.334.334 0 01.147.146c.036.071.036.165.036.351v1.467h3.133c.187 0 .28 0 .352.036a.334.334 0 01.145.146c.037.071.037.165.037.351v.267c0 .187 0 .28-.037.351a.334.334 0 01-.145.146c-.072.036-.165.036-.352.036H11v1.467c0 .187 0 .28-.036.351a.334.334 0 01-.146.146c-.071.036-.165.036-.351.036H10.2c-.187 0-.28 0-.351-.036a.334.334 0 01-.146-.146c-.036-.071-.036-.164-.036-.351v-1.467h-7.8c-.187 0-.28 0-.352-.036a.334.334 0 01-.145-.146c-.037-.071-.037-.164-.037-.351v-.267c0-.186 0-.28.037-.351a.334.334 0 01.145-.146c.072-.036.165-.036.352-.036h7.8V9.867z"
      })
    ]);
  }
});
const PermissionsIcon = defineComponent({
  name: "PermissionsIcon",
  setup() {
    return () => h("svg", {
      xmlns: "http://www.w3.org/2000/svg",
      width: 18,
      height: 18,
      fill: "none",
      "aria-hidden": "true",
      "data-icon": "PermissionsOutlined"
    }, [
      h("path", {
        "fill-rule": "evenodd",
        "clip-rule": "evenodd",
        d: "M4.875 6H2.25a.751.751 0 00-.75.75v9c0 .413.336.75.75.75h13.5c.414 0 .75-.337.75-.75v-9a.751.751 0 00-.75-.75h-2.625v-.375A4.124 4.124 0 009 1.5a4.124 4.124 0 00-4.125 4.125V6zm6.75-.375V6h-5.25v-.375a2.624 2.624 0 115.25 0zM3 15V7.5h12V15H3zm6-1.5a2.25 2.25 0 10-.002-4.502A2.25 2.25 0 009 13.5zm.75-2.25a.751.751 0 01-1.5 0 .751.751 0 011.5 0z",
        fill: "#646A73"
      })
    ]);
  }
});
const SystemSettingsIcon = defineComponent({
  name: "SystemSettingsIcon",
  setup() {
    return () => h("svg", {
      xmlns: "http://www.w3.org/2000/svg",
      width: 18,
      height: 18,
      fill: "none",
      "aria-hidden": "true",
      "data-icon": "SystemSettingsOutlined"
    }, [
      h("path", {
        "fill-rule": "evenodd",
        "clip-rule": "evenodd",
        d: "M10.802 17.05l.37-.083 1.042-2.376 2.566.28.257-.279a8.251 8.251 0 001.804-3.136l.111-.36L15.426 9l1.527-2.097-.111-.359a8.25 8.25 0 00-1.804-3.136l-.257-.28-2.566.28-1.042-2.375-.37-.083a8.2 8.2 0 00-3.605 0l-.37.083-1.042 2.376-2.566-.28-.257.279a8.25 8.25 0 00-1.804 3.136l-.111.36L2.574 9l-1.527 2.097.111.359a8.251 8.251 0 001.804 3.136l.257.28 2.566-.28 1.042 2.375.37.083a8.198 8.198 0 003.605 0zm-.694-1.392a6.73 6.73 0 01-2.217 0l-.825-1.881a1.184 1.184 0 00-1.214-.702l-2.029.222A6.75 6.75 0 012.71 11.36l1.212-1.664a1.184 1.184 0 000-1.394L2.71 6.639a6.75 6.75 0 011.113-1.936l2.03.222a1.184 1.184 0 001.213-.702l.825-1.881a6.725 6.725 0 012.217 0l.826 1.881c.208.474.699.758 1.213.702l2.03-.222a6.75 6.75 0 011.112 1.936l-1.211 1.664a1.184 1.184 0 000 1.394l1.211 1.664a6.75 6.75 0 01-1.113 1.936l-2.029-.222a1.184 1.184 0 00-1.213.702l-.826 1.882zM9 12.479A3.47 3.47 0 015.535 9 3.47 3.47 0 019 5.523 3.47 3.47 0 0112.464 9 3.47 3.47 0 019 12.477zM10.964 9A1.97 1.97 0 019 10.977 1.97 1.97 0 017.035 9 1.97 1.97 0 019 7.023 1.97 1.97 0 0110.964 9z",
        fill: "currentColor"
      })
    ]);
  }
});
const performanceMetricAssessmentEnabled = ref(false);
const DEFAULT_PERFORMANCE_ADMIN_SECTION = "seats";
const PERFORMANCE_ADMIN_SUBMENU_ITEMS = {
  "evaluation-questions": [
    { key: "ReviewQuestionManagement", label: "\u8BC4\u4F30\u9898" },
    { key: "TaggedFillQuestionManagement", label: "\u6807\u7B7E\u578B\u586B\u5199\u9898" }
  ],
  permissions: [
    { key: "PerformancePermissionRoles", label: "\u89D2\u8272\u914D\u7F6E" },
    { key: "PerformancePermissionAuthorization", label: "\u6388\u6743\u914D\u7F6E" },
    { key: "PerformancePermissionOther", label: "\u5176\u4ED6\u6743\u9650\u8BBE\u7F6E" },
    { key: "PerformancePermissionSubjectVisibility", label: "\u88AB\u8BC4\u4F30\u4EBA\u4FE1\u606F\u53EF\u89C1\u6027\u8BBE\u7F6E" }
  ],
  "metric-management": [
    { key: "PerformanceMetricLibrary", label: "指标库" },
    { key: "PerformanceMetricTemplates", label: "指标模板" }
  ],
  system: [
    { key: "PerformanceSystemAssessmentMethod", label: "\u8003\u6838\u65B9\u5F0F\u8BBE\u7F6E" },
    { key: "PerformanceSystemNotifications", label: "\u901A\u77E5\u8BBE\u7F6E" },
    { key: "PerformanceSystemWorkbench", label: "\u5DE5\u4F5C\u53F0\u8BBE\u7F6E" },
    { key: "PerformanceSystemCopy", label: "\u5B57\u773C\u8BBE\u7F6E" },
    { key: "PerformanceSystemOther", label: "\u5176\u4ED6\u8BBE\u7F6E" }
  ]
};
const PERFORMANCE_ADMIN_MENU_ITEMS = [
  { key: "cycles-projects", label: "\u5468\u671F\u4E0E\u9879\u76EE", icon: CyclesProjectsIcon },
  { key: "seats", label: "\u5E2D\u4F4D\u7BA1\u7406", icon: SeatsIcon },
  { key: "templates", label: "\u7EE9\u6548\u6A21\u677F", icon: TemplatesIcon },
  { key: "evaluation-questions", label: "\u8BC4\u4F30\u9898\u7BA1\u7406", icon: EvaluationQuestionsIcon },
  { key: "permissions", label: "\u6743\u9650\u7BA1\u7406", icon: PermissionsIcon },
  { key: "system", label: "\u7CFB\u7EDF\u8BBE\u7F6E", icon: SystemSettingsIcon }
];
const METRIC_MANAGEMENT_MENU_ITEM = {
  key: "metric-management",
  label: "\u6307\u6807\u7BA1\u7406",
  icon: MetricManagementIcon
};
function getPerformanceAdminMenuItems(metricEnabled = performanceMetricAssessmentEnabled.value) {
  if (!metricEnabled) return PERFORMANCE_ADMIN_MENU_ITEMS;
  return [
    ...PERFORMANCE_ADMIN_MENU_ITEMS.slice(0, 2),
    METRIC_MANAGEMENT_MENU_ITEM,
    ...PERFORMANCE_ADMIN_MENU_ITEMS.slice(2)
  ];
}
function getPerformanceAdminSectionLabel(section) {
  return getPerformanceAdminMenuItems(true).find((item) => item.key === section)?.label || "\u5E2D\u4F4D\u7BA1\u7406";
}
export {
  DEFAULT_PERFORMANCE_ADMIN_SECTION,
  PERFORMANCE_ADMIN_MENU_ITEMS,
  PERFORMANCE_ADMIN_SUBMENU_ITEMS,
  getPerformanceAdminMenuItems,
  getPerformanceAdminSectionLabel,
  performanceMetricAssessmentEnabled
};
