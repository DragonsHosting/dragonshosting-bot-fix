import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../lib/api/axios';

interface Guild {
    id: string;
    name: string;
    icon: string | null;
    memberCount: number;
    isOwner: boolean;
}

interface GuildContextType {
    guilds: Guild[];
    activeGuild: Guild | null;
    activeGuildId: string | null;
    loading: boolean;
    switchGuild: (guildId: string) => Promise<void>;
    refreshGuilds: () => Promise<void>;
}

const GuildContext = createContext<GuildContextType>({
    guilds: [],
    activeGuild: null,
    activeGuildId: null,
    loading: true,
    switchGuild: async () => {},
    refreshGuilds: async () => {},
});

export function GuildProvider({ children }: { children: React.ReactNode }) {
    const [guilds, setGuilds] = useState<Guild[]>([]);
    const [activeGuildId, setActiveGuildId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchGuilds = useCallback(async () => {
        try {
            const res = await api.get('/guilds');
            setGuilds(res.data.guilds || []);
            setActiveGuildId(res.data.activeGuildId || null);
        } catch (e) {
            console.error('[GuildContext] Failed to fetch guilds:', e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchGuilds();
    }, [fetchGuilds]);

    const switchGuild = useCallback(async (guildId: string) => {
        try {
            const res = await api.post('/guilds/select', { guildId });
            if (res.data.success) {
                setActiveGuildId(guildId);
                window.dispatchEvent(new CustomEvent('guild-changed', { detail: { guildId } }));
            }
        } catch (e) {
            console.error('[GuildContext] Failed to switch guild:', e);
            throw e;
        }
    }, []);

    const activeGuild = guilds.find(g => g.id === activeGuildId) || null;

    return (
        <GuildContext.Provider value={{
            guilds,
            activeGuild,
            activeGuildId,
            loading,
            switchGuild,
            refreshGuilds: fetchGuilds,
        }}>
            {children}
        </GuildContext.Provider>
    );
}

export function useGuild() {
    return useContext(GuildContext);
}

export default GuildContext;
