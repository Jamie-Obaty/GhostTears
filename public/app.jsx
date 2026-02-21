const { useEffect, useMemo, useRef, useState } = React;

const PENALTY_WORD = 'GHOSTTEARS';
const SOCKET_SERVER_URL = window.location.hostname === 'localhost'
  ? window.location.origin
  : 'https://ghosttears-bxoh.onrender.com';

const styles = `
:root { color-scheme: dark; }
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
  background: radial-gradient(circle at 20% 10%, #14213d 0%, #080b14 50%, #04060d 100%);
  min-height: 100vh;
  color: #eef4ff;
}
.ghost-panel {
  background: linear-gradient(150deg, rgba(22, 34, 56, 0.82), rgba(8, 13, 24, 0.85));
  border: 1px solid rgba(153, 173, 214, 0.25);
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.45), inset 0 0 0 1px rgba(214, 227, 255, 0.05);
  backdrop-filter: blur(10px);
}
.overlay {
  background: rgba(6, 8, 14, 0.7);
  backdrop-filter: blur(8px);
}
.timer-danger {
  color: #ff6b6b;
  text-shadow: 0 0 14px rgba(255, 107, 107, 0.8);
}
`;

function cn(...parts) {
  return parts.filter(Boolean).join(' ');
}

function PenaltyGrid({ players }) {
  const letters = PENALTY_WORD.split('');

  return (
    <div className="ghost-panel rounded-3xl border overflow-auto">
      <table className="w-full border-collapse min-w-[540px]">
        <thead>
          <tr className="border-b border-slate-600/45">
            <th className="text-left p-3 text-xs tracking-[0.26em] text-slate-300">WORD</th>
            {players.map((player) => (
              <th
                key={player.id}
                className={cn(
                  'text-left p-3 text-sm border-l border-slate-700/50',
                  !player.isActive && 'text-red-300 line-through'
                )}
              >
                {player.name}
                {!player.isActive && ' (OUT)'}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {letters.map((letter, rowIdx) => (
            <tr key={`${letter}-${rowIdx}`} className="border-b border-slate-800/70 last:border-b-0">
              <td className="p-3 font-black text-center text-slate-200">{letter}</td>
              {players.map((player) => {
                const hit = player.penaltyIndex > rowIdx;
                return (
                  <td key={`${player.id}-${rowIdx}`} className="p-2 border-l border-slate-800/70">
                    <div
                      className={cn(
                        'h-8 rounded-md border flex items-center justify-center text-xs font-bold',
                        hit
                          ? 'bg-red-600/70 border-red-300 text-red-100'
                          : 'bg-slate-800/60 border-slate-700/70 text-slate-500'
                      )}
                    >
                      {hit ? letter : ''}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function App() {
  const socketRef = useRef(null);
  const [socketId, setSocketId] = useState('');
  const [connected, setConnected] = useState(false);
  const [roomState, setRoomState] = useState(null);
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [joined, setJoined] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const socket = io(SOCKET_SERVER_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      setSocketId(socket.id);
      setConnected(true);
      setErrorMessage('');
    });

    socket.on('disconnect', () => setConnected(false));
    socket.on('joinError', (msg) => setErrorMessage(String(msg || 'Unable to join room.')));
    socket.on('state', (next) => {
      setRoomState(next);
      setJoined(true);
      setErrorMessage('');
    });

    return () => socket.disconnect();
  }, []);

  useEffect(() => {
    const keyHandler = (event) => {
      if (!roomState || roomState.status !== 'playing') return;
      if (roomState.activePlayerId !== socketId) return;
      if (event.target && ['INPUT', 'TEXTAREA'].includes(event.target.tagName)) return;
      if (/^[a-z]$/i.test(event.key)) {
        socketRef.current.emit('letter', { letter: event.key.toUpperCase() });
      }
    };

    window.addEventListener('keydown', keyHandler);
    return () => window.removeEventListener('keydown', keyHandler);
  }, [roomState, socketId]);

  const me = useMemo(
    () => roomState?.players?.find((player) => player.id === socketId) || null,
    [roomState, socketId]
  );

  const joinGame = (event) => {
    event.preventDefault();
    const cleanedName = name.trim().slice(0, 24) || 'Player';
    const cleanedRoom = roomCode.trim().toUpperCase();
    socketRef.current.emit('join', { name: cleanedName, roomCode: cleanedRoom });
  };

  const emit = (event, payload = {}) => {
    if (!socketRef.current) return;
    socketRef.current.emit(event, payload);
  };

  const isMyTurn = roomState?.activePlayerId === socketId;
  const isHost = roomState?.hostId === socketId;
  const activePlayer = roomState?.players?.[roomState?.currentPlayerIndex] || null;

  return (
    <div className="min-h-screen text-slate-100 px-3 py-5 md:p-6">
      <style>{styles}</style>
      <div className="max-w-6xl mx-auto">
        <div className="ghost-panel rounded-3xl border p-4 md:p-6">
          {!joined && (
            <form onSubmit={joinGame} className="max-w-xl mx-auto py-14">
              <h1 className="text-4xl md:text-6xl font-black text-center tracking-[0.25em] mb-4">GHOSTTEARS</h1>
              <p className="text-center text-slate-300 mb-7">Turn-based multiplayer country chain. 2-8 players.</p>
              <div className="grid gap-3 md:grid-cols-2">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Player name"
                  maxLength={24}
                  className="bg-slate-900/80 border border-slate-600 rounded-xl px-4 py-3 outline-none focus:border-emerald-300"
                />
                <input
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  placeholder="Room code (optional)"
                  className="bg-slate-900/80 border border-slate-600 rounded-xl px-4 py-3 outline-none focus:border-emerald-300"
                />
              </div>
              {errorMessage && <p className="text-red-300 mt-3 text-center text-sm">{errorMessage}</p>}
              <button
                type="submit"
                disabled={!connected}
                className="mt-4 w-full bg-emerald-400/80 hover:bg-emerald-300 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-xl py-3 font-bold text-slate-900"
              >
                {connected ? 'Join / Create Room' : 'Connecting...'}
              </button>
            </form>
          )}

          {joined && roomState && (
            <>
              <div className="flex items-start justify-between gap-3 mb-4">
                <button
                  onClick={() => emit('togglePause')}
                  disabled={!isHost || !['playing', 'paused'].includes(roomState.status)}
                  className="ghost-panel rounded-2xl px-4 py-3 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {roomState.status === 'paused' ? 'Resume' : 'Pause'}
                </button>

                <div className="text-center">
                  <div className="text-xs tracking-[0.3em] text-slate-300">ROOM</div>
                  <div className="text-xl font-black tracking-[0.2em]">{roomState.code}</div>
                </div>

                <div className="ghost-panel rounded-2xl w-28 h-24 flex flex-col items-center justify-center">
                  <div className="text-xs tracking-[0.26em] text-slate-400">TIMER</div>
                  <div className={cn('text-5xl font-black leading-none', roomState.timer <= 3 && roomState.timer > 0 && 'timer-danger')}>
                    {roomState.timerActive ? roomState.timer : '-'}
                  </div>
                </div>
              </div>

              <div className="ghost-panel border rounded-3xl h-36 md:h-40 flex items-center justify-center px-3 mb-4">
                <div className={cn(
                  'font-black tracking-[0.24em] text-center break-all',
                  roomState.currentPartial ? 'text-4xl md:text-6xl text-slate-100' : 'text-4xl md:text-6xl text-slate-500'
                )}>
                  {roomState.currentPartial || 'TYPE HERE'}
                </div>
              </div>

              <div className="grid md:grid-cols-4 gap-2 mb-4 text-xs md:text-sm text-slate-300">
                <span className="ghost-panel rounded-xl px-3 py-2">You: {me?.name || 'Spectator'}</span>
                <span className="ghost-panel rounded-xl px-3 py-2">Status: {roomState.status}</span>
                <span className="ghost-panel rounded-xl px-3 py-2">Active: {activePlayer ? activePlayer.name : '-'}</span>
                <span className="ghost-panel rounded-xl px-3 py-2">Turn: {isMyTurn ? 'Your turn' : 'Waiting'}</span>
              </div>

              <div className="mx-auto mb-5 rounded-xl border px-5 py-3 text-center text-sm md:text-base bg-red-900/35 border-red-500/70 text-red-100">
                {roomState.message}
              </div>

              {roomState.status === 'lobby' && (
                <div className="flex justify-center mb-5">
                  <button
                    onClick={() => emit('start')}
                    disabled={!isHost || roomState.players.length < 2}
                    className="bg-emerald-400/85 hover:bg-emerald-300 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-xl px-7 py-3 font-extrabold text-slate-900 tracking-wide"
                  >
                    Start Match
                  </button>
                </div>
              )}

              {roomState.status === 'ended' && (
                <div className="flex justify-center mb-5 gap-2">
                  <button
                    onClick={() => emit('restart')}
                    disabled={!isHost}
                    className="bg-cyan-300/80 hover:bg-cyan-200 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-xl px-7 py-3 font-extrabold text-slate-900 tracking-wide"
                  >
                    Back To Lobby
                  </button>
                </div>
              )}

              <PenaltyGrid players={roomState.players} />

              {roomState.status === 'paused' && (
                <div className="overlay fixed inset-0 z-50 flex flex-col items-center justify-center">
                  <div className="ghost-panel rounded-3xl p-8 text-center">
                    <h2 className="text-3xl font-black tracking-[0.2em]">PAUSED</h2>
                    <p className="text-slate-300 mt-2 mb-4">Timer and input are halted.</p>
                    {isHost && (
                      <button
                        onClick={() => emit('togglePause')}
                        className="bg-emerald-300/85 hover:bg-emerald-200 rounded-xl px-6 py-3 font-bold text-slate-900"
                      >
                        Resume
                      </button>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
