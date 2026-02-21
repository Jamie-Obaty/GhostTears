const { useEffect, useMemo, useRef, useState } = React;

const PENALTY_WORD = "GHOSTTEARS";
const SOCKET_SERVER_URL =
  window.location.hostname === "localhost"
    ? window.location.origin
    : "https://ghosttears-bxoh.onrender.com";

const styles = `
:root {
  color-scheme: dark;
}
* {
  box-sizing: border-box;
}
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
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(214, 227, 255, 0.05);
  backdrop-filter: blur(10px);
}
.card-active {
  border-color: rgba(95, 237, 198, 0.85) !important;
  box-shadow: 0 0 25px rgba(95, 237, 198, 0.2);
}
.avatar-active {
  animation: pulseGlow 1.2s ease-in-out infinite;
}
.avatar-idle .eye {
  animation: blink 4.2s linear infinite;
  transform-origin: center;
}
.avatar-shocked {
  animation: bounce 260ms ease-in-out 5;
}
.avatar-eliminated {
  filter: grayscale(1) opacity(0.7);
}
.timer-danger {
  color: #ff6b6b;
  text-shadow: 0 0 14px rgba(255, 107, 107, 0.8);
}
.overlay {
  background: rgba(6, 8, 14, 0.7);
  backdrop-filter: blur(8px);
}
@keyframes pulseGlow {
  0%, 100% { transform: scale(1); filter: drop-shadow(0 0 0 rgba(95, 237, 198, 0)); }
  50% { transform: scale(1.04); filter: drop-shadow(0 0 10px rgba(95, 237, 198, 0.85)); }
}
@keyframes blink {
  0%, 47%, 53%, 100% { transform: scaleY(1); }
  50% { transform: scaleY(0.15); }
}
@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}
`;

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

