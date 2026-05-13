# ALPHALEARN Deployment Guide

## Architecture
- **Frontend**: Next.js 14 (React)
- **Backend**: Express.js (Node.js)
- **Database**: PostgreSQL (cloud — Neon, Supabase, Railway, or Render)
- **Auth**: JWT tokens
- **Production**: Multi-process clustering via `cluster.js`

---

## 1. Set Up Cloud PostgreSQL

### Option A: Neon (Recommended)
1. Go to [neon.tech](https://neon.tech) → Sign up free
2. Create a new project → Name it `alphalearn`
3. Copy the connection string:
   ```
   postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/alphalearn?sslmode=require
   ```

### Option B: Supabase
1. Go to [supabase.com](https://supabase.com) → Create project
2. Go to Settings → Database → Connection string (URI)

### Option C: Railway / Render
1. Create a PostgreSQL service
2. Copy the `DATABASE_URL` from the dashboard

---

## 2. Configure Environment

Create a `.env` file from the template:
```bash
cp .env.example .env
```

Fill in your values:
```env
DATABASE_URL=postgresql://user:pass@host:5432/alphalearn?sslmode=require
JWT_SECRET=your-strong-secret-here
NODE_ENV=production
PORT=3000
```

---

## 3. Install Dependencies

```bash
npm install
```

---

## 4. Run Locally (Development)

```bash
npm run dev
```

The app will be live at `http://localhost:3000`.

---

## 5. Deploy to Production

### Option A: Render
1. Go to [render.com](https://render.com) → New Web Service
2. Connect your GitHub repository
3. Settings:
   - **Environment**: Node
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
4. Add environment variables: `DATABASE_URL`, `JWT_SECRET`
5. Deploy!

### Option B: Railway
1. Go to [railway.app](https://railway.app) → New Project
2. Deploy from GitHub
3. Add `DATABASE_URL`, `JWT_SECRET` env vars
4. Railway auto-detects Node.js and deploys

### Option C: Docker
```bash
docker build -t alphalearn .
docker run -p 3000:3000 \
  -e DATABASE_URL="your-connection-string" \
  -e JWT_SECRET="your-secret" \
  alphalearn
```

Or with docker-compose:
```bash
DATABASE_URL="your-connection-string" docker-compose up -d
```

---

## 6. Default Credentials

After first deployment, log in with:
- **Username**: `admin`
- **Password**: `admin123`

⚠️ **Change the admin password immediately after first login!**

---

## Security Notes

- 🔒 Rate limiting: 100 req/min per IP (20 for login)
- 🔒 Helmet security headers enabled
- 🔒 Request body size limited to 1MB
- 🔒 JWT tokens expire after 24 hours
- 🔒 PostgreSQL connections use SSL in production
- 🔒 Multi-process clustering for fault tolerance

---

## Scaling

The platform is designed to handle **1,000+ concurrent users**:

| Component | How It Scales |
|---|---|
| Database | PostgreSQL with connection pooling (20 connections) |
| Server | Cluster mode — one worker per CPU core |
| Indexes | 16 database indexes for fast queries |
| Rate Limiting | Prevents abuse and DDoS |
