const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const {
  PENALTY_WORD,
  MAX_PENALTIES,
  TURN_SECONDS,
  buildCountryData,
  createPlayingState,
  submitLetter,
  handleTimeout,
  countActivePlayers
} = require('./gameLogic');

const app = express();
const server = http.createServer(app);
const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

const countries = [
  'Afghanistan','Albania','Algeria','Andorra','Angola','Antigua and Barbuda','Argentina','Armenia','Australia','Austria',
  'Azerbaijan','Bahamas','Bahrain','Bangladesh','Barbados','Belarus','Belgium','Belize','Benin','Bhutan','Bolivia',
  'Bosnia and Herzegovina','Botswana','Brazil','Brunei','Bulgaria','Burkina Faso','Burundi','Cabo Verde','Cambodia',
  'Cameroon','Canada','Central African Republic','Chad','Chile','China','Colombia','Comoros','Congo','Costa Rica',
  "Cote d'Ivoire",'Croatia','Cuba','Cyprus','Czechia','Democratic Republic of the Congo','Denmark','Djibouti','Dominica',
  'Dominican Republic','Ecuador','Egypt','El Salvador','Equatorial Guinea','Eritrea','Estonia','Eswatini','Ethiopia','Fiji',
  'Finland','France','Gabon','Gambia','Georgia','Germany','Ghana','Greece','Grenada','Guatemala','Guinea','Guinea-Bissau',
  'Guyana','Haiti','Honduras','Hungary','Iceland','India','Indonesia','Iran','Iraq','Ireland','Israel','Italy','Jamaica',
  'Japan','Jordan','Kazakhstan','Kenya','Kiribati','Kuwait','Kyrgyzstan','Laos','Latvia','Lebanon','Lesotho','Liberia',
  'Libya','Liechtenstein','Lithuania','Luxembourg','Madagascar','Malawi','Malaysia','Maldives','Mali','Malta','Marshall Islands',
  'Mauritania','Mauritius','Mexico','Micronesia','Moldova','Monaco','Mongolia','Montenegro','Morocco','Mozambique','Myanmar',
  'Namibia','Nauru','Nepal','Netherlands','New Zealand','Nicaragua','Niger','Nigeria','North Korea','North Macedonia','Norway',
  'Oman','Pakistan','Palau','Panama','Papua New Guinea','Paraguay','Peru','Philippines','Poland','Portugal','Qatar','Romania',
  'Russia','Rwanda','Saint Kitts and Nevis','Saint Lucia','Saint Vincent and the Grenadines','Samoa','San Marino','Sao Tome and Principe',
  'Saudi Arabia','Senegal','Serbia','Seychelles','Sierra Leone','Singapore','Slovakia','Slovenia','Solomon Islands','Somalia','South Africa',
  'South Korea','South Sudan','Spain','Sri Lanka','Sudan','Suriname','Sweden','Switzerland','Syria','Tajikistan','Tanzania','Thailand',
  'Timor-Leste','Togo','Tonga','Trinidad and Tobago','Tunisia','Turkey','Turkmenistan','Tuvalu','Uganda','Ukraine','United Arab Emirates',
  'United Kingdom','United States','Uruguay','Uzbekistan','Vanuatu','Vatican City','Venezuela','Vietnam','Yemen','Zambia','Zimbabwe'
];

const countryData = buildCountryData(countries);
const rooms = new Map();

function randomRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
}

function getRoom(code) {
  if (!rooms.has(code)) {
    rooms.set(code, {
      code,
      hostId: null,
      status: 'lobby',
      players: [],
      game: null,
      winnerId: null,
      message: 'Waiting for players.',
      pausedRemainingMs: null,
      ticker: null
    });
  }
  return rooms.get(code);
}

function currentPlayer(room) {
  if (!room.game) return null;
  return room.game.players[room.game.currentPlayerIndex] || null;
}

function currentPlayerId(room) {
  const player = currentPlayer(room);
  return player && player.isActive ? player.id : null;
}

function getTimerSeconds(room) {
  if (room.status !== 'playing' || !room.game || !room.game.turnDeadline) return 0;
  return Math.max(0, Math.ceil((room.game.turnDeadline - Date.now()) / 1000));
}

