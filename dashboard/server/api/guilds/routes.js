const express = require('express');
const router = express.Router();
const auth = require('../../middleware/auth');
const { getDiscordClient } = require('../../bot');

router.get('/', auth, async (req, res) => {
    try {
        const client = getDiscordClient();
        if (!client) {
            return res.status(503).json({ error: 'Discord client not available' });
        }

        const guilds = [];

        for (const guild of client.guilds.cache.values()) {
            try {
                const member = await guild.members.fetch(req.user.id);
                if (member) {
                    guilds.push({
                        id: guild.id,
                        name: guild.name,
                        icon: guild.iconURL({ dynamic: true, size: 64 }),
                        memberCount: guild.memberCount,
                        isOwner: guild.ownerId === req.user.id
                    });
                }
            } catch (e) {}
        }

        res.json({
            guilds,
            activeGuildId: req.user.guildId
        });
    } catch (error) {
        console.error('[GUILDS] Error fetching guilds:', error);
        res.status(500).json({ error: 'Failed to fetch guilds' });
    }
});

router.post('/select', auth, async (req, res) => {
    try {
        const { guildId } = req.body;

        if (!guildId) {
            return res.status(400).json({ error: 'guildId is required' });
        }

        const client = getDiscordClient();
        if (!client) {
            return res.status(503).json({ error: 'Discord client not available' });
        }

        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            return res.status(404).json({ error: 'Guild not found' });
        }

        try {
            await guild.members.fetch(req.user.id);
        } catch (e) {
            return res.status(403).json({ error: 'You are not a member of this guild' });
        }

        const allRoles = [];
        for (const g of client.guilds.cache.values()) {
            try {
                const member = await g.members.fetch(req.user.id);
                if (member) {
                    for (const role of member.roles.cache.values()) {
                        if (!allRoles.includes(role.id)) {
                            allRoles.push(role.id);
                        }
                    }
                }
            } catch (e) {}
        }

        req.session.userData = {
            ...req.session.userData,
            guildId,
            roles: allRoles
        };

        await new Promise((resolve, reject) => {
            req.session.save(err => {
                if (err) reject(err);
                else resolve();
            });
        });

        res.json({
            success: true,
            guildId,
            guild: {
                id: guild.id,
                name: guild.name,
                icon: guild.iconURL({ dynamic: true, size: 64 })
            }
        });
    } catch (error) {
        console.error('[GUILDS] Error selecting guild:', error);
        res.status(500).json({ error: 'Failed to select guild' });
    }
});

module.exports = router;
