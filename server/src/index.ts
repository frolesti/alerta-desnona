import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { initDB } from './db/database';
import { desnonamentRoutes } from './routes/desnonaments';
import { usuariRoutes } from './routes/usuaris';
import { notificacioRoutes } from './routes/notificacions';
import { estadistiquesRoutes } from './routes/estadistiques';
import { startCronJobs } from './services/cron';
import { initPush, getVapidPublicKey } from './services/push';
import { initEmail } from './services/email';
import { initFCM } from './services/fcm';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

// API Routes
app.use('/api/desnonaments', desnonamentRoutes);
app.use('/api/usuaris', usuariRoutes);
app.use('/api/notificacions', notificacioRoutes);
app.use('/api/estadistiques', estadistiquesRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// VAPID public key (el client la necessita per subscriure's a push)
app.get('/api/push/vapid-key', (_req, res) => {
  const key = getVapidPublicKey();
  if (!key) {
    return res.status(503).json({ ok: false, error: 'Push no configurat' });
  }
  res.json({ ok: true, data: { publicKey: key } });
});

// Serve static client in production
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Initialize
async function main() {
  initDB();
  initPush();
  initEmail();
  initFCM();
  startCronJobs();

  app.listen(PORT, () => {
    console.log(`🏠 Alerta Desnona API escoltant al port ${PORT}`);
    console.log(`📍 Mode: ${process.env.NODE_ENV || 'development'}`);
  });
}

main().catch(console.error);

export default app;
