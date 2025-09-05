
# Add-on: Generatore Locandina (tools/poster)

Questa cartella è **autonoma** e non tocca nulla del progetto esistente.
Genera la locandina leggendo i dati dalla tab **Meta** del tuo Google Sheet.

## Come integrare
1. Copia **tutta** la cartella `tools/poster/` nella root della repo esistente.
2. Copia `.github/workflows/poster.yml` nella tua repo (accanto agli altri workflow).
3. In GitHub → **Settings → Secrets and variables → Actions**:
   - Modalità 1 (consigliata): aggiungi `SHEET_CSV_URL` con l'URL CSV “Publish to web” della tab **Meta`.
   - Oppure Modalità 2: aggiungi `SHEET_ID` e `SHEET_GID` (costruiremo noi l'URL CSV).
4. Vai su **Actions** → **Poster – Generate** → **Run workflow**.
5. Scarica gli **Artifacts** (PNG/WEBP in A4, 1080×1350, 1080×1080).

## Sponsor
- Metti i logo sponsor in `tools/poster/assets/sponsor/` (webp/png/svg/jpg).
- (Opzionale) Nella tab Meta, colonna **Sponsor** separata da `|` per ordinare/filtrare gli sponsor (es. `bar-rossi.webp|forno-sara.png`). Se vuota, usiamo **tutti** i file presenti nella cartella.
- La gabbia sponsor è **elastica**: scala automaticamente e va al massimo su 2 righe.

## Comandi locali (opzionali)
```bash
cd tools/poster
npm ci
# Legge dallo Sheet (se hai impostato le env SHEET_*)
SHEET_CSV_URL="https://docs.google.com/..." npm run from:sheet

# Oppure usa i dati già in data/match.json
npm run build
```
