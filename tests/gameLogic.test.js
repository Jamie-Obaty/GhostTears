const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildCountryData,
  createPlayingState,
  submitLetter,
  handleTimeout,
  advanceToNextActivePlayer
} = require('../gameLogic');

function createState(names, countries = ['Oman', 'Chile', 'Chad']) {
  const players = names.map((name, idx) => ({ id: `p${idx}`, name }));
  return createPlayingState(players, buildCountryData(countries));
}

test('invalid-prefix gives penalty and ends round', () => {
  const state = createState(['A', 'B']);
  const result = submitLetter(state, 'z', 1000);

  assert.equal(result.type, 'round_end');
  assert.equal(result.reason, 'invalid-prefix');
  assert.equal(state.players[0].penaltyIndex, 1);
  assert.equal(state.currentPartial, '');
  assert.equal(state.currentPlayerIndex, 1);
});

test('repeat-country gives penalty and ends round', () => {
  const state = createState(['A', 'B']);
  state.currentPartial = 'oma';
  state.usedCountries.add('oman');

  const result = submitLetter(state, 'n', 1000);

  assert.equal(result.type, 'round_end');
  assert.equal(result.reason, 'repeat-country');
  assert.equal(state.players[0].penaltyIndex, 1);
  assert.equal(state.currentPartial, '');
  assert.equal(state.currentPlayerIndex, 1);
});

test('completion gives penalty and stores used country', () => {
  const state = createState(['A', 'B']);
  state.currentPartial = 'oma';

  const result = submitLetter(state, 'n', 1000);

  assert.equal(result.type, 'round_end');
  assert.equal(result.reason, 'completion');
  assert.equal(state.players[0].penaltyIndex, 1);
  assert.equal(state.usedCountries.has('oman'), true);
  assert.equal(state.currentPartial, '');
  assert.equal(state.currentPlayerIndex, 1);
});

test('timeout gives penalty and ends round', () => {
  const state = createState(['A', 'B', 'C']);
  state.currentPartial = 'o';
  state.currentPlayerIndex = 1;
  state.turnDeadline = 1000;

  const result = handleTimeout(state, 1000);

  assert.equal(result.type, 'round_end');
  assert.equal(result.reason, 'timeout');
  assert.equal(state.players[1].penaltyIndex, 1);
  assert.equal(state.currentPartial, '');
  assert.equal(state.currentPlayerIndex, 2);
});

test('elimination occurs at penalty index 10', () => {
  const state = createState(['A', 'B']);
  state.players[0].penaltyIndex = 9;
  state.currentPartial = 'oma';

  const result = submitLetter(state, 'n', 1000);

  assert.equal(result.type, 'round_end');
  assert.equal(state.players[0].penaltyIndex, 10);
  assert.equal(state.players[0].isActive, false);
  assert.equal(state.status, 'ended');
  assert.equal(state.winnerIndex, 1);
});

test('strict next-player advancement invariant after round end', () => {
  const state = createState(['A', 'B', 'C']);
  state.currentPlayerIndex = 1;

  const result = submitLetter(state, 'z', 1000);

  assert.equal(result.type, 'round_end');
  assert.equal(state.currentPlayerIndex, 2);
  assert.notEqual(state.currentPlayerIndex, 1);
});

test('last-man-standing victory for 3+ players', () => {
  const state = createState(['A', 'B', 'C']);
  state.players[1].isActive = false;
  state.players[1].penaltyIndex = 10;
  state.players[0].penaltyIndex = 9;
  state.currentPlayerIndex = 0;
  state.currentPartial = 'oma';

  const result = submitLetter(state, 'n', 1000);

  assert.equal(result.type, 'round_end');
  assert.equal(state.players[0].isActive, false);
  assert.equal(state.status, 'ended');
  assert.equal(state.winnerIndex, 2);
});

test('advanceToNextActivePlayer wraps and skips inactive', () => {
  const state = createState(['A', 'B', 'C', 'D']);
  state.players[1].isActive = false;
  state.players[2].isActive = false;
  state.currentPlayerIndex = 0;

  const idx = advanceToNextActivePlayer(state);

  assert.equal(idx, 3);
  assert.equal(state.currentPlayerIndex, 3);
});
