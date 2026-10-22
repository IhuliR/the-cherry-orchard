import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DURATION_MS,
  MIN_REMAINING_MS,
  RATES,
  changeState,
  formatTime,
  initialState,
  isRunningAt,
  normalizedState,
  remainingAt,
} from '../js/engine.js';

test('timer begins with 48 minutes on pause', () => {
  const state = initialState(1000);
  assert.equal(state.remainingMs, 2_880_000);
  assert.equal(state.running, false);
  assert.equal(formatTime(state.remainingMs), '00:48:00');
});

test('play, normal speed, pause and play again', () => {
  const start = changeState(null, { type: 'play' }, 1000);
  assert.equal(remainingAt(start, 6000), DURATION_MS - 5000);
  const paused = changeState(start, { type: 'pause' }, 6000);
  assert.equal(remainingAt(paused, 25000), DURATION_MS - 5000);
  const resumed = changeState(paused, { type: 'play' }, 25000);
  assert.equal(remainingAt(resumed, 28000), DURATION_MS - 8000);
});

test('speed changes preserve time at change instant', () => {
  const state = changeState(initialState(0), { type: 'play' }, 0);
  const accelerated = changeState(state, { type: 'speed', rate: 2 }, 10000);
  assert.equal(accelerated.remainingMs, DURATION_MS - 10000);
  assert.equal(remainingAt(accelerated, 20000), DURATION_MS - 30000);
  const slower = changeState(accelerated, { type: 'speed', rate: 0.5 }, 20000);
  assert.equal(remainingAt(slower, 24000), DURATION_MS - 32000);
});

test('time stops exactly at one second', () => {
  const state = changeState(initialState(0), { type: 'set', remainingMs: 2000 }, 1000);
  const playing = changeState(state, { type: 'play' }, 1000);
  assert.equal(remainingAt(playing, 5000), MIN_REMAINING_MS);
  assert.equal(formatTime(remainingAt(playing, 5000)), '00:00:01');
  assert.equal(isRunningAt(playing, 5000), false);
});

test('accelerated countdown stops at one second and a later speed change keeps it stopped', () => {
  const state = changeState(initialState(0), { type: 'set', remainingMs: 5000 }, 0);
  const playing = changeState(state, { type: 'play' }, 0);
  const accelerated = changeState(playing, { type: 'speed', rate: 4 }, 500);

  assert.equal(remainingAt(accelerated, 1375), MIN_REMAINING_MS);
  assert.equal(isRunningAt(accelerated, 1375), false);

  const slowed = changeState(accelerated, { type: 'speed', rate: 0.25 }, 2000);
  assert.equal(slowed.remainingMs, MIN_REMAINING_MS);
  assert.equal(slowed.running, false);
  assert.equal(remainingAt(slowed, 10000), MIN_REMAINING_MS);
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

test('persisted expired states normalize to a stopped one-second timer', () => {
  const oldZero = normalizedState({ remainingMs: 0, running: true, rate: 1, updatedAt: 100 }, 5000);
  assert.equal(oldZero.remainingMs, MIN_REMAINING_MS);
  assert.equal(oldZero.running, false);

  const staleRunning = normalizedState({ remainingMs: 2000, running: true, rate: 1, updatedAt: 100 }, 5000);
  assert.equal(remainingAt(staleRunning, 5000), MIN_REMAINING_MS);
  assert.equal(isRunningAt(staleRunning, 5000), false);
});

test('manual set pauses, validates ranges, reset restores defaults', () => {
  const state = changeState(initialState(0), { type: 'set', remainingMs: 47 * 60000 + 59000 }, 1000);
  assert.equal(formatTime(state.remainingMs), '00:47:59');
  assert.equal(state.running, false);
  assert.throws(() => changeState(state, { type: 'set', remainingMs: 0 }, 1000));
  assert.throws(() => changeState(state, { type: 'set', remainingMs: MIN_REMAINING_MS - 1 }, 1000));
  assert.throws(() => changeState(state, { type: 'set', remainingMs: DURATION_MS + 1 }, 1000));
  assert.throws(() => changeState(state, { type: 'speed', rate: 50 }, 1000));
  assert.deepEqual(changeState(state, { type: 'reset' }, 5000), initialState(5000));
});

test('play and toggle cannot restart the timer at one second', () => {
  const minimum = changeState(initialState(0), { type: 'set', remainingMs: MIN_REMAINING_MS }, 1000);
  const played = changeState(minimum, { type: 'play' }, 2000);
  const toggled = changeState(played, { type: 'toggle' }, 3000);

  assert.equal(played.remainingMs, MIN_REMAINING_MS);
  assert.equal(played.running, false);
  assert.equal(toggled.remainingMs, MIN_REMAINING_MS);
  assert.equal(toggled.running, false);
});

test('formatting hides milliseconds until a full second has elapsed', () => {
  assert.equal(formatTime(DURATION_MS - 1), '00:48:00');
  assert.equal(formatTime(DURATION_MS - 1000), '00:47:59');
  assert.equal(formatTime(0), '00:00:01');
});
