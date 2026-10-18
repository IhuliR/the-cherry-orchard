import { firebaseConfig } from './config.js';
import { changeState, initialState, normalizedState } from './engine.js';

const STORAGE_KEY = 'theatre-countdown-state-v1';

// Firebase has a persistent shared state. Without credentials, use a harmless
// local demo, which syncs browser tabs ON THE SAME DEVICE only.
function localConnection() {
  const listeners = new Set();
  let current;
  try {
    current = JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    current = null;
  }
  current = normalizedState(current);
  const publish = () => listeners.forEach((listener) => listener(current));
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY && event.newValue) {
      try {
        current = normalizedState(JSON.parse(event.newValue));
        publish();
      } catch {
        // Ignore malformed external storage updates.
      }
    }
  });
  return {
    mode: 'demo',
    getNow: () => Date.now(),
    subscribe: (callback) => {
      listeners.add(callback);
      callback(current);
      return () => listeners.delete(callback);
    },
    onConnection: (callback) => { callback(true); return () => {}; },
    async apply(command) {
      current = changeState(current, command, Date.now());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
      publish();
    },
    auth: null,
  };
}

export async function createConnection() {
  const { apiKey, projectId, databaseURL, appId } = firebaseConfig;
  if (![apiKey, projectId, databaseURL, appId].every(Boolean)) return localConnection();

  const VERSION = '13.0.0';
  const [{ initializeApp }, dbSdk, authSdk] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${VERSION}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${VERSION}/firebase-database.js`),
    import(`https://www.gstatic.com/firebasejs/${VERSION}/firebase-auth.js`),
  ]);
  const app = initializeApp(firebaseConfig);
  const db = dbSdk.getDatabase(app);
  const auth = authSdk.getAuth(app);
  const timerRef = dbSdk.ref(db, 'timer');
  let serverOffset = 0;
  dbSdk.onValue(dbSdk.ref(db, '.info/serverTimeOffset'), (snapshot) => {
    serverOffset = Number(snapshot.val()) || 0;
  });
  const now = () => Date.now() + serverOffset;
  return {
    mode: 'firebase',
    getNow: now,
    subscribe(callback, onError = () => {}) {
      return dbSdk.onValue(timerRef, (snapshot) => {
        callback(normalizedState(snapshot.val(), now()));
      }, onError);
    },
    onConnection(callback) {
      return dbSdk.onValue(dbSdk.ref(db, '.info/connected'), (snapshot) => callback(snapshot.val() === true));
    },
    async apply(command) {
      const result = await dbSdk.runTransaction(timerRef, (value) => {
        return changeState(value, command, now());
      }, { applyLocally: false });
      if (!result.committed) throw new Error('Обновление отменено. Попробуйте снова.');
    },
    auth: {
      subscribe(callback) { return authSdk.onAuthStateChanged(auth, callback); },
      login(email, password) { return authSdk.signInWithEmailAndPassword(auth, email, password); },
      logout() { return authSdk.signOut(auth); },
    },
  };
}
