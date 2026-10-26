const { ButtonStyle } = require('discord.js');

function formatLongTime() {
	const date = new Date();
	return date.toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'long',
		day: 'numeric'
	});
}

function formatShortTime() {
	return new Date().toLocaleTimeString('en-US', {
		hour: '2-digit',
		minute: '2-digit'
	});
}

function calculatePercent(upvotes, downvotes) {
	const totalVotes = upvotes + downvotes;
	const upvotePercent = totalVotes === 0 ? 0 : (upvotes / totalVotes) * 100;
	const downvotePercent = totalVotes === 0 ? 0 : (downvotes / totalVotes) * 100;
	return {
		upvotePercent: Math.round(upvotePercent),
		downvotePercent: Math.round(downvotePercent)
	};
}

function replacePlaceholders(text, placeholders) {
	for (const key in placeholders) {
		if (typeof placeholders[key] === 'object' && placeholders[key] !== null) {
			for (const subKey in placeholders[key]) {
				const regex = new RegExp(`{${key}_${subKey}}`, 'g');
				text = text.replace(regex, placeholders[key][subKey]);
			}
		} else {
			const regex = new RegExp(`{${key}}`, 'g');
			text = text.replace(regex, placeholders[key]);
		}
	}
	return text;
}

function mapButtonColor(color) {
	if (!color) return ButtonStyle.Primary;
	const normalizedColor = color.charAt(0).toUpperCase() + color.slice(1).toLowerCase();
	return ButtonStyle[normalizedColor] || ButtonStyle.Primary;
}

module.exports = {
	formatLongTime,
	formatShortTime,
	calculatePercent,
	replacePlaceholders,
	mapButtonColor
};