const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

function loadEnabledCommands() {
  const file = path.resolve(__dirname, '../config/commands.yml');
  if (!fs.existsSync(file)) return {};
  return yaml.load(fs.readFileSync(file, 'utf8')) || {};
}

function collectFiles(root, files = []) {
  if (!fs.existsSync(root)) return files;
  for (const item of fs.readdirSync(root)) {
    const full = path.join(root, item);
    if (fs.statSync(full).isDirectory()) collectFiles(full, files);
    else if (item.endsWith('.js')) files.push(full);
  }
  return files;
}

function loadCommands(client) {
  const enabled = loadEnabledCommands();
  client.commands = new Map();

  const roots = [
    path.resolve(__dirname, '../commands'),
    path.resolve(__dirname, '../addons')
  ];

  const files = roots.flatMap(root => collectFiles(root))
    .filter(file => file.includes(`${path.sep}commands${path.sep}`) || path.basename(file).startsWith('cmd_'))
    .filter(file => !file.includes(`${path.sep}commands${path.sep}Utility${path.sep}Tickets${path.sep}`));

  for (const file of files) {
    try {
      delete require.cache[require.resolve(file)];
      const command = require(file);
      if (!command.data || typeof command.data.toJSON !== 'function' || !command.execute) continue;

      const name = command.data.name;
      if (enabled[name] === false) continue;

      client.commands.set(name, command);
      console.log(`[Command] Loaded ${name}`);
    } catch (err) {
      console.log(`[Command] Failed to load ${file}: ${err.message}`);
    }
  }

  return client.commands.size;
}

module.exports = { loadCommands };
