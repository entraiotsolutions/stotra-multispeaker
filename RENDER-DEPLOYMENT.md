# 🚀 Render Deployment Guide

This guide walks you through deploying the LiveKit Audio App on Render.

## 📁 Project Structure

```
root/
  server/            → Express backend
  client/            → Vite frontend
  package.json
  render.yaml
```

## 🔧 Prerequisites

1. **Render Account**: Sign up at [render.com](https://render.com)
2. **GitHub Repository**: Push your code to GitHub
3. **LiveKit Server**: You need a LiveKit server instance (can be self-hosted or cloud)

## 📋 Step-by-Step Deployment

### Step 1: Prepare Your Repository

1. Ensure all changes are committed and pushed to GitHub:
   ```bash
   git add .
   git commit -m "Restructure for Render deployment"
   git push origin main
   ```

### Step 2: Create a New Web Service on Render

1. Log in to [Render Dashboard](https://dashboard.render.com)
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repository
4. Render will auto-detect the `render.yaml` file if present, or you can configure manually

### Step 3: Configure Build & Start Commands

If not using `render.yaml`, configure manually:

- **Build Command**: `pnpm install && pnpm build`
- **Start Command**: `pnpm start`
- **Environment**: `Node`
- **Node Version**: `18` or higher

### Step 4: Set Environment Variables

In the Render dashboard, go to **Environment** and add the following variables:

#### Required Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `production` |
| `PORT` | Server port (auto-set by Render) | (auto) |
| `LIVEKIT_API_KEY` | LiveKit API key | `your-api-key` |
| `LIVEKIT_API_SECRET` | LiveKit API secret | `your-api-secret` |
| `LIVEKIT_URL` | LiveKit WebSocket URL | `wss://your-livekit-server.com` |
| `LIVEKIT_HTTP_URL` | LiveKit HTTP URL | `https://your-livekit-server.com` |
| `VITE_LIVEKIT_URL` | Frontend LiveKit URL | `wss://your-livekit-server.com` |

#### Optional Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `R2_ACCESS_KEY` | Cloudflare R2 access key | `your-r2-key` |
| `R2_SECRET_KEY` | Cloudflare R2 secret key | `your-r2-secret` |
| `R2_BUCKET` | R2 bucket name | `your-bucket` |
| `R2_ENDPOINT` | R2 endpoint URL | `https://your-account.r2.cloudflarestorage.com` |
| `WEBHOOK_SECRET` | Webhook secret for LiveKit | `your-webhook-secret` |

### Step 5: Deploy

1. Click **"Create Web Service"**
2. Render will:
   - Install dependencies (`pnpm install`)
   - Build the frontend (`pnpm build`)
   - Start the server (`pnpm start`)

### Step 6: Verify Deployment

1. Wait for the build to complete (usually 2-5 minutes)
2. Check the logs for any errors
3. Visit your app URL: `https://your-app.onrender.com`
4. Test the health endpoint: `https://your-app.onrender.com/health`

## 🔍 Troubleshooting

### Build Fails

- **Issue**: `pnpm: command not found`
  - **Solution**: Render should auto-detect pnpm from `packageManager` in `package.json`. If not, add `pnpm` installation step in build command.

- **Issue**: Frontend build errors
  - **Solution**: Check that `client/vite.config.ts` exists and is correct. Ensure all dependencies are in `package.json`.

### Runtime Errors

- **Issue**: `Cannot find module`
  - **Solution**: Ensure all dependencies are listed in `package.json` (not just `devDependencies` for production).

- **Issue**: `PORT is not defined`
  - **Solution**: Render automatically sets `PORT`. Ensure your server uses `process.env.PORT`.

- **Issue**: Frontend shows blank page
  - **Solution**: 
    - Check that `pnpm build` completed successfully
    - Verify `client/dist` folder exists after build
    - Check server logs for static file serving errors

### Environment Variables Not Working

- **Issue**: Frontend can't connect to backend
  - **Solution**: 
    - The frontend uses relative API calls (`/api/...`), so no API base URL is needed
    - Ensure the backend is serving the frontend correctly
    - Check that routes are properly configured in `server/index.js`

## 📝 Important Notes

1. **Environment Variables with `VITE_` Prefix**:
   - These are injected at **build time**, not runtime
   - Only `VITE_LIVEKIT_URL` is needed (for LiveKit WebSocket connection)
   - The frontend uses **relative API calls** (`/api/...`), so no API base URL is required
   - If you change `VITE_LIVEKIT_URL`, you must **rebuild** the app
   - In Render, trigger a new deployment after changing this variable

2. **LiveKit Server**:
   - Your LiveKit server must be accessible from the internet
   - Use `wss://` (secure WebSocket) for production
   - Ensure CORS is configured if needed

3. **Static File Serving**:
   - The Express server serves built frontend files from `client/dist`
   - All routes except `/api/*` and `/health` serve `index.html` (SPA routing)

4. **Port Configuration**:
   - Render automatically sets `PORT` environment variable
   - Your server must use `process.env.PORT || 3001` (fallback for local dev)

## 🔄 Updating Your Deployment

1. Push changes to GitHub
2. Render will automatically detect and deploy (if auto-deploy is enabled)
3. Or manually trigger a deploy from the Render dashboard

## 📚 Additional Resources

- [Render Documentation](https://render.com/docs)
- [LiveKit Documentation](https://docs.livekit.io)
- [Vite Environment Variables](https://vitejs.dev/guide/env-and-mode.html)

## ✅ Deployment Checklist

- [ ] Code pushed to GitHub
- [ ] `render.yaml` created (or manual configuration done)
- [ ] All environment variables set in Render dashboard
- [ ] Build command: `pnpm install && pnpm build`
- [ ] Start command: `pnpm start`
- [ ] LiveKit server accessible and configured
- [ ] Health check endpoint working: `/health`
- [ ] Frontend loads correctly
- [ ] API endpoints working: `/api/sessions/*`
- [ ] WebSocket connection to LiveKit working

---

**Need Help?** Check the logs in Render dashboard or review the troubleshooting section above.
