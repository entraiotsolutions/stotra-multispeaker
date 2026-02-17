# ✅ Render Deployment - Correct Configuration

## 🎯 What You Should Do

### Option 1: Use Node.js (Recommended - Uses render.yaml)

**In the Render form, change:**
- ❌ **Language: Docker** 
- ✅ **Language: Node**

**Why?** You have a `render.yaml` file that's configured for Node.js deployment. This is simpler and faster.

**Configuration:**
- Render will auto-detect `render.yaml`
- Build Command: `pnpm install && pnpm build:demo` (auto from render.yaml)
- Start Command: `node server/index.js` (auto from render.yaml)

---

### Option 2: Use Docker (If you prefer)

**Keep Language: Docker** but you need to:

1. **Update the Dockerfile** (already done ✅)
2. **Remove or ignore render.yaml** for Docker deployment
3. **Set environment variables manually** in Render dashboard

---

## 📋 Step-by-Step: Node.js Deployment (Recommended)

### 1. Change Language to Node.js

In the Render form:
- Click the **"Language"** dropdown
- Select **"Node"** instead of "Docker"

### 2. Render Will Auto-Detect

Once you select Node.js, Render will:
- ✅ Auto-detect `render.yaml`
- ✅ Use the build command: `pnpm install && pnpm build:demo`
- ✅ Use the start command: `node server/index.js`
- ✅ Set up environment variables from `render.yaml`

### 3. Set Environment Variables

Go to **Environment** tab and add:

#### Required:
```
NODE_ENV=production
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret
LIVEKIT_URL=wss://your-livekit-server.com
LIVEKIT_HTTP_URL=https://your-livekit-server.com
```

#### Optional (for recording):
```
R2_ACCESS_KEY=your-r2-key
R2_SECRET_KEY=your-r2-secret
R2_BUCKET=your-bucket-name
R2_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
WEBHOOK_SECRET=your-webhook-secret
```

### 4. Instance Type

- **Free**: Good for testing (spins down after inactivity)
- **Starter ($7/month)**: Recommended for production
  - 512 MB RAM, 0.5 CPU
  - No spin-down
  - SSH access
  - Scaling support

### 5. Click "Create Web Service"

Render will:
1. Clone your repo
2. Install dependencies (`pnpm install`)
3. Build frontend (`pnpm build:demo`)
4. Start server (`node server/index.js`)

---

## 🔧 If You Choose Docker Instead

### 1. Keep Language: Docker

### 2. Manual Configuration:

**Build Command:** (leave empty - Docker builds automatically)

**Start Command:** (leave empty - uses Dockerfile CMD)

**Dockerfile Path:** `Dockerfile` (default)

### 3. Set Environment Variables Manually

Same as above, but set them in Render dashboard.

---

## ✅ Recommended Settings Summary

### For Node.js Deployment:

| Setting | Value |
|---------|-------|
| **Language** | `Node` |
| **Build Command** | (auto from render.yaml) |
| **Start Command** | (auto from render.yaml) |
| **Instance Type** | `Starter` ($7/month) or `Free` for testing |
| **Region** | `Oregon (US West)` ✅ (you have this) |
| **Branch** | `main` ✅ (you have this) |

### Environment Variables Needed:

```
NODE_ENV=production
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
LIVEKIT_URL=wss://...
LIVEKIT_HTTP_URL=https://...
```

---

## 🚨 Important Notes

1. **Free Tier Limitations:**
   - Spins down after 15 minutes of inactivity
   - First request after spin-down takes ~30 seconds
   - No SSH access
   - Not ideal for production

2. **LiveKit Server:**
   - Must be deployed separately (not on Render)
   - Can be self-hosted on VPS
   - Or use LiveKit Cloud

3. **Webhooks:**
   - Your LiveKit server needs to send webhooks to:
   - `https://your-app.onrender.com/api/webhooks/livekit`

---

## 🎯 What To Do Right Now

1. **Change Language to Node.js** in the Render form
2. **Keep other settings as they are** (Region, Branch, etc.)
3. **Select Starter plan** ($7/month) for production, or Free for testing
4. **Click "Create Web Service"**
5. **Add environment variables** after service is created
6. **Wait for deployment** (2-5 minutes)

---

## ✅ Checklist

- [ ] Changed Language to **Node.js**
- [ ] Instance Type selected (Starter recommended)
- [ ] Clicked "Create Web Service"
- [ ] Added environment variables in Render dashboard
- [ ] LiveKit server is accessible and configured
- [ ] Webhook URL configured in LiveKit server

---

**Next Steps:** After deployment, test the health endpoint and verify the app loads correctly!
