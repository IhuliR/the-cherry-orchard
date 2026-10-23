import { createConnection } from './connection.js';
import { createSevenSegment } from './segments.js';
import { formatTime, initialState, remainingAt } from './engine.js';

const digits = createSevenSegment(document.querySelector('#clock'));
const message = document.querySelector('#notice');
let state = initialState();
let connection;
let online = true;
let lastDisplay = '';

function update() {
  const remaining = connection ? remainingAt(state, connection.getNow()) : state.remainingMs;
  const value = formatTime(remaining, state.direction);
  if (lastDisplay !== value) {
    lastDisplay = value;
    digits.set(value);
    document.title = `${value} · Театральные часы`;
  }
  requestAnimationFrame(update);
}
requestAnimationFrame(update);

function notice(text) {
  message.textContent = text;
  message.hidden = !text;
}

try {
  connection = await createConnection();
  if (connection.mode === 'demo') {
    notice('ДЕМО: синхронизация только между вкладками этого браузера');
  }
  connection.subscribe((value) => { state = value; }, (error) => {
    console.error(error);
    notice('Ошибка синхронизации. Проверьте соединение.');
  });
  connection.onConnection((connected) => {
    online = connected;
    if (connection.mode === 'firebase') {
      notice(online ? '' : 'Связь потеряна. Часы продолжают отсчёт.');
    }
  });
} catch (error) {
  console.error(error);
  notice('Не удалось подключиться к базе. Проверьте настройки.');
}

const fullscreen = document.querySelector('#fullscreen');
fullscreen.addEventListener('click', async () => {
  if (document.fullscreenElement) await document.exitFullscreen();
  else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
});
