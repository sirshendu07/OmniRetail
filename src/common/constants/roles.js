/**
 * Role-Based Access Control (RBAC) System Roles.
 */
export const ROLES = Object.freeze({
  CUSTOMER: 'CUSTOMER',
  ADMIN: 'ADMIN',
  INVENTORY_MANAGER: 'INVENTORY_MANAGER',
  STORE_MANAGER: 'STORE_MANAGER',
  WAREHOUSE_STAFF: 'WAREHOUSE_STAFF',
  SUPPORT: 'SUPPORT'
});

export const ALL_ROLES = Object.values(ROLES);
