const { ensureTranscriptCollections } = require('./mongoTranscripts');

async function ensureCoreTables() {
  // Historical startup code expects a MySQL bootstrap function here.
  // The current DragonsHosting setup uses MongoDB for transcripts, so this
  // keeps startup safe and prepares transcript indexes when Mongo is enabled.
  await ensureTranscriptCollections();
}

module.exports = { ensureCoreTables };
