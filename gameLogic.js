const PENALTY_WORD = 'GHOSTTEARS';
const MAX_PENALTIES = PENALTY_WORD.length;
const TURN_SECONDS = 10;

function normalizeWord(value) {
  return String(value || '').toLowerCase().replace(/[^a-z]/g, '');
}

function buildCountryData(countries) {
  const countrySet = new Set(countries.map(normalizeWord).filter(Boolean));
  const prefixSet = new Set();
  for (const country of countrySet) {
    for (let i = 1; i <= country.length; i += 1) {
      prefixSet.add(country.slice(0, i));
    }
  }
  return { countrySet, prefixSet };
}

function countActivePlayers(state) {
  return state.players.filter((player) => player.isActive).length;
}

function advanceToNextActivePlayer(state) {
  if (!state.players.length) return -1;
  if (!countActivePlayers(state)) return -1;

  do {
    state.currentPlayerIndex = (state.currentPlayerIndex + 1 + state.players.length) % state.players.length;
  } while (state.players[state.currentPlayerIndex] && state.players[state.currentPlayerIndex].isActive === false);

  return state.currentPlayerIndex;
}

function endRoundAndAdvanceTurn(state) {
  state.currentPartial = '';
  state.turnDeadline = null;
  advanceToNextActivePlayer(state);
}

function resolveWinner(state) {
  const activeIndices = state.players
    .map((player, idx) => ({ player, idx }))
    .filter(({ player }) => player.isActive)
    .map(({ idx }) => idx);

  if (state.initialPlayerCount === 2) {
    const eliminated = state.players.some((player) => !player.isActive && player.penaltyIndex >= MAX_PENALTIES);
    if (eliminated) {
      state.status = 'ended';
      state.winnerIndex = activeIndices.length === 1 ? activeIndices[0] : null;
      return true;
    }
  }

  if (state.initialPlayerCount >= 3 && activeIndices.length === 1) {
    state.status = 'ended';
    state.winnerIndex = activeIndices[0];
    return true;
  }

  if (activeIndices.length === 0) {
    state.status = 'ended';
    state.winnerIndex = null;
    return true;
  }

  return false;
}

function applyPenaltyAndEndRound(state, playerIndex, reason, now = Date.now()) {
  const player = state.players[playerIndex];
  if (!player || !player.isActive || state.status !== 'playing') {
    return { type: 'ignored' };
  }

  player.penaltyIndex += 1;
  let eliminatedNow = false;
  if (player.penaltyIndex >= MAX_PENALTIES) {
    player.isActive = false;
    eliminatedNow = true;
  }

  state.lastPenalty = {
    playerIndex,
    reason,
    at: now
  };

  endRoundAndAdvanceTurn(state);
  const ended = resolveWinner(state);

  return {
    type: 'round_end',
    reason,
    eliminatedNow,
    ended,
    playerIndex
  };
}

function submitLetter(state, letterInput, now = Date.now()) {
  if (state.status !== 'playing') return { type: 'ignored' };

  const active = state.players[state.currentPlayerIndex];
  if (!active || !active.isActive) return { type: 'ignored' };

  const letter = String(letterInput || '').toLowerCase();
  if (!/^[a-z]$/.test(letter)) return { type: 'invalid_input' };

  const candidate = `${state.currentPartial}${letter}`;

  if (!state.prefixSet.has(candidate)) {
    return applyPenaltyAndEndRound(state, state.currentPlayerIndex, 'invalid-prefix', now);
  }

  if (state.countrySet.has(candidate)) {
    if (state.usedCountries.has(candidate)) {
      return applyPenaltyAndEndRound(state, state.currentPlayerIndex, 'repeat-country', now);
    }
    state.usedCountries.add(candidate);
    return applyPenaltyAndEndRound(state, state.currentPlayerIndex, 'completion', now);
  }

  state.currentPartial = candidate;
  advanceToNextActivePlayer(state);
  state.turnDeadline = now + TURN_SECONDS * 1000;

  return {
    type: 'continue',
    currentPartial: state.currentPartial,
    currentPlayerIndex: state.currentPlayerIndex,
    turnDeadline: state.turnDeadline
  };
}

function handleTimeout(state, now = Date.now()) {
  if (state.status !== 'playing') return { type: 'ignored' };
  if (!state.currentPartial) return { type: 'ignored' };
  if (!state.turnDeadline || now < state.turnDeadline) return { type: 'ignored' };
  return applyPenaltyAndEndRound(state, state.currentPlayerIndex, 'timeout', now);
}

function createPlayingState(players, countryData) {
  const gamePlayers = players.map((player) => ({
    id: player.id,
    name: player.name,
    penaltyIndex: 0,
    isActive: true
  }));

  const firstActiveIndex = gamePlayers.findIndex((player) => player.isActive);

  return {
    status: 'playing',
    players: gamePlayers,
    initialPlayerCount: gamePlayers.length,
    currentPlayerIndex: firstActiveIndex,
    currentPartial: '',
    usedCountries: new Set(),
    countrySet: countryData.countrySet,
    prefixSet: countryData.prefixSet,
    turnDeadline: null,
    winnerIndex: null,
    lastPenalty: null
  };
}

module.exports = {
  PENALTY_WORD,
  MAX_PENALTIES,
  TURN_SECONDS,
  normalizeWord,
  buildCountryData,
  createPlayingState,
  submitLetter,
  handleTimeout,
  advanceToNextActivePlayer,
  countActivePlayers
};
