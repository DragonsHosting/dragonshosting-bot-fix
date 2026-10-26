import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRobot, faPalette, faServer, faChartBar, faReply, faSmile, faCompass, faCog, faBan } from '@fortawesome/free-solid-svg-icons';
import BotActivitySettings from './modules/BotActivitySettings'
import DashboardSettings from './modules/DashboardSettings'
import ThemeSettings from './modules/ThemeSettings'
import AutoResponseSettings from './modules/AutoResponseSettings'
import AutoReactSettings from './modules/AutoReactSettings'
import NavigationSettings from './modules/NavigationSettings'
import ChannelStatsSettings from './modules/ChannelStatsSettings'
import BlacklistWordsSettings from './modules/BlacklistWordsSettings'

const tabs = [
    { id: 'bot', label: 'Bot', icon: faRobot },
    { id: 'dashboard', label: 'Dashboard', icon: faPalette },
    { id: 'server', label: 'Server', icon: faServer },
];

const botSettings = [
    { id: 'activity', label: 'Bot Activity', icon: faRobot, component: BotActivitySettings },
    { id: 'stats', label: 'Channel Stats', icon: faChartBar, component: ChannelStatsSettings },
];

const dashboardSettings = [
    { id: 'general', label: 'General', icon: faCog, component: DashboardSettings },
    { id: 'theme', label: 'Theme', icon: faPalette, component: ThemeSettings },
    { id: 'navigation', label: 'Navigation', icon: faCompass, component: NavigationSettings },
];

const serverSettings = [
    { id: 'autoresponse', label: 'Auto Response', icon: faReply, component: AutoResponseSettings },
    { id: 'autoreact', label: 'Auto React', icon: faSmile, component: AutoReactSettings },
    { id: 'blacklist', label: 'Blacklist Words', icon: faBan, component: BlacklistWordsSettings },
];

function SettingsPage() {
    const [activeTab, setActiveTab] = useState('bot');
    const [expandedSections, setExpandedSections] = useState({});

    const toggleSection = (id) => {
        setExpandedSections(prev => ({
            ...prev,
            [id]: !prev[id]
        }));
    };

    const getCurrentSettings = () => {
        switch (activeTab) {
            case 'bot': return botSettings;
            case 'dashboard': return dashboardSettings;
            case 'server': return serverSettings;
            default: return [];
        }
    };

    return (
        <div className="p-4 lg:p-6 max-w-[1400px] mx-auto">
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6"
            >
                <div className="inline-flex p-1.5 glass-card rounded-2xl">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`relative flex items-center gap-2.5 px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 ${
                                activeTab === tab.id
                                    ? 'text-primary-foreground'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            {activeTab === tab.id && (
                                <motion.div
                                    layoutId="activeTab"
                                    className="absolute inset-0 bg-gradient-to-r from-primary to-primary/80 rounded-xl shadow-glow"
                                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                />
                            )}
                            <FontAwesomeIcon icon={tab.icon} className="w-4 h-4 relative z-10" />
                            <span className="relative z-10">{tab.label}</span>
                        </button>
                    ))}
                </div>
            </motion.div>

            <AnimatePresence mode="wait">
                <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-4"
                >
                    {getCurrentSettings().map((setting, index) => {
                        const isExpanded = expandedSections[setting.id] ?? false;
                        const Component = setting.component;
                        
                        return (
                            <motion.div
                                key={setting.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.1 }}
                                className="glass-card overflow-hidden"
                            >
                                <button
                                    onClick={() => toggleSection(setting.id)}
                                    className="w-full flex items-center justify-between px-5 py-4 hover:bg-secondary/20 transition-colors duration-200"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="p-2.5 rounded-xl bg-primary/10">
                                            <FontAwesomeIcon icon={setting.icon} className="w-4 h-4 text-primary" />
                                        </div>
                                        <span className="text-sm font-semibold text-foreground">{setting.label}</span>
                                    </div>
                                    <motion.div
                                        animate={{ rotate: isExpanded ? 180 : 0 }}
                                        transition={{ duration: 0.2 }}
                                    >
                                        <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </motion.div>
                                </button>
                                
                                <AnimatePresence>
                                    {isExpanded && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.2 }}
                                            className="overflow-hidden"
                                        >
                                            <div className="px-5 pb-5 pt-2 border-t border-border/30">
                                                <Component />
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        );
                    })}
                </motion.div>
            </AnimatePresence>
        </div>
    );
}

export default SettingsPage;
