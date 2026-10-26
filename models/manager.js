const mongoose = require('mongoose');
const fs = require('fs');
const yaml = require("js-yaml");
const colors = require('ansi-colors');
const { getConfig } = require('../utils/core/configLoader');

const connectToMongoDB = async(mongoURI = null) => {
    if (!mongoURI) {
        try { mongoURI = getConfig().mongoURI; } catch { mongoURI = process.env.MONGODB_URI; }
    }

    if (!mongoURI || String(mongoURI).startsWith('local://')) {
        await mongoose.connect('local://ferox-localdb');
        console.log(colors.green('[DATABASE] Local JSON database active at data/localdb (MongoDB disabled).'));
        return;
    }

    const maxRetries = 5;
    let retries = 0;
    let uri = mongoURI;

    if (!uri) {
        try {
            const config = getConfig();
            uri = config.mongoURI;
        } catch (error) {
            console.error(colors.yellow('[!] Could not load config, falling back to environment variable'));
            uri = process.env.MONGODB_URI;
        }
    }

    while (retries < maxRetries) {
        try {
            if (uri) {
                await mongoose.connect(uri, {
                    serverSelectionTimeoutMS: 30000,
                    socketTimeoutMS: 75000,
                    maxPoolSize: 15,
                    minPoolSize: 3,
                    maxIdleTimeMS: 30000,
                    connectTimeoutMS: 30000,
                    retryWrites: false,
                    bufferCommands: false,
                    readPreference: 'secondaryPreferred',
                    writeConcern: {
                        w: 1,
                        j: false
                    },
                    readConcern: {
                        level: 'local'
                    }
                });

                
                mongoose.connection.on('error', (err) => {
                    if (err.message && err.message.includes('SSL routines:ssl3_read_bytes:tlsv1 alert internal error')) {
                        console.error(colors.yellow('[!] MongoDB SSL connection issue detected - attempting reconnection...'));
                        return;
                    }
                    console.error(colors.red('[?] MongoDB connection error:'), err);
                });

                mongoose.connection.on('disconnected', () => {
                });

                mongoose.connection.on('reconnected', () => {
                });

                return;
            } else {
                throw new Error('MongoDB Connection String is not specified! Add it to core.yml.');
            }
        } catch (error) {
            retries++;
            
            if (error.message && error.message.includes('SSL routines:ssl3_read_bytes:tlsv1 alert internal error')) {
                console.error(colors.yellow(`[!] MongoDB SSL connection issue on attempt ${retries} - retrying...`));
            } else {
                console.error(colors.red(`[?] MongoDB connection attempt ${retries} failed:`), error.message);
            }
            
            if (retries >= maxRetries) {
                if (error.message && error.message.includes('SSL routines:ssl3_read_bytes:tlsv1 alert internal error')) {
                    console.error(colors.red('[?] Failed to establish secure MongoDB connection after maximum retries. Please check your MongoDB Atlas configuration.'));
                } else {
                    console.error(colors.red('[?] Failed to connect to MongoDB after maximum retries'));
                }
                throw error;
            }
            
            await new Promise(resolve => setTimeout(resolve, retries * 2000));
        }
    }
};

const configureMongoDB = () => {
    mongoose.set('strictQuery', false);
    
    const bufferTimeout = 30000;
    mongoose.set('bufferCommands', false);
    
    return bufferTimeout;
};

module.exports = { connectToMongoDB, configureMongoDB };