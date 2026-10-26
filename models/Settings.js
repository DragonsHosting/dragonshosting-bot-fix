const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true,
    unique: true
  },
  botActivity: {
    type: String,
    default: ''
  },
  dashboardSettings: {
    navName: {
      type: String,
      default: 'DragonHosting'
    },
    favicon: {
      type: String,
      default: 'None'
    },
    tabName: {
      type: String,
      default: 'DragonHosting Dashboard'
    },
    defaultTheme: {
      type: String,
      enum: ['dark', 'blue', 'purple', 'green', 'orange', 'teal', 'cyberpunk', 'slate-professional', 'emerald-pro'],
      default: 'dark'
    },
    logoUrl: {
      type: String,
      default: ''
    },
    customNavItems: [{
      name: { type: String, required: true },
      href: { type: String, required: true },
      iconName: String,
      emoji: String,
      isExternal: { type: Boolean, default: false },
      id: String
    }],
    navCategories: {
      navigation: { type: String, default: 'Navigation' },
      custom: { type: String, default: 'Custom Links' },
      addons: { type: String, default: 'Addons' }
    }
  },
  blacklistWords: {
    enabled: { type: Boolean, default: false },
    patterns: [{ type: String }],
    whitelistWords: [{ type: String }],
    whitelistChannels: [{ type: String }],
    whitelistCategories: [{ type: String }],
    bypassRoles: [{ type: String }],
    logsChannelId: { type: String, default: '' },
    notificationMessage: { type: String, default: '{user}, you used a blacklisted word!' }
  }
});

module.exports = mongoose.model('Settings', settingsSchema);