/** Pure timer state: every state change preserves elapsed time. */
export const DURATION_MS = 46 * 60 * 1000;
export const MIN_REMAINING_MS = 1000;
export const MAX_SETTABLE_MS = 48 * 60 * 1000;
export const MAX_REMAINING_MS = (99 * 60 * 60 + 59 * 60 + 59) * 1000;
export const RATES = [0.25, 0.5, 1, 1.5, 2, 4];
export const DIRECTIONS = ['down', 'up'];

export function initialState(now = Date.now()) {
  return { remainingMs: DURATION_MS, running: false, rate: 1, direction: 'down', updatedAt: now };
}

export function normalizedState(value, now = Date.now()) {
  if (!value || typeof value !== 'object') return initialState(now);
  const remainingMs = Number(value.remainingMs);
  const rate = Number(value.rate);
  const updatedAt = Number(value.updatedAt);
  const direction = value.direction ?? 'down';
  if (!Number.isFinite(remainingMs) || !Number.isFinite(rate) ||
      !Number.isFinite(updatedAt) || typeof value.running !== 'boolean' ||
      !RATES.includes(rate) || !DIRECTIONS.includes(direction)) return initialState(now);
  const normalizedRemaining = Math.max(MIN_REMAINING_MS, Math.min(MAX_REMAINING_MS, remainingMs));
  const canRun = direction === 'up'
    ? normalizedRemaining < MAX_REMAINING_MS
    : normalizedRemaining > MIN_REMAINING_MS;
  return {
    remainingMs: normalizedRemaining,
    // Old persisted states can contain zero together with running: true.
    running: value.running && canRun,
    rate,
    direction,
    updatedAt,
  };
}

export function remainingAt(state, now) {
  const current = Math.max(MIN_REMAINING_MS, Math.min(MAX_REMAINING_MS, state.remainingMs));
  if (!state.running) return current;
  const elapsed = Math.max(0, now - state.updatedAt);
  const change = elapsed * state.rate * (state.direction === 'up' ? 1 : -1);
  return Math.max(MIN_REMAINING_MS, Math.min(MAX_REMAINING_MS, state.remainingMs + change));
}

export function isRunningAt(state, now) {
  const current = remainingAt(state, now);
  const beforeBoundary = state.direction === 'up'
    ? current < MAX_REMAINING_MS
    : current > MIN_REMAINING_MS;
  return state.running && beforeBoundary;
}

export function changeState(previous, command, now) {
  const state = normalizedState(previous, now);
  const left = remainingAt(state, now);
  switch (command.type) {
    case 'play': {
      const canRun = state.direction === 'up' ? left < MAX_REMAINING_MS : left > MIN_REMAINING_MS;
      return { ...state, remainingMs: left, running: canRun, updatedAt: now };
    }
    case 'pause':
      return { ...state, remainingMs: left, running: false, updatedAt: now };
    case 'toggle': {
      const canRun = state.direction === 'up' ? left < MAX_REMAINING_MS : left > MIN_REMAINING_MS;
      return { ...state, remainingMs: left, running: !isRunningAt(state, now) && canRun, updatedAt: now };
    }
    case 'forward':
      if (left !== MIN_REMAINING_MS) throw new Error('Прямой отсчёт можно запустить только с 00:00:01');
      return { ...state, remainingMs: left, running: true, direction: 'up', updatedAt: now };
    case 'speed': {
      const rate = Number(command.rate);
      if (!RATES.includes(rate)) throw new Error('Недопустимая скорость');
      return { ...state, remainingMs: left, running: isRunningAt(state, now), rate, updatedAt: now };
    }
    case 'set': {
      const remainingMs = Number(command.remainingMs);
      if (!Number.isInteger(remainingMs) || remainingMs < MIN_REMAINING_MS || remainingMs > MAX_SETTABLE_MS) {
        throw new Error('Время должно быть от 1 секунды до 48 минут');
      }
      // Manual time changes always pause playback to prevent surprises on stage.
      return { ...state, remainingMs, running: false, direction: 'down', updatedAt: now };
    }
    case 'reset':
      return initialState(now);
    default:
      throw new Error('Неизвестная команда');
  }
}

export function formatTime(milliseconds, direction = 'down') {
  // Countdowns round up; forward timers round down until a full second passes.
  const bounded = Math.max(MIN_REMAINING_MS, Math.min(MAX_REMAINING_MS, milliseconds));
  const seconds = direction === 'up' ? Math.floor(bounded / 1000) : Math.ceil(bounded / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return [hours, minutes, remainder].map((n) => String(n).padStart(2, '0')).join(':');
}
