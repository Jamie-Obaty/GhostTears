# GHOSTTEARS (Web Multiplayer)

## Run

1. Install dependencies:

```bash
npm install
```

2. Start server:

```bash
npm start
```

3. Open:

```text
http://localhost:3000
```

## Remote multiplayer (different locations)

Players can join from different locations by opening the same hosted URL and entering the same room code.

- Local network: use your machine IP (`http://<your-ip>:3000`)
- Internet: deploy the Node app to any public host (Render, Railway, Fly.io, VPS, etc.) or tunnel with ngrok/cloudflared.

## Netlify setup (frontend) + Node host (backend)

This project is split deployment:

- Frontend (`public/`) -> Netlify
- Backend (`server.js`) -> Render/Railway/Fly (or any Node host)

1. Deploy backend first and get URL (example: `https://ghosttears-api.onrender.com`).
2. In `/Users/nanabonsu/Developer/Ghosttears/public/app.jsx`, replace:
   - `https://YOUR-BACKEND.onrender.com`
3. Set backend CORS env var where backend is hosted:
   - `CLIENT_ORIGIN=https://YOUR-NETLIFY-SITE.netlify.app`
   - You can allow multiple origins with commas.
4. Deploy frontend to Netlify:
   - Publish directory: `public`
5. Open Netlify URL, join with room code, and share URL with other players.

## Files

- `/Users/nanabonsu/Developer/Ghosttears/server.js` - realtime socket server + game rules
- `/Users/nanabonsu/Developer/Ghosttears/public/app.jsx` - single-file React game client
- `/Users/nanabonsu/Developer/Ghosttears/public/index.html` - web entrypoint
