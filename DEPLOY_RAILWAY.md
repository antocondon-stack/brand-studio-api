# Deploy to Railway

Your project is already configured for Railway via `railway.toml`:

- **Builder:** Nixpacks  
- **Build:** `npm install && npm run build`  
- **Start:** `npm start` (runs `node dist/server.js`)  
- **Health check:** `GET /health`  
- **Node:** Set `engines.node` in `package.json` to `>=18.0.0` so Railway uses Node 18.

## Option 1: Deploy from GitHub (recommended)

1. **Commit and push your code** (including Wordmark Customizer and `package.json` engines):

   ```bash
   git add .
   git commit -m "Add wordmark customizer, Node 18 engines for Railway"
   git push origin main
   ```

2. In [Railway](https://railway.app): **New Project** → **Deploy from GitHub repo** → select `brand-studio-api`.

3. Railway will use `railway.toml` and deploy on every push to the linked branch.

4. **Optional:** Add **Variables** in the project (e.g. any API keys your app needs from `process.env`).

5. Under **Settings** → **Networking** → **Generate Domain** to get a public URL. Health: `https://<your-app>.up.railway.app/health`.

---

## Option 2: Deploy with Railway CLI

1. **Install the CLI:**

   ```bash
   npm install -g @railway/cli
   ```

2. **Login and link (or create) a project:**

   ```bash
   railway login
   cd /path/to/brand-studio-api
   railway link   # pick existing project, or
   railway init   # create new project
   ```

3. **Commit your changes, then deploy:**

   ```bash
   git add .
   git commit -m "Add wordmark customizer, Node 18 engines for Railway"
   railway up
   ```

4. **Generate a domain** (if needed): in the Railway dashboard, **Settings** → **Networking** → **Generate Domain**.

---

## After deploy

- **Health:** `curl https://<your-domain>/health` → `{"status":"healthy","port":...}`  
- **Root:** `curl https://<your-domain>/` → `{"status":"ok","message":"Brand Studio API is running",...}`  
- **Fonts:** If you use wordmark/font features, add font files under `assets/fonts/` (see `QUICK_FONT_SETUP.md`), commit, and push so the build includes them in `dist/assets/fonts/`.
