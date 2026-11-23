# KanbanOps Connector

Estensione di Chrome (o Edge) che serve al pulsante **Connetti** delle integrazioni di KanbanOps
(Gestione permessi → Integrazioni). La installa chi collega o rinnova le sessioni dei portali
di supporto, cioè gli admin di lavagna. Gli altri non ne hanno bisogno.

## Cosa fa

1. Su KanbanOps premi **Connetti** (o **Riconnetti**) su un'integrazione.
2. L'estensione apre in una finestrella il login del portale, per esempio quello di Cohesity.
   Fai il login tu: password, captcha e MFA restano tuoi.
3. Appena il portale ti fa entrare, l'estensione prende il cookie di sessione e lo passa alla
   pagina di KanbanOps che l'ha chiesto. La pagina lo salva sulla board, con i tuoi permessi.
4. L'estensione cancella quella sessione da questo browser e chiude la finestra.

Il passo 4 serve perché la sessione cambia a ogni rinnovo: se il browser continuasse a usarla,
butterebbe fuori la board.

## Cosa non fa

- Non legge e non salva password: il login lo fai tu sul sito del fornitore.
- Funziona solo su `https://kanbanops.mauden.com` e legge solo i cookie dei portali elencati in
  `background.js` (`PROVIDERS`). La pagina può chiedere un portale di quella lista, nient'altro.
- Non parla con nessun server: tutto passa dalla scheda di KanbanOps che hai aperto.

## Installazione (una volta)

1. Scarica la cartella `extension/` del repository (o fatti passare lo zip).
2. Apri `chrome://extensions` (in Edge `edge://extensions`).
3. Attiva **Modalità sviluppatore** in alto a destra.
4. **Carica estensione non pacchettizzata** e scegli la cartella `extension/`.
5. Ricarica la scheda di KanbanOps: in Integrazioni il pulsante **Connetti** diventa attivo.

Se il browser non è quello aziendale o non permette estensioni non pacchettizzate, la sessione si
può sempre incollare a mano ("Oppure incolla la sessione a mano", stessa finestra).

## Aggiungere un portale

Un portale nuovo sta in due posti, che vanno tenuti allineati:

- backend: un modulo in `backend/src/integrations/providers/` (vedi `index.js`);
- estensione: una voce in `PROVIDERS` di `background.js`, il suo id in `content.js`, il suo
  dominio in `host_permissions` di `manifest.json`. Poi va alzata la `version` e chi ha
  l'estensione deve ricaricarla da `chrome://extensions`.

Nota: `host_permissions` con una porta (`http://host:1234/*`) non dà accesso ai cookie. Va
scritto senza porta.
