const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const User = require('../../../models/UserData');
const { getConfig } = require('../../../utils/core/configLoader.js');
const config = getConfig();
const parseDuration = require('./Utility/parseDuration');
const { buildComponentsV2Payload, createSimplePlaceholderReplacer } = require('../../../utils/core/componentsV2Builder');

const shouldUseComponentsV2 = config.ComponentsV2?.Heist?.MainMenu?.Components ? true : false;

const LOCATIONS = {
    convenience: { name: 'Corner Store', emoji: '🏪', difficulty: 1, minReward: 500, maxReward: 2000, baseSuccess: 0.55, supplyCost: 0, color: '#4CAF50' },
    jewelry: { name: 'Jewelry Store', emoji: '💎', difficulty: 2, minReward: 2000, maxReward: 8000, baseSuccess: 0.40, supplyCost: 500, color: '#9C27B0' },
    bank: { name: 'City Bank', emoji: '🏦', difficulty: 3, minReward: 5000, maxReward: 20000, baseSuccess: 0.28, supplyCost: 2000, color: '#2196F3' },
    casino: { name: 'Grand Casino', emoji: '🎰', difficulty: 4, minReward: 15000, maxReward: 50000, baseSuccess: 0.15, supplyCost: 5000, color: '#FF9800' },
    vault: { name: 'Federal Reserve', emoji: '🏛️', difficulty: 5, minReward: 50000, maxReward: 150000, baseSuccess: 0.05, supplyCost: 15000, color: '#F44336' }
};

// Gear organized by sets - owning full set gives bonus
const HEIST_GEAR = {
    // Stealth Set - for sneaky approaches
    grapple: { name: 'Grappling Hook', emoji: '🪝', desc: 'Scale walls silently', price: 3000, successBonus: 0.02, set: 'stealth' },
    silencer: { name: 'Silenced Pistol', emoji: '🔫', desc: 'Quiet takedowns', price: 8000, successBonus: 0.03, set: 'stealth' },
    nightvision: { name: 'Night Vision', emoji: '👓', desc: 'See in darkness', price: 15000, successBonus: 0.04, set: 'stealth' },
    camo: { name: 'Camo Suit', emoji: '🥷', desc: 'Blend into shadows', price: 25000, successBonus: 0.05, set: 'stealth' },
    
    // Tech Set - for hacker approaches
    laptop: { name: 'Hacking Laptop', emoji: '💻', desc: 'Bypass digital locks', price: 5000, successBonus: 0.02, set: 'tech' },
    usb: { name: 'USB Exploits', emoji: '💾', desc: 'Pre-loaded malware', price: 12000, successBonus: 0.03, set: 'tech' },
    jammer: { name: 'Signal Jammer', emoji: '📶', desc: 'Block communications', price: 20000, successBonus: 0.04, set: 'tech' },
    emp: { name: 'EMP Device', emoji: '⚡', desc: 'Disable electronics', price: 40000, successBonus: 0.06, set: 'tech' },
    
    // Combat Set - for aggressive approaches
    vest: { name: 'Kevlar Vest', emoji: '🦺', desc: 'Bullet protection', price: 4000, successBonus: 0.02, set: 'combat' },
    flashbang: { name: 'Flashbangs', emoji: '💥', desc: 'Disorient guards', price: 10000, successBonus: 0.03, set: 'combat' },
    breaching: { name: 'Breaching Charges', emoji: '🧨', desc: 'Blow through doors', price: 18000, successBonus: 0.04, set: 'combat' },
    minigun: { name: 'Heavy Firepower', emoji: '🔥', desc: 'Overwhelming force', price: 35000, successBonus: 0.05, set: 'combat' },
    
    // Infiltration Set - for disguise approaches
    uniform: { name: 'Guard Uniform', emoji: '👔', desc: 'Blend in as staff', price: 6000, successBonus: 0.02, set: 'infiltration' },
    badge: { name: 'Fake ID Badge', emoji: '🪪', desc: 'Access restricted areas', price: 14000, successBonus: 0.03, set: 'infiltration' },
    voice: { name: 'Voice Modulator', emoji: '🎤', desc: 'Impersonate anyone', price: 22000, successBonus: 0.04, set: 'infiltration' },
    face: { name: 'Face Prosthetics', emoji: '🎭', desc: 'Complete disguise', price: 45000, successBonus: 0.06, set: 'infiltration' },
    
    // Master Set - universal bonuses (expensive)
    thermal: { name: 'Thermal Goggles', emoji: '🥽', desc: 'See through walls', price: 50000, successBonus: 0.05, set: 'master' },
    scanner: { name: 'Security Scanner', emoji: '📡', desc: 'Detect all threats', price: 75000, successBonus: 0.06, set: 'master' },
    ai: { name: 'AI Assistant', emoji: '🤖', desc: 'Real-time analysis', price: 100000, successBonus: 0.07, set: 'master' },
    mastermind: { name: 'Mastermind Kit', emoji: '🧠', desc: 'Ultimate toolkit', price: 200000, successBonus: 0.10, set: 'master' }
};

const GEAR_SETS = {
    stealth: { name: 'Shadow Set', emoji: '🌑', bonus: 0.05, items: ['grapple', 'silencer', 'nightvision', 'camo'] },
    tech: { name: 'Cyber Set', emoji: '💻', bonus: 0.06, items: ['laptop', 'usb', 'jammer', 'emp'] },
    combat: { name: 'Assault Set', emoji: '⚔️', bonus: 0.05, items: ['vest', 'flashbang', 'breaching', 'minigun'] },
    infiltration: { name: 'Phantom Set', emoji: '👻', bonus: 0.06, items: ['uniform', 'badge', 'voice', 'face'] },
    master: { name: 'Mastermind Set', emoji: '👑', bonus: 0.10, items: ['thermal', 'scanner', 'ai', 'mastermind'] }
};

const APPROACHES = {
    stealth: { name: 'Stealth', emoji: '🥷', desc: 'Sneak in undetected', successMod: 0.15, rewardMod: 0.8 },
    aggressive: { name: 'Aggressive', emoji: '💥', desc: 'Quick and loud', successMod: -0.10, rewardMod: 1.3 },
    hacker: { name: 'Hacker', emoji: '💻', desc: 'Disable security systems', successMod: 0.10, rewardMod: 1.0 },
    disguise: { name: 'Disguise', emoji: '🎭', desc: 'Blend in as staff', successMod: 0.20, rewardMod: 0.7 }
};

