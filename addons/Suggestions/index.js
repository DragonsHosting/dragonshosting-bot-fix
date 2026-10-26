'use strict';
module.exports = {
 name: 'Suggestions', version: '1.0.0', description: 'Suggestion storage and configuration',
 async run(client, eventManager, api) {
  api.registerService('suggestions.actions', require('./events/suggestionActions'));
  api.registerService('suggestions.validation', require('./utils/validation'));
  const Suggestion = api.registerModel('Suggestion', require('./models/Suggestion'));
  api.registerModel('SuggestionBlacklist', require('./models/SuggestionBlacklist'));
  api.registerStatistics('suggestions', async guildId => ({
   totalSuggestions: await Suggestion.countDocuments(guildId ? { guildId } : {})
  }));
  const handleMessage = require('./events/messageCreate');
  const handleInteraction = require('./events/interactionCreate');
  api.onDiscord('messageCreate', async ({ message }) => handleMessage(client, message));
  api.onDiscord('interactionCreate', async ({ interaction }) => handleInteraction(client, interaction));
  return () => {};
 }
};
