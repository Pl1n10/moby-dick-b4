export const STATUSES = ['New', 'In Progress', 'Waiting', 'Resolved', 'Closed'];

// Task priority, P0..P5. Convention: 0 = most urgent (drop everything),
// 5 = lowest. Default for new tasks is 3 (medium). See PriorityBadge + styles.
export const PRIORITIES = [0, 1, 2, 3, 4, 5];
export const DEFAULT_PRIORITY = 3;

// Sections (ex GROUPS) and owners are per board, fetched from the API: see
// src/board/BoardProvider.jsx and src/auth/OwnersProvider.jsx.

export const FREQUENCIES = ['daily', 'weekly', 'monthly'];
