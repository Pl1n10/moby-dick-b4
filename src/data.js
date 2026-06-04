export const GROUPS = ['Commvault', 'Cohesity', 'Data Domain - ZFS', 'NBU - Banche Estere'];

export const STATUSES = ['New', 'In Progress', 'Waiting', 'Resolved', 'Closed'];

// Task priority, P0..P5. Convention: 0 = most urgent (drop everything),
// 5 = lowest. Default for new tasks is 3 (medium). See PriorityBadge + styles.
export const PRIORITIES = [0, 1, 2, 3, 4, 5];
export const DEFAULT_PRIORITY = 3;

// OWNERS is now dynamic — fetched from /api/users/owners. See OwnersProvider.

export const FREQUENCIES = ['daily', 'weekly', 'monthly'];
