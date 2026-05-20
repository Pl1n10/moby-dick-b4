-- KanbanOps — Migration 009
-- Stato del mini-gioco "Bit Adder" (easter egg).
-- Una riga per utente, FK su users(email) ON DELETE CASCADE: se l'admin
-- cancella un utente dalla pagina /users, lo score sparisce con lui.
--
-- bits/bots non possono andare negativi (CHECK). updated_at serve solo per
-- diagnostica e per il rate check del POST /click (delta vs elapsedSec).
--
-- Idempotente: CREATE TABLE IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS bit_adder (
  email       TEXT PRIMARY KEY REFERENCES users(email) ON DELETE CASCADE,
  bits        BIGINT NOT NULL DEFAULT 0 CHECK (bits >= 0),
  bots        INT    NOT NULL DEFAULT 0 CHECK (bots >= 0),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
