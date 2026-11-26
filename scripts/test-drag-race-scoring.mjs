import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildDragManualBracket,
  buildDragTimingSchedule,
  calculateDragRun,
  rankTimedDragRiders,
  resolveDragScoringFormat,
} from '../src/lib/dragRaceScoring.ts'

test('calculates the two example riders from the regulation', () => {
  const riderOne = [
    calculateDragRun({ status: 'FINISH', reactionTimeSeconds: 0.32, elapsedTimeSeconds: 5.2, jumpStart: false }),
    calculateDragRun({ status: 'FINISH', reactionTimeSeconds: 0.28, elapsedTimeSeconds: 5.15, jumpStart: false }),
  ]
  const riderTwo = [
    calculateDragRun({ status: 'FINISH', reactionTimeSeconds: -0.05, elapsedTimeSeconds: 4.9, jumpStart: true }),
    calculateDragRun({ status: 'FINISH', reactionTimeSeconds: 0.25, elapsedTimeSeconds: 4.95, jumpStart: false }),
  ]
  const ranking = rankTimedDragRiders([
    { riderId: 'rider-2', runs: riderTwo },
    { riderId: 'rider-1', runs: riderOne },
  ])

  assert.equal(riderOne[0].totalSeconds, 4.712)
  assert.equal(riderOne[1].totalSeconds, 4.663)
  assert.equal(riderTwo[0].totalSeconds, 7.405)
  assert.equal(riderTwo[1].totalSeconds, 4.48)
  assert.equal(ranking[0].riderId, 'rider-1')
  assert.equal(ranking[0].totalSeconds, 9.375)
  assert.equal(ranking[1].totalSeconds, 11.885)
})

test('uses ET then RT as tie breakers and flags an exact tie for runoff', () => {
  const first = [
    calculateDragRun({ status: 'FINISH', reactionTimeSeconds: 0.2, elapsedTimeSeconds: 5, jumpStart: false }),
    calculateDragRun({ status: 'FINISH', reactionTimeSeconds: 0.2, elapsedTimeSeconds: 5, jumpStart: false }),
  ]
  const second = [
    calculateDragRun({ status: 'FINISH', reactionTimeSeconds: 0.3, elapsedTimeSeconds: 4.9, jumpStart: false }),
    calculateDragRun({ status: 'FINISH', reactionTimeSeconds: 0.3, elapsedTimeSeconds: 5.1, jumpStart: false }),
  ]
  const exactTie = rankTimedDragRiders([
    { riderId: 'a', runs: first },
    { riderId: 'b', runs: first },
  ])
  const etBreaksTie = rankTimedDragRiders([
    { riderId: 'first-by-et', runs: second },
    { riderId: 'second-by-et', runs: first },
  ])

  assert.equal(exactTie[1].needsRunoff, true)
  assert.equal(etBreaksTie[0].riderId, 'second-by-et')
  assert.equal(etBreaksTie[0].needsRunoff, false)
})

test('builds a 32-rider manual bracket with 31 heats in five rounds', () => {
  let nextId = 0
  const heats = buildDragManualBracket(Array.from({ length: 32 }, (_, index) => `rider-${index + 1}`), () => `heat-${++nextId}`)
  const counts = [1, 2, 3, 4, 5].map((round) => heats.filter((heat) => heat.roundNumber === round).length)

  assert.deepEqual(counts, [16, 8, 4, 2, 1])
  assert.equal(heats.length, 31)
  assert.equal(heats.filter((heat) => heat.roundNumber === 1).filter((heat) => heat.riderLaneAId && heat.riderLaneBId).length, 16)
})

test('spreads byes into separate first-round matches', () => {
  let nextId = 0
  const heats = buildDragManualBracket(Array.from({ length: 30 }, (_, index) => `rider-${index + 1}`), () => `heat-${++nextId}`)
  const firstRound = heats.filter((heat) => heat.roundNumber === 1)

  assert.equal(firstRound.length, 16)
  assert.equal(firstRound.filter((heat) => heat.outcome === 'BYE').length, 2)
  assert.equal(firstRound.some((heat) => !heat.riderLaneAId && !heat.riderLaneBId), false)
  assert.equal(new Set(firstRound.flatMap((heat) => [heat.riderLaneAId, heat.riderLaneBId]).filter(Boolean)).size, 30)
})

test('does not let a first-round bye skip the unfinished feeder heat', () => {
  let nextId = 0
  const heats = buildDragManualBracket(Array.from({ length: 5 }, (_, index) => `rider-${index + 1}`), () => `heat-${++nextId}`)
  const firstRound = heats.filter((heat) => heat.roundNumber === 1)
  const laterRounds = heats.filter((heat) => heat.roundNumber > 1)

  assert.equal(firstRound.filter((heat) => heat.outcome === 'BYE').length, 3)
  assert.equal(laterRounds.some((heat) => heat.outcome === 'BYE'), false)
  assert.equal(laterRounds.some((heat) => heat.status === 'COMPLETE'), false)
})

test('schedules two timed runs and swaps lanes, including a solo rider', () => {
  const schedule = buildDragTimingSchedule(['a', 'b', 'c'], ['d', 'e'])
  const riderARuns = schedule.filter((heat) => heat.groupOneRiderId === 'a')

  assert.equal(schedule.length, 6)
  assert.equal(riderARuns[0].laneARiderId, 'a')
  assert.equal(riderARuns[1].laneBRiderId, 'a')
  assert.equal(schedule.find((heat) => heat.runNumber === 1 && heat.heatNumber === 1)?.laneBRiderId, 'd')
  assert.equal(schedule.find((heat) => heat.runNumber === 2 && heat.heatNumber === 1)?.laneARiderId, 'e')
  assert.equal(schedule.find((heat) => heat.runNumber === 1 && heat.heatNumber === 3)?.laneBRiderId, null)
  assert.equal(schedule.find((heat) => heat.runNumber === 2 && heat.heatNumber === 3)?.laneARiderId, null)
})

test('defaults legacy categories and unknown formats to moto scoring', () => {
  assert.equal(resolveDragScoringFormat(undefined), 'MOTO_POINTS')
  assert.equal(resolveDragScoringFormat('DRAG_TIMING', 'DRAG_MANUAL'), 'DRAG_MANUAL')
  assert.equal(resolveDragScoringFormat('unknown'), 'MOTO_POINTS')
})
