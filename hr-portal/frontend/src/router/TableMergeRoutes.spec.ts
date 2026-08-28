import { describe, expect, it } from 'vitest'
import router from './index'

describe('table merge routes', () => {
  it('keeps the list in the regular layout and hides the aside for focused workspaces', () => {
    const list = router.getRoutes().find((route) => route.name === 'TableMerge')
    const workspaceNames = ['TableMergeNew', 'TableMergeEdit', 'TableMergeMapping', 'TableMergeRun']
    const workspaces = workspaceNames.map((name) => router.getRoutes().find((route) => route.name === name))

    expect(list?.meta.hideAside).not.toBe(true)
    expect(workspaces.every((route) => route?.meta.hideAside === true)).toBe(true)
    expect(workspaces.every((route) => route?.meta.hideInMenu === true)).toBe(true)
    expect(workspaces.every((route) => route?.meta.menuCode === 'table_tools')).toBe(true)
  })
})
