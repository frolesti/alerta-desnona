# Alerta Desnona — Roadmap de Producció

Full de ruta per convertir Alerta Desnona en una plataforma completa:
app mòbil + web desktop, amb notificacions push i desplegament automatitzat.

---

## Fase 0: Environments a GitHub Actions
> Configurar `staging` i `production` al workflow per separar secrets i pipelines.

- [x] Workflow `daily-update.yml` amb 2 environments (staging + production)
- [x] Environment secrets documentats a `.env.example`
- [x] Protection rules documentades (production requereix approval manual)
- [ ] Environments creats a GitHub → Settings → Environments (manual)
- [ ] Secrets afegits a cada environment (manual)

## Fase 1: PWA + Push Notifications
> Convertir el client React/Vite en una Progressive Web App instal·lable amb notificacions push.

- [x] `manifest.json` amb icones, colors i configuració PWA
- [x] Service Worker amb precaching i estratègia network-first
- [x] `vite-plugin-pwa` integrat a la configuració de Vite
- [x] Meta tags PWA a `index.html` (apple-touch-icon, theme-color...)
- [x] Registre de Service Worker al client (`registerSW`)
- [x] Servei VAPID push al servidor (`services/push.ts`)
- [x] Endpoint API per enviar push notifications
- [x] Client: hook `usePushNotifications` per subscripció/dessubscripció
- [x] Component UI per activar/desactivar notificacions
- [x] Integració cron.ts amb push real (substituir placeholder)
- [ ] Generar VAPID keys reals i afegir a secrets (manual)
- [ ] Provar instal·lació PWA al mòbil (manual)
- [ ] Provar notificació push real (manual)

## Fase 2: Email amb Nodemailer
> Resum diari per email als usuaris subscrits.

- [ ] Configurar `nodemailer` transport amb SMTP
- [ ] Template HTML per resum diari
- [ ] Integrar amb `cron.ts` (resum diari real)
- [ ] Secrets SMTP a cada environment

## Fase 3: Capacitor (App nativa)
> Embolcallar el SPA en una app nativa per a Android i iOS.

- [ ] Instal·lar Capacitor
- [ ] Configurar `capacitor.config.ts`
- [ ] Build per Android (APK/AAB)
- [ ] Build per iOS (Xcode project)
- [ ] Integrar FCM per push natiu

## Fase 4: Firebase Cloud Messaging
> Push natiu per a les apps de les stores (Android + iOS).

- [ ] Crear projecte Firebase
- [ ] `firebase-admin` al servidor
- [ ] Endpoint per registrar FCM tokens
- [ ] Unificar push (web-push + FCM) al servei de notificacions

## Fase 5: Deploy a Producció
> Servidor real accessible públicament.

- [ ] Escollir plataforma (VPS, Railway, Fly.io...)
- [ ] Dockerfile
- [ ] GitHub Actions: deploy automàtic a staging/production
- [ ] Domini personalitzat + SSL
- [ ] Migrar de SQLite a PostgreSQL (si escala ho requereix)

---

## Secrets per Environment

| Secret | Staging | Production | Necessari des de |
|--------|---------|------------|------------------|
| `AI_BASE_URL` | ✅ | ✅ | Fase 0 |
| `AI_MODEL` | ✅ | ✅ | Fase 0 |
| `OPENAI_API_KEY` | ✅ | ✅ | Fase 0 |
| `VAPID_PUBLIC_KEY` | ✅ | ✅ | Fase 1 |
| `VAPID_PRIVATE_KEY` | ✅ | ✅ | Fase 1 |
| `VAPID_EMAIL` | ✅ | ✅ | Fase 1 |
| `SMTP_HOST` | ✅ | ✅ | Fase 2 |
| `SMTP_PORT` | ✅ | ✅ | Fase 2 |
| `SMTP_USER` | ✅ | ✅ | Fase 2 |
| `SMTP_PASS` | ✅ | ✅ | Fase 2 |
| `SMTP_FROM` | ✅ | ✅ | Fase 2 |
| `FIREBASE_PROJECT_ID` | ❌ | ✅ | Fase 4 |
| `FIREBASE_PRIVATE_KEY` | ❌ | ✅ | Fase 4 |
| `FIREBASE_CLIENT_EMAIL` | ❌ | ✅ | Fase 4 |
| `DEPLOY_HOST` | ✅ | ✅ | Fase 5 |
| `DEPLOY_SSH_KEY` | ✅ | ✅ | Fase 5 |
