export interface LayoutRouteMeta {
  hideAside?: boolean
  menuCode?: unknown
}

export function shouldHideAppAside(meta: LayoutRouteMeta): boolean {
  return meta.hideAside === true || meta.menuCode === 'report.list'
}
