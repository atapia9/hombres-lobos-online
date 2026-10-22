// Role catalogue (docs/roles.md). One module per role.
import { alpha } from './alpha.js';
import { hunter } from './hunter.js';
import { mayor } from './mayor.js';
import { protector } from './protector.js';
import { seer } from './seer.js';
import { spy } from './spy.js';
import { villager } from './villager.js';
import { witch } from './witch.js';
import { wolf } from './wolf.js';

export const ROLE_CATALOG = Object.freeze({
  [villager.id]: villager,
  [seer.id]: seer,
  [protector.id]: protector,
  [hunter.id]: hunter,
  [mayor.id]: mayor,
  [spy.id]: spy,
  [witch.id]: witch,
  [wolf.id]: wolf,
  [alpha.id]: alpha,
});

/** Roles the narrator can switch on or off in the lobby (each at most once). */
export const OPTIONAL_ROLES = Object.freeze(
  Object.values(ROLE_CATALOG).filter((r) => r.unique).map((r) => r.id),
);

export const roleLabel = (id) => ROLE_CATALOG[id]?.label ?? null;

export * from './alpha.js';
export * from './hunter.js';
export * from './mayor.js';
export * from './protector.js';
export * from './seer.js';
export * from './spy.js';
export * from './villager.js';
export * from './witch.js';
export * from './wolf.js';
