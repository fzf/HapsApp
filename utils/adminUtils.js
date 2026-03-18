/**
 * adminUtils.js
 *
 * Utilities for gating debug/admin features to specific users.
 * Currently: user ID 1 gets full debug access in all builds.
 */

const ADMIN_USER_IDS = [1];

/**
 * Returns true if the given user should have debug/admin tools visible.
 * Works in both dev and production builds.
 */
export function isAdminUser(user) {
  if (!user) return false;
  const id = Number(user.id ?? user.user_id);
  return ADMIN_USER_IDS.includes(id) || __DEV__;
}
