const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const User = require('../../../models/UserData');
const { getConfig, getLang } = require('../../../utils/core/configLoader.js');
const config = getConfig();
const lang = getLang();
const { replacePlaceholders } = require('./Utility/helpers');
const { buildComponentsV2Payload, createSimplePlaceholderReplacer } = require('../../../utils/core/componentsV2Builder');

const shouldUseComponentsV2 = config.ComponentsV2?.Booster?.View?.Components ? true : false;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('booster')
        .setDescription('Manage your boosters')
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View your active boosters')),
    category: 'Economy',
    async execute(interaction) {
        const user = await User.findOne(
            { userId: interaction.user.id, guildId: interaction.guild.id },
            { boosters: 1 }
        );

        if (!user) {
            return interaction.reply({ content: lang.Economy?.Error?.Generic || "An error occurred.", flags: MessageFlags.Ephemeral });
        }

        if (interaction.options.getSubcommand() === 'view') {
            if (user.boosters.length === 0) {
                if (shouldUseComponentsV2) {
                    const payload = buildComponentsV2Payload(config.ComponentsV2.Booster.NoBoosters, str => str);
                    return interaction.reply({ ...payload, flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
                }
                return interaction.reply({ content: lang.Economy?.Error?.NoBoosters || "You have no active boosters.", flags: MessageFlags.Ephemeral });
            }

            const boosterDesc = lang.Economy?.Boosters?.Description || "**{type} Booster** (Multiplier: **{multiplier}**, Expires: <t:{endTime}:R>)";
            const boosterList = user.boosters.map(booster => {
                const placeholders = {
                    type: booster.type,
                    multiplier: booster.multiplier,
                    endTime: Math.floor(booster.endTime / 1000),
                };
                return replacePlaceholders(boosterDesc, placeholders);
            }).join('\n');

            if (shouldUseComponentsV2) {
                const placeholders = { boosterList };
                const replacer = createSimplePlaceholderReplacer(placeholders);
                const payload = buildComponentsV2Payload(config.ComponentsV2.Booster.View, replacer);
                return interaction.reply({ ...payload, flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }

            const embed = new EmbedBuilder()
                .setTitle(lang.Economy?.Boosters?.Title || "Your Active Boosters")
                .setDescription(boosterList)
                .setColor('#00FF00');

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
    },
};