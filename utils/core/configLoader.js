const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

function loadConfig(file = 'core.yml') {
  const configPath = path.resolve(__dirname, '../../config', file);
  if (!fs.existsSync(configPath)) {
    return {};
  }
  return yaml.load(fs.readFileSync(configPath, 'utf8')) || {};
}

function getConfig() {
  // Load core config
  const core = loadConfig('core.yml');
  
  // Load all module configs and merge them
  const modulesDir = path.resolve(__dirname, '../../config/modules');
  if (fs.existsSync(modulesDir)) {
    const moduleFiles = fs.readdirSync(modulesDir).filter(f => f.endsWith('.yml'));
    for (const file of moduleFiles) {
      try {
        const modulePath = path.join(modulesDir, file);
        const moduleConfig = yaml.load(fs.readFileSync(modulePath, 'utf8')) || {};
        Object.assign(core, moduleConfig);
      } catch (err) {
        // skip broken module configs
      }
    }
  }
  
  return core;
}

function getLang() {
  return loadConfig('lang.yml');
}

function getCommands() {
  return loadConfig('commands.yml');
}

module.exports = {
  loadConfig,
  getConfig,
  getLang,
  getCommands
};
