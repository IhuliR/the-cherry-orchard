/** Pure countdown state: every state change preserves elapsed time. */
export const DURATION_MS = 48 * 60 * 1000;
export const MIN_REMAINING_MS = 1000;
export const RATES = [0.25, 0.5, 1, 1.5, 2, 4];

export function initialState(now = Date.now()) {
  return { remainingMs: DURATION_MS, running: false, rate: 1, updatedAt: now };
}

export function normalizedState(value, now = Date.now()) {
  if (!value || typeof value !== 'object') return initialState(now);
  const remainingMs = Number(value.remainingMs);
  const rate = Number(value.rate);
  const updatedAt = Number(value.updatedAt);
  if (!Number.isFinite(remainingMs) || !Number.isFinite(rate) ||
      !Number.isFinite(updatedAt) || typeof value.running !== 'boolean' ||
      rate <= 0 || rate > 4) return initialState(now);
  const normalizedRemaining = Math.max(MIN_REMAINING_MS, Math.min(DURATION_MS, remainingMs));
  return {
    remainingMs: normalizedRemaining,
    // Old persisted states can contain zero together with running: true.
    running: value.running && normalizedRemaining > MIN_REMAINING_MS,
    rate,
    updatedAt,
  };
}

export function remainingAt(state, now) {
  if (!state.running) return Math.max(MIN_REMAINING_MS, state.remainingMs);
  const elapsed = Math.max(0, now - state.updatedAt);
  return Math.max(MIN_REMAINING_MS, state.remainingMs - elapsed * state.rate);
}

export function isRunningAt(state, now) {
  return state.running && remainingAt(state, now) > MIN_REMAINING_MS;
}

export function changeState(previous, command, now) {
  const state = normalizedState(previous, now);
  const left = remainingAt(state, now);
  switch (command.type) {
    case 'play':
      return { remainingMs: left, running: left > MIN_REMAINING_MS, rate: state.rate, updatedAt: now };
    case 'pause':
      return { remainingMs: left, running: false, rate: state.rate, updatedAt: now };
    case 'toggle':
      return { remainingMs: left, running: !isRunningAt(state, now) && left > MIN_REMAINING_MS, rate: state.rate, updatedAt: now };
    case 'speed': {
      const rate = Number(command.rate);
      if (!RATES.includes(rate)) throw new Error('Недопустимая скорость');
      return { remainingMs: left, running: isRunningAt(state, now), rate, updatedAt: now };
    }
    case 'set': {
      const remainingMs = Number(command.remainingMs);
      if (!Number.isInteger(remainingMs) || remainingMs < MIN_REMAINING_MS || remainingMs > DURATION_MS) {
        throw new Error('Время должно быть от 1 секунды до 48 минут');
      }
      // Manual time changes always pause playback to prevent surprises on stage.
      return { remainingMs, running: false, rate: state.rate, updatedAt: now };
    }
    case 'reset':
      return initialState(now);
    default:
      throw new Error('Неизвестная команда');
  }
}

export function formatTime(milliseconds) {
  // Round UP so the first visible second is 00:48:00, not 00:47:59.
  const seconds = Math.ceil(Math.max(MIN_REMAINING_MS, milliseconds) / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return [hours, minutes, remainder].map((n) => String(n).padStart(2, '0')).join(':');
}
