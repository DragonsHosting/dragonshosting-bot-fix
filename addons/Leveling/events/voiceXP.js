'use strict';

const { getConfig } = require('../../../utils/core/configLoader');
const { handleVoiceXP } = require('./handleXP');

const activeVoiceUsers = new Map();
let voiceXpInterval = null;
let cleanupInterval = null;

function parseTime(timeString) {
    const match = /^(\d+)([smhd])$/.exec(timeString || '');
    if (!match) return 0;
    const value = Number.parseInt(match[1], 10);
    return value * ({ s: 1000, m: 60000, h: 3600000, d: 86400000 }[match[2]] || 0);
}

function stopVoiceXPSystem() {
    if (voiceXpInterval) clearInterval(voiceXpInterval);
    voiceXpInterval = null;
    activeVoiceUsers.clear();
}

function startVoiceXPSystem(client) {
    const config = getConfig();
    if (voiceXpInterval || !config.LevelingSystem?.Enabled) return;
    const interval = Math.max(parseTime(config.LevelingSystem.CooldownSettings?.VoiceInterval || '60s'), 30000);
    voiceXpInterval = setInterval(async () => {
        for (const [memberId, cachedMember] of Array.from(activeVoiceUsers.entries()).slice(0, 75)) {
            try {
                const member = await cachedMember?.guild?.members.fetch(memberId).catch(() => null);
                if (!member?.voice?.channel) {
                    activeVoiceUsers.delete(memberId);
                    continue;
                }
                activeVoiceUsers.set(memberId, member);
                await handleVoiceXP(client, member);
            } catch (error) {
                console.error(`[Leveling] Voice XP failed for ${memberId}:`, error);
                activeVoiceUsers.delete(memberId);
            }
        }
    }, interval);
    voiceXpInterval.unref?.();
}

function handleVoiceState(client, oldState, newState) {
    const config = getConfig();
    if (!config.LevelingSystem?.Enabled) return;
    if (!oldState.channel && newState.channel && newState.member) {
        activeVoiceUsers.set(newState.member.id, newState.member);
        startVoiceXPSystem(client);
    } else if (oldState.channel && !newState.channel && oldState.member) {
        activeVoiceUsers.delete(oldState.member.id);
        if (!activeVoiceUsers.size) stopVoiceXPSystem();
    } else if (oldState.channelId !== newState.channelId) {
        if (newState.member?.voice?.channel) activeVoiceUsers.set(newState.member.id, newState.member);
        else if (oldState.member) activeVoiceUsers.delete(oldState.member.id);
    }
}

function startCleanup() {
    if (cleanupInterval) return;
    cleanupInterval = setInterval(async () => {
        if (activeVoiceUsers.size <= 200) return;
        for (const [memberId, member] of activeVoiceUsers) {
            const fresh = await member?.guild?.members.fetch(memberId).catch(() => null);
            if (!fresh?.voice?.channel) activeVoiceUsers.delete(memberId);
            else activeVoiceUsers.set(memberId, fresh);
        }
    }, 120000);
    cleanupInterval.unref?.();
}

function cleanup() {
    stopVoiceXPSystem();
    if (cleanupInterval) clearInterval(cleanupInterval);
    cleanupInterval = null;
}

module.exports = { handleVoiceState, startCleanup, cleanup };
