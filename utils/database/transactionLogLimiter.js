const MAX_TRANSACTION_LOGS = 100;
const MAX_USER_MESSAGES = 50;

function limitTransactionLogs(user) {
    if (user.transactionLogs && user.transactionLogs.length > MAX_TRANSACTION_LOGS) {
        user.transactionLogs = user.transactionLogs.slice(-MAX_TRANSACTION_LOGS);
    }
    return user;
}

function limitUserMessages(user) {
    if (user.messages && user.messages.length > MAX_USER_MESSAGES) {
        user.messages = user.messages.slice(-MAX_USER_MESSAGES);
    }
    return user;
}

function applyUserDataLimits(user) {
    limitTransactionLogs(user);
    limitUserMessages(user);
    return user;
}

module.exports = {
    limitTransactionLogs,
    limitUserMessages,
    applyUserDataLimits,
    MAX_TRANSACTION_LOGS,
    MAX_USER_MESSAGES
};

