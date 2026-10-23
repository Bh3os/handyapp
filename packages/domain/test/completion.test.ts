// Completion: the walkthrough record and what blocks Finished (TSK-0083; HH-QA-01, HH-QA-03, HH-WORK-12, T55,
// OWN-DEC-75). Pure: no database.
import { describe, expect, it } from 'vitest'
import { completionProblems, isAcceptance, walkthroughProblems } from '../src/index.js'

describe('the walkthrough (TSK-0083, HH-QA-03, OWN-DEC-75)', () => {
  it('[HH-QA-03] customer unavailable names nobody and is never acceptance; other outcomes name who took part', () => {
    expect(isAcceptance('customer_unavailable')).toBe(false)
    expect(isAcceptance('disputed')).toBe(false)
    expect(isAcceptance('accepted')).toBe(true)
    expect(walkthroughProblems({ outcome: 'customer_unavailable' })).toEqual([])
    expect(walkthroughProblems({ outcome: 'customer_unavailable', participantName: 'Someone' })).toEqual([
      'NO_PARTICIPANT_WHEN_UNAVAILABLE',
    ])
    expect(walkthroughProblems({ outcome: 'accepted' })).toEqual(['PARTICIPANT_REQUIRED', 'PARTICIPANT_ROLE_REQUIRED'])
    expect(
      walkthroughProblems({ outcome: 'disputed', participantName: 'Synthetic', participantRole: 'customer' }),
    ).toEqual(['COMMENTS_REQUIRED'])
  })
})

describe('what blocks Finished (TSK-0083, HH-QA-01, T55)', () => {
  const ready = {
    jobState: 'in_progress',
    holdsOpen: 0,
    workStarted: true,
    alreadySubmitted: false,
    packages: [{ code: 'PT-01', checklistComplete: true, beforePhotos: 1, afterPhotos: 1 }],
  }
  it('[HH-QA-01] nothing when the evidence is complete; each missing item named per work package', () => {
    expect(completionProblems(ready)).toEqual([])
    expect(
      completionProblems({
        ...ready,
        holdsOpen: 1,
        packages: [{ code: 'PT-01', checklistComplete: false, beforePhotos: 0, afterPhotos: 0 }],
      }),
    ).toEqual([
      { code: 'HOLD_OPEN' },
      { code: 'CHECKLIST_INCOMPLETE', workPackage: 'PT-01' },
      { code: 'BEFORE_PHOTO_MISSING', workPackage: 'PT-01' },
      { code: 'AFTER_PHOTO_MISSING', workPackage: 'PT-01' },
    ])
    expect(completionProblems({ ...ready, alreadySubmitted: true, jobState: 'ready_for_qa' })).toEqual([
      { code: 'ALREADY_SUBMITTED' },
    ])
  })
})
