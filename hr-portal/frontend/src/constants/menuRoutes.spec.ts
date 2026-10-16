import { describe, expect, it } from 'vitest'
import { MENU_ROUTE_MAP } from './menuRoutes'

describe('standard field navigation', () => {
  it('maps both the group and catalog to the warehouse page', () => {
    expect(MENU_ROUTE_MAP['warehouse.standard_fields']).toBe('/warehouse/standard-fields')
    expect(MENU_ROUTE_MAP['warehouse.standard_fields.catalog']).toBe('/warehouse/standard-fields')
  })
})
