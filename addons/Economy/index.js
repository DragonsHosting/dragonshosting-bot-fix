'use strict';
module.exports = {
 name: 'Economy', version: '1.0.0', description: 'Economy services and interest schedule',
 async run(client, eventManager, api) {
  api.registerModel('StoreItem', require('./models/StoreItem'));
  api.registerModel('StorePurchase', require('./models/StorePurchase'));
  api.registerService('economy.helpers', require('./commands/Utility/helpers'));
  const StoreAPI = require('./utils/storeAPI');
  global.storeAPI = new StoreAPI(); global.storeAPI.setContext(client, api.config, api.lang);
  api.registerService('economy.store', require('./commands/store'));
  api.registerService('economy.pets', require('./commands/pets'));
  const handleInteraction = require('./events/interactionCreate');
  api.onDiscord('interactionCreate', async ({ interaction }) => handleInteraction(interaction));
  if (!api.commandConfig?.economy || !api.config.Economy?.interestInterval?.length) return () => {};
  const moment = require('moment-timezone'), UserData = require('../../models/UserData');
  let timer; const timezone = api.config.Timezone;
  const schedule = () => {
   const now=moment().tz(timezone), times=api.config.Economy.interestInterval.map(v=>moment.tz(v,'HH:mm',timezone)).sort((a,b)=>a.diff(b));
   const next=times.find(v=>now.isBefore(v)) || times[0].clone().add(1,'day');
   timer=setTimeout(async()=>{ try {
    for(const user of await UserData.find({})) {
     const rate=user.interestRate!==null?user.interestRate:api.config.Economy.defaultInterestRate;
     let amount=user.bank*rate; if(api.config.Economy.maxInterestEarning>0) amount=Math.min(amount,api.config.Economy.maxInterestEarning);
     await UserData.findOneAndUpdate({_id:user._id},{$inc:{bank:amount},$push:{transactionLogs:{type:'interest',amount,timestamp:new Date()}}});
    }
   } catch(error) { console.error('[Economy] Interest schedule failed:',error); } schedule();
   },Math.max(1000,next.diff(now))); timer.unref?.();
  }; schedule(); return ()=>clearTimeout(timer);
 }
};
