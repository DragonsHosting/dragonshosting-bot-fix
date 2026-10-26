const fs = require('fs');
const colors = require('ansi-colors');

async function exitWithDelay() {
  await new Promise((resolve) => setTimeout(resolve, 50));
  return process.exit(1);
}

async function handleInvalidLicense(data) {

  
  console.log('\n' + colors.bold.red('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log(colors.bold.red('🚫 AUTHORIZATION VALIDATION FAILED - GUILD LIMIT REACHED'));
  console.log(colors.bold.red('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log(colors.red('│'));
  console.log(colors.red('│  ❌ Error: Your license has reached the maximum guild limit'));
  console.log(colors.red('│'));
  console.log(colors.red('│  🔧 How to resolve this:'));
  console.log(colors.red('│     1. Join our discord server and open a ticket'));
  console.log(colors.red('│'));
  console.log(colors.red('│  🆘 Get Help:'));
  console.log(colors.red('│     • Join our Discord: discord.gg/DragonsHosting'));
  console.log(colors.red('│     • Create a support ticket'));
  console.log(colors.red('│     • Our team will help reset your limit'));
  console.log(colors.red('│'));
  console.log(colors.bold.red('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
  return exitWithDelay();
}

async function handleRateLimitExceeded(data) {

  
  console.log('\n' + colors.bold.red('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log(colors.bold.red('⏰ AUTHORIZATION VALIDATION FAILED - RATE LIMIT EXCEEDED'));
  console.log(colors.bold.red('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log(colors.red('│'));
  console.log(colors.red('│  ❌ Error: Too many license validation requests'));
  console.log(colors.red('│'));
  console.log(colors.red('│  ⏳ What to do:'));
  console.log(colors.red('│     • Wait 3 minutes before restarting the bot'));
  console.log(colors.red('│     • This helps prevent server overload'));
  console.log(colors.red('│'));
  console.log(colors.red('│  🆘 Need immediate help?'));
  console.log(colors.red('│     • Join our Discord: discord.gg/DragonsHosting'));
  console.log(colors.red('│     • Create a support ticket'));
  console.log(colors.red('│'));
  console.log(colors.bold.red('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
  return exitWithDelay();
}

async function handleInvalidAuthorizationKey(data) {

  
  console.log('\n' + colors.bold.red('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log(colors.bold.red('🔐 AUTHORIZATION VALIDATION FAILED - INVALID KEY'));
  console.log(colors.bold.red('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log(colors.red('│'));
  console.log(colors.red('│  ❌ Error: The provided authorization key is invalid or not recognized'));
  console.log(colors.red('│'));
  console.log(colors.red('│  🔧 How to get a valid license:'));
  console.log(colors.red('│     1. Join our Discord server: discord.gg/DragonsHosting'));
  console.log(colors.red('│     2. Create a support ticket'));
  console.log(colors.red('│     3. Request a authorization key from our team'));
  console.log(colors.red('│'));
  console.log(colors.red('│  💡 Already have a access?'));
  console.log(colors.red('│     • Double-check your authorization key in core.yml'));
  console.log(colors.red('│     • Make sure there are no extra spaces or characters'));
  console.log(colors.red('│'));
  console.log(colors.bold.red('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
  return exitWithDelay();
}

async function handleInvalidLicenseStatus(data) {

  
  console.log('\n' + colors.bold.red('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log(colors.bold.red('🚫 AUTHORIZATION VALIDATION FAILED - STATUS ERROR'));
  console.log(colors.bold.red('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log(colors.red('│'));
  console.log(colors.red('│  ❌ Error: License status validation failed'));
  console.log(colors.red('│'));
  console.log(colors.red('│  🔍 Possible causes:'));
  console.log(colors.red('│     • Authorization may be expired or suspended'));
  console.log(colors.red('│     • Authorization server connectivity issues'));
  console.log(colors.red('│     • Authorization key format or status problems'));
  console.log(colors.red('│'));
  console.log(colors.red('│  🆘 Get support:'));
  console.log(colors.red('│     • Join our Discord: discord.gg/DragonsHosting'));
  console.log(colors.red('│     • Create a support ticket'));
  console.log(colors.red('│     • Provide your authorization key for assistance'));
  console.log(colors.red('│'));
  console.log(colors.bold.red('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
  return exitWithDelay();
}

module.exports = { handleInvalidAuthorizationKey, handleInvalidLicenseStatus, handleRateLimitExceeded, handleInvalidLicense };