const EVENTS = {
    stealth: [
        { text: 'A guard is approaching. What do you do?', options: [
            { label: 'Hide in shadows', emoji: '🌑', success: 0.55, reward: 1.0 },
            { label: 'Distract with noise', emoji: '🔔', success: 0.45, reward: 1.15 },
            { label: 'Take them down quietly', emoji: '🤫', success: 0.35, reward: 1.3 },
            { label: 'Wait it out', emoji: '⏳', success: 0.60, reward: 0.9 }
        ]},
        { text: 'You encounter a laser grid. Your move?', options: [
            { label: 'Navigate through', emoji: '🤸', success: 0.40, reward: 1.1 },
            { label: 'Find alternate route', emoji: '🚪', success: 0.55, reward: 0.95 },
            { label: 'Disable the system', emoji: '⚡', success: 0.30, reward: 1.35 },
            { label: 'Use mirrors to redirect', emoji: '🪞', success: 0.45, reward: 1.2 }
        ]},
        { text: 'Motion sensors detected ahead!', options: [
            { label: 'Move extremely slow', emoji: '🐌', success: 0.50, reward: 1.0 },
            { label: 'Crawl under detection', emoji: '🐍', success: 0.40, reward: 1.15 },
            { label: 'Jam the sensors', emoji: '📡', success: 0.35, reward: 1.25 },
            { label: 'Find the blind spot', emoji: '👁️', success: 0.45, reward: 1.1 }
        ]},
        { text: 'Security camera rotating your way!', options: [
            { label: 'Time the rotation', emoji: '⏱️', success: 0.50, reward: 1.05 },
            { label: 'Shoot out the camera', emoji: '🎯', success: 0.30, reward: 1.3 },
            { label: 'Loop the feed', emoji: '🔄', success: 0.40, reward: 1.2 },
            { label: 'Stay in blind spot', emoji: '🫥', success: 0.55, reward: 0.95 }
        ]}
    ],
    aggressive: [
        { text: 'Alarms are blaring! Security is coming!', options: [
            { label: 'Hold your ground', emoji: '🛡️', success: 0.45, reward: 1.2 },
            { label: 'Create a diversion', emoji: '💣', success: 0.50, reward: 1.05 },
            { label: 'Rush to the vault', emoji: '🏃', success: 0.35, reward: 1.4 },
            { label: 'Take hostages', emoji: '👥', success: 0.40, reward: 1.25 }
        ]},
        { text: 'The vault door is reinforced. What now?', options: [
            { label: 'Use explosives', emoji: '🧨', success: 0.40, reward: 1.3 },
            { label: 'Force the manager', emoji: '👔', success: 0.50, reward: 1.05 },
            { label: 'Drill through', emoji: '🔧', success: 0.35, reward: 1.2 },
            { label: 'Thermite charge', emoji: '🔥', success: 0.30, reward: 1.45 }
        ]},
        { text: 'SWAT team arriving in 2 minutes!', options: [
            { label: 'Speed up and grab what you can', emoji: '💨', success: 0.45, reward: 1.15 },
            { label: 'Set up defensive position', emoji: '🏰', success: 0.40, reward: 1.25 },
            { label: 'Find escape route NOW', emoji: '🚪', success: 0.55, reward: 0.9 },
            { label: 'Use smoke grenades', emoji: '💨', success: 0.35, reward: 1.35 }
        ]},
        { text: 'Armed guards blocking the exit!', options: [
            { label: 'Flashbang and push', emoji: '💥', success: 0.45, reward: 1.15 },
            { label: 'Find another exit', emoji: '🚗', success: 0.50, reward: 0.95 },
            { label: 'Shoot your way out', emoji: '🔫', success: 0.30, reward: 1.4 },
            { label: 'Negotiate passage', emoji: '🤝', success: 0.40, reward: 1.1 }
        ]}
    ],
    hacker: [
        { text: 'Firewall detected! Choose your attack:', options: [
            { label: 'Brute force', emoji: '⚡', success: 0.30, reward: 1.35 },
            { label: 'Social engineering', emoji: '📞', success: 0.50, reward: 1.0 },
            { label: 'Zero-day exploit', emoji: '🐛', success: 0.40, reward: 1.25 },
            { label: 'SQL injection', emoji: '💉', success: 0.45, reward: 1.15 }
        ]},
        { text: 'They\'re tracing your connection!', options: [
            { label: 'Proxy hop', emoji: '🔀', success: 0.55, reward: 0.95 },
            { label: 'Speed download', emoji: '⬇️', success: 0.35, reward: 1.4 },
            { label: 'Plant a virus', emoji: '🦠', success: 0.40, reward: 1.2 },
            { label: 'Cut connection', emoji: '✂️', success: 0.50, reward: 1.0 }
        ]},
        { text: 'Biometric lock requires fingerprint!', options: [
            { label: 'Spoof the scanner', emoji: '🖐️', success: 0.35, reward: 1.3 },
            { label: 'Find backup access', emoji: '🔑', success: 0.50, reward: 1.0 },
            { label: 'Hack the database', emoji: '🗄️', success: 0.40, reward: 1.2 },
            { label: 'Physical bypass', emoji: '🔧', success: 0.45, reward: 1.1 }
        ]},
        { text: 'Security AI is learning your patterns!', options: [
            { label: 'Randomize behavior', emoji: '🎲', success: 0.45, reward: 1.1 },
            { label: 'Overload the AI', emoji: '🧠', success: 0.35, reward: 1.35 },
            { label: 'Use decoy signals', emoji: '📡', success: 0.50, reward: 1.0 },
            { label: 'Corrupt its memory', emoji: '💾', success: 0.40, reward: 1.25 }
        ]}
    ],
    disguise: [
        { text: 'A real employee is suspicious. React!', options: [
            { label: 'Act natural', emoji: '😎', success: 0.50, reward: 1.0 },
            { label: 'Flash fake credentials', emoji: '🪪', success: 0.40, reward: 1.15 },
            { label: 'Pretend phone call', emoji: '📱', success: 0.55, reward: 0.95 },
            { label: 'Distract with question', emoji: '❓', success: 0.45, reward: 1.1 }
        ]},
        { text: 'Security checkpoint ahead.', options: [
            { label: 'Walk through confidently', emoji: '🚶', success: 0.45, reward: 1.1 },
            { label: 'Find a back entrance', emoji: '🚪', success: 0.55, reward: 0.9 },
            { label: 'Bribe the guard', emoji: '💵', success: 0.35, reward: 1.3 },
            { label: 'Tailgate an employee', emoji: '👥', success: 0.50, reward: 1.0 }
        ]},
        { text: 'They\'re doing ID verification today!', options: [
            { label: 'Use forged documents', emoji: '📄', success: 0.40, reward: 1.2 },
            { label: 'Claim you forgot it', emoji: '🤷', success: 0.45, reward: 1.05 },
            { label: 'Create a distraction', emoji: '🎪', success: 0.35, reward: 1.25 },
            { label: 'Go through loading dock', emoji: '📦', success: 0.50, reward: 0.95 }
        ]},
        { text: 'The real manager is returning early!', options: [
            { label: 'Hide in closet', emoji: '🚪', success: 0.50, reward: 1.0 },
            { label: 'Pretend to be leaving', emoji: '👋', success: 0.45, reward: 1.1 },
            { label: 'Confront and bluff', emoji: '🎭', success: 0.30, reward: 1.4 },
            { label: 'Use back stairs', emoji: '🪜', success: 0.55, reward: 0.9 }
        ]}
    ]
};

function createProgressBar(current, total, length = 10) {
    const filled = Math.round((current / total) * length);
    return '▓'.repeat(filled) + '░'.repeat(length - filled);
}

function getTimeRemaining(ms) {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}

function calculateGearBonus(userGear) {
    if (!userGear || !Array.isArray(userGear)) return 0;
    
    // Base gear bonuses
    let total = userGear.reduce((sum, gearId) => {
        const gear = HEIST_GEAR[gearId];
        return sum + (gear?.successBonus || 0);
    }, 0);
    
    // Set bonuses
    for (const [setId, setData] of Object.entries(GEAR_SETS)) {
        const hasFullSet = setData.items.every(item => userGear.includes(item));
        if (hasFullSet) {
            total += setData.bonus;
        }
    }
    
    return total;
}

function getCompletedSets(userGear) {
    if (!userGear || !Array.isArray(userGear)) return [];
    return Object.entries(GEAR_SETS)
        .filter(([setId, setData]) => setData.items.every(item => userGear.includes(item)))
        .map(([setId, setData]) => setData);
}

function getOwnedGearDisplay(userGear) {
    if (!userGear || userGear.length === 0) return '*No gear owned*';
    
    // Group by set
    const bySet = {};
    userGear.forEach(gearId => {
        const gear = HEIST_GEAR[gearId];
        if (gear) {
            if (!bySet[gear.set]) bySet[gear.set] = [];
            bySet[gear.set].push(gear);
        }
    });
    
    const lines = [];
    for (const [setId, items] of Object.entries(bySet)) {
        const setData = GEAR_SETS[setId];
        const complete = setData.items.every(item => userGear.includes(item));
        lines.push(`**${setData.emoji} ${setData.name}** ${complete ? '✅' : `(${items.length}/${setData.items.length})`}`);
        items.forEach(gear => {
            lines.push(`  ${gear.emoji} ${gear.name}`);
        });
    }
    
    return lines.join('\n') || '*No gear owned*';
}