function roomPlayersForView(room) {
  if (room.game) {
    return room.game.players.map((player) => ({
      id: player.id,
      name: player.name,
      penaltyIndex: player.penaltyIndex,
      isActive: player.isActive
    }));
  }
  return room.players.map((player) => ({
    id: player.id,
    name: player.name,
    penaltyIndex: player.penaltyIndex || 0,
    isActive: player.isActive !== false
  }));
}

function visibleState(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    status: room.status,
    players: roomPlayersForView(room),
    initialPlayerCount: room.game ? room.game.initialPlayerCount : room.players.length,
    currentPlayerIndex: room.game ? room.game.currentPlayerIndex : -1,
    activePlayerId: currentPlayerId(room),
    currentPartial: room.game ? room.game.currentPartial.toUpperCase() : '',
    winnerId: room.winnerId,
    message: room.message,
    timer: getTimerSeconds(room),
    timerActive: room.status === 'playing' && Boolean(room.game && room.game.currentPartial),
    penaltyWord: PENALTY_WORD,
    maxPenalties: MAX_PENALTIES,
    lastPenalty: room.game ? room.game.lastPenalty : null
  };
}

function emitRoom(room) {
  io.to(room.code).emit('state', visibleState(room));
}

function stopTicker(room) {
  if (room.ticker) {
    clearInterval(room.ticker);
    room.ticker = null;
  }
}

function ensureTicker(room) {
  if (room.ticker) return;
  room.ticker = setInterval(() => {
    if (room.status !== 'playing' || !room.game) return;

    const result = handleTimeout(room.game, Date.now());
    if (result.type === 'round_end') {
      applyGameResult(room, result);
      emitRoom(room);
      return;
    }

    if (room.game.currentPartial) {
      emitRoom(room);
    }
  }, 250);
}

function winnerFromGame(room) {
  if (!room.game || room.game.winnerIndex == null) return null;
  return room.game.players[room.game.winnerIndex] || null;
}

function reasonText(reason) {
  if (reason === 'timeout') return 'Timeout';
  if (reason === 'repeat-country') return 'Repeat country';
  if (reason === 'completion') return 'Country completed';
  return 'Invalid prefix';
}

function applyGameResult(room, result) {
  if (!room.game) return;

  if (result.type === 'continue') {
    const active = currentPlayer(room);
    room.message = active ? `${active.name}'s turn.` : 'Next turn.';
    return;
  }

  if (result.type !== 'round_end') return;

  const penalized = room.game.players[result.playerIndex];
  const letter = PENALTY_WORD[Math.max(0, penalized.penaltyIndex - 1)] || '';
  const base = `${penalized.name} takes ${letter ? `'${letter}'` : 'a penalty'} (${reasonText(result.reason)}).`;

  if (room.game.status === 'ended') {
    room.status = 'ended';
    const winner = winnerFromGame(room);
    room.winnerId = winner ? winner.id : null;
    room.message = winner ? `${base} ${winner.name} wins.` : `${base} Game over.`;
    return;
  }

  room.status = 'playing';
  room.winnerId = null;
  const next = currentPlayer(room);
  room.message = `${base} ${next ? `${next.name}'s turn.` : ''}`.trim();
}

function startGame(room, requesterId) {
  if (room.hostId !== requesterId) return;
  if (room.players.length < 2 || room.players.length > 8) return;

  room.game = createPlayingState(room.players, countryData);
  room.status = 'playing';
  room.winnerId = null;
  room.pausedRemainingMs = null;
  const active = currentPlayer(room);
  room.message = active ? `${active.name}'s turn. Enter one letter (A-Z).` : 'Game started.';
  ensureTicker(room);
}

function onLetter(room, socketId, letter) {
  if (room.status !== 'playing' || !room.game) return;

  const active = currentPlayer(room);
  if (!active || active.id !== socketId) return;

  const result = submitLetter(room.game, String(letter || '').slice(0, 1), Date.now());
  applyGameResult(room, result);
}

function togglePause(room, requesterId) {
  if (room.hostId !== requesterId || !room.game) return;

  if (room.status === 'playing') {
    room.status = 'paused';
    room.pausedRemainingMs = room.game.turnDeadline ? Math.max(0, room.game.turnDeadline - Date.now()) : null;
    room.game.turnDeadline = null;
    room.message = 'Game paused.';
    return;
  }

  if (room.status === 'paused') {
    room.status = 'playing';
    if (room.game.currentPartial && room.pausedRemainingMs != null) {
      room.game.turnDeadline = Date.now() + Math.max(1, room.pausedRemainingMs);
    }
    room.pausedRemainingMs = null;
    room.message = 'Game resumed.';
  }
}

