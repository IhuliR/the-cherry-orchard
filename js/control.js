import { createConnection } from './connection.js';
import { createSevenSegment } from './segments.js';
import { DURATION_MS, formatTime, initialState, remainingAt, RATES } from './engine.js';

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
  for (const button of document.querySelectorAll('[data-command], #set-time')) {
    button.disabled = !canEdit;
  }
  el('toggle').textContent = state.running ? '⏸ Пауза' : '▶ Запустить';
  for (const button of document.querySelectorAll('[data-speed]')) {
    const selected = Number(button.dataset.speed) === state.rate;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  }
}

function render() {
  const remaining = connection ? remainingAt(state, connection.getNow()) : state.remainingMs;
  const value = formatTime(remaining);
  digits.set(value);
  el('text-time').textContent = value;
  el('speed-label').textContent = `Скорость: ${state.rate}×`;
  el('play-status').textContent = state.running && remaining > 0 ? 'Идёт отсчёт' : (remaining <= 0 ? 'Время вышло' : 'На паузе');
  if (state.running && remaining <= 0) el('toggle').textContent = '▶ Запустить';
  else el('toggle').textContent = state.running ? '⏸ Пауза' : '▶ Запустить';
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

el('toggle').addEventListener('click', () => command({ type: state.running ? 'pause' : 'play' }));
el('reset').addEventListener('click', () => {
  if (confirm('Вернуть 00:48:00 и поставить часы на паузу?')) command({ type: 'reset' });
});
for (const button of document.querySelectorAll('[data-speed]')) {
  button.addEventListener('click', () => command({ type: 'speed', rate: Number(button.dataset.speed) }));
}
el('set-time').addEventListener('click', () => {
  const minutes = Number(el('minutes').value);
  const seconds = Number(el('seconds').value);
  if (!Number.isInteger(minutes) || !Number.isInteger(seconds) || minutes < 0 || seconds < 0 || seconds > 59 || (minutes * 60 + seconds) * 1000 > DURATION_MS) {
    showFeedback('Укажи время от 00:00 до 48:00', true);
    return;
  }
  command({ type: 'set', remainingMs: (minutes * 60 + seconds) * 1000 });
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
