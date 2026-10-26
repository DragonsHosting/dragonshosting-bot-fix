import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCode, faLayerGroup } from '@fortawesome/free-solid-svg-icons';
import EmbedBuilder from './components/EmbedBuilder';
import ComponentsV2Builder from './components/ComponentsV2Builder';

type BuilderTab = 'classic' | 'v2';

const EmbedBuilderPage: React.FC = () => {
    const [activeTab, setActiveTab] = useState<BuilderTab>('classic');

    return (
        <div className="space-y-6 px-4 lg:px-6 max-w-[1600px] mx-auto w-full">
            <div className="glass-card rounded-2xl p-1.5 inline-flex gap-1">
                <button
                    onClick={() => setActiveTab('classic')}
                    className={`relative flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                        activeTab === 'classic'
                            ? 'text-foreground'
                            : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                    {activeTab === 'classic' && (
                        <motion.div
                            layoutId="activeTab"
                            className="absolute inset-0 bg-primary/20 rounded-xl"
                            transition={{ type: 'spring', duration: 0.3 }}
                        />
                    )}
                    <FontAwesomeIcon icon={faCode} className="w-4 h-4 relative z-10" />
                    <span className="relative z-10">Classic Embed</span>
                </button>
                <button
                    onClick={() => setActiveTab('v2')}
                    className={`relative flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                        activeTab === 'v2'
                            ? 'text-foreground'
                            : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                    {activeTab === 'v2' && (
                        <motion.div
                            layoutId="activeTab"
                            className="absolute inset-0 bg-primary/20 rounded-xl"
                            transition={{ type: 'spring', duration: 0.3 }}
                        />
                    )}
                    <FontAwesomeIcon icon={faLayerGroup} className="w-4 h-4 relative z-10" />
                    <span className="relative z-10">Components V2</span>
                    <span className="relative z-10 px-1.5 py-0.5 text-[10px] font-bold bg-primary/20 text-primary rounded">NEW</span>
                </button>
            </div>

            {activeTab === 'classic' ? <EmbedBuilder /> : <ComponentsV2Builder />}
        </div>
    );
};

export default EmbedBuilderPage; 