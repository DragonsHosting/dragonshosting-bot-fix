const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const yaml = require('js-yaml');
const colors = require('ansi-colors');

const CONFIG_DIR = path.join(__dirname, '..', '..', '..', 'config');
const MODULES_DIR = path.join(CONFIG_DIR, 'modules');
const CORE_CONFIG_PATH = path.join(CONFIG_DIR, 'core.yml');

function compareVersions(version1, version2) {
    const parseVersion = (v) => {
        return v.toString().split('.').map(num => parseInt(num.replace(/[^0-9]/g, ''), 10) || 0);
    };
    
    const v1Parts = parseVersion(version1);
    const v2Parts = parseVersion(version2);
    const maxLength = Math.max(v1Parts.length, v2Parts.length);
    
    for (let i = 0; i < maxLength; i++) {
        const v1Part = v1Parts[i] || 0;
        const v2Part = v2Parts[i] || 0;
        
        if (v1Part < v2Part) return -1;
        if (v1Part > v2Part) return 1;
    }
    
    return 0;
}

function readYamlIfExists(p) {
    if (!fs.existsSync(p)) return null;
    try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

function writeYaml(p, content) {
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(p, content, 'utf8');
}

function computeIndent(line) {
    return line.length - line.trimStart().length;
}

function appendSubblockAtBottom(content, sectionKey, subblock) {
    if (!content) return content;
    const lines = content.split('\n');
    const keyRe = new RegExp(`^${sectionKey.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\s*:\\s*$`);
    const start = lines.findIndex(l => keyRe.test(l.trim()));
    if (start === -1) return content;
    const baseIndent = computeIndent(lines[start]);
    let end = start + 1;
    while (end < lines.length) {
        const t = lines[end].trim();
        const ind = computeIndent(lines[end]);
        if (t !== '' && ind <= baseIndent) break;
        end++;
    }
    const subKeyName = subblock.split('\n')[0].trim().split(':')[0];
    for (let i = start + 1; i < end; i++) {
        const t = lines[i].trim();
        if (t.startsWith(subKeyName + ':')) return content;
    }
    const indentStr = ' '.repeat(baseIndent + 2);
    const block = subblock.split('\n').map((ln, idx) => idx === 0 ? indentStr + ln : (ln ? indentStr + ln : ln)).join('\n');
    const before = lines.slice(0, end).join('\n');
    const after = lines.slice(end).join('\n');
    const sepBefore = before && !before.endsWith('\n') ? '\n' : '';
    const sepAfter = after ? (after.startsWith('\n') ? '' : '\n') : '\n';
    return `${before}${sepBefore}${block}${sepAfter}${after}`;
}

function insertSubblockAfterEmbedThumbnail(content, sectionKey, subblock) {
    if (!content) return content;
    const lines = content.split('\n');
    const secRe = new RegExp(`^${sectionKey.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\s*:\\s*$`);
    const secStart = lines.findIndex(l => secRe.test(l.trim()));
    if (secStart === -1) return content;
    const secIndent = computeIndent(lines[secStart]);
    let embedStart = -1; let embedIndent = 0; let secEnd = secStart + 1;
    for (let i = secStart + 1; i < lines.length; i++) {
        const t = lines[i].trim();
        const ind = computeIndent(lines[i]);
        if (t !== '' && ind <= secIndent) { secEnd = i; break; }
        if (embedStart === -1 && /^Embed\s*:\s*$/.test(t) && ind === secIndent + 2) {
            embedStart = i; embedIndent = ind; 
        }
    }
    if (secEnd === secStart + 1) secEnd = lines.length;
    for (let i = secStart + 1; i < secEnd; i++) {
        const t = lines[i].trim();
        const ind = computeIndent(lines[i]);
        if (ind === secIndent + 2 && /^AutoDelete\s*:/i.test(t)) return content;
    }
    if (embedStart === -1) {
        return appendSubblockAtBottom(content, sectionKey, subblock);
    }
    let embedEnd = embedStart + 1;
    for (let i = embedStart + 1; i < lines.length; i++) {
        const t = lines[i].trim();
        const ind = computeIndent(lines[i]);
        if (t !== '' && ind <= embedIndent) { embedEnd = i; break; }
        embedEnd = i + 1;
    }
    let insertAt = embedEnd;
    while (insertAt - 1 > embedStart && lines[insertAt - 1].trim() === '') insertAt--;
    const indentStr = ' '.repeat(secIndent + 2);
    const blockLines = subblock.split('\n').map((ln, idx) => idx === 0 ? indentStr + ln : (ln ? indentStr + ln : ln));
    const out = [...lines];
    out.splice(insertAt, 0, ...blockLines);
    return out.join('\n');
}

function insertSubblockBeforeChild(content, sectionKey, beforeChildKey, subblock) {
    if (!content) return content;
    const lines = content.split('\n');
    const keyRe = new RegExp(`^${sectionKey.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\s*:\\s*$`);
    const start = lines.findIndex(l => keyRe.test(l.trim()));
    if (start === -1) return content;
    const baseIndent = computeIndent(lines[start]);
    let end = start + 1;
    while (end < lines.length) {
        const t = lines[end].trim();
        const ind = computeIndent(lines[end]);
        if (t !== '' && ind <= baseIndent) break;
        end++;
    }
    const subKeyName = subblock.split('\n')[0].trim().split(':')[0];
    for (let i = start + 1; i < end; i++) {
        const t = lines[i].trim();
        if (t.startsWith(subKeyName + ':')) return content;
    }
    let beforeIdx = -1;
    for (let i = start + 1; i < end; i++) {
        const raw = lines[i];
        const t = raw.trim();
        const ind = computeIndent(raw);
        if (ind === baseIndent + 2 && t.startsWith(beforeChildKey + ':')) { beforeIdx = i; break; }
        if (t !== '' && ind <= baseIndent) break;
    }
    const insertAt = (beforeIdx !== -1) ? beforeIdx : end;
    const indentStr = ' '.repeat(baseIndent + 2);
    const blockLines = subblock.split('\n').map((ln, idx) => idx === 0 ? indentStr + ln : (ln ? indentStr + ln : ln));
    const out = [...lines];
    out.splice(insertAt, 0, ...blockLines);
    return out.join('\n');
}

function ensureTopKey(content, key, defaultBlock) {
    if (!content) return `${defaultBlock}\n`;
    const lines = content.split('\n');
    const keyRe = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:`);
    if (lines.some(l => keyRe.test(l.trim()))) return content;
    const sep = content.endsWith('\n') ? '' : '\n';
    return content + sep + defaultBlock + (defaultBlock.endsWith('\n') ? '' : '\n');
}

function renameTopKey(content, fromKey, toKey) {
    if (!content) return content;
    const keyRe = new RegExp(`^(\\s*)${fromKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s*):(.*)$`);
    return content.split('\n').map(line => {
        const m = line.match(keyRe);
        if (m) return `${m[1]}${toKey}${m[2]}:${m[3]}`;
        return line;
    }).join('\n');
}

function removeTopKey(content, key) {
    if (!content) return content;
    const lines = content.split('\n');
    const keyRe = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:`);
    const start = lines.findIndex(l => keyRe.test(l.trim()));
    if (start === -1) return content;
    const baseIndent = lines[start].length - lines[start].trimStart().length;
    let end = start + 1;
    while (end < lines.length) {
        const t = lines[end].trim();
        const ind = lines[end].length - lines[end].trimStart().length;
        if (t !== '' && ind <= baseIndent) break;
        end++;
    }
    const before = lines.slice(0, start).join('\n');
    const after = lines.slice(end).join('\n');
    const sep = before && after ? '\n' : '';
    return `${before}${sep}${after}`.replace(/\n+$/,'\n');
}

function addNestedDefault(content, pathKeys, defaultBlock) {
    const joined = pathKeys.join(':');
    if ((content || '').includes(`${pathKeys[pathKeys.length-1]}:`)) return content;
    const sep = content && !content.endsWith('\n') ? '\n' : '';
    return (content || '') + sep + defaultBlock + (defaultBlock.endsWith('\n') ? '' : '\n');
}

module.exports = {
    fs, crypto, path, yaml, colors,
    CONFIG_DIR, MODULES_DIR, CORE_CONFIG_PATH,
    compareVersions,
    readYamlIfExists,
    writeYaml,
    computeIndent,
    appendSubblockAtBottom,
    insertSubblockAfterEmbedThumbnail,
    insertSubblockBeforeChild,
    ensureTopKey,
    renameTopKey,
    removeTopKey,
    addNestedDefault
};
