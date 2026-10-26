'use strict';

module.exports = {
    name: 'Tickets',
    version: '1.0.0',
    description: 'Ticket lifecycle, transcript, review and close-request workflows',
    async run(client, eventManager, api) {
        const config = api.config || {};
        const Ticket = require('./models/tickets');
        const handleInteraction = require('./events/interactionCreate');
        const handleMessage = require('./events/messageCreate');
        const { startFeatherTopupAutoTickets } = require('./utils/featherTopupAutoTickets');
        const { startAlertScheduler } = require('./events/checkAlerts');

        api.registerModel('Ticket', Ticket);
        api.registerStatistics('tickets', async (guildId) => {
            const filter = guildId ? { guildId } : {};
            const [totalTickets, openTickets, closedTickets, deletedTickets] = await Promise.all([
                Ticket.countDocuments(filter), Ticket.countDocuments({ ...filter, status: 'open' }),
                Ticket.countDocuments({ ...filter, status: 'closed' }), Ticket.countDocuments({ ...filter, status: 'deleted' })
            ]);
            return { totalTickets, openTickets, closedTickets, deletedTickets };
        });
        let statusTimer;
        let alertCleanup;
        if (api.config.TicketSettings?.Enabled) {
            startFeatherTopupAutoTickets(client);
            alertCleanup = startAlertScheduler(client);
            statusTimer = setInterval(async () => {
                const tickets = await Ticket.find({ status: { $in: ['open', 'closed'] } }).catch(() => []);
                for (const ticket of tickets) {
                    const channel = client.channels.cache.get(ticket.channelId) || await client.channels.fetch(ticket.channelId).catch(() => null);
                    if (!channel) { ticket.status = 'deleted'; ticket.deletedAt = new Date(); await ticket.save().catch(() => {}); }
                }
            }, 300000);
            statusTimer.unref?.();
        }
        api.onDiscord('messageCreate', async ({ message }) => handleMessage(client, message, config));
        api.onDiscord('guildMemberRemove', async ({ member }) => {
            if (!member) return;
            const { handleUserTickets } = require('./utils/handleUserTickets');
            await handleUserTickets(client, member);
        });
        api.onDiscord('interactionCreate', async ({ interaction }) => {
            if (!interaction) return false;
            return handleInteraction(client, interaction, config, api.lang || {});
        });

        return () => { if (statusTimer) clearInterval(statusTimer); alertCleanup?.(); };
    }
};
