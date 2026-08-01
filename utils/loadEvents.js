const fs = require('fs');
const path = require('path');

function collectFiles(root, files = []) {
  if (!fs.existsSync(root)) return files;

  for (const item of fs.readdirSync(root)) {
    const full = path.join(root, item);

    if (fs.statSync(full).isDirectory()) {
      collectFiles(full, files);
    } else if (item.endsWith('.js')) {
      files.push(full);
    }
  }

  return files;
}

function loadEvents(client) {
  let count = 0;

  const roots = [
    path.resolve(__dirname, '../events'),
    path.resolve(__dirname, '../addons')
  ];

  const files = roots
    .flatMap(root => collectFiles(root))
    .filter(file => !file.endsWith(`${path.sep}events${path.sep}interactionCreate.js`))
    .filter(file => !file.includes(`${path.sep}events${path.sep}Tickets${path.sep}`))
    .filter(file => {
      return file.includes(`${path.sep}events${path.sep}`) ||
             file.toLowerCase().includes('event') ||
             file.toLowerCase().includes('interaction') ||
             file.toLowerCase().includes('messagecreate') ||
             file.toLowerCase().includes('guildmember') ||
             file.toLowerCase().includes('roledelete');
    });

  for (const file of files) {
    try {
      delete require.cache[require.resolve(file)];
      const event = require(file);

      if (event.name && typeof event.execute === 'function') {
        if (event.once) {
          client.once(event.name, (...args) => event.execute(...args, client));
        } else {
          client.on(event.name, (...args) => event.execute(...args, client));
        }

        count++;
        console.log(`[Event] Loaded ${event.name}`);
        continue;
      }

      if (typeof event.run === 'function') {
        // Some old addons try to read client.user before the bot is ready.
        // Run them safely after clientReady so the startup will not crash.
        client.once('clientReady', async () => {
          try {
            await event.run(client);
            console.log(`[Event/AddOn] Loaded ${path.basename(file)}`);
          } catch (err) {
            console.log(`[Event/AddOn] Skipped ${file}: ${err.message}`);
          }
        });

        count++;
        console.log(`[Event/AddOn] Queued ${path.basename(file)}`);
        continue;
      }
    } catch (err) {
      console.log(`[Event/AddOn] Failed to load ${file}: ${err.message}`);
    }
  }

  return count;
}

module.exports = { loadEvents };
