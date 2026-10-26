const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

const GUILD_ID = '0';
const STAFF_INFO_CHANNEL_ID = '0';
const STAFF_REGLEMENT_MESSAGE_ID = '0';
const DOC_URL = 'https://docs.google.com/document/d/1azImjODtji3FTH41p_5ysKl0QdG0TuOXBnid47t4YXw';
const MARKER_PATH = path.join(__dirname, 'data', 'staff-reglement-google-doc-updated-20260725.json');

function buildPayload(client) {
  const embed = new EmbedBuilder()
    .setTitle('Dragonshosting Staff-Reglement')
    .setDescription([
      'Het staff-reglement staat voortaan in Google Docs.',
      '',
      `**Document:** ${DOC_URL}`,
      '',
      'Lees dit document zorgvuldig door. Als stafflid word je geacht de actuele versie te kennen en na te leven.',
    ].join('\n'))
    .setColor(0x00b7ff)
    .setFooter({ text: 'Dragonshosting • Staff informatie' })
    .setTimestamp();

  return {
    content: `📄 **Dragonshosting Staff-Reglement**\n${DOC_URL}`,
    embeds: [embed],
    files: [],
    components: [],
    allowedMentions: { parse: [] },
  };
}

async function updateStaffReglementMessage(client) {
  if (fs.existsSync(MARKER_PATH)) return;

  const guild = client.guilds.cache.get(GUILD_ID) || await client.guilds.fetch(GUILD_ID).catch(() => null);
  if (!guild) {
    console.warn('[DragonshostingStaffReglementDocUpdater] Guild not found.');
    return;
  }

  const channel = guild.channels.cache.get(STAFF_INFO_CHANNEL_ID) || await guild.channels.fetch(STAFF_INFO_CHANNEL_ID).catch(() => null);
  if (!channel?.isTextBased()) {
    console.warn('[DragonshostingStaffReglementDocUpdater] Staff information channel not found or not text based.');
    return;
  }

  const payload = buildPayload(client);
  let mode = 'sent-new';
  let messageId = null;

  const existing = await channel.messages.fetch(STAFF_REGLEMENT_MESSAGE_ID).catch(() => null);
  if (existing && existing.author?.id === client.user.id) {
    const edited = await existing.edit(payload);
    mode = 'edited-existing';
    messageId = edited.id;
  } else {
    const sent = await channel.send(payload);
    messageId = sent.id;
  }

  fs.mkdirSync(path.dirname(MARKER_PATH), { recursive: true });
  fs.writeFileSync(MARKER_PATH, JSON.stringify({
    done: true,
    mode,
    messageId,
    docUrl: DOC_URL,
    updatedAt: new Date().toISOString(),
  }, null, 2));

  console.log(`[DragonshostingStaffReglementDocUpdater] ${mode}: ${messageId}`);
}

module.exports = {
  name: 'DragonshostingStaffReglementDocUpdater',
  version: '1.0.0',
  description: 'One-time update for staff reglement Google Doc link.',
  run: async (client) => {
    setTimeout(() => {
      updateStaffReglementMessage(client).catch(error => {
        console.error('[DragonshostingStaffReglementDocUpdater] Failed:', error);
      });
    }, 15000);
  },
};
