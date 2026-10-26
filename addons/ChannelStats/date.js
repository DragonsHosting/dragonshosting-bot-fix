'use strict';

module.exports = function formatCurrentDate(timeZone = 'Europe/Amsterdam') {
    const options = {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        timeZone
    };
    try {
        return new Intl.DateTimeFormat('en-US', options).format(new Date());
    } catch {
        return new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' }).format(new Date());
    }
};

