const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const Ticket = require('../models/tickets');
const { getConfig } = require('../../../utils/core/configLoader');
const { sendComponentsV2Message } = require('../../../utils/core/componentsV2Builder');

const config = getConfig();

async function handleUserTickets(client, member) {
	try {
		const tickets = await Ticket.find({ 
			userId: member.id, 
			guildId: member.guild.id,
			status: { $in: ['open', 'closed'] } 
		});
		const userLeftDesign = config.UserLeftDesign;
		const buttonConfig = userLeftDesign?.Button;

		if (!userLeftDesign) return;

		for (const ticket of tickets) {
			let channel = null;
			try {
				channel = await member.guild.channels.fetch(ticket.channelId, { force: true });
			} catch (err) {
				await Ticket.findOneAndUpdate(
					{ ticketId: ticket.ticketId },
					{ status: 'deleted', deletedAt: new Date() }
				);
				continue;
			}
			if (channel) {
				const userIcon = member.user.displayAvatarURL({ format: 'png', dynamic: true, size: 4096 });
				const placeholderReplacer = (text) => {
					if (Array.isArray(text)) {
						return text.map(line => line
							.replace(/{userId}/g, member.id)
							.replace(/{user}/g, `<@${member.id}>`)
							.replace(/{userIcon}/g, userIcon)
						).join('\n');
					}
					return (text || '').replace(/{userId}/g, member.id)
						.replace(/{user}/g, `<@${member.id}>`)
						.replace(/{userIcon}/g, userIcon);
				};

				if (userLeftDesign.Components) {
					await sendComponentsV2Message(client, channel.id, userLeftDesign, placeholderReplacer);

					if (buttonConfig && buttonConfig.Name && buttonConfig.Emoji && buttonConfig.Style) {
						const styleMap = {
							"PRIMARY": ButtonStyle.Primary,
							"SECONDARY": ButtonStyle.Secondary,
							"SUCCESS": ButtonStyle.Success,
							"DANGER": ButtonStyle.Danger,
							"LINK": ButtonStyle.Link
						};

						const deleteButton = new ButtonBuilder()
							.setCustomId(`ticketdelete-${ticket.ticketId}`)
							.setLabel(buttonConfig.Name)
							.setEmoji(buttonConfig.Emoji)
							.setStyle(styleMap[buttonConfig.Style.toUpperCase()] || ButtonStyle.Secondary);

						const row = new ActionRowBuilder().addComponents(deleteButton);
						await channel.send({ components: [row] });
					}
				} else if (userLeftDesign.Embed) {
					const embedConfig = userLeftDesign.Embed;
					const embed = new EmbedBuilder()
						.setColor(embedConfig.Color)
						.setDescription(embedConfig.Description.join('\n')
							.replace(/{userId}/g, member.id)
							.replace(/{user}/g, `<@${member.id}>`)
							.replace(/{userIcon}/g, member.user.displayAvatarURL({ format: 'png', dynamic: true, size: 4096 })));

					if (embedConfig.Title && embedConfig.Title !== "") {
						embed.setTitle(embedConfig.Title
							.replace(/{userId}/g, member.id)
							.replace(/{user}/g, `<@${member.id}>`)
							.replace(/{userIcon}/g, member.user.displayAvatarURL({ format: 'png', dynamic: true, size: 4096 })));
					}

					if (embedConfig.Footer && embedConfig.Footer.Text && embedConfig.Footer.Text !== "") {
						embed.setFooter({
							text: embedConfig.Footer.Text
								.replace(/{userId}/g, member.id)
								.replace(/{user}/g, member.user.username)
								.replace(/{userIcon}/g, member.user.displayAvatarURL({ format: 'png', dynamic: true, size: 4096 })),
							iconURL: embedConfig.Footer.Icon && embedConfig.Footer.Icon !== "" ? embedConfig.Footer.Icon.replace(/{userIcon}/g, member.user.displayAvatarURL({ format: 'png', dynamic: true, size: 4096 })) : null
						});
					}

					if (embedConfig.Author && embedConfig.Author.Text && embedConfig.Author.Text !== "") {
						embed.setAuthor({
							name: embedConfig.Author.Text
								.replace(/{userId}/g, member.id)
								.replace(/{user}/g, member.user.username)
								.replace(/{userIcon}/g, member.user.displayAvatarURL({ format: 'png', dynamic: true, size: 4096 })),
							iconURL: embedConfig.Author.Icon && embedConfig.Author.Icon !== "" ? embedConfig.Author.Icon.replace(/{userIcon}/g, member.user.displayAvatarURL({ format: 'png', dynamic: true, size: 4096 })) : null
						});
					}

					if (embedConfig.Image && embedConfig.Image !== "") {
						embed.setImage(embedConfig.Image);
					}

					if (embedConfig.Thumbnail && embedConfig.Thumbnail !== "") {
						embed.setThumbnail(embedConfig.Thumbnail.replace(/{userIcon}/g, member.user.displayAvatarURL({ format: 'png', dynamic: true, size: 4096 })));
					}

					if (buttonConfig && buttonConfig.Name && buttonConfig.Emoji && buttonConfig.Style) {
						const styleMap = {
							"PRIMARY": ButtonStyle.Primary,
							"SECONDARY": ButtonStyle.Secondary,
							"SUCCESS": ButtonStyle.Success,
							"DANGER": ButtonStyle.Danger,
							"LINK": ButtonStyle.Link
						};

						const deleteButton = new ButtonBuilder()
							.setCustomId(`ticketdelete-${ticket.ticketId}`)
							.setLabel(buttonConfig.Name)
							.setEmoji(buttonConfig.Emoji)
							.setStyle(styleMap[buttonConfig.Style.toUpperCase()] || ButtonStyle.Secondary);

						const row = new ActionRowBuilder().addComponents(deleteButton);

						await channel.send({ embeds: [embed], components: [row] });
					} else {
						await channel.send({ embeds: [embed] });
					}
				}
			}
		}
	} catch (error) {
		console.error('Error handling user tickets:', error);
	}
}

module.exports = { handleUserTickets };