'use strict';
module.exports = {
 name: 'Reminders', version: '1.0.0', description: 'Reminder scheduling',
 async run(client, eventManager, api) {
  api.registerModel('Reminder', require('./models/reminder'));
  if (!api.commandConfig?.reminder) return;
  require('./events/reminderScheduler').startReminderScheduler(client);
  return () => {};
 }
};
