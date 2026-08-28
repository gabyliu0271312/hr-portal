import { describe, expect, it } from 'vitest'
import { shouldHideAppAside } from './layoutVisibility'

describe('shouldHideAppAside', () => {
  it('hides the aside for explicit fullscreen routes', () => {
    expect(shouldHideAppAside({ hideAside: true })).toBe(true)
  })

  it('hides the aside for report routes even when legacy route metadata omits hideAside', () => {
    expect(shouldHideAppAside({ menuCode: 'report.list' })).toBe(true)
  })

  it('keeps the aside for regular modules', () => {
    expect(shouldHideAppAside({ menuCode: 'warehouse.assets' })).toBe(false)
  })
})
