# Alerta Desnona 🏠

Plataforma ciutadana de seguiment i alerta de desnonaments (subhastes judicials) a tot l'Estat espanyol. Les dades s'obtenen del Portal de Subastas del BOE.

## Funcionalitats

- **Mapa interactiu** amb tots els desnonaments pendents d'executar, amb clustering de punts
- **Pàgina de detall** per cada cas: adreça normalitzada, informació financera, jutjat, procediment
- **Estadístiques** per província i comunitat autònoma
- **Multiidioma**: Català, Castellà, Gallec, Euskara
- **Mode fosc / clar** automàtic

## Stack tecnològic

- **Frontend**: React 19 + TypeScript + Vite
- **Backend**: Express + TypeScript (tsx)
- **Base de dades**: SQLite (better-sqlite3)
- **IA**: Google Gemini 2.5 Flash Lite per normalitzar adreces
- **Geocoding**: Photon API (komoot.io) a nivell de ciutat
- **Mapa**: Leaflet + react-leaflet amb clustering

## Instal·lació

```bash
# Dependències
npm install
cd client && npm install
cd ../server && npm install

# Configura .env al directori server/
# AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
# AI_MODEL=gemini-2.5-flash-lite
# OPENAI_API_KEY=la_teva_clau_api

# Arranca el servidor (port 3001)
cd server && npx tsx src/index.ts

# Arranca el client (port 5173)
cd client && npx vite
```

## Pipeline de dades

1. **Scraping**: Recull casos del Portal de Subastas del BOE
2. **Parsing IA**: Normalitza adreces amb Gemini (batch de 100)
3. **Geocoding**: Geocodifica per ciutat amb Photon API

## Llicència

Projecte de codi obert sense ànim de lucre.
