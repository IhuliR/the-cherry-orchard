import { createConnection } from './connection.js';
import { createSevenSegment } from './segments.js';
import { formatTime, initialState, isRunningAt, MAX_REMAINING_MS, MAX_SETTABLE_MS, MIN_REMAINING_MS, remainingAt } from './engine.js';

const el = (id) => document.getElementById(id);
const digits = createSevenSegment(el('preview-clock'));
const feedback = el('feedback');
let state = initialState();
let connection;
let authorized = false;
let connected = false;
let busy = false;

function showFeedback(text, isError = false) {
  feedback.textContent = text;
  feedback.classList.toggle('error', isError);
}

function updateButtons() {
  const canEdit = authorized && connected && !busy;
  const now = connection ? connection.getNow() : Date.now();
  const running = isRunningAt(state, now);
  for (const button of document.querySelectorAll('[data-command], #set-time')) {
    button.disabled = !canEdit;
  }
  el('forward').hidden = remainingAt(state, now) !== MIN_REMAINING_MS || running;
  el('toggle').textContent = running ? '⏸ Пауза' : '▶ Запустить';
  for (const button of document.querySelectorAll('[data-speed]')) {
    const selected = Number(button.dataset.speed) === state.rate;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  }
}

function render() {
  const now = connection ? connection.getNow() : Date.now();
  const remaining = remainingAt(state, now);
  const running = isRunningAt(state, now);
  const value = formatTime(remaining, state.direction);
  digits.set(value);
  el('text-time').textContent = value;
  el('speed-label').textContent = `Скорость: ${state.rate}×`;
  if (running) {
    el('play-status').textContent = state.direction === 'up' ? 'Идёт прямой отсчёт' : 'Идёт обратный отсчёт';
  } else if (remaining <= MIN_REMAINING_MS) {
    el('play-status').textContent = 'Обратный отсчёт завершён';
  } else if (remaining >= MAX_REMAINING_MS) {
    el('play-status').textContent = 'Достигнут предел 99:59:59';
  } else {
    el('play-status').textContent = state.direction === 'up' ? 'На паузе · вперёд' : 'На паузе · назад';
  }
  el('toggle').textContent = running ? '⏸ Пауза' : '▶ Запустить';
  el('forward').hidden = remaining !== MIN_REMAINING_MS || running;
  requestAnimationFrame(render);
}
requestAnimationFrame(render);

async function command(action) {
  if (!authorized || !connected || busy) return;
  busy = true;
  updateButtons();
  try {
    await connection.apply(action);
    showFeedback('Изменение отправлено');
  } catch (error) {
    console.error(error);
    showFeedback(error?.message || 'Не удалось обновить таймер', true);
  } finally {
    busy = false;
    updateButtons();
  }
}

el('toggle').addEventListener('click', () => {
  const now = connection ? connection.getNow() : Date.now();
  command({ type: isRunningAt(state, now) ? 'pause' : 'play' });
});
el('forward').addEventListener('click', () => command({ type: 'forward' }));
el('reset').addEventListener('click', () => {
  if (confirm('Вернуть 00:46:00 и поставить часы на паузу?')) command({ type: 'reset' });
});
for (const button of document.querySelectorAll('[data-speed]')) {
  button.addEventListener('click', () => command({ type: 'speed', rate: Number(button.dataset.speed) }));
}
el('set-time').addEventListener('click', () => {
  const minutes = Number(el('minutes').value);
  const seconds = Number(el('seconds').value);
  const remainingMs = (minutes * 60 + seconds) * 1000;
  if (!Number.isInteger(minutes) || !Number.isInteger(seconds) || minutes < 0 || seconds < 0 || seconds > 59 || remainingMs < MIN_REMAINING_MS || remainingMs > MAX_SETTABLE_MS) {
    showFeedback('Укажи время от 00:01 до 48:00', true);
    return;
  }
  command({ type: 'set', remainingMs });
});

try {
  connection = await createConnection();
  el('mode').textContent = connection.mode === 'demo' ? 'ДЕМО · только на одном устройстве' : 'Firebase · онлайн';
  el('demo-banner').hidden = connection.mode !== 'demo';
  connection.subscribe((value) => {
    state = value;
    updateButtons();
  }, (error) => showFeedback(`Ошибка чтения таймера: ${error.message}`, true));
  connection.onConnection((value) => {
    connected = value;
    el('connection-status').textContent = value ? '● На связи' : '● Нет соединения';
    el('connection-status').classList.toggle('disconnected', !value);
    updateButtons();
  });

  if (connection.mode === 'demo') {
    authorized = true;
    el('logout').hidden = true;
    el('auth-panel').hidden = true;
    el('controls').hidden = false;
    updateButtons();
  } else {
    connection.auth.subscribe((user) => {
      authorized = Boolean(user);
      el('auth-panel').hidden = authorized;
      el('controls').hidden = !authorized;
      if (authorized) showFeedback('Вход выполнен');
      updateButtons();
    });
    el('login').addEventListener('submit', async (event) => {
      event.preventDefault();
      el('login-submit').disabled = true;
      try {
        await connection.auth.login(el('email').value.trim(), el('password').value);
        el('password').value = '';
        showFeedback('Вход выполнен');
      } catch (error) {
        console.error(error);
        showFeedback('Не удалось войти. Проверьте email и пароль.', true);
      } finally {
        el('login-submit').disabled = false;
      }
    });
    el('logout').addEventListener('click', () => connection.auth.logout());
  }
} catch (error) {
  console.error(error);
  showFeedback(`Не удалось подключиться: ${error.message}`, true);
}
