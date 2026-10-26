const fs = require('fs');
const path = require('path');
const dns = require('dns');

try {
    dns.setDefaultResultOrder('ipv4first');
} catch (error) {
    // Older Node versions may not support this option.
}
const Ticket = require('../models/tickets');
const { createTicket } = require('./ticketCreation.js');
const { getConfig } = require('../../../utils/core/configLoader.js');

const config = getConfig();
const DEFAULT_CONFIG_PATH = path.resolve(process.cwd(), 'config', 'feather-autotickets.json');
const PROCESSED_ORDERS_PATH = path.resolve(process.cwd(), 'data', 'feather-autotickets-processed.json');

let running = false;
let started = false;

function loadProcessedOrders() {
    try {
        if (!fs.existsSync(PROCESSED_ORDERS_PATH)) return {};
        return JSON.parse(fs.readFileSync(PROCESSED_ORDERS_PATH, 'utf8')) || {};
    } catch (error) {
        console.error('[FeatherAutoTickets] Could not read processed orders file:', error.message);
        return {};
    }
}

function saveProcessedOrder(orderNumber, channelId = null) {
    try {
        fs.mkdirSync(path.dirname(PROCESSED_ORDERS_PATH), { recursive: true });
        const processed = loadProcessedOrders();
        processed[orderNumber] = {
            channelId,
            processedAt: new Date().toISOString()
        };
        fs.writeFileSync(PROCESSED_ORDERS_PATH, JSON.stringify(processed, null, 2));
    } catch (error) {
        console.error('[FeatherAutoTickets] Could not write processed orders file:', error.message);
    }
}

