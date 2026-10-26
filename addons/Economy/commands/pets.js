const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const User = require('../../../models/UserData');
const StoreItem = require('../models/StoreItem');
const { getConfig } = require('../../../utils/core/configLoader.js');
const { editReplyComponentsV2, replyComponentsV2, createSimplePlaceholderReplacer } = require('../../../utils/core/componentsV2Builder.js');
const config = getConfig();

const XP_PER_LEVEL = 100;
const MAX_LEVEL = 50;
const HUNGER_DECAY_PER_HOUR = 4;
const HAPPINESS_DECAY_PER_HOUR = 2;

const ADVENTURES = {
    quick: { name: 'Quick Scout', duration: 15 * 60 * 1000, minLevel: 1, baseCoins: 50, baseXp: 15, successRate: 0.9, emoji: '🏃' },
    standard: { name: 'Forest Expedition', duration: 60 * 60 * 1000, minLevel: 5, baseCoins: 200, baseXp: 50, successRate: 0.75, emoji: '🌲' },
    epic: { name: 'Mountain Quest', duration: 4 * 60 * 60 * 1000, minLevel: 15, baseCoins: 800, baseXp: 200, successRate: 0.6, emoji: '⛰️' },
    legendary: { name: 'Dragon\'s Lair', duration: 12 * 60 * 60 * 1000, minLevel: 25, baseCoins: 3000, baseXp: 600, successRate: 0.4, emoji: '🐲' }
};

const TRAINING_COOLDOWN = 30 * 60 * 1000;
const TRAINING_COST = 100;

function calculateStats(pet) {
    const now = Date.now();
    const lastFed = new Date(pet.lastFed).getTime();
    const hoursSinceFed = (now - lastFed) / (1000 * 60 * 60);
    const hunger = Math.max(0, Math.min(100, 100 - (hoursSinceFed * HUNGER_DECAY_PER_HOUR)));
    const happiness = Math.max(0, Math.min(100, (pet.happiness || 100) - (hoursSinceFed * HAPPINESS_DECAY_PER_HOUR)));
    return { hunger, happiness };
}

function getXpForLevel(level) { return Math.floor(XP_PER_LEVEL * Math.pow(1.2, level - 1)); }
function getLevelBonus(level) { return 1 + ((level - 1) * 0.05); }
function getStatBonus(pet) {
    const stats = pet.stats || { agility: 0, intelligence: 0, strength: 0 };
    return 1 + ((stats.agility + stats.intelligence + stats.strength) * 0.01);
}
function getUpkeepCost(pet, petItem) { return Math.floor((petItem?.rewardData?.petPassiveIncome || 10) * 0.1); }
async function getPetItem(petId) { return await StoreItem.findOne({ itemId: petId }); }
function createProgressBar(current, max, length = 10) { const filled = Math.round((current / max) * length); return '▓'.repeat(filled) + '░'.repeat(length - filled); }
function formatDuration(ms) {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}

function createDashboardButtons(currentView = 'dashboard', hasPets = true) {
    return [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('pet_dashboard').setLabel('Dashboard').setEmoji('🏠').setStyle(currentView === 'dashboard' ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('pet_training').setLabel('Training').setEmoji('🎯').setStyle(currentView === 'training' ? ButtonStyle.Primary : ButtonStyle.Secondary).setDisabled(!hasPets),
        new ButtonBuilder().setCustomId('pet_adventures').setLabel('Adventures').setEmoji('🗺️').setStyle(currentView === 'adventures' ? ButtonStyle.Primary : ButtonStyle.Secondary).setDisabled(!hasPets),
        new ButtonBuilder().setCustomId('pet_collect').setLabel('Collect').setEmoji('💰').setStyle(ButtonStyle.Success).setDisabled(!hasPets)
    )];
}

