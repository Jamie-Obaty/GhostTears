const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

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
const PENALTY_WORD = 'GHOSTTEARS';
const MAX_PENALTIES = PENALTY_WORD.length;
const TURN_SECONDS = 10;

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

const sanitize = (value) => value.toLowerCase().replace(/[^a-z]/g, '');
const countrySet = new Set(countries.map(sanitize));
const prefixSet = new Set();
for (const country of countrySet) {
  for (let i = 1; i <= country.length; i += 1) {
    prefixSet.add(country.slice(0, i));
  }
}

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
      currentString: '',
      usedCountries: [],
      activePlayerId: null,
      winnerId: null,
      message: 'Waiting for players.',
      turnDeadline: null,
      pausedRemaining: null,
      lastPenalty: null,
      tickHandle: null
    });
  }
  return rooms.get(code);
}

function activePlayers(room) {
  return room.players.filter((player) => !player.eliminated);
}

function findPlayer(room, socketId) {
  return room.players.find((player) => player.id === socketId) || null;
}

function nextActivePlayerId(room, afterId) {
  const alive = activePlayers(room);
  if (!alive.length) return null;
  const order = room.players.filter((player) => !player.eliminated).map((player) => player.id);
  if (!order.length) return null;
  const idx = Math.max(0, order.indexOf(afterId));
  for (let i = 1; i <= order.length; i += 1) {
    const candidate = order[(idx + i) % order.length];
    if (room.players.find((player) => player.id === candidate && !player.eliminated)) {
      return candidate;
    }
  }
  return order[0];
}

function visibleState(room) {
  const now = Date.now();
  const timer = room.turnDeadline ? Math.max(0, Math.ceil((room.turnDeadline - now) / 1000)) : 0;
  return {
    code: room.code,
    hostId: room.hostId,
    status: room.status,
    players: room.players,
    currentString: room.currentString.toUpperCase(),
    activePlayerId: room.activePlayerId,
    winnerId: room.winnerId,
    message: room.message,
    timer,
    penaltyWord: PENALTY_WORD,
    maxPenalties: MAX_PENALTIES,
    lastPenalty: room.lastPenalty
  };
}

function emitRoom(room) {
  io.to(room.code).emit('state', visibleState(room));
}

function stopTicker(room) {
  if (room.tickHandle) {
    clearInterval(room.tickHandle);
    room.tickHandle = null;
  }
}

function startTicker(room) {
  if (room.tickHandle) return;
  room.tickHandle = setInterval(() => {
    if (room.status !== 'playing') return;
    if (!room.turnDeadline) return;
    if (Date.now() >= room.turnDeadline) {
      applyPenalty(room, room.activePlayerId, 'Timeout!');
      emitRoom(room);
    } else {
      emitRoom(room);
    }
  }, 500);
}

function checkForWinner(room) {
  const alive = activePlayers(room);
  if (alive.length <= 1) {
    room.status = 'ended';
    room.winnerId = alive[0] ? alive[0].id : null;
    room.turnDeadline = null;
    if (room.winnerId) {
      const winner = room.players.find((p) => p.id === room.winnerId);
      room.message = `${winner.name} wins!`;
    } else {
      room.message = 'Game ended.';
    }
    return true;
  }
  return false;
}

function resetRound(room, penalizedId) {
  room.currentString = '';
  room.turnDeadline = null;
  room.pausedRemaining = null;
  room.activePlayerId = nextActivePlayerId(room, penalizedId || room.activePlayerId);
}

function applyPenalty(room, playerId, reason) {
  const player = room.players.find((p) => p.id === playerId);
  if (!player || player.eliminated || room.status !== 'playing') return;
  player.penalties += 1;
  room.lastPenalty = { playerId, at: Date.now(), reason };

  if (player.penalties >= MAX_PENALTIES) {
    player.eliminated = true;
    room.message = `${player.name} is eliminated. ${reason}`;
  } else {
    room.message = `${player.name} takes '${PENALTY_WORD[player.penalties - 1]}'. ${reason}`;
  }

  if (!checkForWinner(room)) {
    resetRound(room, playerId);
    if (room.activePlayerId) {
      const next = room.players.find((p) => p.id === room.activePlayerId);
      room.message += ` ${next ? `${next.name}'s turn.` : ''}`;
    }
  }
}

