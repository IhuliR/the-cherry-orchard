import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DURATION_MS,
  MAX_REMAINING_MS,
  MAX_SETTABLE_MS,
  MIN_REMAINING_MS,
  RATES,
  changeState,
  formatTime,
  initialState,
  isRunningAt,
  normalizedState,
  remainingAt,
} from '../js/engine.js';

test('timer begins with 46 minutes, paused in countdown direction', () => {
  const state = initialState(1000);
  assert.deepEqual(state, {
    remainingMs: 2_760_000,
    running: false,
    rate: 1,
    direction: 'down',
    updatedAt: 1000,
  });
  assert.equal(formatTime(state.remainingMs), '00:46:00');
});

test('countdown can be paused and resumed without changing direction', () => {
  const start = changeState(null, { type: 'play' }, 1000);
  assert.equal(remainingAt(start, 6000), DURATION_MS - 5000);

  const paused = changeState(start, { type: 'pause' }, 6000);
  assert.equal(paused.direction, 'down');
  assert.equal(remainingAt(paused, 25000), DURATION_MS - 5000);

  const resumed = changeState(paused, { type: 'play' }, 25000);
  assert.equal(resumed.direction, 'down');
  assert.equal(remainingAt(resumed, 28000), DURATION_MS - 8000);
});

test('countdown speed changes preserve time at the change instant', () => {
  const state = changeState(initialState(0), { type: 'play' }, 0);
  const accelerated = changeState(state, { type: 'speed', rate: 2 }, 10000);
  assert.equal(accelerated.remainingMs, DURATION_MS - 10000);
  assert.equal(remainingAt(accelerated, 20000), DURATION_MS - 30000);

  const slower = changeState(accelerated, { type: 'speed', rate: 0.5 }, 20000);
  assert.equal(slower.remainingMs, DURATION_MS - 30000);
  assert.equal(remainingAt(slower, 24000), DURATION_MS - 32000);
});

test('countdown stops exactly at one second', () => {
  const state = changeState(initialState(0), { type: 'set', remainingMs: 2000 }, 1000);
  const playing = changeState(state, { type: 'play' }, 1000);
  assert.equal(remainingAt(playing, 5000), MIN_REMAINING_MS);
  assert.equal(formatTime(remainingAt(playing, 5000), playing.direction), '00:00:01');
  assert.equal(isRunningAt(playing, 5000), false);
});

test('countdown respects the one-second floor at every supported speed', () => {
  for (const rate of RATES) {
    const state = changeState(initialState(0), { type: 'set', remainingMs: 5000 }, 0);
    const playing = changeState(state, { type: 'play' }, 0);
    const rated = changeState(playing, { type: 'speed', rate }, 0);
    const afterFinish = Math.ceil((5000 - MIN_REMAINING_MS) / rate) + 1;

    assert.equal(remainingAt(rated, afterFinish), MIN_REMAINING_MS, `rate ${rate}×`);
    assert.equal(isRunningAt(rated, afterFinish), false, `rate ${rate}×`);
  }
});

test('forward countdown starts only from one second', () => {
  const minimum = changeState(initialState(0), { type: 'set', remainingMs: MIN_REMAINING_MS }, 1000);
  const forward = changeState(minimum, { type: 'forward' }, 2000);

  assert.equal(forward.direction, 'up');
  assert.equal(forward.running, true);
  assert.equal(remainingAt(forward, 3000), 2000);
  assert.equal(formatTime(remainingAt(forward, 2999), forward.direction), '00:00:01');
  assert.equal(formatTime(remainingAt(forward, 3000), forward.direction), '00:00:02');
  assert.throws(() => changeState(initialState(0), { type: 'forward' }, 0));
});

test('forward countdown can be paused and resumed without changing direction', () => {
  const minimum = changeState(initialState(0), { type: 'set', remainingMs: MIN_REMAINING_MS }, 0);
  const forward = changeState(minimum, { type: 'forward' }, 0);
  const paused = changeState(forward, { type: 'pause' }, 3000);

  assert.equal(paused.remainingMs, 4000);
  assert.equal(paused.direction, 'up');
  assert.equal(remainingAt(paused, 10000), 4000);

  const resumed = changeState(paused, { type: 'play' }, 10000);
  assert.equal(resumed.direction, 'up');
  assert.equal(remainingAt(resumed, 12000), 6000);
});

test('forward speed changes preserve time and work at every supported rate', () => {
  for (const rate of RATES) {
    const minimum = changeState(initialState(0), { type: 'set', remainingMs: MIN_REMAINING_MS }, 0);
    const forward = changeState(minimum, { type: 'forward' }, 0);
    const rated = changeState(forward, { type: 'speed', rate }, 2000);

    assert.equal(rated.remainingMs, 3000, `no jump at ${rate}×`);
    assert.equal(remainingAt(rated, 3000), 3000 + 1000 * rate, `rate ${rate}×`);
  }
});

