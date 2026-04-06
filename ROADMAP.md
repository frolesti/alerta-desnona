# Alerta Desnona — Roadmap de Producció

Full de ruta per convertir Alerta Desnona en una plataforma completa:
pàgina web (PWA) + app mòbil (Capacitor), amb notificacions push i desplegament automatitzat.

---

## Fase 0: Environments a GitHub Actions
> Configurar `staging` i `production` al workflow per separar secrets i pipelines.

- [x] Workflow `daily-update.yml` amb 2 environments (staging + production)
- [x] Environment secrets documentats a `.env.example`
- [x] Protection rules documentades (production requereix approval manual)
- [x] Environments creats a GitHub → Settings → Environments
- [ ] Secrets afegits a cada environment (manual)

## Fase 1: PWA + Push Notifications
> Convertir el client React/Vite en una Progressive Web App instal·lable amb notificacions push.

- [x] `manifest.json` amb icones, colors i configuració PWA
- [x] Service Worker amb precaching i estratègia network-first
- [x] Registre de SW a `main.tsx` (vanilla, sense `vite-plugin-pwa`)
- [x] Meta tags PWA a `index.html` (apple-touch-icon, theme-color...)
- [x] Registre de Service Worker al client (`registerSW`)
- [x] Servei VAPID push al servidor (`services/push.ts`)
- [x] Endpoint API per enviar push notifications
- [x] Client: hook `usePushNotifications` per subscripció/dessubscripció
- [x] Component UI per activar/desactivar notificacions
- [x] Integració cron.ts amb push real (substituir placeholder)
- [x] Generar VAPID keys reals i afegir a `.env` local
- [ ] Afegir VAPID secrets a GitHub Environments (manual)
- [ ] Provar instal·lació PWA al mòbil (manual)
- [ ] Provar notificació push real (manual)

## Fase 2: Email amb Nodemailer
> Resum diari per email als usuaris subscrits.

- [x] Configurar `nodemailer` transport amb SMTP (`services/email.ts`)
- [x] Template HTML per resum diari (taula responsive amb estils inline)
- [x] Template HTML per alerta individual (desnonament imminent)
- [x] Integrar amb `cron.ts` (resum diari real + emails imminents)
- [x] Secrets SMTP afegits al workflow i `.env.example`
- [x] Configurar compte SMTP real (Gmail App Password)
- [ ] Provar enviament d'email real (manual)

## Fase 3: Capacitor (App nativa) + Push natiu
> Embolcallar la PWA en una app nativa per a Android i iOS, amb push natiu.

- [x] Instal·lar Capacitor (`@capacitor/core`, `@capacitor/cli`)
- [x] Configurar `capacitor.config.ts`
- [x] Afegir plataforma Android (`npx cap add android`)
- [x] Afegir plataforma iOS (`npx cap add ios`)
- [x] Plugin `@capacitor/push-notifications` per FCM/APNs
- [x] Hook `useNativePush.ts` per push natiu
- [x] `PushToggle` unificat (detecta web vs natiu automàticament)
- [x] Endpoint API `PUT /api/usuaris/:id/fcm-token`
- [x] Columna `fcm_token` a BD + migració automàtica
- [x] Crear projecte Firebase + `google-services.json` copiat
- [x] Integrar `firebase-admin` al servidor per enviar via FCM (Fase 4)
- [ ] Compilar APK (requereix Android Studio) (manual)
- [ ] Compilar iOS (requereix Xcode + Mac) (manual)

## Fase 4: Firebase Cloud Messaging (servidor)
> Enviar push natiu des del servidor via FCM.

- [x] `firebase-admin` al servidor
- [x] Servei FCM complet (`services/fcm.ts`) amb `initFCM()` + `notificarImminentsFCM()`
- [x] Integrat amb `cron.ts` (web-push + FCM + email en paral·lel)
- [x] Neteja automàtica de tokens invàlids
- [ ] Afegir secrets Firebase a GitHub Environments (manual)
- [ ] Provar push natiu real (manual)

## Fase 5: Deploy a Producció
> Servidor real accessible públicament.

- [x] Dockerfile multi-stage (client-build → server-build → production)
- [x] `.dockerignore` per builds eficients
- [x] `docker-compose.yml` amb volum persistent per la BD
- [x] GitHub Actions `deploy.yml` (build + push a GHCR)
- [x] Opcions de deploy comentades: Railway, Fly.io, SSH/VPS
- [x] `VITE_API_URL` env var per builds Capacitor/staging
- [x] Type declarations (`vite-env.d.ts`)
- [ ] Escollir plataforma (Railway, Fly.io, VPS...) (manual)
- [ ] Configurar deploy real + domini + SSL (manual)
- [ ] Migrar de SQLite a PostgreSQL (si escala ho requereix, futur)

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
| `DEPLOY_HOST` | ✅ | ✅ | Fase 5 (SSH) |
| `DEPLOY_SSH_KEY` | ✅ | ✅ | Fase 5 (SSH) |
| `RAILWAY_TOKEN` | ❌ | ✅ | Fase 5 (Railway) |
| `FLY_API_TOKEN` | ❌ | ✅ | Fase 5 (Fly.io) |