function startGame(room, requesterId) {
  if (room.hostId !== requesterId) return;
  if (room.players.length < 2) return;
  room.status = 'playing';
  room.currentString = '';
  room.usedCountries = [];
  room.winnerId = null;
  room.turnDeadline = null;
  room.pausedRemaining = null;
  room.lastPenalty = null;
  for (const player of room.players) {
    player.penalties = 0;
    player.eliminated = false;
  }
  room.activePlayerId = room.players[0].id;
  room.message = `${room.players[0].name}'s turn. Type a letter (A-Z).`;
  startTicker(room);
}

function handleLetter(room, socketId, letter) {
  if (room.status !== 'playing') return;
  if (room.activePlayerId !== socketId) return;
  if (!/^[a-z]$/i.test(letter)) return;

  const candidate = `${room.currentString}${letter.toLowerCase()}`;

  if (!prefixSet.has(candidate)) {
    applyPenalty(room, socketId, 'Invalid prefix.');
    return;
  }

  if (countrySet.has(candidate)) {
    if (room.usedCountries.includes(candidate)) {
      applyPenalty(room, socketId, 'Repeated country.');
      return;
    }
    room.usedCountries.push(candidate);
    applyPenalty(room, socketId, 'Country completed.');
    return;
  }

  room.currentString = candidate;
  room.turnDeadline = Date.now() + TURN_SECONDS * 1000;
  room.pausedRemaining = null;
  const nextId = nextActivePlayerId(room, socketId);
  room.activePlayerId = nextId;
  const next = room.players.find((p) => p.id === nextId);
  room.message = `${next ? next.name : 'Next player'}'s turn.`;
}

function togglePause(room, requesterId) {
  if (room.hostId !== requesterId) return;
  if (room.status === 'playing') {
    room.status = 'paused';
    room.pausedRemaining = room.turnDeadline ? Math.max(0, Math.ceil((room.turnDeadline - Date.now()) / 1000)) : 0;
    room.turnDeadline = null;
    room.message = 'Game paused.';
  } else if (room.status === 'paused') {
    room.status = 'playing';
    if (room.currentString && room.pausedRemaining > 0) {
      room.turnDeadline = Date.now() + room.pausedRemaining * 1000;
    } else {
      room.turnDeadline = null;
    }
    room.message = 'Game resumed.';
  }
}

function removePlayerFromRoom(room, socketId) {
  const idx = room.players.findIndex((player) => player.id === socketId);
  if (idx === -1) return;

  const removed = room.players[idx];
  room.players.splice(idx, 1);

  if (room.hostId === socketId) {
    room.hostId = room.players[0] ? room.players[0].id : null;
  }

  if (!room.players.length) {
    stopTicker(room);
    rooms.delete(room.code);
    return;
  }

  if (room.activePlayerId === socketId) {
    room.activePlayerId = nextActivePlayerId(room, socketId);
  }

  if (room.status === 'playing' || room.status === 'paused') {
    checkForWinner(room);
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

    socket.join(code);
    socket.data.roomCode = code;

    room.players.push({
      id: socket.id,
      name: normalizedName,
      penalties: 0,
      eliminated: false
    });

    if (!room.hostId) room.hostId = socket.id;
    room.message = `${normalizedName} joined room ${code}.`;

    startTicker(room);
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
    handleLetter(room, socket.id, String(letter || '').slice(0, 1));
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
    room.status = 'lobby';
    room.currentString = '';
    room.turnDeadline = null;
    room.pausedRemaining = null;
    room.winnerId = null;
    room.usedCountries = [];
    room.lastPenalty = null;
    room.message = 'Lobby reset. Host can start again.';
    for (const p of room.players) {
      p.penalties = 0;
      p.eliminated = false;
    }
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
