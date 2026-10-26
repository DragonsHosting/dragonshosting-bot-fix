'use strict';

module.exports = {
    name: 'System',
    version: '1.0.0',
    description: 'Bot information, help, activity and administration commands',
    async run(client, eventManager, api) {
        const { Collection } = require('discord.js');
        api.registerModel('BotActivity', require('./models/BotActivity'));
        if (!client.snipes) client.snipes = new Collection();

        const remember = (message, edited = false, newMessage = null) => {
            if (!message?.guild || !message.author || message.author.bot) return;
            if (!client.snipes.has(message.guild.id)) client.snipes.set(message.guild.id, new Collection());
            const guildSnipes = client.snipes.get(message.guild.id);
            guildSnipes.set(message.channel.id, {
                content: message.content,
                oldContent: edited ? message.content : undefined,
                newContent: edited ? newMessage?.content : undefined,
                author: message.author.tag || 'Unknown User',
                member: message.member,
                timestamp: new Date(),
                edited
            });
            while (guildSnipes.size > 50) guildSnipes.delete(guildSnipes.firstKey());
        };

        api.onDiscord('messageDelete', async ({ message }) => {
            remember(message);
            return false;
        });
        api.onDiscord('messageUpdate', async ({ message, oldMessage }) => {
            if (oldMessage?.content !== message?.content) remember(oldMessage, true, message);
            return false;
        });
        return () => {};
    }
};
