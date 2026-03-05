# skills.md — Buone Pratiche per Progetti con Claude Code

## 0. Questa guida si evolve

Questo documento non è statico. Quando durante il lavoro emerge un pattern ricorrente,
una soluzione elegante, o una lezione imparata da un errore, fermati e chiediti:

### Il test delle 3 domande

Prima di aggiungere una nuova pratica a questo file:

1. **È riusabile?** — Funzionerebbe anche su un progetto diverso, con stack diverso?
   Se è specifica solo di questo progetto, va nel CLAUDE.md, non qui.
2. **È stata validata?** — L'abbiamo usata almeno 2 volte con successo,
   o ha risolto un problema reale? Le intuizioni non testate restano appunti, non best practice.
3. **È concreta?** — Si può tradurre in un'azione chiara ("fai X", "evita Y")?
   I principi vaghi ("scrivi codice pulito") non servono a nessuno.

### Come proporre un'aggiunta

Quando uno dei due (umano o Claude) nota un pattern interessante:

- **Segnalalo esplicitamente**: "Questo potrebbe essere una skill nuova per skills.md?"
- **Discutilo brevemente**: passa il test delle 3 domande?
- **Se sì**, aggiungilo nella sezione appropriata con un esempio concreto tratto dal progetto in cui è emerso.
- **Se no ma è utile**, annotalo nel CLAUDE.md del progetto specifico.

### Regola del "terzo progetto"

Nel dubbio, aspetta. Se lo stesso pattern emerge in un terzo progetto indipendente,
è quasi certamente una buona pratica. Due occorrenze possono essere coincidenza,
tre sono un pattern.

---

## 1. Parti semplice, evolvi gradualmente

- **Prima versione funzionante, poi refactor.** Non architettare tutto subito.
  - Esempio: App.jsx monolitico (~510 righe) → split in componenti + hooks solo quando la complessità lo richiedeva.
  - Esempio: localStorage → Express + PostgreSQL + Docker, un passo alla volta.
- **Non aggiungere TypeScript, test o linting finché non servono davvero.** Sono investimenti che hanno senso quando il progetto si stabilizza.

## 2. CLAUDE.md come bibbia del progetto

- Mantieni un `CLAUDE.md` aggiornato con: tech stack, struttura, comandi, convenzioni, data model, design system.
- Includi la **business logic non ovvia** (es. la sincronizzazione Waiting ↔ Status).
- Usa una sezione **Upgrade TODO** con priorità (P1/P2/P3/P4) come roadmap vivente.
- Aggiorna il CLAUDE.md ad ogni refactor significativo — è il primo file che viene letto.

## 3. Commit convenzionali e atomici

- Usa prefissi: `feat:`, `fix:`, `refactor:`, `chore:`.
- Un commit = un cambiamento logico. Non mescolare feature e refactor nello stesso commit.
- Il messaggio spiega il *perché*, non il *cosa* (il diff mostra il cosa).

## 4. Struttura modulare progressiva

- **Costanti in un file dedicato** (`data.js`): gruppi, stati, owner — single source of truth.
- **Stili centralizzati** (`styles.js`): un oggetto `S` con palette, font, input base.
- **Logica in custom hooks** (`useTasks.js`, `useRecurring.js`): separa stato + CRUD dal rendering.
- **Componenti piccoli e focalizzati**: un file per componente, nomi chiari (EditableText, StatusBadge, TaskRow).

## 5. Pattern UI collaudati

- **Optimistic updates**: aggiorna lo stato locale subito, sincronizza col server in background.
- **Polling + refetch on focus**: `setInterval` per il polling, `window.addEventListener('focus')` per riprendere dati freschi.
- **Debounce degli aggiornamenti**: `lastUpdateRef` per evitare che il polling sovrascriva modifiche locali recenti.
- **Filtri componibili**: search + status + owner + group, tutti indipendenti e azzerabili insieme.

## 6. Design system coerente

- Definisci la palette colori una volta sola e riusala ovunque.
- Status badge con colori semantici (blu=nuovo, arancio=in progress, rosso=waiting, verde=resolved, grigio=closed).
- Font monospace per dati tecnici, sans-serif per UI.
- Dark theme di default per tool interni / operativi.

## 7. Come chiedere le cose a Claude Code

- **Sii specifico sul risultato**, non sul metodo: "Aggiungi una tab Storico che mostra solo i task Closed" > "Modifica il filtro nell'array".
- **Dai contesto di business**: "Il flag waiting non deve aggiornare updatedAt perché altrimenti le righe saltano nel sort".
- **Indica le priorità**: se hai più cose da fare, numerale o usa P0/P1/P2.
- **Itera per step**: una feature alla volta, verifica, poi la prossima. Non chiedere 5 feature in un messaggio.
- **Se il risultato non ti convince, dillo subito** — è più facile correggere in corso che rifare dopo.

## 8. Architettura progressiva (no backend → backend)

- Inizia senza backend se puoi (localStorage, file JSON).
- Quando serve persistenza condivisa, aggiungi un backend minimale (Express + pg).
- Usa Docker Compose per orchestrare i servizi (db, api, nginx).
- Il frontend non deve sapere se parla con localStorage o un'API — astrai il layer di persistenza.

## 9. Checklist prima di chiudere una sessione

- [ ] Il codice compila senza errori (`npm run build`)?
- [ ] Le feature nuove funzionano come previsto?
- [ ] Il CLAUDE.md riflette lo stato attuale del progetto?
- [ ] I commit sono puliti e con messaggi chiari?
- [ ] C'è qualcosa da aggiungere all'Upgrade TODO?

## 10. Anti-pattern da evitare

- **Over-engineering prematuro**: non aggiungere abstraction layer, feature flag o config per cose che servono una volta sola.
- **Commit giganti**: se il diff è > 200 righe, probabilmente andava spezzato.
- **Stili sparsi**: non mettere colori/font hardcoded nei componenti, usa l'oggetto stili centralizzato.
- **Ignorare i warning**: se la console li mostra, risolvili subito — si accumulano.
- **Duplicare costanti**: se un valore appare in più di un posto, spostalo in `data.js`.