function moveToLobby(room) {
  room.status = 'lobby';
  room.winnerId = null;
  room.pausedRemainingMs = null;
  room.game = null;
  room.players = room.players.map((player) => ({
    id: player.id,
    name: player.name,
    penaltyIndex: 0,
    isActive: true
  }));
  room.message = 'Lobby reset. Host can start again.';
}

function removePlayerFromRoom(room, socketId) {
  const idx = room.players.findIndex((player) => player.id === socketId);
  if (idx === -1) return;

  const [removed] = room.players.splice(idx, 1);

  if (room.hostId === socketId) {
    room.hostId = room.players[0] ? room.players[0].id : null;
  }

  if (room.game) {
    const gameIdx = room.game.players.findIndex((player) => player.id === socketId);
    if (gameIdx !== -1) {
      room.game.players.splice(gameIdx, 1);
      room.game.initialPlayerCount = Math.min(room.game.initialPlayerCount, room.game.players.length);

      if (room.game.players.length) {
        if (room.game.currentPlayerIndex >= room.game.players.length) {
          room.game.currentPlayerIndex = 0;
        }
        if (!room.game.players[room.game.currentPlayerIndex].isActive) {
          for (let i = 0; i < room.game.players.length; i += 1) {
            const probe = (room.game.currentPlayerIndex + i) % room.game.players.length;
            if (room.game.players[probe].isActive) {
              room.game.currentPlayerIndex = probe;
              break;
            }
          }
        }
      }

      if (countActivePlayers(room.game) <= 1) {
        room.status = 'ended';
        const winner = room.game.players.find((player) => player.isActive) || null;
        room.winnerId = winner ? winner.id : null;
      }
    }
  }

  if (!room.players.length) {
    stopTicker(room);
    rooms.delete(room.code);
    return;
  }

  if (room.status !== 'ended') {
    room.message = `${removed.name} left the room.`;
  }
}

io.on('connection', (socket) => {
  socket.on('join', ({ roomCode, name }) => {
    const normalizedName = String(name || '').trim().slice(0, 24) || 'Player';
    const code = (String(roomCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || randomRoomCode());
    const room = getRoom(code);

    if (room.players.some((p) => p.id === socket.id)) return;
    if (room.status !== 'lobby') {
      socket.emit('joinError', 'Room already in progress. Wait for lobby reset.');
      return;
    }
    if (room.players.length >= 8) {
      socket.emit('joinError', 'Room is full (max 8 players).');
      return;
    }

    socket.join(code);
    socket.data.roomCode = code;

    room.players.push({
      id: socket.id,
      name: normalizedName,
      penaltyIndex: 0,
      isActive: true
    });

    if (!room.hostId) room.hostId = socket.id;
    room.message = `${normalizedName} joined room ${code}.`;

    ensureTicker(room);
    emitRoom(room);
  });

  socket.on('start', () => {
    const code = socket.data.roomCode;
    if (!code || !rooms.has(code)) return;
    const room = rooms.get(code);
    startGame(room, socket.id);
    emitRoom(room);
  });

  socket.on('letter', ({ letter }) => {
    const code = socket.data.roomCode;
    if (!code || !rooms.has(code)) return;
    const room = rooms.get(code);
    onLetter(room, socket.id, letter);
    emitRoom(room);
  });

  socket.on('togglePause', () => {
    const code = socket.data.roomCode;
    if (!code || !rooms.has(code)) return;
    const room = rooms.get(code);
    togglePause(room, socket.id);
    emitRoom(room);
  });

  socket.on('restart', () => {
    const code = socket.data.roomCode;
    if (!code || !rooms.has(code)) return;
    const room = rooms.get(code);
    if (room.hostId !== socket.id) return;
    moveToLobby(room);
    emitRoom(room);
  });

  socket.on('disconnect', () => {
    const code = socket.data.roomCode;
    if (!code || !rooms.has(code)) return;
    const room = rooms.get(code);
    removePlayerFromRoom(room, socket.id);
    if (rooms.has(code)) emitRoom(room);
  });
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (_, res) => {
  res.json({ ok: true });
});

server.listen(PORT, () => {
  console.log(`GHOSTTEARS running on http://localhost:${PORT}`);
});
