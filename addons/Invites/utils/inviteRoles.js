const { getConfig } = require('../../../utils/core/configLoader.js');
const Invite = require('../models/inviteSchema');

const config = getConfig();

async function getUserInviteCount(guildId, userId) {
    const invites = await Invite.find({ guildID: guildId, inviterID: userId });
    let inviteCount = 0;

    for (const invite of invites) {
        inviteCount += invite.uses;
    }

    return inviteCount;
}

async function checkAndAssignInviteRoles(member) {
    try {
        if (!config.InviteRoles.Enabled) {
            return;
        }

        const guildId = member.guild.id;
        const userId = member.id;
        const shouldStack = config.InviteRoles.Stack !== false;

        const inviteCount = await getUserInviteCount(guildId, userId);

        const sortedTiers = Object.entries(config.InviteRoles.Tiers)
            .sort(([, a], [, b]) => b.Amount - a.Amount);

        let qualifiedTierFound = false;

        for (const [tierKey, tierData] of sortedTiers) {
            const rolesToProcess = tierData.Roles.filter(roleId => 
                roleId !== "ROLE_ID" && roleId.trim() !== ""
            );

            if (inviteCount >= tierData.Amount && !qualifiedTierFound) {
                qualifiedTierFound = true;
                
                for (const roleId of rolesToProcess) {
                    const role = member.guild.roles.cache.get(roleId);
                    if (role && !member.roles.cache.has(roleId)) {
                        try {
                            await member.roles.add(role);
                        } catch (error) {
                            console.error(`[INVITE ROLES] Error adding role ${role.name} to ${member.user.tag}:`, error);
                        }
                    }
                }
            } else if (!shouldStack && qualifiedTierFound) {
                for (const roleId of rolesToProcess) {
                    const role = member.guild.roles.cache.get(roleId);
                    if (role && member.roles.cache.has(roleId)) {
                        try {
                            await member.roles.remove(role);
                        } catch (error) {
                            console.error(`[INVITE ROLES] Error removing role ${role.name} from ${member.user.tag}:`, error);
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.error('[INVITE ROLES] Error in checkAndAssignInviteRoles:', error);
    }
}

async function updateInviteRolesForUser(client, guildId, userId) {
    try {
        if (!config.InviteRoles.Enabled) {
            return;
        }

        const guild = client.guilds.cache.get(guildId);
        if (!guild) return;

        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) return;

        await checkAndAssignInviteRoles(member);
    } catch (error) {
        console.error('[INVITE ROLES] Error in updateInviteRolesForUser:', error);
    }
}

module.exports = {
    getUserInviteCount,
    checkAndAssignInviteRoles,
    updateInviteRolesForUser
};