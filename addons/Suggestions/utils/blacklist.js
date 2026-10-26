const SuggestionBlacklist = require('../models/SuggestionBlacklist');

const cache = new Map();
let lastUpdate = 0;

async function refreshCacheIfStale(ttlMs = 5 * 60 * 1000) {
	const now = Date.now();
	if (now - lastUpdate > ttlMs) {
		const blacklistedUsers = await SuggestionBlacklist.find({}).select('userId').lean();
		cache.clear();
		blacklistedUsers.forEach(u => cache.set(u.userId, true));
		lastUpdate = now;
	}
}

async function isBlacklisted(userId, ttlMs) {
	await refreshCacheIfStale(ttlMs);
	return cache.has(userId);
}

async function addToBlacklist(userId) {
	await SuggestionBlacklist.updateOne({ userId }, { userId }, { upsert: true });
	cache.set(userId, true);
}

async function removeFromBlacklist(userId) {
	await SuggestionBlacklist.deleteOne({ userId });
	cache.delete(userId);
}

module.exports = {
	isBlacklisted,
	addToBlacklist,
	removeFromBlacklist
};