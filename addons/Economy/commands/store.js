const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const User = require('../../../models/UserData');
const { editReplyComponentsV2, createSimplePlaceholderReplacer } = require('../../../utils/core/componentsV2Builder.js');

const CATEGORY_INFO = {
    pets: { name: 'Pets', emoji: '🐾', color: '#FF9500' },
    roles: { name: 'Roles', emoji: '🎭', color: '#9B59B6' },
    boosters: { name: 'Boosters', emoji: '🚀', color: '#3498DB' },
    titles: { name: 'Titles', emoji: '🏷️', color: '#E91E63' },
    items: { name: 'Items', emoji: '🎒', color: '#2ECC71' },
    special: { name: 'Special', emoji: '✨', color: '#F1C40F' }
};

function getItemStatus(item, user) {
    if (item.rewardType === 'pet' && user.pets?.some(p => p.petId === item.itemId)) {
        return { emoji: '✅', status: 'owned', reason: 'Already owned' };
    }
    const meetsLevel = !item.requirements?.level || (user.level || 0) >= item.requirements.level;
    const meetsPrestige = !item.requirements?.prestige || (user.prestigeLevel || 0) >= item.requirements.prestige;
    if (!meetsLevel || !meetsPrestige) {
        return { emoji: '🛑', status: 'locked', reason: !meetsLevel ? `Lvl ${item.requirements.level}` : `Prestige ${item.requirements.prestige}` };
    }
    if (user.balance < item.price) {
        return { emoji: '🔴', status: 'expensive', reason: 'Insufficient funds' };
    }
    return { emoji: '🟢', status: 'available', reason: null };
}

function formatPrice(price) {
    if (price >= 1000000) return `${(price / 1000000).toFixed(1)}M`;
    if (price >= 1000) return `${(price / 1000).toFixed(1)}K`;
    return price.toString();
}

async function buildCategoryComponentsV2(interaction, user) {
    const categoryList = [];
    for (const cat of Object.keys(CATEGORY_INFO)) {
        const items = await global.storeAPI.getItems(interaction.guild.id, cat);
        if (items.length > 0) {
            categoryList.push({ category: cat, ...CATEGORY_INFO[cat], count: items.length });
        }
    }

    if (categoryList.length === 0) {
        return { components: null, selectRow: [] };
    }

    const categoryLines = categoryList.map(cat => `${cat.emoji}  **${cat.name}**  ─  ${cat.count} items`).join('\n');

    const components = {
        Components: [
            {
                Type: 'container',
                AccentColor: '#5865F2',
                Components: [
                    { Type: 'text_display', Content: `# STORE\n\nSelect a category to browse items.\n\n${categoryLines}` },
                    { Type: 'text_display', Content: `-# Balance: ${user.balance.toLocaleString()} coins` }
                ]
            }
        ]
    };

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('store_category')
        .setPlaceholder('▼  Choose a category')
        .addOptions(categoryList.map(cat => ({
            label: cat.name,
            value: cat.category,
            emoji: cat.emoji,
            description: `Browse ${cat.count} items`
        })));

    return { components, selectRow: [new ActionRowBuilder().addComponents(selectMenu)] };
}

