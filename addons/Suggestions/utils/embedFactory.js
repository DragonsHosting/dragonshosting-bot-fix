const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { replacePlaceholders, mapButtonColor } = require('./helpers');
const { getConfig } = require('../../../utils/core/configLoader');
const { buildComponentsV2Payload, sendComponentsV2Message, createSimplePlaceholderReplacer } = require('../../../utils/core/componentsV2Builder');
const config = getConfig();

function formatSelectValues(modalData) {
    const formattedData = {};
    
    Object.entries(config.SuggestionSettings.AdditionalModalInputs || {}).forEach(([key, inputConfig]) => {
        const modalKey = `modal_${inputConfig.ID}`;
        const modalValue = modalData[modalKey];
        
        if (inputConfig.Type === 'StringSelect') {
            if (modalValue && inputConfig.Options) {
                const selectedOption = inputConfig.Options.find(option => option.Value === modalValue);
                
                if (selectedOption) {
                    const emoji = selectedOption.Emoji || '';
                    const label = selectedOption.Label || modalValue;
                    formattedData[modalKey] = modalValue;
                    formattedData[`${modalKey}_formatted`] = `${emoji} ${label}`.trim();
                    formattedData[`${modalKey}_label`] = label;
                    formattedData[`${modalKey}_emoji`] = emoji;
                } else {
                    formattedData[modalKey] = modalValue;
                    formattedData[`${modalKey}_formatted`] = modalValue;
                }
            } else {
                formattedData[modalKey] = 'N/A';
                formattedData[`${modalKey}_formatted`] = 'N/A';
                formattedData[`${modalKey}_label`] = 'N/A';
                formattedData[`${modalKey}_emoji`] = '';
            }
        } else {
            if (!modalValue) {
                formattedData[modalKey] = 'N/A';
            }
        }
    });
    return formattedData;
}

function buildSuggestionEmbed(placeholders, userIconUrl) {
	const allPlaceholders = { ...placeholders, userIcon: userIconUrl };
	const placeholderReplacer = createSimplePlaceholderReplacer(allPlaceholders);
	return buildComponentsV2Payload(config.SuggestionEmbed, placeholderReplacer);
}

function buildVoteRow(uniqueId, placeholders) {
	const upvoteButtonLabel = replacePlaceholders(config.SuggestionUpvote.ButtonName, placeholders);
	const downvoteButtonLabel = replacePlaceholders(config.SuggestionDownvote.ButtonName, placeholders);

	const upvoteButton = new ButtonBuilder()
		.setCustomId(`upvote-${uniqueId}`)
		.setLabel(upvoteButtonLabel)
		.setEmoji(config.SuggestionUpvote.ButtonEmoji)
		.setStyle(mapButtonColor(config.SuggestionUpvote.ButtonColor));

	const downvoteButton = new ButtonBuilder()
		.setCustomId(`downvote-${uniqueId}`)
		.setLabel(downvoteButtonLabel)
		.setEmoji(config.SuggestionDownvote.ButtonEmoji)
		.setStyle(mapButtonColor(config.SuggestionDownvote.ButtonColor));

	return new ActionRowBuilder().addComponents(upvoteButton, downvoteButton);
}

function buildDecisionEmbed(username, suggestion, action, reason, displayName) {
	const embedConfig = action === 'accept' ? config.SuggestionAcceptEmbed : config.SuggestionDenyEmbed;
	
	const modalData = suggestion.modalData ? Object.fromEntries(suggestion.modalData) : {};
	const formattedModalData = formatSelectValues(modalData);
	
	const placeholders = {
		user: username,
		displayName: displayName || username,
		suggestion: suggestion.text,
		SuggestionID: suggestion.uniqueId,
		ShortTime: require('./helpers').formatShortTime(),
		LongTime: require('./helpers').formatLongTime(),
		reason: reason,
		userIcon: suggestion.UserIcon,
		upvotecount: suggestion.upvotes || 0,
		downvotecount: suggestion.downvotes || 0,
		upvoteemoji: config.SuggestionUpvote.upvoteEmoji || '',
		downvoteemoji: config.SuggestionDownvote.downvoteEmoji || '',
		...require('./helpers').calculatePercent(suggestion.upvotes || 0, suggestion.downvotes || 0),
		...modalData,
		...formattedModalData
	};

	const placeholderReplacer = createSimplePlaceholderReplacer(placeholders);
	return buildComponentsV2Payload(embedConfig, placeholderReplacer);
}


module.exports = {
	buildSuggestionEmbed,
	buildVoteRow,
	buildDecisionEmbed
};