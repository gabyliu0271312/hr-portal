export interface AppMeta {
  key: 'portal' | 'performance' | 'people'
  name: string
  entryPath: string
  /** 进入应用所需入口权限码（portal 无需） */
  menuCode?: string
  /** 进入应用后台所需的权限码；拥有 admin 也可看到应用卡片 */
  adminCode?: string
}

export const APP_CATALOG: AppMeta[] = [
  { key: 'portal', name: 'HR Portal', entryPath: '/home' },
  { key: 'performance', name: '创梦绩效', entryPath: '/performance', menuCode: 'performance.app', adminCode: 'performance.admin' },
  { key: 'people', name: '创梦人力', entryPath: '/people', menuCode: 'people.app', adminCode: 'people.admin' },
]

/** Portal 顶部导航不展示的应用级一级菜单 code（统一收敛到左上角应用弹窗） */
export const APP_TOP_TAB_CODES = ['performance', 'people']
