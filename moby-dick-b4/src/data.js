export const GROUPS = ['Commvault', 'Cohesity', 'NetBackup + Data Domain'];

export const STATUSES = ['New', 'In Progress', 'Waiting', 'Resolved', 'Closed'];

export const OWNERS = ['Bob', 'Erica', 'Walker'];

export const SEED_TASKS = [
  {
    id: 'seed-cv-1',
    group: 'Commvault',
    reference: 'INC00412301',
    description: 'Backup job failing on SQL Server prod cluster — timeout after 4h',
    status: 'In Progress',
    owner: 'Bob',
    waiting: false,
    updatedAt: new Date('2026-02-07T09:30:00').toISOString(),
  },
  {
    id: 'seed-cv-2',
    group: 'Commvault',
    reference: 'Email: RE: License renewal Q1',
    description: 'Commvault license expiring March 15 — need PO approval from client',
    status: 'Waiting',
    owner: 'Erica',
    waiting: true,
    updatedAt: new Date('2026-02-06T14:00:00').toISOString(),
  },
  {
    id: 'seed-co-1',
    group: 'Cohesity',
    reference: 'INC00398877',
    description: 'Cohesity DataProtect node offline after firmware update',
    status: 'New',
    owner: 'Walker',
    waiting: false,
    updatedAt: new Date('2026-02-08T11:15:00').toISOString(),
  },
  {
    id: 'seed-co-2',
    group: 'Cohesity',
    reference: 'Email: Cohesity cluster expansion',
    description: 'Client requested 3 additional nodes — sizing document needed',
    status: 'In Progress',
    owner: 'Erica',
    waiting: false,
    updatedAt: new Date('2026-02-05T16:45:00').toISOString(),
  },
  {
    id: 'seed-nb-1',
    group: 'NetBackup + Data Domain',
    reference: 'INC00420100',
    description: 'NetBackup master server certificate expired — all policies suspended',
    status: 'In Progress',
    owner: 'Bob',
    waiting: false,
    updatedAt: new Date('2026-02-09T08:00:00').toISOString(),
  },
  {
    id: 'seed-nb-2',
    group: 'NetBackup + Data Domain',
    reference: 'Email: DD replication lag alert',
    description: 'Data Domain replication to DR site lagging >24h — bandwidth issue suspected',
    status: 'Waiting',
    owner: 'Walker',
    waiting: true,
    updatedAt: new Date('2026-02-08T17:30:00').toISOString(),
  },
];
