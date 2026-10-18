// Changelog shown to users from the footer ("Novità"). Hand-written, in
// Italian, from the point of view of someone using the board: what they can
// do now, not how it was built. Commit messages are for developers; this is
// not generated from them.
//
// Newest first. One entry per production deploy, dated as the deploy
// (`mauden-prod-YYYY-MM-DD` tag). A user-visible `feat:` adds its line here in
// the same commit. `type`: 'new' | 'improved' | 'fixed'.
//
// The "unread" dot compares the first entry's date with the last one the
// viewer opened, so a new entry must go on top with a later date.
export const CHANGELOG = [
  {
    date: '2026-10-19',
    items: [
      { type: 'improved', text: 'L\'export ora è un file Excel al posto del CSV: si apre direttamente, con le intestazioni fisse, i colori degli stati e le date vere, che puoi ordinare e filtrare.' },
    ],
  },
  {
    date: '2026-10-18',
    items: [
      { type: 'new', text: 'Riordina i task trascinandoli: passa sul task e afferra la maniglia che compare a sinistra. L\'ordine è lo stesso per tutti e una modifica non sposta più la riga in cima.' },
      { type: 'new', text: 'Questo elenco delle novità, dal link in fondo alla pagina.' },
    ],
  },
  {
    date: '2026-10-10',
    items: [
      { type: 'new', text: 'Più lavagne nella stessa app: ogni team ha la sua, con sezioni proprie. Al primo accesso scegli la tua.' },
      { type: 'new', text: 'Tema chiaro, dal tasto nell\'intestazione. Puoi anche lasciare che segua il tema del sistema.' },
      { type: 'new', text: 'Gli admin gestiscono membri, ruoli e sezioni scrivibili da "Gestione permessi", nel menu utente.' },
      { type: 'improved', text: 'Icone nuove al posto delle emoji: seguono i colori del tema.' },
    ],
  },
  {
    date: '2026-10-07',
    items: [
      { type: 'new', text: 'Ogni task ha un numero (MD001, MD002…): si cerca, compare nell\'export CSV e nelle mail di assegnazione.' },
    ],
  },
  {
    date: '2026-09-28',
    items: [
      { type: 'fixed', text: 'Le mail di assegnazione arrivano di nuovo: si erano fermate a settembre.' },
    ],
  },
  {
    date: '2026-07-20',
    items: [
      { type: 'new', text: 'Tab Info Reperibile: spunta "Rep." su un task e lo vede chi è di turno. In cima alla tab c\'è il reperibile corrente.' },
    ],
  },
  {
    date: '2026-07-16',
    items: [
      { type: 'new', text: 'Annulla l\'ultima modifica con il tasto Annulla o con Ctrl+Z. Se nel frattempo un collega ha toccato lo stesso campo, l\'annullamento viene saltato.' },
      { type: 'improved', text: 'La ricerca evidenzia il testo trovato anche dentro le checklist.' },
    ],
  },
  {
    date: '2026-07-07',
    items: [
      { type: 'improved', text: 'La ricerca trova anche il testo delle checklist e apre il task che lo contiene.' },
      { type: 'fixed', text: 'Il testo di una voce di checklist si salva quando esci dal campo, non più a ogni tasto premuto.' },
    ],
  },
  {
    date: '2026-06-04',
    items: [
      { type: 'new', text: 'Priorità da P0 a P5. Un task P0 ha il bordo rosso.' },
      { type: 'new', text: 'Chi riceve un task assegnato viene avvisato per mail.' },
    ],
  },
  {
    date: '2026-05-19',
    items: [
      { type: 'new', text: 'Accesso con l\'account Microsoft aziendale.' },
      { type: 'new', text: 'Checklist dentro ogni task. Un task non si chiude finché ha voci aperte.' },
      { type: 'new', text: 'Operatori di sezione: possono modificare i task delle sezioni assegnate e leggere il resto.' },
      { type: 'new', text: 'Export CSV della sezione, apribile direttamente in Excel.' },
      { type: 'improved', text: 'I link nelle descrizioni sono cliccabili e la tab aperta resta quella dopo un ricaricamento.' },
    ],
  },
]

export const LATEST_CHANGE = CHANGELOG[0]?.date ?? null
