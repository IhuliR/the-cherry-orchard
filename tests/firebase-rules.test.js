import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Firebase rules accept synchronized direction and the forward timer limit', async () => {
  const contents = await readFile(new URL('../database.rules.json', import.meta.url), 'utf8');
  const timerRules = JSON.parse(contents).rules.timer;

  assert.match(timerRules['.validate'], /direction/);
  assert.match(timerRules.direction['.validate'], /'down'/);
  assert.match(timerRules.direction['.validate'], /'up'/);
  assert.match(timerRules.remainingMs['.validate'], />= 1000/);
  assert.match(timerRules.remainingMs['.validate'], /<= 359999000/);
  assert.equal(timerRules.$other['.validate'], false);
});
