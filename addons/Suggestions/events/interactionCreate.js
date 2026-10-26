'use strict';

const { MessageFlags } = require('discord.js');
const { getConfig, getLang } = require('../../../utils/core/configLoader');
const actions = require('./suggestionActions');
const validation = require('../utils/validation');

function readAdditionalInputs(interaction, settings) {
    const modalData = {};
    for (const inputConfig of Object.values(settings.AdditionalModalInputs || {})) {
        let value;
        if (inputConfig.Type === 'StringSelect') {
            const stored = global.originalModalData?.get(interaction.user.id);
            value = stored?.selectValues?.[inputConfig.ID];
            if (!value && interaction.data?.components) {
                const components = interaction.data.components.flatMap(row => row.components || []);
                value = components.find(component => component.custom_id === inputConfig.ID)?.values?.[0];
            }
        } else {
            try { value = interaction.fields.getTextInputValue(inputConfig.ID); } catch (_) {}
        }
        if (value) modalData[`modal_${inputConfig.ID}`] = value;
    }
    return modalData;
}

module.exports = async function handleSuggestionInteraction(client, interaction) {
    const config = getConfig();
    const lang = getLang();
    const settings = config.SuggestionSettings;
    if (!settings) return false;

    if (interaction.isButton?.()) {
        const [action, uniqueId] = interaction.customId.split('-');
        if (action === 'upvote') {
            await actions.upvoteSuggestion(client, interaction, uniqueId);
            return true;
        }
        if (action === 'downvote') {
            await actions.downvoteSuggestion(client, interaction, uniqueId);
            return true;
        }
    }

    if (interaction.isStringSelectMenu?.()) {
        const input = Object.values(settings.AdditionalModalInputs || {}).find(item =>
            item?.Type === 'StringSelect' && item.ID === interaction.customId
        );
        if (!input) return false;
        global.originalModalData ||= new Map();
        const stored = global.originalModalData.get(interaction.user.id) || { selectValues: {} };
        stored.selectValues ||= {};
        stored.selectValues[interaction.customId] = interaction.values[0];
        global.originalModalData.set(interaction.user.id, stored);
        const selected = input.Options?.find(option => option.Value === interaction.values[0]);
        await interaction.reply({
            content: `✅ Selected: **${selected?.Label || interaction.values[0]}**\n\nNow please use the \`/suggest\` command to submit your suggestion.`,
            flags: MessageFlags.Ephemeral
        });
        return true;
    }

    if (!interaction.isModalSubmit?.() || !interaction.customId.startsWith('suggestionModal')) return false;
    let suggestionText;
    try {
        suggestionText = interaction.fields.getTextInputValue('suggestionText');
    } catch (_) {
        await interaction.reply({ content: lang.Suggestion.Error, flags: MessageFlags.Ephemeral });
        return true;
    }

    if (settings.blockBlacklistWords && await validation.containsBlacklistedWordsText(suggestionText)) {
        await interaction.reply({ content: validation.buildBlacklistResponse(interaction.user), flags: MessageFlags.Ephemeral });
        return true;
    }

    const modalData = readAdditionalInputs(interaction, settings);
    if (!interaction.replied && !interaction.deferred) await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await actions.createSuggestion(client, interaction, suggestionText, modalData);
    await interaction.editReply({ content: lang.Suggestion.SuggestionCreated });
    global.originalModalData?.delete(interaction.user.id);
    return true;
};
