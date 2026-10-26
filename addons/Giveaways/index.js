'use strict';
module.exports = {
 name: 'Giveaways', version: '1.0.0', description: 'Giveaway lifecycle scheduler',
 async run(client, eventManager, api) {
  const actions = require('./events/giveawayActions');
  actions.setClient?.(client);
  api.registerModel('Giveaway', require('./models/Giveaway'));
  api.registerService('giveaway.actions', actions);
  const handleInteraction = require('./events/interactionCreate');
  api.onDiscord('interactionCreate', async ({ interaction }) => handleInteraction(client, interaction));
  if (!api.commandConfig?.giveaway) return;
  require('./events/giveawayScheduler')();
  return () => {};
 }
};
