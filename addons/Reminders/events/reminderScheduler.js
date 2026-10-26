const Reminder = require('../models/reminder.js');
const { EmbedBuilder } = require('discord.js');
const { getLang } = require('../../../utils/core/configLoader.js');

let nextReminderTimeout = null;
let client = null;

function hexToDecimal(hex) {
    return parseInt(hex.replace('#', ''), 16);
}

async function scheduleNextReminder() {
    if (!client) return;
    
    if (nextReminderTimeout) clearTimeout(nextReminderTimeout);
    
    const next = await Reminder.findOne({ sent: false, reminderTime: { $gt: new Date(0) } })
        .sort({ reminderTime: 1 })
        .lean();
    
    if (!next) return;
    
    const delay = Math.max(0, new Date(next.reminderTime).getTime() - Date.now());
    
    nextReminderTimeout = setTimeout(async () => {
        try {
            const reminder = await Reminder.findOne({ _id: next._id, sent: false });
            if (!reminder) return scheduleNextReminder();
            
            let channel;
            try {
                channel = await client.channels.fetch(reminder.channelId);
            } catch (channelError) {
                if (channelError.code === 10003) {
                    await Reminder.deleteOne({ _id: reminder._id });
                    return scheduleNextReminder();
                }
                throw channelError;
            }
            
            let user;
            try {
                user = await client.users.fetch(reminder.userId);
            } catch (userError) {
                if (userError.code === 10013) {
                    await Reminder.deleteOne({ _id: reminder._id });
                    return scheduleNextReminder();
                }
                throw userError;
            }
            
            const lang = getLang();
            const embed = new EmbedBuilder().setColor(hexToDecimal(lang.Reminder.Embeds.DM.Color));
            
            if (lang.Reminder.Embeds.DM.Title) embed.setTitle(lang.Reminder.Embeds.DM.Title);
            if (lang.Reminder.Embeds.DM.Description) embed.setDescription(lang.Reminder.Embeds.DM.Description.replace('{message}', reminder.message));
            if (lang.Reminder.Embeds.DM.Footer && lang.Reminder.Embeds.DM.Footer.Text) {
                const footerOptions = { text: lang.Reminder.Embeds.DM.Footer.Text };
                if (lang.Reminder.Embeds.DM.Footer.Icon && lang.Reminder.Embeds.DM.Footer.Icon.trim() !== '') footerOptions.iconURL = lang.Reminder.Embeds.DM.Footer.Icon;
                embed.setFooter(footerOptions);
            }
            if (lang.Reminder.Embeds.DM.Author && lang.Reminder.Embeds.DM.Author.Text) {
                const authorOptions = { name: lang.Reminder.Embeds.DM.Author.Text };
                if (lang.Reminder.Embeds.DM.Author.Icon && lang.Reminder.Embeds.DM.Author.Icon.trim() !== '') authorOptions.iconURL = lang.Reminder.Embeds.DM.Author.Icon;
                embed.setAuthor(authorOptions);
            }
            if (lang.Reminder.Embeds.DM.Image) embed.setImage(lang.Reminder.Embeds.DM.Image);
            if (lang.Reminder.Embeds.DM.Thumbnail) embed.setThumbnail(lang.Reminder.Embeds.DM.Thumbnail);
            embed.setTimestamp();
            
            await user.send({ embeds: [embed] }).catch(async error => {
                if (error.code === 50007) {
                    await channel.send({ content: `<@${reminder.userId}>`, embeds: [embed] });
                } else {
                    console.error('Failed to send reminder:', error);
                }
            });
            
            reminder.sent = true;
            await reminder.save();
        } catch (error) {
            console.error('Failed to send reminder:', error);
        } finally {
            scheduleNextReminder();
        }
    }, Math.min(delay, 24 * 60 * 60 * 1000));
    
    if (nextReminderTimeout.unref) nextReminderTimeout.unref();
}

function startReminderScheduler(discordClient) {
    client = discordClient;
    scheduleNextReminder();
}

module.exports = { startReminderScheduler, scheduleNextReminder };