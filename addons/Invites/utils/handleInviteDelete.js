const { EmbedBuilder } = require('discord.js');
const moment = require('moment-timezone');
const { getConfig, getLang, replacePlaceholders: globalReplacePlaceholders } = require('../../../utils/core/configLoader');
const { getLogChannel } = require('../../../utils/handlers/messageUtils');

const config = getConfig();
const lang = getLang();

function replacePlaceholders(text, creator, invite, currentTime) {
	return text
		.replace(/{creator}/g, creator)
		.replace(/{inviteCode}/g, invite.code)
		.replace(/{uses}/g, invite.uses || '0')
		.replace(/{channel}/g, invite.channel ? `<#${invite.channel.id}>` : 'Unknown Channel')
		.replace(/{longtime}/g, currentTime.format('MMMM Do YYYY'))
		.replace(/{shorttime}/g, currentTime.format('HH:mm'));
}

async function handleInviteDelete(client, invite) {
	if (!config.InviteDeleteLogs.Enabled) return;

	try {
		const currentTime = moment().tz(config.Timezone);
		const logChannel = getLogChannel(invite.guild, config.InviteDeleteLogs.LogsChannelID);
		if (!logChannel) return;

		let creator = 'Unknown';
		let creatorObj = null;

		try {
			const inviteCache = client.invites.get(invite.guild.id);
			if (invite.inviter) {
				creatorObj = invite.inviter;
			} else if (invite.inviterId) {
				try {
					creatorObj = await invite.guild.members.fetch(invite.inviterId);
					if (creatorObj) creatorObj = creatorObj.user;
				} catch (e) {}
			}
			if (creatorObj) {
				creator = `<@${creatorObj.id}>`;
			}
		} catch (e) {
			console.error('Error finding invite creator:', e);
		}

		let embedData = lang.InviteDeleteLogs.Embed;
		let embed = new EmbedBuilder().setColor(embedData.Color || '#E57373');

		if (embedData.Title) {
			embed.setTitle(embedData.Title);
		}

		if (embedData.Description.length > 0) {
			embed.setDescription(
				embedData.Description.map(line => replacePlaceholders(line, creator, invite, currentTime)).join('\n')
			);
		}

		if (embedData.Footer && embedData.Footer.Text) {
			embed.setFooter({
				text: globalReplacePlaceholders(replacePlaceholders(embedData.Footer.Text, creator, invite, currentTime)),
				iconURL: embedData.Footer.Icon || undefined
			});
		}

		if (embedData.Author && embedData.Author.Text) {
			embed.setAuthor({
				name: replacePlaceholders(embedData.Author.Text, creator, invite, currentTime),
				iconURL: embedData.Author.Icon || undefined
			});
		}

		if (embedData.Thumbnail && creatorObj) {
			embed.setThumbnail(creatorObj.displayAvatarURL({ format: 'png', dynamic: true }));
		}

		if (embedData.Image) {
			embed.setImage(embedData.Image);
		}

		await logChannel.send({ embeds: [embed] });
	} catch (error) {
		console.error('Error handling invite delete:', error);
	}
}

module.exports = { handleInviteDelete };