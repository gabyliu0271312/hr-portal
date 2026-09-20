# CS-B06 像素契约

completion_status: completed
pixel_restore_status: ready_for_implementation
uncovered_reasons: []
pixel_acceptance_status: not-run

## 1. 测量环境

- viewport：`1920×1080`
- DPR：`1`
- 浏览器缩放：采集默认 100%
- 绝对坐标仅用于同 viewport 验收；布局实现使用父级约束。
- 证据根：`C:/Users/gaby.liu/ClonedSites/idreamsky.feishu.cn_20260903_170553_711902/captures`

## 2. 核心容器

| 状态 | root bbox | item outline bbox | 说明 |
| --- | --- | --- | --- |
| root/item default | `(560,195.6667,792,280)` | `(560,281.6667,792,185.3333)` | item outline 只包下半填写题 |
| root selected | outline `(560,195.6667,792,279.3333)` | 不显示 item outline | 2px solid #3370FF |
| item hidden | `(560,195.6667,792,280)` | 保持 item outline | item 不移除 |
| hide description on | `(560,195.6667,792,258)` | N/A（root owner） | 比默认减少 22 |
| allow multiple on | `(560,195.6667,792,314.3125)` | N/A（root owner） | 比默认增加 34.3125 |
| controls restored | `(560,195.6667,792,280)` | owner 对应 outline | 完整恢复 |

root/item 选中边框 computed：

```text
display: block
box-sizing: border-box
background-color: rgba(0,0,0,0)
border: 2px solid rgb(51,112,255)
border-radius: 4px
box-shadow: none
opacity: 1
overflow: visible
```

## 3. 右栏

- 外层 bbox：`(1600,46.6667,320,1024)`。
- 内容起始 x：`1620`，主行宽 `272px`。
- item：
  - “填写设置”行 `(1620,123.6667,272,22)`。
  - 第一 radio `(1620,156.6667,16,16)`；label `(1644,153.6667,84,22)`。
  - 第二 radio `(1620,186.6667,16,16)`；label 同样距控件 `8px`。
  - “必填项设置”行 `(1620,233.6667,272,22)`。
  - 必填 checkbox `(1620,266.6667,16,16)`。
- root：
  - “显示设置”行 `(1620,123.6667,272,22)`。
  - 隐藏描述 checkbox `(1620,156.6667,16,16)`。
  - “填写设置”行 `(1620,203.6667,272,22)`。
  - 允许添加多个 checkbox `(1620,236.6667,16,16)`。

Typography：标题组使用系统字体 `14px/600/22px`、`#1F2329`；选项 label 使用系统字体 `14px/400/22px`。控件与 label 水平间距 `8px`。

## 4. 动态差分

| transition | before | after | 不变量 |
| --- | ---: | ---: | --- |
| hide description on | root h=280 | h=258 | x=560、y=195.6667、w=792 |
| hide description off | h=258 | h=280 | 内容顺序恢复 |
| allow multiple on | h=280 | h=314.3125 | x/y/w 不变 |
| allow multiple off | h=314.3125 | h=280 | 按钮完全移除 |
| item hide | h=280 | h=280 | root/card/item 几何不变 |
| required off/on | h=280 | h=280 | 仅星号与 checkbox 状态变化 |

## 5. Add button

- container row `(584,467,744,22.3125)`。
- button `(584,467.3125,54,22)`。
- SVG `(588,471.625,14,14)`，`viewBox="0 0 24 24"`。
- 文案“添加”位于 SVG 后；颜色使用 primary blue。
- path：

```text
M12 2a1 1 0 0 0-1 1v8H3a1 1 0 1 0 0 2h8v8a1 1 0 1 0 2 0v-8h8a1 1 0 1 0 0-2h-8V3a1 1 0 0 0-1-1Z
```

fill=`currentColor`，stroke=`none`。

## 6. item hidden icon

- icon：`VisibleLockOutlined`
- SVG bbox：`(1326,288.125,16,16)`
- viewBox：`0 0 24 24`
- fill=`currentColor`，stroke=`none`
- path：

```text
m14.52 18.056 1.504 1.503a9.094 9.094 0 0 1-4.04.941c-3.995 0-7.479-2.52-10.453-7.562a1.864 1.864 0 0 1-.011-1.877c.783-1.36 1.609-2.536 2.477-3.528L5.304 8.84c-.79.87-1.559 1.917-2.304 3.147 2.76 4.454 5.748 6.513 8.985 6.513a7.43 7.43 0 0 0 2.535-.444Zm4.139-2.933c.797-.87 1.577-1.912 2.341-3.136C18.292 7.55 15.301 5.5 11.985 5.5c-.864 0-1.706.14-2.526.424l-1.51-1.51a9.241 9.241 0 0 1 4.035-.914c4.07 0 7.566 2.518 10.49 7.555a1.864 1.864 0 0 1-.01 1.887c-.797 1.342-1.63 2.505-2.498 3.489l-1.307-1.308Zm-6.218.853a4 4 0 0 1-4.417-4.417l4.417 4.417Zm3.535-3.536L11.56 8.024a4 4 0 0 1 4.417 4.417ZM2.21 2.21a.997.997 0 0 1 1.41-.005l18.388 18.389a.998.998 0 0 1-.004 1.41.998.998 0 0 1-1.41.004L2.205 3.619a.997.997 0 0 1 .005-1.41Z
```

## 7. 验收 tolerance

| 层级 | tolerance |
| --- | --- |
| root/item/aside bbox | ±1 CSS px |
| radio/checkbox/SVG 尺寸 | ±0.5 CSS px |
| 22px 高度差、34.3125px 高度差 | ±1 CSS px |
| border width | ±0.34 CSS px |
| 颜色 | exact computed RGB/RGBA |
| 文案/visible/forbidden | exact |

当前只有目标证据，没有实现侧截图与 rendered contract，pixel 验收状态必须保持 `not-run`。
