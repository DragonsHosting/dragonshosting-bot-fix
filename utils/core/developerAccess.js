const DEVELOPER_IDS = new Set([
  // Discord user IDs can be added here.
]);

const DEVELOPER_ROLE_IDS = new Set([
  '1505816343406968903', // Bot Developers
  '1505815795643453551', // MC Development Manager
  '1505815941005705308', // MC Head Developer
  '1505816063261151304', // MC Developer
  '1505816125739368568', // MC Head Configurator
  '1505816184304701472', // MC Configurator
  '1507348091177664588', // H-Manager
  '1507673467393277952', // Manager
  '1502994605757436125', // H-Administratie
  '1506646518181138552', // Administratie
  '1505845635671396472', // Head Moderator
  '1505845756525936650', // Sr. Moderator
  '1505845822363926642', // Moderator
  '1505845879607660574', // Jr. Moderator
  '1505845932510412860', // Helper
  '1505846025326170182', // Trial Helper
  '1506340973029101679'  // General Staff Role
]);

const PUBLIC_ROLE_IDS = new Set([
  '1482714956922224650' // members
]);

const patchedPermissions = new WeakSet();
const patchedRoleCaches = new WeakSet();

function normalizeUserId(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return value.user?.id || value.member?.id || value.member?.user?.id || value.id || null;
}

function memberHasAnyRole(value, roleIds) {
  const member = value?.member || value;
  const roles = member?.roles;
  if (!roles) return false;

  if (roles.cache && typeof roles.cache.has === 'function') {
    return [...roleIds].some(roleId => roles.cache.has(roleId));
  }

  if (Array.isArray(roles)) {
    return roles.some(role => roleIds.has(typeof role === 'string' ? role : role?.id));
  }

  if (typeof roles.has === 'function') {
    return [...roleIds].some(roleId => roles.has(roleId));
  }

  return false;
}

function memberHasDeveloperRole(value) {
  return memberHasAnyRole(value, DEVELOPER_ROLE_IDS);
}

function memberHasPublicRole(value) {
  return memberHasAnyRole(value, PUBLIC_ROLE_IDS);
}

function isDeveloper(value) {
  const id = normalizeUserId(value);
  return Boolean((id && DEVELOPER_IDS.has(id)) || memberHasDeveloperRole(value));
}

function patchPermissionObject(permissions) {
  if (!permissions || typeof permissions.has !== 'function' || patchedPermissions.has(permissions)) return;
  if (!Object.isExtensible(permissions)) return;

  const originalHas = permissions.has.bind(permissions);
  try {
    permissions.has = () => true;
    patchedPermissions.add(permissions);
  } catch {
    // Discord.js can freeze some permission objects. In that case, runtime
    // default-permission checks still allow developer roles via isDeveloper().
  }
}

function patchRoleCache(roleCache) {
  if (!roleCache || patchedRoleCaches.has(roleCache)) return;
  if (!Object.isExtensible(roleCache)) return;

  const originalHas = typeof roleCache.has === 'function' ? roleCache.has.bind(roleCache) : null;
  const originalSome = typeof roleCache.some === 'function' ? roleCache.some.bind(roleCache) : null;

  try {
    if (originalHas) {
      roleCache.has = (roleId, ...args) => originalHas(roleId, ...args) || DEVELOPER_ROLE_IDS.has(roleId);
    }

    if (originalSome) {
      roleCache.some = (predicate, thisArg) => {
        if (originalSome(predicate, thisArg)) return true;
        if (typeof predicate !== 'function') return false;

        return [...DEVELOPER_ROLE_IDS].some(roleId => {
          try {
            return Boolean(predicate.call(thisArg, { id: roleId, name: 'Developer Bypass' }, roleId, roleCache));
          } catch {
            return false;
          }
        });
      };
    }
    patchedRoleCaches.add(roleCache);
  } catch {
    // Leave the original cache intact if Discord.js prevents mutation.
  }
}

function applyDeveloperPermissionBypass(interaction) {
  if (!isDeveloper(interaction)) return false;

  patchPermissionObject(interaction.member?.permissions);
  patchPermissionObject(interaction.memberPermissions);
  patchRoleCache(interaction.member?.roles?.cache);
  return true;
}

function getDefaultMemberPermissions(command) {
  try {
    const json = command?.data?.toJSON?.();
    return json?.default_member_permissions ?? null;
  } catch {
    return null;
  }
}

function commandToPublicRegistrationJSON(command) {
  const json = command.data.toJSON();

  // Runtime checks still enforce normal permissions. Clearing this only prevents
  // Discord from hiding admin/mod commands from configured staff and developers.
  if (Object.prototype.hasOwnProperty.call(json, 'default_member_permissions')) {
    json.default_member_permissions = null;
  }

  return json;
}

function memberHasRequiredDefaultPermission(interaction, requiredPermissions) {
  if (!requiredPermissions) return true;
  if (isDeveloper(interaction)) return true;

  const permissions = interaction.memberPermissions || interaction.member?.permissions;
  if (!permissions || typeof permissions.has !== 'function') return false;

  try {
    return permissions.has(BigInt(requiredPermissions));
  } catch {
    return permissions.has(requiredPermissions);
  }
}

module.exports = {
  DEVELOPER_IDS,
  DEVELOPER_ROLE_IDS,
  PUBLIC_ROLE_IDS,
  isDeveloper,
  memberHasPublicRole,
  applyDeveloperPermissionBypass,
  getDefaultMemberPermissions,
  commandToPublicRegistrationJSON,
  memberHasRequiredDefaultPermission
};