function Avatar({ isActive, isWinner, isEliminated, isShocked, isNervous }) {
  const avatarClass = cn(
    "w-24 h-24 md:w-28 md:h-28 transition-all duration-300",
    isActive && "avatar-active",
    !isActive && "avatar-idle",
    isShocked && "avatar-shocked",
    isEliminated && "avatar-eliminated",
  );

  const faceFill = isWinner ? "#18c47e" : isShocked ? "#ff5f5f" : "#58e6bf";
  const eyeColor = isEliminated ? "#f2f2f2" : "#042329";

  return (
    <svg viewBox="0 0 120 120" className={avatarClass} aria-label="avatar">
      <defs>
        <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow
            dx="0"
            dy="0"
            stdDeviation="2"
            floodColor="#63ffd4"
            floodOpacity="0.4"
          />
        </filter>
      </defs>
      <circle cx="60" cy="58" r="33" fill={faceFill} filter="url(#softGlow)" />
      {isNervous && !isEliminated && (
        <g>
          <path
            d="M90 26 C96 35, 96 41, 90 47 C84 40, 84 34, 90 26"
            fill="#7cc6ff"
            opacity="0.85"
          />
        </g>
      )}
      {!isEliminated && (
        <>
          <ellipse
            className="eye"
            cx="48"
            cy="52"
            rx="5"
            ry="6"
            fill={eyeColor}
          />
          <ellipse
            className="eye"
            cx="72"
            cy="52"
            rx="5"
            ry="6"
            fill={eyeColor}
          />
        </>
      )}
      {isEliminated && (
        <g stroke="#f8f8f8" strokeWidth="3">
          <line x1="42" y1="47" x2="53" y2="58" />
          <line x1="53" y1="47" x2="42" y2="58" />
          <line x1="67" y1="47" x2="78" y2="58" />
          <line x1="78" y1="47" x2="67" y2="58" />
        </g>
      )}
      {!isEliminated && isWinner && (
        <path
          d="M44 71 Q60 86 76 71"
          stroke="#063020"
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
        />
      )}
      {!isEliminated && !isWinner && (
        <path
          d="M44 75 Q60 69 76 75"
          stroke="#063020"
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
        />
      )}
      <path
        d="M36 98 C35 85, 85 85, 84 98"
        stroke={faceFill}
        strokeWidth="8"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PenaltyBar({ penalties }) {
  return (
    <div className="flex gap-1 mt-4">
      {PENALTY_WORD.split("").map((letter, idx) => (
        <div
          key={`${letter}-${idx}`}
          className={cn(
            "w-7 h-9 rounded-md border text-[11px] font-bold flex items-center justify-center transition-all",
            idx < penalties
              ? "bg-red-600/70 border-red-300 text-red-100"
              : "bg-slate-700/55 border-slate-500/50 text-slate-300",
          )}
        >
          {letter}
        </div>
      ))}
    </div>
  );
}

function PlayerCard({ player, isActive, isMe, isWinner, isShocked, timer }) {
  const isNervous = isActive && timer <= 3 && timer > 0;
  return (
    <div
      className={cn(
        "ghost-panel rounded-3xl p-4 border transition-all",
        isActive && "card-active",
      )}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold tracking-wide">
            {player.name}
            {isMe ? " (You)" : ""}
          </div>
          <div
            className={cn(
              "text-xs tracking-[0.22em] mt-1 uppercase",
              !player.isActive ? "text-red-300" : "text-slate-300",
            )}
          >
            {!player.isActive
              ? "Eliminated"
              : isWinner
                ? "Winner"
                : isActive
                  ? "Active Turn"
                  : "Waiting"}
          </div>
        </div>
        <Avatar
          isActive={isActive}
          isWinner={isWinner}
          isEliminated={!player.isActive}
          isShocked={isShocked}
          isNervous={isNervous}
        />
      </div>
      <PenaltyBar penalties={player.penaltyIndex || 0} />
    </div>
  );
}

function App() {
  const socketRef = useRef(null);
  const [socketId, setSocketId] = useState("");
  const [connected, setConnected] = useState(false);
  const [roomState, setRoomState] = useState(null);
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [joined, setJoined] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const socket = io(SOCKET_SERVER_URL, {
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setSocketId(socket.id);
      setConnected(true);
      setErrorMessage("");
    });

    socket.on("disconnect", () => setConnected(false));
    socket.on("joinError", (msg) => setErrorMessage(String(msg || "Unable to join room.")));
    socket.on("state", (next) => {
      setRoomState(next);
      setJoined(true);
      setErrorMessage("");
    });

    return () => socket.disconnect();
  }, []);

  useEffect(() => {
    const keyHandler = (event) => {
      if (!roomState || roomState.status !== "playing") return;
      if (roomState.activePlayerId !== socketId) return;
      if (event.target && ["INPUT", "TEXTAREA"].includes(event.target.tagName))
        return;
      if (/^[a-z]$/i.test(event.key)) {
        socketRef.current.emit("letter", { letter: event.key.toLowerCase() });
      }
    };

    window.addEventListener("keydown", keyHandler);
    return () => window.removeEventListener("keydown", keyHandler);
  }, [roomState, socketId]);

  const me = useMemo(
    () => roomState?.players?.find((player) => player.id === socketId) || null,
    [roomState, socketId],
  );

  const joinGame = (event) => {
    event.preventDefault();
    const cleanedName = name.trim().slice(0, 24) || "Player";
    const cleanedRoom = roomCode.trim().toUpperCase();
    socketRef.current.emit("join", {
      name: cleanedName,
      roomCode: cleanedRoom,
    });
  };

  const emit = (event, payload = {}) => {
    if (!socketRef.current) return;
    socketRef.current.emit(event, payload);
  };

  const isMyTurn = roomState?.activePlayerId === socketId;
  const isHost = roomState?.hostId === socketId;
  const displayString = roomState?.currentPartial || "TYPE HERE";

  return (
    <div className="min-h-screen text-slate-100 px-3 py-5 md:p-6">
      <style>{styles}</style>
      <div className="max-w-5xl mx-auto">
        <div className="ghost-panel rounded-3xl border p-4 md:p-6">
          {!joined && (
            <form onSubmit={joinGame} className="max-w-xl mx-auto py-14">
              <h1 className="text-4xl md:text-5xl font-black text-center tracking-[0.25em] mb-4">
                GHOSTTEARS
              </h1>
              <p className="text-center text-slate-300 mb-7">
                Multiplayer word duel. Join from anywhere with a room code.
              </p>
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
                {connected ? "Join / Create Room" : "Connecting..."}
              </button>
            </form>
          )}

          {joined && roomState && (
            <>
              <div className="flex items-start justify-between gap-3 mb-4">
                <button
                  onClick={() => emit("togglePause")}
                  disabled={
                    !isHost || !["playing", "paused"].includes(roomState.status)
                  }
                  className="ghost-panel rounded-2xl px-4 py-3 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {roomState.status === "paused" ? "Resume" : "Pause"}
                </button>
                <div className="text-center">
                  <div className="text-xs tracking-[0.3em] text-slate-300">
                    ROOM
                  </div>
                  <div className="text-xl font-black tracking-[0.2em]">
                    {roomState.code}
                  </div>
                </div>
                <div className="ghost-panel rounded-2xl w-28 h-24 flex flex-col items-center justify-center">
                  <div className="text-xs tracking-[0.26em] text-slate-400">
                    TIMER
                  </div>
                  <div
                    className={cn(
                      "text-5xl font-black leading-none",
                      roomState.timer <= 3 &&
                        roomState.timer > 0 &&
                        "timer-danger",
                    )}
                  >
                    {roomState.timerActive ? roomState.timer : 0}
                  </div>
                </div>
              </div>

              <div className="ghost-panel border rounded-3xl h-44 md:h-52 flex items-center justify-center px-3 mb-4">
                <div
                  className={cn(
                    "font-black tracking-[0.24em] text-center break-all",
                    roomState.currentPartial
                      ? "text-4xl md:text-6xl text-slate-100"
                      : "text-4xl md:text-6xl text-slate-500",
                  )}
                >
                  {displayString}
                </div>
              </div>

              <div
                className={cn(
                  "mx-auto mb-5 max-w-md rounded-full border px-5 py-3 text-center text-sm md:text-base",
                  "bg-red-900/35 border-red-500/70 text-red-100",
                )}
              >
                {roomState.message}
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2 mb-5 text-xs md:text-sm text-slate-300">
                <span className="ghost-panel rounded-full px-3 py-2">
                  You: {me?.name || "Spectator"}
                </span>
                <span className="ghost-panel rounded-full px-3 py-2">
                  Status: {roomState.status}
                </span>
                <span className="ghost-panel rounded-full px-3 py-2">
                  Turn: {isMyTurn ? "Your turn" : "Waiting"}
                </span>
                <span className="ghost-panel rounded-full px-3 py-2">
                  Players: {roomState.players.length}
                </span>
              </div>

              {roomState.status === "lobby" && (
                <div className="flex justify-center mb-5">
                  <button
                    onClick={() => emit("start")}
                    disabled={!isHost || roomState.players.length < 2}
                    className="bg-emerald-400/85 hover:bg-emerald-300 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-xl px-7 py-3 font-extrabold text-slate-900 tracking-wide"
                  >
                    Start Match
                  </button>
                </div>
              )}

              {roomState.status === "ended" && (
                <div className="flex justify-center mb-5">
                  <button
                    onClick={() => emit("restart")}
                    disabled={!isHost}
                    className="bg-cyan-300/80 hover:bg-cyan-200 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-xl px-7 py-3 font-extrabold text-slate-900 tracking-wide"
                  >
                    Back To Lobby
                  </button>
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-4">
                {roomState.players.map((player) => {
                  const isWinner = roomState.winnerId === player.id;
                  const isShocked =
                    roomState.lastPenalty &&
                    roomState.players[roomState.lastPenalty.playerIndex]?.id === player.id &&
                    Date.now() - roomState.lastPenalty.at < 1500;

                  return (
                    <PlayerCard
                      key={player.id}
                      player={player}
                      isActive={
                        roomState.activePlayerId === player.id &&
                        roomState.status === "playing"
                      }
                      isMe={player.id === socketId}
                      isWinner={isWinner}
                      isShocked={isShocked}
                      timer={roomState.timer}
                    />
                  );
                })}
              </div>

              {roomState.status === "paused" && (
                <div className="overlay fixed inset-0 z-50 flex flex-col items-center justify-center">
                  <div className="ghost-panel rounded-3xl p-8 text-center">
                    <h2 className="text-3xl font-black tracking-[0.2em]">
                      PAUSED
                    </h2>
                    <p className="text-slate-300 mt-2 mb-4">
                      Timer and input are halted.
                    </p>
                    {isHost && (
                      <button
                        onClick={() => emit("togglePause")}
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

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
