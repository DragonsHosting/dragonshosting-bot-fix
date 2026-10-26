const { getConfig } = require('./configLoader');
const UserData = require('../../models/UserData');
const colors = require('ansi-colors');

class DataPurgeService {
    static async purgeUserMessages() {
        try {
            const config = getConfig();
            if (!config.DataPurge?.Enabled || !config.DataPurge?.UserMessages?.Enabled) {
                return { success: false, reason: 'User messages purge is disabled' };
            }

            const retentionDays = config.DataPurge.UserMessages.RetentionDays;
            const cutoffDate = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);

            const result = await UserData.updateMany(
                {},
                { $pull: { messages: { timeSent: { $lt: cutoffDate } } } }
            );

            return { success: true, modifiedCount: result.modifiedCount, type: 'user_messages' };
        } catch (error) {
            console.error(`${colors.red('[DATA PURGE ERROR]')} Failed to purge user messages:`, error);
            return { success: false, error: error.message };
        }
    }

    static async purgeTransactionLogs() {
        try {
            const config = getConfig();
            if (!config.DataPurge?.Enabled || !config.DataPurge?.TransactionLogs?.Enabled) {
                return { success: false, reason: 'Transaction logs purge is disabled' };
            }

            const retentionDays = config.DataPurge.TransactionLogs.RetentionDays;
            const cutoffDate = new Date(Date.now() - (retentionDays * 24 * 60 * 60 * 1000));

            const result1 = await UserData.updateMany(
                {},
                { $pull: { transactionLogs: { timestamp: { $lt: cutoffDate, $type: "date" } } } }
            );
            
            const result2 = await UserData.updateMany(
                { 'transactionLogs.0': { $exists: true } },
                [
                    {
                        $set: {
                            transactionLogs: {
                                $filter: {
                                    input: "$transactionLogs",
                                    cond: {
                                        $not: {
                                            $and: [
                                                { $eq: [{ $type: "$$this.timestamp" }, "string"] },
                                                { $lt: [{ $dateFromString: { dateString: "$$this.timestamp" } }, cutoffDate] }
                                            ]
                                        }
                                    }
                                }
                            }
                        }
                    }
                ]
            );
            
            const totalModified = result1.modifiedCount + result2.modifiedCount;

            return { success: true, modifiedCount: totalModified, type: 'transaction_logs' };
        } catch (error) {
            console.error(`${colors.red('[DATA PURGE ERROR]')} Failed to purge transaction logs:`, error);
            return { success: false, error: error.message };
        }
    }

    static async purgeTickets() {
        try {
            const config = getConfig();
            if (!config.DataPurge?.Enabled || !config.DataPurge?.Tickets?.Enabled) {
                return { success: false, reason: 'Tickets purge is disabled' };
            }

            const Ticket = global.addonLoader?.getModel('Ticket');
            if (!Ticket) return { success: false, reason: 'Tickets addon is not loaded' };

            const retentionDays = config.DataPurge.Tickets.RetentionDays;
            const cutoffDate = new Date(Date.now() - (retentionDays * 24 * 60 * 60 * 1000));

            
            const testCount = await Ticket.countDocuments({
                $or: [
                    { createdAt: { $lt: cutoffDate.toISOString() } },
                    { 
                        $and: [
                            { status: { $in: ['closed', 'deleted'] } },
                            { closedAt: { $lt: cutoffDate.toISOString() } }
                        ]
                    }
                ]
            });
            
            
            const sampleTickets = await Ticket.find({
                $or: [
                    { createdAt: { $lt: cutoffDate.toISOString() } },
                    { 
                        $and: [
                            { status: { $in: ['closed', 'deleted'] } },
                            { closedAt: { $lt: cutoffDate.toISOString() } }
                        ]
                    }
                ]
            }).select('ticketId createdAt closedAt status').limit(3);
            
            
            const oldByCreation = await Ticket.countDocuments({ createdAt: { $lt: cutoffDate.toISOString() } });
            const oldByStatus = await Ticket.countDocuments({ 
                status: { $in: ['closed', 'deleted'] },
                closedAt: { $lt: cutoffDate.toISOString() }
            });
            
            
            const collection = Ticket.collection;
            
            const rawCount = await collection.countDocuments({
                $or: [
                    { createdAt: { $lt: cutoffDate.toISOString() } },
                    { 
                        $and: [
                            { status: { $in: ['closed', 'deleted'] } },
                            { closedAt: { $lt: cutoffDate.toISOString() } }
                        ]
                    }
                ]
            });
            
            
            const rawDecember = await collection.findOne({
                createdAt: { $regex: /^2024-12/ }
            });
            
            if (rawDecember) {
                
                const wouldMatch = rawDecember.createdAt < cutoffDate.toISOString();
            }

            const result = await collection.deleteMany({
                $or: [
                    { createdAt: { $lt: cutoffDate.toISOString() } },
                    { 
                        $and: [
                            { status: { $in: ['closed', 'deleted'] } },
                            { closedAt: { $lt: cutoffDate.toISOString() } }
                        ]
                    }
                ]
            });

            return { success: true, deletedCount: result.deletedCount, type: 'tickets' };
        } catch (error) {
            console.error(`${colors.red('[DATA PURGE ERROR]')} Failed to purge tickets:`, error);
            return { success: false, error: error.message };
        }
    }

    static async runFullPurge() {
        
        const results = await Promise.allSettled([
            this.purgeUserMessages(),
            this.purgeTransactionLogs(),
            this.purgeTickets()
        ]);

        const summary = results.map((result, index) => {
            const types = ['user_messages', 'transaction_logs', 'tickets'];
            return {
                type: types[index],
                success: result.status === 'fulfilled' && result.value.success,
                data: result.status === 'fulfilled' ? result.value : { error: result.reason }
            };
        });

        const successCount = summary.filter(s => s.success).length;
        
        return summary;
    }
}

module.exports = DataPurgeService;