test('forward countdown stops safely at the six-digit display limit', () => {
  const nearLimit = normalizedState({
    remainingMs: MAX_REMAINING_MS - 1000,
    running: true,
    rate: 4,
    direction: 'up',
    updatedAt: 1000,
  }, 1000);

  assert.equal(remainingAt(nearLimit, 2000), MAX_REMAINING_MS);
  assert.equal(isRunningAt(nearLimit, 2000), false);
  assert.equal(formatTime(remainingAt(nearLimit, 2000), 'up'), '99:59:59');

  const paused = changeState(nearLimit, { type: 'pause' }, 2000);
  assert.equal(paused.remainingMs, MAX_REMAINING_MS);
  assert.equal(paused.running, false);

  const slowed = changeState(nearLimit, { type: 'speed', rate: 0.25 }, 2000);
  assert.equal(slowed.remainingMs, MAX_REMAINING_MS);
  assert.equal(slowed.running, false);
  assert.equal(slowed.rate, 0.25);
});

test('old Firebase state defaults to countdown and is not clamped to the new default', () => {
  const oldState = normalizedState({ remainingMs: 2_880_000, running: false, rate: 1, updatedAt: 100 }, 5000);
  assert.equal(oldState.remainingMs, 2_880_000);
  assert.equal(oldState.direction, 'down');

  const oldZero = normalizedState({ remainingMs: 0, running: true, rate: 1, updatedAt: 100 }, 5000);
  assert.equal(oldZero.remainingMs, MIN_REMAINING_MS);
  assert.equal(oldZero.running, false);
  assert.equal(oldZero.direction, 'down');
});

test('serialized forward state restores elapsed time after reload', () => {
  const stored = {
    remainingMs: 5000,
    running: true,
    rate: 2,
    direction: 'up',
    updatedAt: 1000,
  };
  const restored = normalizedState(JSON.parse(JSON.stringify(stored)), 4000);

  assert.deepEqual(restored, stored);
  assert.equal(remainingAt(restored, 4000), 11000);
  assert.equal(isRunningAt(restored, 4000), true);
});

test('manual set keeps the existing 48-minute range, pauses and returns to countdown direction', () => {
  const minimum = changeState(initialState(0), { type: 'set', remainingMs: MIN_REMAINING_MS }, 0);
  const forward = changeState(minimum, { type: 'forward' }, 0);
  const state = changeState(forward, { type: 'set', remainingMs: 47 * 60000 + 59000 }, 1000);

  assert.equal(formatTime(state.remainingMs), '00:47:59');
  assert.equal(state.running, false);
  assert.equal(state.direction, 'down');
  assert.equal(changeState(state, { type: 'set', remainingMs: MAX_SETTABLE_MS }, 1000).remainingMs, MAX_SETTABLE_MS);
  assert.throws(() => changeState(state, { type: 'set', remainingMs: 0 }, 1000));
  assert.throws(() => changeState(state, { type: 'set', remainingMs: MIN_REMAINING_MS - 1 }, 1000));
  assert.throws(() => changeState(state, { type: 'set', remainingMs: MAX_SETTABLE_MS + 1 }, 1000));
  assert.throws(() => changeState(state, { type: 'speed', rate: 50 }, 1000));
});

test('reset restores 46 minutes and standard countdown direction', () => {
  const minimum = changeState(initialState(0), { type: 'set', remainingMs: MIN_REMAINING_MS }, 0);
  const forward = changeState(minimum, { type: 'forward' }, 0);
  assert.deepEqual(changeState(forward, { type: 'reset' }, 5000), initialState(5000));
});

test('regular play and toggle cannot restart countdown at one second', () => {
  const minimum = changeState(initialState(0), { type: 'set', remainingMs: MIN_REMAINING_MS }, 1000);
  const played = changeState(minimum, { type: 'play' }, 2000);
  const toggled = changeState(played, { type: 'toggle' }, 3000);

  assert.equal(played.running, false);
  assert.equal(played.direction, 'down');
  assert.equal(toggled.running, false);
  assert.equal(toggled.direction, 'down');
});

test('formatting uses countdown ceiling and forward floor', () => {
  assert.equal(formatTime(DURATION_MS - 1), '00:46:00');
  assert.equal(formatTime(DURATION_MS - 1000), '00:45:59');
  assert.equal(formatTime(0), '00:00:01');
  assert.equal(formatTime(1999, 'up'), '00:00:01');
  assert.equal(formatTime(2000, 'up'), '00:00:02');
});
