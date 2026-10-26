import { useState, useRef, useEffect } from 'react';
import { useGuild } from '../../contexts/GuildContext';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronDown, faCheck, faServer } from '@fortawesome/free-solid-svg-icons';
import { motion, AnimatePresence } from 'framer-motion';

interface GuildSelectorProps {
    collapsed?: boolean;
}

export default function GuildSelector({ collapsed = false }: GuildSelectorProps) {
    const { guilds, activeGuild, activeGuildId, loading, switchGuild } = useGuild();
    const [isOpen, setIsOpen] = useState(false);
    const [switching, setSwitching] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = async (guildId: string) => {
        if (guildId === activeGuildId || switching) return;
        setSwitching(true);
        try {
            await switchGuild(guildId);
            setIsOpen(false);
            window.location.reload();
        } catch (e) {
            console.error('[GuildSelector] Switch failed:', e);
        } finally {
            setSwitching(false);
        }
    };

    if (loading) {
        return (
            <div className="mx-2 mb-2">
                <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-secondary/30 animate-pulse">
                    <div className="w-7 h-7 rounded-lg bg-secondary/50" />
                    {!collapsed && <div className="h-3.5 w-24 bg-secondary/50 rounded-md" />}
                </div>
            </div>
        );
    }

    if (guilds.length <= 1) return null;

    if (collapsed) {
        return (
            <div className="relative mx-2 mb-2" ref={dropdownRef}>
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="w-full flex items-center justify-center p-2.5 rounded-xl bg-secondary/30 border border-border/30 hover:bg-secondary/50 transition-all duration-200"
                >
                    {activeGuild?.icon ? (
                        <img src={activeGuild.icon} alt="" className="w-7 h-7 rounded-lg object-cover" />
                    ) : (
                        <div className="w-7 h-7 rounded-lg bg-secondary/50 flex items-center justify-center">
                            <FontAwesomeIcon icon={faServer} className="w-3 h-3 text-muted-foreground" />
                        </div>
                    )}
                </button>

                <AnimatePresence>
                    {isOpen && (
                        <motion.div
                            initial={{ opacity: 0, x: -5 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -5 }}
                            transition={{ duration: 0.15 }}
                            className="absolute left-full top-0 ml-3 z-50 w-56"
                        >
                            <div className="bg-card border border-border/30 rounded-xl overflow-hidden py-1">
                                {guilds.map(guild => (
                                    <button
                                        key={guild.id}
                                        onClick={() => handleSelect(guild.id)}
                                        disabled={switching}
                                        className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-all duration-200 ${
                                            guild.id === activeGuildId
                                                ? 'bg-primary/10 text-foreground'
                                                : 'text-muted-foreground hover:text-foreground hover:bg-secondary/40'
                                        } ${switching ? 'opacity-50 cursor-wait' : ''}`}
                                    >
                                        {guild.icon ? (
                                            <img src={guild.icon} alt="" className="w-6 h-6 rounded-md object-cover shrink-0" />
                                        ) : (
                                            <div className="w-6 h-6 rounded-md bg-secondary/50 flex items-center justify-center shrink-0">
                                                <span className="text-[10px] font-bold">{guild.name.charAt(0)}</span>
                                            </div>
                                        )}
                                        <span className="text-xs font-medium truncate flex-1">{guild.name}</span>
                                        {guild.id === activeGuildId && (
                                            <FontAwesomeIcon icon={faCheck} className="w-3 h-3 text-primary shrink-0" />
                                        )}
                                    </button>
                                ))}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        );
    }

    return (
        <div className="relative mx-2 mb-2" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-secondary/30 border border-border/30 hover:bg-secondary/50 transition-all duration-200 ${switching ? 'opacity-50 cursor-wait' : ''}`}
                disabled={switching}
            >
                {activeGuild?.icon ? (
                    <img src={activeGuild.icon} alt="" className="w-7 h-7 rounded-lg object-cover shrink-0" />
                ) : (
                    <div className="w-7 h-7 rounded-lg bg-secondary/50 flex items-center justify-center shrink-0">
                        <FontAwesomeIcon icon={faServer} className="w-3 h-3 text-muted-foreground" />
                    </div>
                )}
                <span className="text-xs font-medium text-foreground truncate flex-1 text-left">
                    {activeGuild?.name || 'Select Server'}
                </span>
                <FontAwesomeIcon
                    icon={faChevronDown}
                    className={`w-3 h-3 text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                />
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -5, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -5, scale: 0.98 }}
                        transition={{ duration: 0.15 }}
                        className="absolute left-0 right-0 top-full mt-1.5 z-50"
                    >
                        <div className="bg-card border border-border/30 rounded-xl overflow-hidden py-1 max-h-64 overflow-y-auto">
                            {guilds.map(guild => (
                                <button
                                    key={guild.id}
                                    onClick={() => handleSelect(guild.id)}
                                    disabled={switching}
                                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-all duration-200 ${
                                        guild.id === activeGuildId
                                            ? 'bg-primary/10 text-foreground'
                                            : 'text-muted-foreground hover:text-foreground hover:bg-secondary/40'
                                    } ${switching ? 'opacity-50 cursor-wait' : ''}`}
                                >
                                    {guild.icon ? (
                                        <img src={guild.icon} alt="" className="w-7 h-7 rounded-lg object-cover shrink-0" />
                                    ) : (
                                        <div className="w-7 h-7 rounded-lg bg-secondary/50 flex items-center justify-center shrink-0">
                                            <span className="text-xs font-bold">{guild.name.charAt(0)}</span>
                                        </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <span className="text-xs font-medium truncate block">{guild.name}</span>
                                        <span className="text-[10px] text-muted-foreground/60">{guild.memberCount.toLocaleString()} members</span>
                                    </div>
                                    {guild.id === activeGuildId && (
                                        <FontAwesomeIcon icon={faCheck} className="w-3 h-3 text-primary shrink-0" />
                                    )}
                                </button>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