function loadAutoTicketConfig() {
    const filePath = process.env.FEATHER_AUTOTICKETS_CONFIG || DEFAULT_CONFIG_PATH;
    let fileConfig = {};

    if (fs.existsSync(filePath)) {
        try {
            fileConfig = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch (error) {
            console.error('[FeatherAutoTickets] Invalid config JSON:', error.message);
        }
    }

    return {
        enabled: process.env.FEATHER_AUTOTICKETS_ENABLED
            ? process.env.FEATHER_AUTOTICKETS_ENABLED === 'true'
            : fileConfig.enabled !== false,
        baseUrl: process.env.FEATHER_BASE_URL || fileConfig.baseUrl || 'https://feather.dragonshosting.nl',
        apiKey: process.env.FEATHER_API_KEY || fileConfig.apiKey || '',
        guildId: process.env.FEATHER_AUTOTICKETS_GUILD_ID || fileConfig.guildId || '',
        ticketTypeKey: process.env.FEATHER_AUTOTICKETS_TYPE || fileConfig.ticketTypeKey || 'Donaties',
        intervalMs: Number(process.env.FEATHER_AUTOTICKETS_INTERVAL_MS || fileConfig.intervalMs || 60000),
        lookbackLimit: Number(process.env.FEATHER_AUTOTICKETS_LIMIT || fileConfig.limit || 25)
    };
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function summarizeFetchError(error) {
    const cause = error?.cause;
    const code = cause?.code || error?.code || error?.name || 'FETCH_FAILED';
    const message = cause?.message || error?.message || 'unknown error';
    return `${code}: ${message}`;
}

async function featherRequest(settings, endpoint) {
    const url = `${settings.baseUrl.replace(/\/+$/, '')}${endpoint}`;
    const attempts = 2;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        try {
            const response = await fetch(url, {
                signal: controller.signal,
                headers: {
                    Accept: 'application/json',
                    Authorization: `Bearer ${settings.apiKey}`
                }
            });

            if (!response.ok) {
                throw new Error(`Feather API ${endpoint} failed with ${response.status}`);
            }

            return response.json();
        } catch (error) {
            if (attempt >= attempts) {
                throw new Error(`Feather API ${endpoint} request failed after ${attempts} attempt(s): ${summarizeFetchError(error)}`);
            }
            await sleep(1000);
        } finally {
            clearTimeout(timeout);
        }
    }
}

function buildFakeInteraction(client, guild, member) {
    return {
        client,
        guild,
        member,
        user: member.user,
        skipTicketCreatedResponse: true,
        deferred: true,
        replied: false,
        deferReply: async () => {},
        followUp: async (payload) => {
            const content = typeof payload === 'string' ? payload : payload?.content;
            if (content) {
                console.log('[FeatherAutoTickets] createTicket followUp:', content);
            }
        }
    };
}

function orderQuestions(order, user) {
    return [
        { question: 'FeatherPanel ordernummer', answer: String(order.order_number || '-') },
        { question: 'FeatherPanel gebruiker', answer: `${order.username || '-'} (${order.email || '-'})` },
        { question: 'Discord link', answer: `${user.discord_oauth2_username || user.discord_oauth2_name || user.discord_oauth2_id}` },
        { question: 'Credits', answer: String(order.credits ?? '-') },
        { question: 'Bedrag', answer: String(order.amount_formatted || `${order.currency || 'EUR'} ${order.amount_cents || 0}`) },
        { question: 'Betaalmethode', answer: String(order.payment_method || '-') },
        { question: 'Status', answer: String(order.status || '-') },
        { question: 'Opmerking klant', answer: String(order.user_note || '-') }
    ];
}

async function processPendingTopups(client) {
    if (running) return;
    running = true;

    try {
        const settings = loadAutoTicketConfig();
        if (!settings.enabled) return;
        if (!settings.apiKey) {
            console.warn('[FeatherAutoTickets] Missing FEATHER_API_KEY/apiKey; auto tickets disabled.');
            return;
        }
        if (!config.TicketTypes?.[settings.ticketTypeKey]) {
            console.warn(`[FeatherAutoTickets] Ticket type "${settings.ticketTypeKey}" does not exist.`);
            return;
        }

        const guild = settings.guildId
            ? await client.guilds.fetch(settings.guildId).catch(() => null)
            : client.guilds.cache.first();

        if (!guild) {
            console.warn('[FeatherAutoTickets] Guild not found.');
            return;
        }

        const ordersResponse = await featherRequest(
            settings,
            `/api/admin/billingmanualtopups/orders?status=pending&limit=${encodeURIComponent(settings.lookbackLimit)}`
        );
        const orders = ordersResponse?.data?.data || ordersResponse?.data?.orders || [];

        for (const order of orders) {
            const orderNumber = String(order.order_number || '').trim();
            if (!orderNumber) continue;

            const processedOrders = loadProcessedOrders();
            if (processedOrders[orderNumber]) continue;

            const existing = await Ticket.findOne({
                guildId: guild.id,
                'questions.answer': orderNumber
            }).lean();
            if (existing) {
                saveProcessedOrder(orderNumber, existing.channelId);
                continue;
            }

            const userResponse = await featherRequest(settings, `/api/admin/users/${encodeURIComponent(order.user_uuid)}`);
            const user = userResponse?.data?.user;
            if (!user || user.discord_oauth2_linked !== 'true' || !user.discord_oauth2_id) {
                continue;
            }

            const member = await guild.members.fetch(user.discord_oauth2_id).catch(() => null);
            if (!member) {
                console.warn(`[FeatherAutoTickets] Linked Discord user ${user.discord_oauth2_id} is not in guild ${guild.id}.`);
                continue;
            }

            const interaction = buildFakeInteraction(client, guild, member);
            await createTicket(client, interaction, settings.ticketTypeKey, orderQuestions(order, user), config.TicketTypes[settings.ticketTypeKey].Panel);
            const createdTicket = await Ticket.findOne({
                guildId: guild.id,
                'questions.answer': orderNumber
            }).sort({ createdAt: -1 }).lean();
            saveProcessedOrder(orderNumber, createdTicket?.channelId || null);
            console.log(`[FeatherAutoTickets] Created ticket for ${orderNumber} / Discord ${user.discord_oauth2_id}.`);
        }
    } catch (error) {
        console.error('[FeatherAutoTickets] Poll failed:', error);
    } finally {
        running = false;
    }
}

function startFeatherTopupAutoTickets(client) {
    if (started) return;
    started = true;

    const settings = loadAutoTicketConfig();
    if (!settings.enabled) {
        console.log('[FeatherAutoTickets] Disabled.');
        return;
    }

    setTimeout(() => processPendingTopups(client), 15000);
    setInterval(() => processPendingTopups(client), Math.max(30000, settings.intervalMs));
    console.log(`[FeatherAutoTickets] Started. ticketType=${settings.ticketTypeKey}`);
}

module.exports = {
    startFeatherTopupAutoTickets,
    processPendingTopups
};