async function buildCategoryItemsComponentsV2(interaction, category, user) {
    const items = await global.storeAPI.getItems(interaction.guild.id, category);
    const info = CATEGORY_INFO[category];

    if (items.length === 0) {
        const components = {
            Components: [{ Type: 'container', AccentColor: '#ED4245', Components: [
                { Type: 'text_display', Content: `No items in ${info.name}` }
            ]}]
        };
        return { components, selectRow: [], backRow: [] };
    }

    const itemLines = items.slice(0, 8).map(item => {
        const priceStr = formatPrice(item.price);
        const status = getItemStatus(item, user);
        let details = '';
        
        if (status.status === 'owned') {
            details = '✓ Owned';
        } else {
            switch (item.rewardType) {
                case 'pet':
                    const petBoost = ((item.rewardData.petMultiplier - 1) * 100).toFixed(0);
                    const passive = item.rewardData.petPassiveIncome || 0;
                    details = `+${petBoost}% earnings · ${passive}/hr passive`;
                    break;
                case 'booster':
                    const boostMult = item.rewardData.boosterMultiplier || 1.5;
                    const duration = (item.rewardData.boosterDuration / 3600000).toFixed(0);
                    details = `${boostMult}x ${item.rewardData.boosterType} · ${duration}h`;
                    break;
                case 'title':
                    details = `Title: ${item.rewardData.title}`;
                    break;
                case 'role':
                    const roleDur = item.rewardData.roleDuration ? `${(item.rewardData.roleDuration / 86400000).toFixed(0)}d` : 'Permanent';
                    details = `Role · ${roleDur}`;
                    break;
                default:
                    details = item.description || 'No description';
            }
        }
        
        return `${item.metadata.emoji}  **${item.name}**  ─  \`${priceStr}\` coins\n-# ${details}`;
    });

    const components = {
        Components: [
            {
                Type: 'container',
                AccentColor: info.color,
                Components: [
                    { Type: 'text_display', Content: `# ${info.emoji}  ${info.name.toUpperCase()}\n\n${itemLines.join('\n\n')}` },
                    { Type: 'text_display', Content: `-# Balance: ${user.balance.toLocaleString()} coins` }
                ]
            }
        ]
    };

    const selectOptions = items.slice(0, 25).map(item => {
        const status = getItemStatus(item, user);
        const desc = status.reason || `${item.price.toLocaleString()} coins`;
        return { label: item.name, description: desc.substring(0, 50), value: item.itemId, emoji: status.emoji };
    });

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('store_purchase')
        .setPlaceholder('▼  Select item to purchase')
        .addOptions(selectOptions);

    const backButton = new ButtonBuilder()
        .setCustomId('store_back')
        .setLabel('Categories')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('◀');

    return {
        components,
        selectRow: [new ActionRowBuilder().addComponents(selectMenu)],
        backRow: [new ActionRowBuilder().addComponents(backButton)]
    };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('store')
        .setDescription('Browse and purchase items')
        .addSubcommand(sub => sub.setName('browse').setDescription('Browse store categories'))
        .addSubcommand(sub => sub.setName('category').setDescription('View a category')
            .addStringOption(opt => opt.setName('type').setDescription('Category').setRequired(true)
                .addChoices(
                    { name: '🐾 Pets', value: 'pets' },
                    { name: '🎭 Roles', value: 'roles' },
                    { name: '🚀 Boosters', value: 'boosters' },
                    { name: '🏷️ Titles', value: 'titles' },
                    { name: '🎒 Items', value: 'items' },
                    { name: '✨ Special', value: 'special' }
                ))),
    category: 'Economy',
    
    CATEGORY_INFO,
    getItemStatus,
    formatPrice,
    buildCategoryComponentsV2,
    buildCategoryItemsComponentsV2,
    
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        await global.storeAPI.seedDefaultItems(interaction.guild.id);
        
        let user = await User.findOne({ userId: interaction.user.id, guildId: interaction.guild.id });
        if (!user) {
            user = new User({ userId: interaction.user.id, guildId: interaction.guild.id, balance: 0 });
            await user.save();
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        if (subcommand === 'browse') {
            const { components, selectRow } = await buildCategoryComponentsV2(interaction, user);
            if (!components) {
                const emptyV2 = { Components: [{ Type: 'container', AccentColor: '#ED4245', Components: [
                    { Type: 'text_display', Content: 'The store is currently empty.' }
                ]}]};
                return editReplyComponentsV2(interaction, emptyV2.Components, createSimplePlaceholderReplacer({}));
            }
            await editReplyComponentsV2(interaction, components.Components, createSimplePlaceholderReplacer({}), selectRow);
        } else if (subcommand === 'category') {
            const category = interaction.options.getString('type');
            const { components, selectRow, backRow } = await buildCategoryItemsComponentsV2(interaction, category, user);
            await editReplyComponentsV2(interaction, components.Components, createSimplePlaceholderReplacer({}), [...selectRow, ...backRow]);
        }
    },

    async handleCategorySelect(interaction) {
        const category = interaction.values[0];
        let user = await User.findOne({ userId: interaction.user.id, guildId: interaction.guild.id });
        if (!user) {
            user = new User({ userId: interaction.user.id, guildId: interaction.guild.id, balance: 0 });
            await user.save();
        }

        await interaction.deferUpdate();
        const { components, selectRow, backRow } = await buildCategoryItemsComponentsV2(interaction, category, user);
        await editReplyComponentsV2(interaction, components.Components, createSimplePlaceholderReplacer({}), [...selectRow, ...backRow]);
    },

    async handleBackButton(interaction) {
        let user = await User.findOne({ userId: interaction.user.id, guildId: interaction.guild.id });
        if (!user) user = new User({ userId: interaction.user.id, guildId: interaction.guild.id, balance: 0 });

        await interaction.deferUpdate();
        const { components, selectRow } = await buildCategoryComponentsV2(interaction, user);
        
        if (!components) {
            const emptyV2 = { Components: [{ Type: 'container', AccentColor: '#ED4245', Components: [
                { Type: 'text_display', Content: 'The store is currently empty.' }
            ]}]};
            return editReplyComponentsV2(interaction, emptyV2.Components, createSimplePlaceholderReplacer({}));
        }
        
        await editReplyComponentsV2(interaction, components.Components, createSimplePlaceholderReplacer({}), selectRow);
    },

    async handlePurchase(interaction) {
        const itemId = interaction.values[0];
        let user = await User.findOne({ userId: interaction.user.id, guildId: interaction.guild.id });
        if (!user) {
            user = new User({ userId: interaction.user.id, guildId: interaction.guild.id, balance: 0 });
            await user.save();
        }

        const item = await global.storeAPI.getItem(interaction.guild.id, itemId);
        
        if (!item) {
            const errorV2 = { Components: [{ Type: 'container', AccentColor: '#ED4245', Components: [
                { Type: 'text_display', Content: '**Item Unavailable**\n\n> This item is no longer available.' }
            ]}]};
            await interaction.deferUpdate();
            return editReplyComponentsV2(interaction, errorV2.Components, createSimplePlaceholderReplacer({}));
        }

        const status = getItemStatus(item, user);
        const backBtn = new ButtonBuilder().setCustomId('store_back').setLabel('Back to Store').setStyle(ButtonStyle.Secondary);
        
        await interaction.deferUpdate();

        if (status.status === 'owned') {
            const ownedV2 = { Components: [{ Type: 'container', AccentColor: '#3498DB', Components: [
                { Type: 'text_display', Content: `# ✅ ALREADY OWNED\n\n${item.metadata.emoji} **${item.name}**\n\n-# You already own this! Use \`/pets list\` to view your collection` }
            ]}]};
            return editReplyComponentsV2(interaction, ownedV2.Components, createSimplePlaceholderReplacer({}), [new ActionRowBuilder().addComponents(backBtn)]);
        }

        if (status.status === 'locked') {
            const lockedV2 = { Components: [{ Type: 'container', AccentColor: '#ED4245', Components: [
                { Type: 'text_display', Content: `# 🛑 LOCKED\n\n${item.metadata.emoji} **${item.name}**\n\n-# Requires **${status.reason}** to unlock` }
            ]}]};
            return editReplyComponentsV2(interaction, lockedV2.Components, createSimplePlaceholderReplacer({}), [new ActionRowBuilder().addComponents(backBtn)]);
        }

        if (status.status === 'expensive') {
            const needed = item.price - user.balance;
            const expensiveV2 = { Components: [{ Type: 'container', AccentColor: '#ED4245', Components: [
                { Type: 'text_display', Content: `# 💸 INSUFFICIENT FUNDS\n\n${item.metadata.emoji} **${item.name}**\n\n> Price: **${item.price.toLocaleString()}** coins\n> Your balance: **${user.balance.toLocaleString()}** coins\n\n-# You need **${needed.toLocaleString()}** more coins` }
            ]}]};
            return editReplyComponentsV2(interaction, expensiveV2.Components, createSimplePlaceholderReplacer({}), [new ActionRowBuilder().addComponents(backBtn)]);
        }

        const result = await global.storeAPI.purchaseItem(interaction.guild.id, interaction.user.id, itemId, interaction.client);

        if (!result.success) {
            const failV2 = { Components: [{ Type: 'container', AccentColor: '#ED4245', Components: [
                { Type: 'text_display', Content: `# ❌ FAILED\n\n> ${result.error}` }
            ]}]};
            return editReplyComponentsV2(interaction, failV2.Components, createSimplePlaceholderReplacer({}), [new ActionRowBuilder().addComponents(backBtn)]);
        }

        const newBalance = user.balance - result.item.price;

        const successV2 = { Components: [{ Type: 'container', AccentColor: '#57F287', Components: [
            { Type: 'text_display', Content: `# ✅ PURCHASE COMPLETE\n\n${result.item.metadata.emoji} **${result.item.name}**\n-# ${result.reward}\n\n> 💸 **-${result.item.price.toLocaleString()}** coins\n> 💰 Balance: **${newBalance.toLocaleString()}** coins` }
        ]}]};

        const continueBtn = new ButtonBuilder().setCustomId('store_back').setLabel('Continue Shopping').setStyle(ButtonStyle.Success);
        await editReplyComponentsV2(interaction, successV2.Components, createSimplePlaceholderReplacer({}), [new ActionRowBuilder().addComponents(continueBtn)]);
    }
};
