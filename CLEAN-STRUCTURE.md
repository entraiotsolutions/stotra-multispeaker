# Clean Repository Structure

## Final Folder Structure

```
stotra-multispeaker/
├── client/
│   ├── demo.ts              # Main client application code
│   ├── index.html           # HTML entry point
│   ├── styles.css           # Application styles
│   ├── tsconfig.json        # TypeScript config for client
│   └── vite.config.ts       # Vite build configuration
├── server/
│   ├── config.js            # Server configuration
│   ├── index.js             # Express server entry point
│   ├── routes/
│   │   ├── recordings.js    # Recording routes
│   │   ├── sessions.js      # Session management routes
│   │   └── webhooks.js      # Webhook handlers
│   └── services/
│       ├── r2Service.js           # Cloudflare R2 service
│       ├── recordingService.js    # Recording service
│       ├── recordingStorage.js    # Recording storage
│       ├── sessionService.js      # Session service
│       └── tokenService.js        # Token generation service
├── .gitignore               # Git ignore rules
├── package.json             # Application dependencies
├── pnpm-lock.yaml          # Lock file (will be regenerated)
└── [other config files]    # env.example, render.yaml, etc.
```

## Final package.json

```json
{
  "name": "stotra-multispeaker",
  "version": "1.0.0",
  "description": "Standalone audio app using LiveKit",
  "main": "server/index.js",
  "scripts": {
    "dev": "concurrently \"pnpm dev:server\" \"pnpm dev:client\"",
    "dev:server": "cross-env NODE_ENV=development node server/index.js",
    "dev:client": "vite -c client/vite.config.ts",
    "build": "vite build -c client/vite.config.ts",
    "start": "node server/index.js"
  },
  "dependencies": {
    "@aws-sdk/client-s3": "^3.991.0",
    "cors": "^2.8.6",
    "dotenv": "^16.6.1",
    "express": "^5.2.1",
    "livekit-client": "^2.17.1",
    "livekit-server-sdk": "^2.15.0"
  },
  "devDependencies": {
    "@types/cors": "^2.8.17",
    "@types/express": "^5.0.0",
    "@types/node": "^20.0.0",
    "concurrently": "^8.2.2",
    "cross-env": "^7.0.3",
    "typescript": "^5.8.3",
    "vite": "^7.3.1"
  },
  "packageManager": "pnpm@10.22.0"
}
```

## Key Changes Made

1. ✅ **Removed all LiveKit SDK source code** (`src/` directory)
2. ✅ **Removed SDK build tooling** (rollup configs, SDK vite configs)
3. ✅ **Removed examples directory**
4. ✅ **Updated client imports** to use `livekit-client` package instead of `../src/`
5. ✅ **Cleaned package.json** - only app dependencies, no SDK build scripts
6. ✅ **Updated Vite config** - removed SDK source references
7. ✅ **Updated TypeScript config** - removed SDK source includes
8. ✅ **Server already configured** to serve from `client/dist`

## Git Reinitialization Commands

To start fresh with a clean Git history:

```bash
# Remove existing Git history
rm -rf .git

# Initialize new Git repository
git init

# Add all files
git add .

# Create initial commit
git commit -m "Initial commit: Clean standalone audio app"

# Add your remote (replace with your repository URL)
git remote add origin <your-repo-url>

# Push to new repository
git branch -M main
git push -u origin main --force
```

## Windows PowerShell Commands

```powershell
# Remove existing Git history
Remove-Item -Recurse -Force .git

# Initialize new Git repository
git init

# Add all files
git add .

# Create initial commit
git commit -m "Initial commit: Clean standalone audio app"

# Add your remote (replace with your repository URL)
git remote add origin <your-repo-url>

# Push to new repository
git branch -M main
git push -u origin main --force
```

## Next Steps

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Set up environment variables:**
   - Copy `env.example` to `.env`
   - Fill in your LiveKit credentials and R2 config

3. **Test locally:**
   ```bash
   pnpm dev
   ```

4. **Build for production:**
   ```bash
   pnpm build
   pnpm start
   ```

5. **Deploy to Render:**
   - The app is now ready for Render deployment
   - Build command: `pnpm build`
   - Start command: `pnpm start`
   - Server uses `process.env.PORT` automatically

## What Was Removed

- ❌ `src/` - LiveKit SDK source code
- ❌ `examples/` - SDK examples
- ❌ `rollup.config.js` - SDK build config
- ❌ `rollup.config.worker.js` - SDK worker build config
- ❌ `vite.config.mjs` - SDK demo config
- ❌ `vite.demo.config.mjs` - SDK demo build config
- ❌ `tsconfig.json` (root) - SDK TypeScript config
- ❌ `tsconfig.eslint.json` - SDK ESLint config
- ❌ `eslint.config.mjs` - SDK ESLint config
- ❌ `throws-transformer/` - SDK build tooling
- ❌ `dist/` - SDK build output
- ❌ `token-server.js` - Legacy token server
- ❌ Various SDK-related scripts and configs

## What Remains

- ✅ `client/` - Your standalone app frontend
- ✅ `server/` - Your Express backend
- ✅ `package.json` - Clean app dependencies only
- ✅ Configuration files (env.example, render.yaml, etc.)
- ✅ Documentation files

The app now uses LiveKit as **installed dependencies only**, not as source code.
