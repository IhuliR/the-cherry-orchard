import test from 'node:test';
import assert from 'node:assert/strict';
import { DURATION_MS, initialState, remainingAt, changeState, formatTime } from '../js/engine.js';

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

test('time stops exactly at zero', () => {
  const state = changeState(initialState(0), { type: 'set', remainingMs: 2000 }, 1000);
  const playing = changeState(state, { type: 'play' }, 1000);
  assert.equal(remainingAt(playing, 5000), 0);
  assert.equal(formatTime(remainingAt(playing, 5000)), '00:00:00');
});

test('manual set pauses, validates ranges, reset restores defaults', () => {
  const state = changeState(initialState(0), { type: 'set', remainingMs: 47 * 60000 + 59000 }, 1000);
  assert.equal(formatTime(state.remainingMs), '00:47:59');
  assert.equal(state.running, false);
  assert.throws(() => changeState(state, { type: 'set', remainingMs: DURATION_MS + 1 }, 1000));
  assert.throws(() => changeState(state, { type: 'speed', rate: 50 }, 1000));
  assert.deepEqual(changeState(state, { type: 'reset' }, 5000), initialState(5000));
});

test('formatting hides milliseconds until a full second has elapsed', () => {
  assert.equal(formatTime(DURATION_MS - 1), '00:48:00');
  assert.equal(formatTime(DURATION_MS - 1000), '00:47:59');
});
