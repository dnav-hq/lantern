import { describe, expect, it } from 'vitest'
import { nextSelection } from './verseSelection'

describe('nextSelection', () => {
  it('selects a verse when nothing is selected', () => {
    expect(nextSelection(null, 4)).toEqual([4, 4])
  })

  it('grows by one when the next verse is tapped', () => {
    expect(nextSelection([4, 4], 5)).toEqual([4, 5])
    expect(nextSelection([4, 5], 3)).toEqual([3, 5])
  })

  it('clears when the only selected verse is tapped again', () => {
    expect(nextSelection([4, 4], 4)).toBeNull()
  })

  it('drops an end when that end is tapped', () => {
    expect(nextSelection([3, 5], 5)).toEqual([3, 4])
    expect(nextSelection([3, 5], 3)).toEqual([4, 5])
  })

  it('starts again on a verse inside the range', () => {
    expect(nextSelection([3, 7], 5)).toEqual([5, 5])
  })

  it('starts again on a verse away from the range', () => {
    expect(nextSelection([3, 4], 9)).toEqual([9, 9])
    expect(nextSelection([3, 4], 1)).toEqual([1, 1])
  })

  it('extends to any verse when asked to', () => {
    expect(nextSelection([3, 4], 9, true)).toEqual([3, 9])
    expect(nextSelection([3, 4], 1, true)).toEqual([1, 4])
  })
})
