const { getConfig, getLang } = require('../../../utils/core/configLoader');
const config = getConfig();
const lang = getLang();

function convertSimplePatternToRegex(simplePattern) {
	let regexPattern = simplePattern
		.replace(/\./g, '\\.')
		.replace(/\*/g, '.*');
	return new RegExp(`^${regexPattern}$`, 'i');
}

async function containsBlacklistedWordsText(text) {
	const patterns = config.BlacklistWords?.Patterns || [];
	const regexes = patterns.map(convertSimplePatternToRegex);
	return regexes.some(r => r.test(text));
}

function buildBlacklistResponse(user) {
	const message = lang.BlacklistWords && lang.BlacklistWords.Message
		? lang.BlacklistWords.Message.replace(/{user}/g, `${user}`)
		: 'Your suggestion contains blacklisted words.';
	return message;
}

function userHasAllowedRole(member) {
	const allowedRoles = (config.SuggestionSettings?.AllowedRoles) || [];
	return allowedRoles.length === 0 || allowedRoles.some(roleId => member.roles.cache.has(roleId));
}

module.exports = {
	containsBlacklistedWordsText,
	buildBlacklistResponse,
	userHasAllowedRole
};