function getSetProgress(userGear) {
    if (!userGear || !Array.isArray(userGear)) return [];
    return Object.entries(GEAR_SETS).map(([setId, setData]) => {
        const owned = setData.items.filter(item => userGear.includes(item)).length;
        return { ...setData, setId, owned, total: setData.items.length, complete: owned === setData.items.length };
    });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('heist')
        .setDescription('Plan and execute an elaborate heist'),
    category: 'Economy',

    async execute(interaction) {
        let user = await User.findOne({ userId: interaction.user.id, guildId: interaction.guild.id });

        if (!user) {
            user = new User({
                userId: interaction.user.id,
                guildId: interaction.guild.id,
                balance: 0,
                heistData: {}
            });
            await user.save();
        }

        if (!user.heistData) user.heistData = {};

        await this.showMainMenu(interaction, user);
    },

    async showMainMenu(interaction, user, isUpdate = false) {
        const now = Date.now();
        const cooldown = parseDuration(config.Heist?.executeCooldown || '4h');
        const onCooldown = !!(user.heistData?.lastExecute && (now - new Date(user.heistData.lastExecute).getTime() < cooldown));
        const cooldownRemaining = onCooldown ? cooldown - (now - new Date(user.heistData.lastExecute).getTime()) : 0;

        const hasActiveHeist = user.heistData?.location && user.heistData?.scoutedAt;
        const scoutExpiry = parseDuration(config.Heist?.scoutExpiry || '2h');
        const scoutValid = hasActiveHeist && (now - new Date(user.heistData.scoutedAt).getTime() < scoutExpiry);

        const userGear = user.equipment?.HeistGear || [];
        const gearBonus = calculateGearBonus(userGear);

        let statusText = '';
        if (onCooldown) {
            statusText = `\n⏰ **Cooldown:** ${getTimeRemaining(cooldownRemaining)} remaining`;
        }

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('heist_scout')
                .setLabel(scoutValid ? 'New Target' : 'Scout Location')
                .setEmoji('🔍')
                .setStyle(scoutValid ? ButtonStyle.Secondary : ButtonStyle.Primary)
                .setDisabled(onCooldown),
            new ButtonBuilder()
                .setCustomId('heist_plan')
                .setLabel('Choose Approach')
                .setEmoji('📋')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(!scoutValid || onCooldown),
            new ButtonBuilder()
                .setCustomId('heist_execute')
                .setLabel('Execute Heist')
                .setEmoji('🚀')
                .setStyle(ButtonStyle.Success)
                .setDisabled(!scoutValid || !user.heistData?.plan || onCooldown)
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('heist_gear')
                .setLabel('Gear Shop')
                .setEmoji('🎒')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('heist_intel')
                .setLabel('Intel')
                .setEmoji('📊')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('heist_history')
                .setLabel('History')
                .setEmoji('📜')
                .setStyle(ButtonStyle.Secondary)
        );

        let options;

        if (shouldUseComponentsV2) {
            const placeholders = {
                userAvatar: interaction.user.displayAvatarURL({ extension: 'png' }),
                balance: user.balance.toLocaleString(),
                gearBonus: (gearBonus * 100).toFixed(0),
                statusText
            };
            const replacer = createSimplePlaceholderReplacer(placeholders);
            const payload = buildComponentsV2Payload(config.ComponentsV2.Heist.MainMenu, replacer);
            
            if (scoutValid) {
                const loc = LOCATIONS[user.heistData.location];
                const timeLeft = scoutExpiry - (now - new Date(user.heistData.scoutedAt).getTime());
                const supplyText = loc.supplyCost > 0 ? `**${loc.supplyCost.toLocaleString()}** coins` : '**Free**';
                const canAfford = user.balance >= loc.supplyCost;
                const planText = user.heistData.plan ? `${APPROACHES[user.heistData.plan].emoji} ${APPROACHES[user.heistData.plan].name}` : '*Not selected*';
                
                const targetPlaceholders = {
                    emoji: loc.emoji,
                    name: loc.name,
                    reward: user.heistData.potentialReward?.toLocaleString(),
                    supplyCost: supplyText,
                    canAfford: canAfford ? '✅' : '❌',
                    timeLeft: getTimeRemaining(timeLeft),
                    planText
                };
                const targetReplacer = createSimplePlaceholderReplacer(targetPlaceholders);
                const targetContent = targetReplacer(config.ComponentsV2.Heist.ActiveTarget.Content);
                
                if (payload.components && payload.components[0] && payload.components[0].components) {
                    payload.components[0].components.push({ type: 10, content: targetContent });
                }
            }
            
            payload.components.push(row1.toJSON(), row2.toJSON());
            options = { ...payload, flags: MessageFlags.IsComponentsV2 };
        } else {
            const embed = new EmbedBuilder()
                .setAuthor({ name: `${interaction.user.username}'s Heist HQ`, iconURL: interaction.user.displayAvatarURL() })
                .setDescription([
                    '```',
                    '  Plan your perfect crime  ',
                    '```',
                    '',
                    `💰 **Balance:** ${user.balance.toLocaleString()} coins`,
                    `🎒 **Gear Bonus:** +${(gearBonus * 100).toFixed(0)}% success`,
                    statusText
                ].join('\n'))
                .setColor('#1a1a2e')
                .setFooter({ text: 'Choose an action below' });

            if (scoutValid) {
                const loc = LOCATIONS[user.heistData.location];
                const timeLeft = scoutExpiry - (now - new Date(user.heistData.scoutedAt).getTime());
                const supplyText = loc.supplyCost > 0 
                    ? `🧰 Supplies: **${loc.supplyCost.toLocaleString()}** coins`
                    : '🧰 Supplies: **Free**';
                const canAfford = user.balance >= loc.supplyCost;
                embed.addFields({
                    name: `📍 Active Target: ${loc.emoji} ${loc.name}`,
                    value: [
                        `💵 Potential: **${user.heistData.potentialReward?.toLocaleString()}** coins`,
                        `${supplyText} ${canAfford ? '✅' : '❌'}`,
                        `⏳ Intel expires: ${getTimeRemaining(timeLeft)}`,
                        user.heistData.plan ? `📋 Plan: ${APPROACHES[user.heistData.plan].emoji} ${APPROACHES[user.heistData.plan].name}` : '📋 Plan: *Not selected*'
                    ].join('\n'),
                    inline: false
                });
            }

            options = { embeds: [embed], components: [row1, row2] };
        }

        const reply = isUpdate 
            ? await interaction.update(options)
            : await interaction.reply(options);

        const message = isUpdate ? interaction.message : await interaction.fetchReply();
        
        const collector = message.createMessageComponentCollector({
            time: 600000
        });

        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) {
                await i.reply({ content: '❌ This isn\'t your heist!', ephemeral: true });
                return;
            }

            const freshUser = await User.findOne({ userId: interaction.user.id, guildId: interaction.guild.id });
            
            switch (i.customId) {
                case 'heist_scout':
                    collector.stop();
                    await this.showLocationSelect(i, freshUser);
                    break;
                case 'heist_plan':
                    collector.stop();
                    await this.showApproachSelect(i, freshUser);
                    break;
                case 'heist_execute':
                    collector.stop();
                    await this.executeHeist(i, freshUser);
                    break;
                case 'heist_gear':
                    collector.stop();
                    await this.showGearShop(i, freshUser);
                    break;
                case 'heist_intel':
                    collector.stop();
                    await this.showIntel(i, freshUser);
                    break;
                case 'heist_history':
                    collector.stop();
                    await this.showHistory(i, freshUser);
                    break;
                case 'heist_back':
                    collector.stop();
                    await this.showMainMenu(i, freshUser, true);
                    break;
            }
        });
    },

    async showLocationSelect(interaction, user) {
        const scoutCost = config.Heist?.scoutCost || 500;

        const locationOptions = Object.entries(LOCATIONS).map(([id, loc]) => {
            const supplyText = loc.supplyCost > 0 ? ` | 🧰 ${loc.supplyCost.toLocaleString()}` : ' | 🧰 Free';
            return {
                label: loc.name,
                description: `${loc.minReward.toLocaleString()}-${loc.maxReward.toLocaleString()} coins${supplyText}`,
                value: id,
                emoji: loc.emoji
            };
        });

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('heist_location_select')
            .setPlaceholder('▼ Select a location to scout')
            .addOptions(locationOptions);

        const row1 = new ActionRowBuilder().addComponents(selectMenu);
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('heist_back')
                .setLabel('Back')
                .setEmoji('◀')
                .setStyle(ButtonStyle.Secondary)
        );

        let updateOptions;

        if (shouldUseComponentsV2) {
            const placeholders = {
                scoutCost: scoutCost.toLocaleString(),
                balance: user.balance.toLocaleString()
            };
            const replacer = createSimplePlaceholderReplacer(placeholders);
            const payload = buildComponentsV2Payload(config.ComponentsV2.Heist.LocationSelect, replacer);
            payload.components.push(row1.toJSON(), row2.toJSON());
            updateOptions = { ...payload, flags: MessageFlags.IsComponentsV2 };
        } else {
            const embed = new EmbedBuilder()
                .setTitle('🔍 SELECT TARGET LOCATION')
                .setDescription([
                    '```',
                    '  Choose your target wisely  ',
                    '```',
                    '',
                    `💰 **Scout Cost:** ${scoutCost.toLocaleString()} coins`,
                    `💵 **Your Balance:** ${user.balance.toLocaleString()} coins`,
                    '',
                    '⚠️ *Higher tiers require supplies to execute!*'
                ].join('\n'))
                .setColor('#FF6B35');
            updateOptions = { embeds: [embed], components: [row1, row2] };
        }

        await interaction.update(updateOptions);

        const message = interaction.message;
        const collector = message.createMessageComponentCollector({
            time: 120000
        });

        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) {
                await i.reply({ content: '❌ This isn\'t your heist!', ephemeral: true });
                return;
            }

            if (i.customId === 'heist_back') {
                collector.stop();
                const freshUser = await User.findOne({ userId: interaction.user.id, guildId: interaction.guild.id });
                await this.showMainMenu(i, freshUser, true);
                return;
            }

            if (i.customId === 'heist_location_select') {
                collector.stop();
                const locationId = i.values[0];
                await this.scoutLocation(i, user, locationId, scoutCost);
            }
        });
    },

    async scoutLocation(interaction, user, locationId, scoutCost) {
        const location = LOCATIONS[locationId];

        if (user.balance < scoutCost) {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('heist_back').setLabel('Back').setEmoji('◀').setStyle(ButtonStyle.Secondary)
            );

            let updateOptions;
            if (shouldUseComponentsV2) {
                const placeholders = {
                    required: scoutCost.toLocaleString(),
                    balance: user.balance.toLocaleString()
                };
                const replacer = createSimplePlaceholderReplacer(placeholders);
                const payload = buildComponentsV2Payload(config.ComponentsV2.Heist.InsufficientFunds, replacer);
                payload.components.push(row.toJSON());
                updateOptions = { ...payload, flags: MessageFlags.IsComponentsV2 };
            } else {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Insufficient Funds')
                    .setDescription(`You need **${scoutCost.toLocaleString()}** coins to scout.\nYour balance: **${user.balance.toLocaleString()}** coins`)
                    .setColor('#FF0000');
                updateOptions = { embeds: [embed], components: [row] };
            }

            await interaction.update(updateOptions);

            const collector = interaction.message.createMessageComponentCollector({
                time: 60000
            });

            collector.on('collect', async i => {
                if (i.user.id !== interaction.user.id) {
                    await i.reply({ content: '❌ This isn\'t your heist!', ephemeral: true });
                    return;
                }
                collector.stop();
                const freshUser = await User.findOne({ userId: interaction.user.id, guildId: interaction.guild.id });
                await this.showMainMenu(i, freshUser, true);
            });
            return;
        }

        user.balance -= scoutCost;
        const potentialReward = Math.floor(Math.random() * (location.maxReward - location.minReward) + location.minReward);

        user.heistData = {
            location: locationId,
            scoutedAt: new Date(),
            potentialReward,
            plan: null,
            plannedAt: null,
            lastExecute: user.heistData?.lastExecute
        };

        user.transactionLogs.push({ type: 'heist_scout', amount: -scoutCost, timestamp: new Date() });
        await user.save();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('heist_plan')
                .setLabel('Choose Approach')
                .setEmoji('📋')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('heist_back')
                .setLabel('Back to HQ')
                .setEmoji('◀')
                .setStyle(ButtonStyle.Secondary)
        );

        let updateOptions;
        if (shouldUseComponentsV2) {
            const supplyInfo = location.supplyCost > 0 
                ? `**${location.supplyCost.toLocaleString()}** coins`
                : '**Free**';
            const placeholders = {
                emoji: location.emoji,
                name: location.name,
                color: location.color,
                stars: '⭐'.repeat(location.difficulty) + '☆'.repeat(5 - location.difficulty),
                baseSuccess: (location.baseSuccess * 100).toFixed(0),
                reward: potentialReward.toLocaleString(),
                supplyCost: supplyInfo,
                scoutCostPaid: scoutCost.toLocaleString(),
                balance: user.balance.toLocaleString()
            };
            const replacer = createSimplePlaceholderReplacer(placeholders);
            const payload = buildComponentsV2Payload(config.ComponentsV2.Heist.TargetAcquired, replacer);
            payload.components.push(row.toJSON());
            updateOptions = { ...payload, flags: MessageFlags.IsComponentsV2 };
        } else {
            const supplyInfo = location.supplyCost > 0 
                ? `🧰 **Supply Cost:** ${location.supplyCost.toLocaleString()} coins (paid on execution)`
                : '🧰 **Supply Cost:** Free';

            const embed = new EmbedBuilder()
                .setTitle(`${location.emoji} TARGET ACQUIRED`)
                .setDescription([
                    '```',
                    `  ${location.name}  `,
                    '```',
                    '',
                    '**📊 Intel Report:**',
                    `> Difficulty: ${'⭐'.repeat(location.difficulty)}${'☆'.repeat(5 - location.difficulty)}`,
                    `> Base Success: **${(location.baseSuccess * 100).toFixed(0)}%**`,
                    `> Potential Take: **${potentialReward.toLocaleString()}** coins`,
                    `> ${supplyInfo}`,
                    '',
                    `💸 Scout cost: **-${scoutCost.toLocaleString()}** coins`,
                    `💰 New balance: **${user.balance.toLocaleString()}** coins`,
                    '',
                    '*Choose your approach to continue...*'
                ].join('\n'))
                .setColor(location.color)
                .setThumbnail(interaction.user.displayAvatarURL());
            updateOptions = { embeds: [embed], components: [row] };
        }

        await interaction.update(updateOptions);

        const collector = interaction.message.createMessageComponentCollector({
            time: 120000
        });

        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) {
                await i.reply({ content: '❌ This isn\'t your heist!', ephemeral: true });
                return;
            }
            collector.stop();
            const freshUser = await User.findOne({ userId: interaction.user.id, guildId: interaction.guild.id });
            
            if (i.customId === 'heist_plan') {
                await this.showApproachSelect(i, freshUser);
            } else {
                await this.showMainMenu(i, freshUser, true);
            }
        });
    },

    async showApproachSelect(interaction, user) {
        if (!user.heistData?.location) {
            await this.showMainMenu(interaction, user, true);
            return;
        }

        const location = LOCATIONS[user.heistData.location];

        const approachOptions = Object.entries(APPROACHES).map(([id, approach]) => ({
            label: approach.name,
            description: approach.desc,
            value: id,
            emoji: approach.emoji
        }));

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('heist_approach_select')
            .setPlaceholder('▼ Select your approach')
            .addOptions(approachOptions);

        const row1 = new ActionRowBuilder().addComponents(selectMenu);
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('heist_back').setLabel('Back').setEmoji('◀').setStyle(ButtonStyle.Secondary)
        );

        let updateOptions;
        if (shouldUseComponentsV2) {
            const placeholders = {
                targetName: location.name
            };
            const replacer = createSimplePlaceholderReplacer(placeholders);
            const payload = buildComponentsV2Payload(config.ComponentsV2.Heist.ApproachSelect, replacer);
            
            const approachText = Object.entries(APPROACHES).map(([id, approach]) => {
                const successMod = approach.successMod >= 0 ? `+${(approach.successMod * 100).toFixed(0)}%` : `${(approach.successMod * 100).toFixed(0)}%`;
                return `${approach.emoji} **${approach.name}**\n> ${approach.desc}\n> Success: \`${successMod}\` · Reward: \`${approach.rewardMod}x\``;
            }).join('\n\n');
            
            if (payload.components && payload.components[0] && payload.components[0].components) {
                payload.components[0].components.push({ type: 10, content: approachText });
            }
            
            payload.components.push(row1.toJSON(), row2.toJSON());
            updateOptions = { ...payload, flags: MessageFlags.IsComponentsV2 };
        } else {
            const embed = new EmbedBuilder()
                .setTitle('📋 SELECT YOUR APPROACH')
                .setDescription([
                    '```',
                    `  Target: ${location.name}  `,
                    '```',
                    '',
                    '*Each approach has different risk/reward trade-offs*'
                ].join('\n'))
                .setColor('#00CED1');

            Object.entries(APPROACHES).forEach(([id, approach]) => {
                const successMod = approach.successMod >= 0 ? `+${(approach.successMod * 100).toFixed(0)}%` : `${(approach.successMod * 100).toFixed(0)}%`;
                embed.addFields({
                    name: `${approach.emoji} ${approach.name}`,
                    value: `${approach.desc}\n\`Success: ${successMod}\` · \`Reward: ${approach.rewardMod}x\``,
                    inline: true
                });
            });

            updateOptions = { embeds: [embed], components: [row1, row2] };
        }

        await interaction.update(updateOptions);

        const collector = interaction.message.createMessageComponentCollector({
            time: 120000
        });

        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) {
                await i.reply({ content: '❌ This isn\'t your heist!', ephemeral: true });
                return;
            }

            if (i.customId === 'heist_back') {
                collector.stop();
                const freshUser = await User.findOne({ userId: interaction.user.id, guildId: interaction.guild.id });
                await this.showMainMenu(i, freshUser, true);
                return;
            }

            if (i.customId === 'heist_approach_select') {
                collector.stop();
                const approachId = i.values[0];
                await this.selectApproach(i, user, approachId);
            }
        });
    },

    async selectApproach(interaction, user, approachId) {
        const approach = APPROACHES[approachId];
        const location = LOCATIONS[user.heistData.location];
        const userGear = user.equipment?.HeistGear || [];
        const gearBonus = calculateGearBonus(userGear);

        user.heistData.plan = approachId;
        user.heistData.plannedAt = new Date();
        await user.save();

        const finalSuccess = Math.min(0.95, Math.max(0.05, location.baseSuccess + approach.successMod + gearBonus));
        const estimatedReward = Math.floor(user.heistData.potentialReward * approach.rewardMod);
        const canAfford = user.balance >= location.supplyCost;

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('heist_execute')
                .setLabel('Execute Heist')
                .setEmoji('🚀')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('heist_plan')
                .setLabel('Change Plan')
                .setEmoji('🔄')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('heist_back')
                .setLabel('Back to HQ')
                .setEmoji('◀')
                .setStyle(ButtonStyle.Secondary)
        );

        let updateOptions;
        if (shouldUseComponentsV2) {
            const supplyText = location.supplyCost > 0 
                ? `**${location.supplyCost.toLocaleString()}** coins`
                : '**Free**';
            const approachMod = approach.successMod >= 0 ? `+${(approach.successMod * 100).toFixed(0)}` : `${(approach.successMod * 100).toFixed(0)}`;
            const placeholders = {
                emoji: approach.emoji,
                approachName: approach.name,
                targetEmoji: location.emoji,
                targetName: location.name,
                baseSuccess: (location.baseSuccess * 100).toFixed(0),
                approachMod,
                gearBonus: (gearBonus * 100).toFixed(0),
                finalSuccess: (finalSuccess * 100).toFixed(0),
                estimatedReward: estimatedReward.toLocaleString(),
                supplyCost: supplyText,
                canAfford: canAfford ? '✅' : '❌',
                readyText: canAfford ? 'Ready to execute' : 'Earn more coins to afford supplies',
                color: canAfford ? '#00FF7F' : '#FF6B35'
            };
            const replacer = createSimplePlaceholderReplacer(placeholders);
            const payload = buildComponentsV2Payload(config.ComponentsV2.Heist.PlanLocked, replacer);
            payload.components.push(row.toJSON());
            updateOptions = { ...payload, flags: MessageFlags.IsComponentsV2 };
        } else {
            const supplyText = location.supplyCost > 0 
                ? `🧰 **Supply Cost:** ${location.supplyCost.toLocaleString()} coins`
                : '🧰 **Supply Cost:** Free';

            const embed = new EmbedBuilder()
                .setTitle(`${approach.emoji} PLAN LOCKED IN`)
                .setDescription([
                    '```',
                    `  ${approach.name} Approach  `,
                    '```',
                    '',
                    `**${location.emoji} Target:** ${location.name}`,
                    '',
                    '**📊 Final Stats:**',
                    `> Base: ${(location.baseSuccess * 100).toFixed(0)}% + Approach: ${approach.successMod >= 0 ? '+' : ''}${(approach.successMod * 100).toFixed(0)}% + Gear: +${(gearBonus * 100).toFixed(0)}%`,
                    `> **Success Chance: ${(finalSuccess * 100).toFixed(0)}%**`,
                    `> Estimated Take: **${estimatedReward.toLocaleString()}** coins`,
                    `> ${supplyText} ${canAfford ? '✅' : '❌ Not enough!'}`,
                    '',
                    canAfford ? '⚠️ *Ready to execute when you are...*' : '⚠️ *Earn more coins to afford supplies!*'
                ].join('\n'))
                .setColor(canAfford ? '#00FF7F' : '#FF6B35');

            updateOptions = { embeds: [embed], components: [row] };
        }

        await interaction.update(updateOptions);

        const collector = interaction.message.createMessageComponentCollector({
            time: 300000
        });

        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) {
                await i.reply({ content: '❌ This isn\'t your heist!', ephemeral: true });
                return;
            }
            collector.stop();
            const freshUser = await User.findOne({ userId: interaction.user.id, guildId: interaction.guild.id });

            switch (i.customId) {
                case 'heist_execute':
                    await this.executeHeist(i, freshUser);
                    break;
                case 'heist_plan':
                    await this.showApproachSelect(i, freshUser);
                    break;
                default:
                    await this.showMainMenu(i, freshUser, true);
            }
        });
    },

    async executeHeist(interaction, user) {
        if (!user.heistData?.location || !user.heistData?.plan) {
            await this.showMainMenu(interaction, user, true);
            return;
        }

        const location = LOCATIONS[user.heistData.location];
        const approach = APPROACHES[user.heistData.plan];
        const events = EVENTS[user.heistData.plan] || EVENTS.stealth;
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;

        // Check and deduct supply cost
        if (location.supplyCost > 0) {
            if (user.balance < location.supplyCost) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Insufficient Supplies')
                    .setDescription([
                        `You need **${location.supplyCost.toLocaleString()}** coins for supplies to hit ${location.emoji} ${location.name}!`,
                        '',
                        `💰 Your Balance: **${user.balance.toLocaleString()}** coins`,
                        `🧰 Required: **${location.supplyCost.toLocaleString()}** coins`,
                        '',
                        '*Earn more coins or choose an easier target.*'
                    ].join('\n'))
                    .setColor('#FF0000');

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('heist_back').setLabel('Back to HQ').setEmoji('◀').setStyle(ButtonStyle.Secondary)
                );

                await interaction.update({ embeds: [embed], components: [row] });

                const collector = interaction.message.createMessageComponentCollector({ time: 60000 });
                collector.on('collect', async i => {
                    if (i.user.id !== userId) {
                        await i.reply({ content: '❌ This isn\'t your heist!', ephemeral: true });
                        return;
                    }
                    collector.stop();
                    const freshUser = await User.findOne({ userId, guildId });
                    await this.showMainMenu(i, freshUser, true);
                });
                return;
            }

            // Deduct supply cost
            user.balance -= location.supplyCost;
            user.transactionLogs.push({ type: 'heist_supplies', amount: -location.supplyCost, timestamp: new Date() });
            await user.save();
        }

        let successMultiplier = 1.0;
        let rewardMultiplier = approach.rewardMod;
        const totalPhases = 4; // Increased from 3 to 4 phases

        // Get the message reference for direct editing
        const message = interaction.message;

        const runPhase = async (phaseNum) => {
            if (phaseNum > totalPhases) {
                await this.finishHeist(message, interaction, user, location, approach, successMultiplier, rewardMultiplier);
                return;
            }

            const event = events[Math.floor(Math.random() * events.length)];
            const progress = createProgressBar(phaseNum - 1, totalPhases);

            const buttons = event.options.map((opt, idx) => 
                new ButtonBuilder()
                    .setCustomId(`heist_choice_${idx}`)
                    .setLabel(opt.label)
                    .setEmoji(opt.emoji)
                    .setStyle(ButtonStyle.Primary)
            );

            const row = new ActionRowBuilder().addComponents(buttons);

            let editOptions;
            if (shouldUseComponentsV2) {
                const placeholders = {
                    phase: phaseNum,
                    total: totalPhases,
                    progressBar: progress,
                    percent: Math.floor(((phaseNum - 1) / totalPhases) * 100),
                    targetEmoji: location.emoji,
                    targetName: location.name,
                    approachEmoji: approach.emoji,
                    approachName: approach.name,
                    eventText: event.text,
                    color: location.color
                };
                const replacer = createSimplePlaceholderReplacer(placeholders);
                const payload = buildComponentsV2Payload(config.ComponentsV2.Heist.HeistPhase, replacer);
                payload.components.push(row.toJSON());
                editOptions = { ...payload, flags: MessageFlags.IsComponentsV2, embeds: [] };
            } else {
                const embed = new EmbedBuilder()
                    .setTitle(`🎬 PHASE ${phaseNum}/${totalPhases}`)
                    .setDescription([
                        `\`${progress}\` **${Math.floor(((phaseNum - 1) / totalPhases) * 100)}%**`,
                        '',
                        `${location.emoji} **${location.name}** | ${approach.emoji} **${approach.name}**`,
                        '',
                        '─'.repeat(30),
                        '',
                        `**${event.text}**`
                    ].join('\n'))
                    .setColor(location.color);
                editOptions = { embeds: [embed], components: [row] };
            }

            await message.edit(editOptions);

            const collector = message.createMessageComponentCollector({
                time: 30000
            });

            collector.on('collect', async int => {
                if (int.user.id !== userId) {
                    await int.reply({ content: '❌ This isn\'t your heist!', ephemeral: true });
                    return;
                }
                collector.stop('collected');
                
                const choiceIdx = parseInt(int.customId.split('_')[2]);
                const choice = event.options[choiceIdx];

                const roll = Math.random();
                const phaseSuccess = roll < choice.success;

                let phaseEditOptions;
                if (phaseSuccess) {
                    successMultiplier *= 1.1;
                    rewardMultiplier *= choice.reward;

                    if (shouldUseComponentsV2) {
                        const placeholders = {
                            phase: phaseNum,
                            choice: choice.label,
                            bonus: ((choice.reward - 1) * 100).toFixed(0)
                        };
                        const replacer = createSimplePlaceholderReplacer(placeholders);
                        const payload = buildComponentsV2Payload(config.ComponentsV2.Heist.PhaseSuccess, replacer);
                        phaseEditOptions = { ...payload, components: [], flags: MessageFlags.IsComponentsV2, embeds: [] };
                    } else {
                        const successEmbed = new EmbedBuilder()
                            .setTitle(`✅ Phase ${phaseNum} Complete!`)
                            .setDescription([
                                `**${choice.label}** - Success!`,
                                '',
                                `🎯 Bonus: +${((choice.reward - 1) * 100).toFixed(0)}% reward`
                            ].join('\n'))
                            .setColor('#00FF00');
                        phaseEditOptions = { embeds: [successEmbed], components: [] };
                    }
                } else {
                    successMultiplier *= 0.7;

                    if (shouldUseComponentsV2) {
                        const placeholders = {
                            phase: phaseNum,
                            choice: choice.label
                        };
                        const replacer = createSimplePlaceholderReplacer(placeholders);
                        const payload = buildComponentsV2Payload(config.ComponentsV2.Heist.PhaseFail, replacer);
                        phaseEditOptions = { ...payload, components: [], flags: MessageFlags.IsComponentsV2, embeds: [] };
                    } else {
                        const failEmbed = new EmbedBuilder()
                            .setTitle(`⚠️ Phase ${phaseNum} - Complication!`)
                            .setDescription([
                                `**${choice.label}** - Things got messy...`,
                                '',
                                `📉 Success chance reduced`
                            ].join('\n'))
                            .setColor('#FFA500');
                        phaseEditOptions = { embeds: [failEmbed], components: [] };
                    }
                }

                await int.update(phaseEditOptions);
                setTimeout(() => runPhase(phaseNum + 1), 1500);
            });

            collector.on('end', async (collected, reason) => {
                if (reason === 'time') {
                    successMultiplier *= 0.5;
                    
                    const timeoutEmbed = new EmbedBuilder()
                        .setTitle('⏰ Too Slow!')
                        .setDescription('You hesitated too long...')
                        .setColor('#FF0000');

                    await message.edit({ embeds: [timeoutEmbed], components: [] });

                    setTimeout(() => runPhase(phaseNum + 1), 1500);
                }
            });
        };

        let introOptions;
        if (shouldUseComponentsV2) {
            introOptions = {
                components: [{
                    type: 17,
                    accent_color: 0xFF4500,
                    components: [
                        { type: 10, content: `**🚨 HEIST IN PROGRESS**\n\n> Initiating Operation...\n\n${location.emoji} **Target:** ${location.name}\n${approach.emoji} **Approach:** ${approach.name}\n\n-# Get ready for quick decisions!` }
                    ]
                }],
                flags: MessageFlags.IsComponentsV2,
                embeds: []
            };
        } else {
            const introEmbed = new EmbedBuilder()
                .setTitle('🚨 HEIST IN PROGRESS')
                .setDescription([
                    '```',
                    '  Initiating Operation...  ',
                    '```',
                    '',
                    `${location.emoji} **Target:** ${location.name}`,
                    `${approach.emoji} **Approach:** ${approach.name}`,
                    '',
                    '*Get ready for quick decisions!*'
                ].join('\n'))
                .setColor('#FF4500');
            introOptions = { embeds: [introEmbed], components: [] };
        }

        await interaction.update(introOptions);

        setTimeout(() => runPhase(1), 2000);
    },

    async finishHeist(message, interaction, user, location, approach, successMultiplier, rewardMultiplier) {
        const userGear = user.equipment?.HeistGear || [];
        const gearBonus = calculateGearBonus(userGear);
        const baseSuccess = location.baseSuccess + approach.successMod + gearBonus;
        const finalSuccess = Math.min(0.95, Math.max(0.05, baseSuccess * successMultiplier));
        const roll = Math.random();
        const success = roll < finalSuccess;
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;

        user.heistData.lastExecute = new Date();

        if (success) {
            const baseReward = user.heistData.potentialReward;
            const finalReward = Math.floor(baseReward * rewardMultiplier);

            user.balance += finalReward;
            user.transactionLogs.push({ type: 'heist_success', amount: finalReward, timestamp: new Date() });

            user.heistData.location = null;
            user.heistData.scoutedAt = null;
            user.heistData.plan = null;
            user.heistData.plannedAt = null;
            user.heistData.potentialReward = 0;

            await user.save();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('heist_back')
                    .setLabel('Back to HQ')
                    .setEmoji('🏠')
                    .setStyle(ButtonStyle.Primary)
            );

            let editOptions;
            if (shouldUseComponentsV2) {
                const placeholders = {
                    targetEmoji: location.emoji,
                    targetName: location.name,
                    baseReward: baseReward.toLocaleString(),
                    multiplier: rewardMultiplier.toFixed(2),
                    finalReward: finalReward.toLocaleString(),
                    balance: user.balance.toLocaleString()
                };
                const replacer = createSimplePlaceholderReplacer(placeholders);
                const payload = buildComponentsV2Payload(config.ComponentsV2.Heist.HeistSuccess, replacer);
                payload.components.push(row.toJSON());
                editOptions = { ...payload, flags: MessageFlags.IsComponentsV2, embeds: [] };
            } else {
                const embed = new EmbedBuilder()
                    .setTitle('💰 HEIST SUCCESSFUL!')
                    .setDescription([
                        '```diff',
                        '+ MISSION COMPLETE',
                        '```',
                        '',
                        `${location.emoji} **${location.name}** has been hit!`,
                        '',
                        '**💵 Payout Breakdown:**',
                        `> Base Take: ${baseReward.toLocaleString()} coins`,
                        `> Multiplier: ${rewardMultiplier.toFixed(2)}x`,
                        `> **Final Take: ${finalReward.toLocaleString()} coins**`,
                        '',
                        `💰 **New Balance:** ${user.balance.toLocaleString()} coins`
                    ].join('\n'))
                    .setColor('#00FF00')
                    .setImage('https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif');
                editOptions = { embeds: [embed], components: [row] };
            }

            await message.edit(editOptions);
        } else {
            user.heistData.location = null;
            user.heistData.scoutedAt = null;
            user.heistData.plan = null;
            user.heistData.plannedAt = null;
            user.heistData.potentialReward = 0;

            user.transactionLogs.push({ type: 'heist_fail', amount: 0, timestamp: new Date() });
            await user.save();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('heist_back')
                    .setLabel('Back to HQ')
                    .setEmoji('🏠')
                    .setStyle(ButtonStyle.Secondary)
            );

            let editOptions;
            if (shouldUseComponentsV2) {
                const placeholders = {
                    targetName: location.name,
                    balance: user.balance.toLocaleString()
                };
                const replacer = createSimplePlaceholderReplacer(placeholders);
                const payload = buildComponentsV2Payload(config.ComponentsV2.Heist.HeistFail, replacer);
                payload.components.push(row.toJSON());
                editOptions = { ...payload, flags: MessageFlags.IsComponentsV2, embeds: [] };
            } else {
                const embed = new EmbedBuilder()
                    .setTitle('🚔 HEIST FAILED!')
                    .setDescription([
                        '```diff',
                        '- BUSTED',
                        '```',
                        '',
                        `The ${location.name} job went south...`,
                        '',
                        '*You barely escaped with nothing.*',
                        '',
                        `💰 **Balance:** ${user.balance.toLocaleString()} coins`
                    ].join('\n'))
                    .setColor('#FF0000');
                editOptions = { embeds: [embed], components: [row] };
            }

            await message.edit(editOptions);
        }

        const collector = message.createMessageComponentCollector({
            time: 60000
        });

        collector.on('collect', async i => {
            if (i.user.id !== userId) {
                await i.reply({ content: '❌ This isn\'t your heist!', ephemeral: true });
                return;
            }
            collector.stop();
            const freshUser = await User.findOne({ userId, guildId });
            await this.showMainMenu(i, freshUser, true);
        });
    },

    async showIntel(interaction, user) {
        const userGear = user.equipment?.HeistGear || [];
        const gearBonus = calculateGearBonus(userGear);

        const locationLines = Object.entries(LOCATIONS).map(([id, loc]) => {
            const stars = '★'.repeat(loc.difficulty) + '☆'.repeat(5 - loc.difficulty);
            const withGear = Math.min(0.95, loc.baseSuccess + gearBonus);
            const supplyText = loc.supplyCost > 0 ? `🧰 ${loc.supplyCost.toLocaleString()}` : '🧰 Free';
            return [
                `${loc.emoji} **${loc.name}** \`${stars}\``,
                `Success: \`${(loc.baseSuccess * 100).toFixed(0)}%\` → \`${(withGear * 100).toFixed(0)}%\` with gear`,
                `-# 💵 ${loc.minReward.toLocaleString()}-${loc.maxReward.toLocaleString()} | ${supplyText}`
            ].join('\n');
        });

        const approachLines = Object.entries(APPROACHES).map(([id, app]) => {
            const successMod = app.successMod >= 0 ? `+${(app.successMod * 100).toFixed(0)}%` : `${(app.successMod * 100).toFixed(0)}%`;
            return `${app.emoji} **${app.name}** · \`${successMod}\` success · \`${app.rewardMod}x\` reward`;
        });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('heist_back').setLabel('Back to HQ').setEmoji('◀').setStyle(ButtonStyle.Secondary)
        );

        let updateOptions;
        if (shouldUseComponentsV2) {
            const placeholders = {
                gearBonus: (gearBonus * 100).toFixed(0),
                userAvatar: interaction.user.displayAvatarURL({ extension: 'png' })
            };
            const replacer = createSimplePlaceholderReplacer(placeholders);
            const payload = buildComponentsV2Payload(config.ComponentsV2.Heist.Intel, replacer);
            
            const locContent = `**📍 Locations**\n\n${locationLines.join('\n\n')}`;
            const appContent = `**📋 Approaches**\n\n${approachLines.join('\n')}`;
            
            if (payload.components && payload.components[0] && payload.components[0].components) {
                payload.components[0].components.push(
                    { type: 14 },
                    { type: 10, content: locContent },
                    { type: 14 },
                    { type: 10, content: appContent },
                    { type: 10, content: '-# ★ = Difficulty · Higher difficulty = Higher risk & reward' }
                );
            }
            
            payload.components.push(row.toJSON());
            updateOptions = { ...payload, flags: MessageFlags.IsComponentsV2 };
        } else {
            const embed = new EmbedBuilder()
                .setAuthor({ name: 'CLASSIFIED INTEL', iconURL: interaction.user.displayAvatarURL() })
                .setDescription([
                    '```',
                    '  Known Locations & Approaches  ',
                    '```',
                    '',
                    `🎒 **Your Gear Bonus:** +${(gearBonus * 100).toFixed(0)}%`
                ].join('\n'))
                .addFields(
                    {
                        name: '📍 Locations',
                        value: locationLines.join('\n\n'),
                        inline: false
                    },
                    {
                        name: '📋 Approaches',
                        value: approachLines.join('\n'),
                        inline: false
                    }
                )
                .setColor('#2C3E50')
                .setFooter({ text: '★ = Difficulty  ·  Higher difficulty = Higher risk & reward' });
            updateOptions = { embeds: [embed], components: [row] };
        }

        await interaction.update(updateOptions);

        const collector = interaction.message.createMessageComponentCollector({
            time: 120000
        });

        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) {
                await i.reply({ content: '❌ This isn\'t your heist!', ephemeral: true });
                return;
            }
            collector.stop();
            const freshUser = await User.findOne({ userId: interaction.user.id, guildId: interaction.guild.id });
            await this.showMainMenu(i, freshUser, true);
        });
    },

    createSuccessBar(rate) {
        const filled = Math.round(rate * 10);
        return '▓'.repeat(filled) + '░'.repeat(10 - filled);
    },

    async showHistory(interaction, user) {
        const heistLogs = user.transactionLogs
            ?.filter(t => t.type?.startsWith('heist_'))
            ?.slice(-10)
            ?.reverse() || [];

        const successCount = heistLogs.filter(t => t.type === 'heist_success').length;
        const failCount = heistLogs.filter(t => t.type === 'heist_fail').length;
        const totalEarnings = heistLogs.filter(t => t.type === 'heist_success').reduce((a, b) => a + (b.amount || 0), 0);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('heist_back').setLabel('Back').setEmoji('◀').setStyle(ButtonStyle.Secondary)
        );

        let updateOptions;
        if (shouldUseComponentsV2) {
            const placeholders = {
                successCount,
                failCount,
                totalEarnings: totalEarnings.toLocaleString()
            };
            const replacer = createSimplePlaceholderReplacer(placeholders);
            const payload = buildComponentsV2Payload(config.ComponentsV2.Heist.History, replacer);
            
            let historyContent;
            if (heistLogs.length === 0) {
                historyContent = '\n**Recent Jobs**\n*Complete your first heist to see it here*';
            } else {
                const historyText = heistLogs.slice(0, 5).map(log => {
                    const date = new Date(log.timestamp).toLocaleDateString();
                    if (log.type === 'heist_success') {
                        return `✅ **+${log.amount?.toLocaleString()}** coins - ${date}`;
                    } else if (log.type === 'heist_fail') {
                        return `❌ Failed - ${date}`;
                    }
                    return `🔍 Scouted - ${date}`;
                }).join('\n');
                historyContent = `\n**Recent Jobs**\n${historyText}`;
            }
            
            if (payload.components && payload.components[0] && payload.components[0].components) {
                payload.components[0].components.push({ type: 10, content: historyContent });
            }
            
            payload.components.push(row.toJSON());
            updateOptions = { ...payload, flags: MessageFlags.IsComponentsV2 };
        } else {
            const embed = new EmbedBuilder()
                .setTitle('📜 HEIST HISTORY')
                .setDescription([
                    '```',
                    '  Your Criminal Record  ',
                    '```',
                    '',
                    `✅ Successful: **${successCount}**`,
                    `❌ Failed: **${failCount}**`,
                    `💰 Total Earnings: **${totalEarnings.toLocaleString()}** coins`,
                    '',
                    '**Recent Jobs:**'
                ].join('\n'))
                .setColor('#8B4513');

            if (heistLogs.length === 0) {
                embed.addFields({ name: 'No History', value: '*Complete your first heist to see it here*', inline: false });
            } else {
                const historyText = heistLogs.slice(0, 5).map(log => {
                    const date = new Date(log.timestamp).toLocaleDateString();
                    if (log.type === 'heist_success') {
                        return `✅ **+${log.amount?.toLocaleString()}** coins - ${date}`;
                    } else if (log.type === 'heist_fail') {
                        return `❌ Failed - ${date}`;
                    }
                    return `🔍 Scouted - ${date}`;
                }).join('\n');
                
                embed.addFields({ name: '\u200b', value: historyText, inline: false });
            }

            updateOptions = { embeds: [embed], components: [row] };
        }

        await interaction.update(updateOptions);

        const collector = interaction.message.createMessageComponentCollector({
            time: 120000
        });

        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) {
                await i.reply({ content: '❌ This isn\'t your heist!', ephemeral: true });
                return;
            }
            collector.stop();
            const freshUser = await User.findOne({ userId: interaction.user.id, guildId: interaction.guild.id });
            await this.showMainMenu(i, freshUser, true);
        });
    },

    async showGearShop(interaction, user) {
        const userGear = user.equipment?.HeistGear || [];
        const gearBonus = calculateGearBonus(userGear);
        const setProgress = getSetProgress(userGear);
        const completedSets = setProgress.filter(s => s.complete);

        const setDisplay = setProgress.map(s => {
            const progress = `${s.owned}/${s.total}`;
            const status = s.complete ? '✅' : `[${progress}]`;
            const bonusText = s.complete ? `+${(s.bonus * 100).toFixed(0)}% SET BONUS` : `+${(s.bonus * 100).toFixed(0)}% if complete`;
            return `${s.emoji} **${s.name}** ${status} - ${bonusText}`;
        }).join('\n');

        const availableGear = Object.entries(HEIST_GEAR).filter(([id]) => !userGear.includes(id));

        const components = [];

        if (availableGear.length > 0) {
            const gearOptions = availableGear.map(([id, gear]) => {
                const setData = GEAR_SETS[gear.set];
                return {
                    label: `${gear.name} - ${gear.price.toLocaleString()}`,
                    description: `${setData.name} | +${(gear.successBonus * 100).toFixed(0)}% success`,
                    value: id,
                    emoji: gear.emoji
                };
            });

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('heist_gear_select')
                .setPlaceholder('▼ Select gear to purchase')
                .addOptions(gearOptions);

            components.push(new ActionRowBuilder().addComponents(selectMenu));
        }

        components.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('heist_back')
                .setLabel('Back to HQ')
                .setEmoji('◀')
                .setStyle(ButtonStyle.Secondary)
        ));

        let updateOptions;
        if (shouldUseComponentsV2) {
            const setsComplete = completedSets.length > 0 ? `\n**Sets Complete:** ${completedSets.length}/${setProgress.length}` : '';
            const placeholders = {
                balance: user.balance.toLocaleString(),
                gearBonus: (gearBonus * 100).toFixed(0),
                setsComplete,
                setDisplay
            };
            const replacer = createSimplePlaceholderReplacer(placeholders);
            const payload = buildComponentsV2Payload(config.ComponentsV2.Heist.GearShop, replacer);
            
            if (availableGear.length === 0) {
                if (payload.components && payload.components[0] && payload.components[0].components) {
                    payload.components[0].components.push({ type: 10, content: '\n**✨ Fully Equipped!**\nYou own all available heist gear!' });
                }
            }
            
            components.forEach(c => payload.components.push(c.toJSON()));
            updateOptions = { ...payload, flags: MessageFlags.IsComponentsV2 };
        } else {
            const embed = new EmbedBuilder()
                .setTitle('🎒 HEIST GEAR SHOP')
                .setDescription([
                    '```',
                    '  Collect sets for bonus success!  ',
                    '```',
                    '',
                    `💰 **Balance:** ${user.balance.toLocaleString()} coins`,
                    `🎯 **Total Bonus:** +${(gearBonus * 100).toFixed(0)}% success`,
                    completedSets.length > 0 ? `👑 **Sets Complete:** ${completedSets.length}/${setProgress.length}` : '',
                    '',
                    '**Set Progress:**',
                    setDisplay
                ].filter(Boolean).join('\n'))
                .setColor('#FFD700');

            if (availableGear.length === 0) {
                embed.addFields({
                    name: '✨ Fully Equipped!',
                    value: 'You own all available heist gear and all set bonuses are active!',
                    inline: false
                });
            }

            updateOptions = { embeds: [embed], components };
        }

        await interaction.update(updateOptions);

        const collector = interaction.message.createMessageComponentCollector({
            time: 120000
        });

        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) {
                await i.reply({ content: '❌ This isn\'t your heist!', ephemeral: true });
                return;
            }

            if (i.customId === 'heist_back') {
                collector.stop();
                const freshUser = await User.findOne({ userId: interaction.user.id, guildId: interaction.guild.id });
                await this.showMainMenu(i, freshUser, true);
                return;
            }

            if (i.customId === 'heist_gear_select') {
                const gearId = i.values[0];
                const gear = HEIST_GEAR[gearId];
                const freshUser = await User.findOne({ userId: interaction.user.id, guildId: interaction.guild.id });

                if (freshUser.balance < gear.price) {
                    await i.reply({ 
                        content: `❌ You need **${gear.price.toLocaleString()}** coins to buy ${gear.emoji} ${gear.name}!\nYour balance: **${freshUser.balance.toLocaleString()}** coins`, 
                        ephemeral: true 
                    });
                    return;
                }

                if (!freshUser.equipment) freshUser.equipment = {};
                if (!freshUser.equipment.HeistGear) freshUser.equipment.HeistGear = [];

                if (freshUser.equipment.HeistGear.includes(gearId)) {
                    await i.reply({ content: `❌ You already own ${gear.emoji} ${gear.name}!`, ephemeral: true });
                    return;
                }

                freshUser.balance -= gear.price;
                freshUser.equipment.HeistGear.push(gearId);
                freshUser.transactionLogs.push({ type: 'heist_gear', amount: -gear.price, timestamp: new Date() });
                await freshUser.save();

                collector.stop();

                // Update the shop display after purchase
                const updatedGear = freshUser.equipment.HeistGear;
                const updatedBonus = calculateGearBonus(updatedGear);

                const updatedEmbed = new EmbedBuilder()
                    .setTitle('🎒 HEIST GEAR SHOP')
                    .setDescription([
                        '```',
                        '  Upgrade your equipment  ',
                        '```',
                        '',
                        `✅ **Purchased ${gear.emoji} ${gear.name}!**`,
                        `🎯 **+${(gear.successBonus * 100).toFixed(0)}%** success bonus gained!`,
                        '',
                        `💰 **Balance:** ${freshUser.balance.toLocaleString()} coins`,
                        `🎯 **Total Bonus:** +${(updatedBonus * 100).toFixed(0)}% success`,
                        '',
                        '**Your Gear:**',
                        getOwnedGearDisplay(updatedGear)
                    ].join('\n'))
                    .setColor('#00FF00');

                const availableGear = Object.entries(HEIST_GEAR).filter(([id]) => !updatedGear.includes(id));
                const updatedComponents = [];

                if (availableGear.length > 0) {
                    const options = availableGear.map(([id, g]) => ({
                        label: `${g.name} - ${g.price.toLocaleString()} coins`,
                        description: `${g.desc} (+${(g.successBonus * 100).toFixed(0)}% success)`,
                        value: id,
                        emoji: g.emoji
                    }));

                    const selectMenu = new StringSelectMenuBuilder()
                        .setCustomId('heist_gear_select')
                        .setPlaceholder('▼ Select more gear to purchase')
                        .addOptions(options);

                    updatedComponents.push(new ActionRowBuilder().addComponents(selectMenu));
                } else {
                    updatedEmbed.addFields({
                        name: '✨ Fully Equipped!',
                        value: 'You own all available heist gear!',
                        inline: false
                    });
                }

                updatedComponents.push(new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('heist_back')
                        .setLabel('Back to HQ')
                        .setEmoji('◀')
                        .setStyle(ButtonStyle.Secondary)
                ));

                await i.update({ embeds: [updatedEmbed], components: updatedComponents });

                // Set up new collector for the updated menu
                const newCollector = i.message.createMessageComponentCollector({ time: 120000 });
                newCollector.on('collect', async newI => {
                    if (newI.user.id !== interaction.user.id) {
                        await newI.reply({ content: '❌ This isn\'t your heist!', ephemeral: true });
                        return;
                    }
                    newCollector.stop();
                    const newestUser = await User.findOne({ userId: interaction.user.id, guildId: interaction.guild.id });
                    if (newI.customId === 'heist_back') {
                        await this.showMainMenu(newI, newestUser, true);
                    } else {
                        await this.showGearShop(newI, newestUser);
                    }
                });
            }
        });
    }
};
