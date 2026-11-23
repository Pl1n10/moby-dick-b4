// Registry of vendor support portals a board can connect.
//
// A provider is a module with this shape (see cohesity.js):
//   id, label, portal                 identity, shown in the console and on the tab
//   credential { label, help[] }      what the admin pastes and how to get it
//   credentialsFrom(pasted)           → stored credentials object, or null if malformed
//   hasSession(credentials)           → boolean
//   fetchCases(credentials, save)     → normalized cases; calls save(newCreds) on rotation
//   isOpen(c), mapStatus(status), mapPriority(p), waitingOnUs(status),
//   caseUrl(extId), describe(c)
// Normalized case: { extId, number, subject, status, priority, product,
//   clusterName, origin, openedAt, modifiedAt, closedAt }.
//
// Adding a provider = a new module here. No migration: integrations.provider
// is free text validated against this registry.

import cohesity from './cohesity.js'

const PROVIDERS = new Map([cohesity].map(p => [p.id, p]))

export function getProvider(id) {
  return PROVIDERS.get(id) || null
}

// What the console needs to offer a provider: never any credential.
export function listProviders() {
  return [...PROVIDERS.values()].map(p => ({
    id: p.id, label: p.label, portal: p.portal, credential: p.credential,
  }))
}
