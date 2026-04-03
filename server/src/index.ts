import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import session from 'express-session';
import path from 'path';
import { authRouter } from './routes/auth.routes.js';
import { repoRouter } from './routes/repo.routes.js';

const app = express();
const PORT = parseInt(process.env.PORT ?? '3001', 10);
const CLIENT_URL = process.env.CLIENT_URL ?? 'http://localhost:5173';
const SESSION_SECRET = process.env.SESSION_SECRET ?? 'dev-secret-change-in-production';
const NODE_ENV = process.env.NODE_ENV ?? 'development';

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP — default includes upgrade-insecure-requests which forces HTTPS
  hsts: false, // Disable HSTS — we don't terminate TLS here
}));

// CORS
app.use(
  cors({
    origin: CLIENT_URL,
    credentials: true,
  })
);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false, // Set to true only when behind a TLS-terminating reverse proxy
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      sameSite: 'lax', // Must be 'lax' for OAuth redirect flow to work
    },
  })
);

// API routes
app.use('/api/auth', authRouter);
app.use('/api/repos', repoRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static client files in production
if (NODE_ENV === 'production') {
  const clientDistPath = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientDistPath));

  // Fallback: serve index.html for all non-API routes (SPA routing)
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} in ${NODE_ENV} mode`);
});

export default app;
