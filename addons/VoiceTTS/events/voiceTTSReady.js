const workers = require('../voiceTTSWorkers');

module.exports = {
  name: 'clientReady',
  once: true,
  execute(client) {
    const status = workers.startWorkerClients(client);
    console.log(`[VoiceTTS] Worker slots ready: ${status.configuredTokens}/${status.slots} configured.`);
  }
};
