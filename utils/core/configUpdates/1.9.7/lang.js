module.exports = function applyLangUpdates(helpers) {
    const {
        fs, path, yaml, colors,
        CONFIG_DIR, MODULES_DIR,
        readYamlIfExists, writeYaml, computeIndent,
        appendSubblockAtBottom
    } = helpers;

// Lang.yml Ticket ComponentsV2 migration - Converts Embed format to Components format and removes old Embeds
try {
    const langPath = path.join(CONFIG_DIR, 'lang.yml');
    let langContent = readYamlIfExists(langPath) || '';
    if (langContent) {
        const hasTicketEmbedFormat = /\n\s+Embed:\s*\n/.test(langContent);
        
        if (hasTicketEmbedFormat) {
            try {
                const yaml = require('js-yaml');
                const langData = yaml.load(langContent);
                
                function escapeYamlStr(str) {
                    if (str === '' || str === null || str === undefined) return '""';
                    if (typeof str !== 'string') return String(str);
                    const needsQuotes = /[:#\[\]{}|>&*!?,]/.test(str) || str.includes('"') || str.trim() !== str || str.startsWith('-') || str.startsWith('#');
                    if (needsQuotes) {
                        return '"' + str.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
                    }
                    return str;
                }
                
                function generateLangComponentsYaml(embed, baseIndent) {
                    if (!embed) return null;
                    const i0 = ' '.repeat(baseIndent);
                    const i1 = ' '.repeat(baseIndent + 2);
                    const i2 = ' '.repeat(baseIndent + 4);
                    const i3 = ' '.repeat(baseIndent + 6);
                    const i4 = ' '.repeat(baseIndent + 8);
                    const i5 = ' '.repeat(baseIndent + 10);
                    
                    let lines = [];
                    lines.push(`${i0}Components:`);
                    lines.push(`${i1}- Type: container`);
                    lines.push(`${i2}AccentColor: "${embed.Color || '#5865F2'}"`);
                    lines.push(`${i2}Components:`);
                    
                    let mainContent = [];
                    if (embed.Title) mainContent.push(`# ${embed.Title}`);
                    if (embed.Description) {
                        if (mainContent.length > 0) mainContent.push('');
                        const desc = Array.isArray(embed.Description) ? embed.Description : [embed.Description];
                        mainContent.push(...desc);
                    }
                    
                    if (mainContent.length > 0) {
                        if (embed.Thumbnail) {
                            lines.push(`${i3}- Type: section`);
                            lines.push(`${i4}Text:`);
                            lines.push(`${i5}Content:`);
                            for (const line of mainContent) {
                                lines.push(`${i5}  - ${escapeYamlStr(line)}`);
                            }
                            lines.push(`${i4}Accessory:`);
                            lines.push(`${i5}Type: thumbnail`);
                            lines.push(`${i5}Media:`);
                            lines.push(`${i5}  URL: ${escapeYamlStr(embed.Thumbnail)}`);
                        } else {
                            lines.push(`${i3}- Type: text_display`);
                            lines.push(`${i4}Content:`);
                            for (const line of mainContent) {
                                lines.push(`${i4}  - ${escapeYamlStr(line)}`);
                            }
                        }
                    }
                    
                    if (embed.Image) {
                        lines.push(`${i3}- Type: separator`);
                        lines.push(`${i3}- Type: media_gallery`);
                        lines.push(`${i4}Items:`);
                        lines.push(`${i4}  - Media:`);
                        lines.push(`${i4}      URL: ${escapeYamlStr(embed.Image)}`);
                    }
                    
                    if (embed.Footer?.Text) {
                        lines.push(`${i3}- Type: separator`);
                        lines.push(`${i3}- Type: text_display`);
                        lines.push(`${i4}Content: ${escapeYamlStr(`-# ${embed.Footer.Text}`)}`);
                    }
                    
                    return lines.join('\n');
                }
                
                function removeLangEmbedBlock(lines, embedLineIdx) {
                    const embedLine = lines[embedLineIdx];
                    const embedIndent = embedLine.match(/^(\s*)/)[1].length;
                    
                    let endIdx = embedLineIdx + 1;
                    while (endIdx < lines.length) {
                        const line = lines[endIdx];
                        if (line.trim() === '' || line.trim().startsWith('#')) {
                            endIdx++;
                            continue;
                        }
                        const lineIndent = line.match(/^(\s*)/)[1].length;
                        if (lineIndent <= embedIndent) break;
                        endIdx++;
                    }
                    
                    return [
                        ...lines.slice(0, embedLineIdx),
                        ...lines.slice(endIdx)
                    ];
                }
                
                function replaceLangEmbedBlock(lines, embedLineIdx, embed) {
                    const embedLine = lines[embedLineIdx];
                    const embedIndent = embedLine.match(/^(\s*)/)[1].length;
                    
                    let endIdx = embedLineIdx + 1;
                    while (endIdx < lines.length) {
                        const line = lines[endIdx];
                        if (line.trim() === '' || line.trim().startsWith('#')) {
                            endIdx++;
                            continue;
                        }
                        const lineIndent = line.match(/^(\s*)/)[1].length;
                        if (lineIndent <= embedIndent) break;
                        endIdx++;
                    }
                    
                    const componentsYaml = generateLangComponentsYaml(embed, embedIndent);
                    if (!componentsYaml) return { lines, changed: false };
                    
                    const newLines = [
                        ...lines.slice(0, embedLineIdx),
                        componentsYaml,
                        ...lines.slice(endIdx)
                    ];
                    
                    return { lines: newLines, changed: true };
                }
                
                let lines = langContent.split('\n');
                let changed = false;
                
                const langEmbedSections = [
                    { pattern: /^\s{4}Embed:\s*$/, data: langData.Tickets?.TicketCreated?.Embed, after: 'TicketCreated:', hasComponents: !!langData.Tickets?.TicketCreated?.Components },
                    { pattern: /^\s{4}Embed:\s*$/, data: langData.Tickets?.Blacklisted?.Embed, after: 'Blacklisted:', hasComponents: !!langData.Tickets?.Blacklisted?.Components },
                ];
                
                for (const section of langEmbedSections) {
                    if (!section.data) continue;
                    
                    let afterIdx = -1;
                    for (let i = 0; i < lines.length; i++) {
                        if (lines[i].includes(section.after)) {
                            afterIdx = i;
                            break;
                        }
                    }
                    if (afterIdx === -1) continue;
                    
                    for (let i = afterIdx + 1; i < lines.length; i++) {
                        if (section.pattern.test(lines[i])) {
                            if (section.hasComponents) {
                                lines = removeLangEmbedBlock(lines, i);
                                changed = true;
                            } else {
                                const result = replaceLangEmbedBlock(lines, i, section.data);
                                if (result.changed) {
                                    lines = result.lines;
                                    changed = true;
                                }
                            }
                            break;
                        }
                        const lineIndent = lines[i].match(/^(\s*)/)[1].length;
                        const afterIndent = lines[afterIdx].match(/^(\s*)/)[1].length;
                        if (lines[i].trim() && lineIndent <= afterIndent && i > afterIdx + 1) break;
                    }
                }
                
                if (changed) {
                    writeYaml(langPath, lines.join('\n'));
                }
            } catch (err) {
                // Migration failed - leave file as-is
            }
        }
    }
} catch {}

};
