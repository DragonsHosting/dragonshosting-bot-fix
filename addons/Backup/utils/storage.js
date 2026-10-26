'use strict';

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const BACKUP_ARRAYS = ['channels', 'roles', 'bans', 'members'];

function jsonBytes(value) {
    return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

function splitBackup(backupData, guildId, createdAt = new Date(), automatic = false) {
    const base = {
        id: backupData.id,
        name: backupData.name,
        region: backupData.region,
        iconURL: backupData.iconURL,
        splashURL: backupData.splashURL,
        owner: backupData.owner,
        createdTimestamp: backupData.createdTimestamp
    };
    const recordBase = { backupId: backupData.id, guildId, createdAt, automatic };

    if (jsonBytes(backupData) <= MAX_DOCUMENT_BYTES) {
        return [{ ...recordBase, isChunk: false, chunkIndex: 0, totalChunks: 1, data: backupData }];
    }

    const chunks = [];
    let current = { ...base, isChunk: true, chunkIndex: 0 };
    for (const key of BACKUP_ARRAYS) current[key] = [];

    const flush = () => {
        if (BACKUP_ARRAYS.every(key => current[key].length === 0) && chunks.length > 0) return;
        chunks.push(current);
        current = { ...base, isChunk: true, chunkIndex: chunks.length };
        for (const key of BACKUP_ARRAYS) current[key] = [];
    };

    for (const key of BACKUP_ARRAYS) {
        for (const item of backupData[key] || []) {
            current[key].push(item);
            if (jsonBytes(current) > MAX_DOCUMENT_BYTES) {
                current[key].pop();
                if (current[key].length === 0 && BACKUP_ARRAYS.every(arrayKey => current[arrayKey].length === 0)) {
                    throw new Error(`A single ${key} entry exceeds the safe MongoDB backup chunk size`);
                }
                flush();
                current[key].push(item);
                if (jsonBytes(current) > MAX_DOCUMENT_BYTES) {
                    throw new Error(`A single ${key} entry exceeds the safe MongoDB backup chunk size`);
                }
            }
        }
    }
    flush();

    return chunks.map((data, index) => ({
        ...recordBase,
        isChunk: true,
        chunkIndex: index,
        totalChunks: chunks.length,
        data: { ...data, chunkIndex: index, totalChunks: chunks.length }
    }));
}

function getBackupId(record) {
    if (record.data?.isChunk && record.data.id) return String(record.data.id);
    const id = String(record.backupId || '');
    return id.replace(/_\d+$/, '');
}

function groupBackups(records) {
    const groups = new Map();
    for (const record of records) {
        const id = getBackupId(record);
        if (!id) continue;
        const group = groups.get(id) || [];
        group.push(record);
        groups.set(id, group);
    }
    return groups;
}

function assembleBackup(records) {
    const ordered = [...records].sort((a, b) => {
        const indexA = a.data?.isChunk && Number.isInteger(a.data.chunkIndex)
            ? a.data.chunkIndex
            : (Number.isInteger(a.chunkIndex) ? a.chunkIndex : Number(String(a.backupId).match(/_(\d+)$/)?.[1] || 0));
        const indexB = b.data?.isChunk && Number.isInteger(b.data.chunkIndex)
            ? b.data.chunkIndex
            : (Number.isInteger(b.chunkIndex) ? b.chunkIndex : Number(String(b.backupId).match(/_(\d+)$/)?.[1] || 0));
        return indexA - indexB;
    });
    const first = ordered[0]?.data;
    if (!first) return null;
    if (!ordered.some(record => record.isChunk || record.data?.isChunk)) return first;
    const expectedChunks = Number(ordered[0].totalChunks || first.totalChunks || 0);
    if (expectedChunks > 0 && ordered.length !== expectedChunks) {
        throw new Error(`Backup is incomplete: expected ${expectedChunks} chunks, found ${ordered.length}`);
    }

    const result = {
        id: first.id,
        name: first.name,
        region: first.region,
        iconURL: first.iconURL,
        splashURL: first.splashURL,
        owner: first.owner,
        createdTimestamp: first.createdTimestamp
    };
    for (const key of BACKUP_ARRAYS) {
        result[key] = ordered.flatMap(record => Array.isArray(record.data?.[key]) ? record.data[key] : []);
    }
    return result;
}

module.exports = { MAX_DOCUMENT_BYTES, splitBackup, getBackupId, groupBackups, assembleBackup };