function createPetSelectMenu(pets, currentPetId) {
    if (pets.length === 0) return null;
    const options = pets.map(pet => ({ label: pet.name, value: pet.petId, description: `Level ${pet.level}`, default: pet.petId === currentPetId }));
    return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('pet_select').setPlaceholder('Select a pet').addOptions(options.slice(0, 25)));
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pets')
        .setDescription('Manage your pet collection')
        .addSubcommand(sub => sub.setName('menu').setDescription('Open the pet dashboard'))
        .addSubcommand(sub => sub.setName('feed').setDescription('Feed your active pet'))
        .addSubcommand(sub => sub.setName('rename').setDescription('Rename a pet').addStringOption(opt => opt.setName('name').setDescription('New name').setRequired(true).setMaxLength(20)))
        .addSubcommand(sub => sub.setName('release').setDescription('Release a pet').addStringOption(opt => opt.setName('pet').setDescription('Pet to release').setRequired(true))),
    category: 'Economy',

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        let user = await User.findOne({ userId: interaction.user.id, guildId: interaction.guild.id });
        if (!user) { user = new User({ userId: interaction.user.id, guildId: interaction.guild.id, balance: 0, pets: [] }); await user.save(); }
        if (!user.pets) user.pets = [];

        switch (subcommand) {
            case 'menu': return this.showDashboard(interaction, user);
            case 'feed': return this.feedPet(interaction, user);
            case 'rename': return this.renamePet(interaction, user);
            case 'release': return this.releasePet(interaction, user);
        }
    },

    async showDashboard(interaction, user, isEdit = false) {
        if (user.pets.length === 0) {
            const emptyV2 = { Components: [{ Type: 'container', AccentColor: '#2b2d31', Components: [
                { Type: 'text_display', Content: '# PET DASHBOARD\n\nYou don\'t have any pets yet.\n\n> Visit `/store` to adopt one.' }
            ]}]};
            const response = { flags: MessageFlags.Ephemeral };
            if (isEdit) {
                return editReplyComponentsV2(interaction, emptyV2.Components, createSimplePlaceholderReplacer({}), createDashboardButtons('dashboard', false));
            }
            await interaction.deferReply(response);
            return editReplyComponentsV2(interaction, emptyV2.Components, createSimplePlaceholderReplacer({}), createDashboardButtons('dashboard', false));
        }

        const activePet = user.pets.find(p => p.petId === user.activePetId) || user.pets[0];
        const petItem = await getPetItem(activePet.petId);
        const stats = calculateStats(activePet);
        const petStats = activePet.stats || { agility: 0, intelligence: 0, strength: 0 };
        const xpNeeded = getXpForLevel(activePet.level);
        
        const basePassive = petItem?.rewardData?.petPassiveIncome || 0;
        const levelBonus = getLevelBonus(activePet.level);
        const statBonus = getStatBonus(activePet);
        const hourlyEarning = Math.floor(basePassive * levelBonus * statBonus * (stats.hunger / 100));
        const upkeepCost = getUpkeepCost(activePet, petItem);
        const netEarning = hourlyEarning - upkeepCost;

        let statusText = activePet.petId === user.activePetId ? 'Active' : 'Inactive';
        if (activePet.activeAdventure) {
            const remaining = new Date(activePet.activeAdventure.endsAt).getTime() - Date.now();
            if (remaining > 0) statusText = `On Adventure (${formatDuration(remaining)})`;
        }

        const dashV2 = { Components: [{ Type: 'container', AccentColor: '#5865F2', Components: [
            { Type: 'text_display', Content: `# ${activePet.name}\n\n> **Level:** ${activePet.level}  ·  **Status:** ${statusText}  ·  **Net:** +${netEarning}/hr\n\n**XP**\n${createProgressBar(activePet.xp, xpNeeded)} ${activePet.xp}/${xpNeeded}\n\n**Happiness**\n${createProgressBar(stats.happiness, 100)} ${Math.floor(stats.happiness)}%\n\n**Hunger**\n${createProgressBar(stats.hunger, 100)} ${Math.floor(stats.hunger)}%\n\n**Stats:** AGI ${petStats.agility} · INT ${petStats.intelligence} · STR ${petStats.strength}` },
            { Type: 'text_display', Content: `-# Earnings: ${hourlyEarning}/hr · Upkeep: ${upkeepCost}/hr · Total: ${activePet.totalEarnings.toLocaleString()}` }
        ]}]};

        const components = createDashboardButtons('dashboard', true);
        const petSelect = createPetSelectMenu(user.pets, activePet.petId);
        if (petSelect) components.push(petSelect);

        const quickActions = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('pet_feed').setLabel('Feed').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('pet_set_active').setLabel('Set Active').setStyle(ButtonStyle.Secondary).setDisabled(activePet.petId === user.activePetId)
        );
        components.push(quickActions);

        if (isEdit) {
            return editReplyComponentsV2(interaction, dashV2.Components, createSimplePlaceholderReplacer({}), components);
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        return editReplyComponentsV2(interaction, dashV2.Components, createSimplePlaceholderReplacer({}), components);
    },

    async showTraining(interaction, user) {
        const activePet = user.pets.find(p => p.petId === user.activePetId) || user.pets[0];
        if (!activePet) return;

        const now = Date.now();
        const training = activePet.training || {};

        const canFetch = !training.lastFetch || (now - new Date(training.lastFetch).getTime()) >= TRAINING_COOLDOWN;
        const canPuzzle = !training.lastPuzzle || (now - new Date(training.lastPuzzle).getTime()) >= TRAINING_COOLDOWN;
        const canAgility = !training.lastAgility || (now - new Date(training.lastAgility).getTime()) >= TRAINING_COOLDOWN;

        const trainV2 = { Components: [{ Type: 'container', AccentColor: '#9b59b6', Components: [
            { Type: 'text_display', Content: `# TRAINING HUB\n\nTraining **${activePet.name}**\n\n> Each training costs **${TRAINING_COST}** coins.\n\n**Current Stats:**\n> Agility: ${activePet.stats?.agility || 0}\n> Intelligence: ${activePet.stats?.intelligence || 0}\n> Strength: ${activePet.stats?.strength || 0}` }
        ]}]};

        const trainingRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('train_fetch').setLabel(canFetch ? 'Fetch (+AGI)' : 'Cooldown').setStyle(canFetch ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(!canFetch || user.balance < TRAINING_COST),
            new ButtonBuilder().setCustomId('train_puzzle').setLabel(canPuzzle ? 'Puzzle (+INT)' : 'Cooldown').setStyle(canPuzzle ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(!canPuzzle || user.balance < TRAINING_COST),
            new ButtonBuilder().setCustomId('train_agility').setLabel(canAgility ? 'Agility (+STR)' : 'Cooldown').setStyle(canAgility ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(!canAgility || user.balance < TRAINING_COST)
        );

        const components = createDashboardButtons('training', true);
        components.push(trainingRow);

        await editReplyComponentsV2(interaction, trainV2.Components, createSimplePlaceholderReplacer({}), components);
    },

    async showAdventures(interaction, user) {
        const activePet = user.pets.find(p => p.petId === user.activePetId) || user.pets[0];
        if (!activePet) return;

        const stats = calculateStats(activePet);

        if (activePet.activeAdventure) {
            const remaining = new Date(activePet.activeAdventure.endsAt).getTime() - Date.now();
            if (remaining > 0) {
                const adventure = ADVENTURES[activePet.activeAdventure.type];
                const advV2 = { Components: [{ Type: 'container', AccentColor: '#f39c12', Components: [
                    { Type: 'text_display', Content: `# ${adventure.name}\n\n**${activePet.name}** is on an adventure!\n\n> Returns in: **${formatDuration(remaining)}**\n\n**Potential Rewards:**\n> Coins: ${activePet.activeAdventure.rewards.coins}\n> XP: ${activePet.activeAdventure.rewards.xp}` }
                ]}]};

                const claimRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('adventure_claim').setLabel('Claim Rewards').setStyle(ButtonStyle.Success).setDisabled(remaining > 0)
                );
                const components = createDashboardButtons('adventures', true);
                components.push(claimRow);
                return editReplyComponentsV2(interaction, advV2.Components, createSimplePlaceholderReplacer({}), components);
            } else {
                return this.claimAdventure(interaction, user);
            }
        }

        const adventureLines = Object.entries(ADVENTURES).map(([key, adv]) => {
            const canStart = activePet.level >= adv.minLevel;
            const locked = !canStart ? '(Locked) ' : '';
            const successChance = Math.floor(adv.successRate * 100 * (stats.happiness / 100));
            return `**${adv.name}** ${locked}\n> Lv.${adv.minLevel}+ · ${formatDuration(adv.duration)} · ${successChance}% success`;
        });

        const advBoardV2 = { Components: [{ Type: 'container', AccentColor: '#3498db', Components: [
            { Type: 'text_display', Content: `# ADVENTURE BOARD\n\nSend **${activePet.name}** on an adventure!\n\n${adventureLines.join('\n\n')}` },
            { Type: 'text_display', Content: `-# Adventures completed: ${activePet.adventureHistory?.completed || 0}` }
        ]}]};

        const adventureSelect = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder().setCustomId('adventure_start').setPlaceholder('Select an adventure')
                .addOptions(Object.entries(ADVENTURES).map(([key, adv]) => ({ label: adv.name, value: key, description: `${formatDuration(adv.duration)} | Level ${adv.minLevel}+` })))
        );

        const components = createDashboardButtons('adventures', true);
        components.push(adventureSelect);
        await editReplyComponentsV2(interaction, advBoardV2.Components, createSimplePlaceholderReplacer({}), components);
    },

    async startAdventure(interaction, user, adventureType) {
        const activePet = user.pets.find(p => p.petId === user.activePetId) || user.pets[0];
        if (!activePet || activePet.activeAdventure) return;

        const adventure = ADVENTURES[adventureType];
        if (!adventure || activePet.level < adventure.minLevel) {
            return interaction.followUp({ content: `Your pet needs to be level ${adventure.minLevel} for this adventure!`, flags: MessageFlags.Ephemeral });
        }

        const stats = calculateStats(activePet);
        const successRate = adventure.successRate * (stats.happiness / 100);
        const success = Math.random() < successRate;

        const coinMultiplier = success ? (1 + Math.random()) : 0.2;
        const xpMultiplier = success ? (1 + Math.random()) : 0.5;

        activePet.activeAdventure = {
            type: adventureType,
            startedAt: new Date(),
            endsAt: new Date(Date.now() + adventure.duration),
            rewards: { coins: Math.floor(adventure.baseCoins * coinMultiplier * getLevelBonus(activePet.level)), xp: Math.floor(adventure.baseXp * xpMultiplier), items: [] }
        };

        await user.save();
        return interaction.followUp({ content: `${adventure.emoji} **${activePet.name}** has departed on **${adventure.name}**! They'll return in ${formatDuration(adventure.duration)}.`, flags: MessageFlags.Ephemeral });
    },

    async claimAdventure(interaction, user) {
        const activePet = user.pets.find(p => p.petId === user.activePetId) || user.pets[0];
        if (!activePet?.activeAdventure) return;

        const remaining = new Date(activePet.activeAdventure.endsAt).getTime() - Date.now();
        if (remaining > 0) {
            return interaction.followUp({ content: `Your pet is still on the adventure! Returns in ${formatDuration(remaining)}`, flags: MessageFlags.Ephemeral });
        }

        const rewards = activePet.activeAdventure.rewards;
        const adventure = ADVENTURES[activePet.activeAdventure.type];

        user.balance += rewards.coins;
        activePet.xp += rewards.xp;
        activePet.adventureHistory = activePet.adventureHistory || { completed: 0, successful: 0, totalCoinsEarned: 0, totalXpEarned: 0 };
        activePet.adventureHistory.completed++;
        activePet.adventureHistory.successful += rewards.coins > adventure.baseCoins ? 1 : 0;
        activePet.adventureHistory.totalCoinsEarned += rewards.coins;
        activePet.adventureHistory.totalXpEarned += rewards.xp;

        let leveledUp = false;
        const xpNeeded = getXpForLevel(activePet.level);
        while (activePet.xp >= xpNeeded && activePet.level < MAX_LEVEL) { activePet.xp -= xpNeeded; activePet.level++; leveledUp = true; }

        activePet.activeAdventure = null;
        await user.save();

        const completeV2 = { Components: [{ Type: 'container', AccentColor: '#57F287', Components: [
            { Type: 'text_display', Content: `# ADVENTURE COMPLETE\n\n**${activePet.name}** has returned from **${adventure.name}**!\n\n**Rewards:**\n> +${rewards.coins.toLocaleString()} coins\n> +${rewards.xp} XP${leveledUp ? `\n\n**LEVEL UP!** Now level ${activePet.level}!` : ''}` }
        ]}]};

        await editReplyComponentsV2(interaction, completeV2.Components, createSimplePlaceholderReplacer({}), createDashboardButtons('adventures', true));
    },

    async runTraining(interaction, user, trainingType) {
        const activePet = user.pets.find(p => p.petId === user.activePetId) || user.pets[0];
        if (!activePet) return;

        if (user.balance < TRAINING_COST) {
            return interaction.followUp({ content: `You need ${TRAINING_COST} coins for training!`, flags: MessageFlags.Ephemeral });
        }

        const stats = calculateStats(activePet);
        const successRate = 0.5 + (stats.happiness / 200) + (stats.hunger / 200);
        const success = Math.random() < successRate;

        activePet.training = activePet.training || {};
        activePet.stats = activePet.stats || { agility: 0, intelligence: 0, strength: 0 };

        const statGain = success ? Math.floor(1 + Math.random() * 3) : 0;
        const xpGain = success ? Math.floor(20 + Math.random() * 30) : Math.floor(5 + Math.random() * 10);

        let statName = '';
        switch (trainingType) {
            case 'fetch': activePet.training.lastFetch = new Date(); activePet.stats.agility += statGain; statName = 'Agility'; break;
            case 'puzzle': activePet.training.lastPuzzle = new Date(); activePet.stats.intelligence += statGain; statName = 'Intelligence'; break;
            case 'agility': activePet.training.lastAgility = new Date(); activePet.stats.strength += statGain; statName = 'Strength'; break;
        }

        activePet.training.totalSessions = (activePet.training.totalSessions || 0) + 1;
        activePet.xp += xpGain;
        user.balance -= TRAINING_COST;

        let leveledUp = false;
        const xpNeeded = getXpForLevel(activePet.level);
        if (activePet.xp >= xpNeeded && activePet.level < MAX_LEVEL) { activePet.xp -= xpNeeded; activePet.level++; leveledUp = true; }

        await user.save();

        const resultEmoji = success ? '✅' : '❌';
        const resultText = success ? `Training successful! **+${statGain} ${statName}** and **+${xpGain} XP**` : `Training failed, but ${activePet.name} still gained **+${xpGain} XP**`;

        return interaction.followUp({ content: `${resultEmoji} ${resultText}${leveledUp ? `\n🎉 **LEVEL UP!** Now level ${activePet.level}!` : ''}`, flags: MessageFlags.Ephemeral });
    },

    async feedPet(interaction, user) {
        const pet = user.pets.find(p => p.petId === user.activePetId) || user.pets[0];
        if (!pet) return interaction.reply({ content: 'You don\'t have any pets!', flags: MessageFlags.Ephemeral });

        const petItem = await getPetItem(pet.petId);
        const feedCost = config.Pets?.feedCost || 50;

        if (user.balance < feedCost) return interaction.reply({ content: `You need **${feedCost}** coins to feed your pet.`, flags: MessageFlags.Ephemeral });

        const oldStats = calculateStats(pet);
        const xpGain = Math.floor(10 + Math.random() * 10);

        user.balance -= feedCost;
        pet.hunger = 100;
        pet.happiness = Math.min(100, (oldStats.happiness || 0) + 20);
        pet.lastFed = new Date();
        pet.timesFed = (pet.timesFed || 0) + 1;
        pet.xp = (pet.xp || 0) + xpGain;

        let leveledUp = false;
        const xpNeeded = getXpForLevel(pet.level);
        if (pet.xp >= xpNeeded && pet.level < MAX_LEVEL) { pet.xp -= xpNeeded; pet.level++; leveledUp = true; }

        await user.save();

        const feedV2 = { Components: [{ Type: 'container', AccentColor: leveledUp ? '#FFD700' : '#57F287', Components: [
            { Type: 'text_display', Content: `# ${petItem?.metadata?.emoji || '🐾'} ${pet.name} Fed!\n\n${leveledUp ? '🎉 **LEVEL UP!** Now level ' + pet.level + '!\n\n' : ''}> 🍖 Hunger: ${Math.floor(oldStats.hunger)}% → 100%\n> ❤️ Happiness: ${Math.floor(oldStats.happiness)}% → ${pet.happiness}%\n> ✨ XP: +${xpGain}` },
            { Type: 'text_display', Content: `-# Cost: ${feedCost} coins · Balance: ${user.balance.toLocaleString()}` }
        ]}]};

        return replyComponentsV2(interaction, feedV2.Components, createSimplePlaceholderReplacer({}), { ephemeral: true });
    },

    async renamePet(interaction, user) {
        const newName = interaction.options.getString('name');
        const pet = user.pets.find(p => p.petId === user.activePetId) || user.pets[0];
        if (!pet) return interaction.reply({ content: 'You don\'t have any pets!', flags: MessageFlags.Ephemeral });
        const oldName = pet.name;
        pet.name = newName;
        await user.save();
        return interaction.reply({ content: `✅ **${oldName}** is now **${newName}**!`, flags: MessageFlags.Ephemeral });
    },

    async releasePet(interaction, user) {
        const petQuery = interaction.options.getString('pet').toLowerCase();
        const petIndex = user.pets.findIndex(p => p.name.toLowerCase() === petQuery || p.petId.startsWith(petQuery));
        if (petIndex === -1) return interaction.reply({ content: 'Pet not found.', flags: MessageFlags.Ephemeral });
        const pet = user.pets[petIndex];
        user.pets.splice(petIndex, 1);
        if (user.activePetId === pet.petId) user.activePetId = user.pets.length > 0 ? user.pets[0].petId : null;
        await user.save();
        return interaction.reply({ content: `🐾 **${pet.name}** has been released. Level ${pet.level} • Earned ${pet.totalEarnings.toLocaleString()} total`, flags: MessageFlags.Ephemeral });
    },

    async handleInteraction(interaction, user) {
        const customId = interaction.customId;
        await interaction.deferUpdate();

        if (customId === 'pet_dashboard') return this.showDashboard(interaction, user, true);
        if (customId === 'pet_training') return this.showTraining(interaction, user);
        if (customId === 'pet_adventures') return this.showAdventures(interaction, user);
        if (customId === 'pet_collect') return this.collectEarnings(interaction, user);
        if (customId === 'pet_feed') return this.quickFeed(interaction, user);
        if (customId === 'pet_set_active') return this.showDashboard(interaction, user, true);
        if (customId === 'pet_select') { user.activePetId = interaction.values[0]; await user.save(); return this.showDashboard(interaction, user, true); }
        if (customId.startsWith('train_')) { const type = customId.replace('train_', ''); await this.runTraining(interaction, user, type); return this.showTraining(interaction, user); }
        if (customId === 'adventure_start') { await this.startAdventure(interaction, user, interaction.values[0]); return this.showAdventures(interaction, user); }
        if (customId === 'adventure_claim') return this.claimAdventure(interaction, user);
    },

    async quickFeed(interaction, user) {
        const pet = user.pets.find(p => p.petId === user.activePetId) || user.pets[0];
        if (!pet) return;

        const feedCost = config.Pets?.feedCost || 50;
        if (user.balance < feedCost) return interaction.followUp({ content: `You need **${feedCost}** coins to feed your pet.`, flags: MessageFlags.Ephemeral });

        const oldStats = calculateStats(pet);
        const xpGain = Math.floor(10 + Math.random() * 10);

        user.balance -= feedCost;
        pet.hunger = 100;
        pet.happiness = Math.min(100, (oldStats.happiness || 0) + 20);
        pet.lastFed = new Date();
        pet.timesFed = (pet.timesFed || 0) + 1;
        pet.xp += xpGain;

        let leveledUp = false;
        const xpNeeded = getXpForLevel(pet.level);
        if (pet.xp >= xpNeeded && pet.level < MAX_LEVEL) { pet.xp -= xpNeeded; pet.level++; leveledUp = true; }

        await user.save();
        await interaction.followUp({ content: `Fed **${pet.name}**! +${xpGain} XP${leveledUp ? ' **LEVEL UP!**' : ''}`, flags: MessageFlags.Ephemeral });
        return this.showDashboard(interaction, user, true);
    },

    async collectEarnings(interaction, user) {
        if (user.pets.length === 0) return;

        let totalEarnings = 0;
        let totalUpkeep = 0;
        let petsCollected = 0;

        for (const pet of user.pets) {
            const petItem = await getPetItem(pet.petId);
            const stats = calculateStats(pet);
            const lastCollect = pet.lastCollect ? new Date(pet.lastCollect).getTime() : new Date(pet.acquiredAt).getTime();
            const hoursSinceCollect = Math.min(24, (Date.now() - lastCollect) / (1000 * 60 * 60));

            if (hoursSinceCollect < 0.5) continue;

            const basePassive = petItem?.rewardData?.petPassiveIncome || 10;
            const levelBonus = getLevelBonus(pet.level);
            const statBonus = getStatBonus(pet);
            const hungerMultiplier = Math.max(0.1, stats.hunger / 100);
            const hourlyEarning = basePassive * levelBonus * statBonus * hungerMultiplier;
            const upkeep = getUpkeepCost(pet, petItem);

            const earnings = Math.floor(hourlyEarning * hoursSinceCollect);
            const upkeepCost = Math.floor(upkeep * hoursSinceCollect);

            totalEarnings += earnings;
            totalUpkeep += upkeepCost;
            petsCollected++;
            pet.lastCollect = new Date();
            pet.totalEarnings = (pet.totalEarnings || 0) + Math.max(0, earnings - upkeepCost);
        }

        if (petsCollected === 0) {
            await interaction.followUp({ content: 'Nothing to collect yet. Wait at least 30 minutes between collections.', flags: MessageFlags.Ephemeral });
            return this.showDashboard(interaction, user, true);
        }

        const netTotal = totalEarnings - totalUpkeep;
        user.balance += netTotal;
        await user.save();

        await interaction.followUp({ content: `Collected **${totalEarnings.toLocaleString()}** coins (−${totalUpkeep.toLocaleString()} upkeep) = **${netTotal >= 0 ? '+' : ''}${netTotal.toLocaleString()}**`, flags: MessageFlags.Ephemeral });
        return this.showDashboard(interaction, user, true);
    }
};
