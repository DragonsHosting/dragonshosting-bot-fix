module.exports = function applyConfigUpdates(helpers) {
    const {
        fs, path, yaml, colors,
        CONFIG_DIR, MODULES_DIR, CORE_CONFIG_PATH,
        compareVersions, readYamlIfExists, writeYaml, computeIndent,
        appendSubblockAtBottom, insertSubblockBeforeChild,
        ensureTopKey, renameTopKey, removeTopKey, addNestedDefault
    } = helpers;

    try {
        const suggestionsPath = path.join(MODULES_DIR, 'suggestions.yml');
        let suggestions = readYamlIfExists(suggestionsPath) || '';
        if (suggestions) {
            const hasOldEmbedFormat = /\n\s+EmbedColor:\s/.test(suggestions) || 
                                     /\n\s+EmbedTitle:\s/.test(suggestions) || 
                                     /\n\s+EmbedBody:\s/.test(suggestions) ||
                                     /\n\s+UseComponentsV2:\s/.test(suggestions);
            
            if (hasOldEmbedFormat) {
                try {
                    const yamlModule = require('js-yaml');
                    const suggestionsData = yamlModule.load(suggestions);
                    
                    function removeEmbedBlock(lines, embedLineIdx) {
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
                    
                    function migrateEmbedToComponents(embedSection, embedType) {
                        if (!embedSection) return null;
                        
                        let accentColor = embedSection.EmbedColor || '#5865F2';
                        let content = '';
                        
                        if (embedType === 'SuggestionEmbed') {
                            const title = embedSection.EmbedTitle || '{user}\'s Suggestion';
                            const desc = embedSection.EmbedDescription || [];
                            const footer = embedSection.EmbedFooter || 'Suggestion ID: {SuggestionID} | {LongTime}';
                            
                            content = `**${title}**\\n\\n`;
                            if (Array.isArray(desc)) {
                                content += desc.join('\\n');
                            } else if (desc) {
                                content += desc;
                            }
                            content += `\\n\\n-# ${footer}`;
                            
                            if (!accentColor) accentColor = '#5865F2';
                        } else if (embedType === 'SuggestionAcceptEmbed') {
                            const title = embedSection.EmbedTitle || 'Accepted {user}\'s Suggestion';
                            const body = embedSection.EmbedBody || [];
                            const footer = embedSection.EmbedFooter || 'Suggestion ID: {SuggestionID} | {LongTime}';
                            
                            content = `**${title}**\\n\\n`;
                            if (Array.isArray(body)) {
                                content += body.join('\\n');
                            } else if (body) {
                                content += body;
                            }
                            content += `\\n\\n-# ${footer}`;
                            
                            if (!accentColor) accentColor = '#57F287';
                        } else if (embedType === 'SuggestionDenyEmbed') {
                            const title = embedSection.EmbedTitle || 'Denied {user}\'s Suggestion';
                            const body = embedSection.EmbedBody || [];
                            const footer = embedSection.EmbedFooter || 'Suggestion ID: {SuggestionID} | {LongTime}';
                            
                            content = `**${title}**\\n\\n`;
                            if (Array.isArray(body)) {
                                content += body.join('\\n');
                            } else if (body) {
                                content += body;
                            }
                            content += `\\n\\n-# ${footer}`;
                            
                            if (!accentColor) accentColor = '#ED4245';
                        }
                        
                        return {
                            Components: [
                                {
                                    Type: 'container',
                                    AccentColor: accentColor,
                                    Spoiler: false,
                                    Components: [
                                        {
                                            Type: 'section',
                                            Text: {
                                                Content: content
                                            },
                                            Accessory: {
                                                Type: 'thumbnail',
                                                Media: {
                                                    Url: '{userIcon}'
                                                }
                                            }
                                        }
                                    ]
                                }
                            ]
                        };
                    }
                    
                    let lines = suggestions.split('\n');
                    let changed = false;
                    
                    const embedSections = [
                        { key: 'SuggestionEmbed', data: suggestionsData.SuggestionEmbed },
                        { key: 'SuggestionAcceptEmbed', data: suggestionsData.SuggestionAcceptEmbed },
                        { key: 'SuggestionDenyEmbed', data: suggestionsData.SuggestionDenyEmbed }
                    ];
                    
                    for (const section of embedSections) {
                        if (!section.data) continue;
                        
                        const hasOldFormat = section.data.EmbedColor || section.data.EmbedTitle || 
                                           section.data.EmbedDescription || section.data.EmbedBody ||
                                           section.data.UseComponentsV2 || section.data.ComponentsV2;
                        const hasNewFormat = section.data.Components;
                        
                        if (hasOldFormat) {
                            let sectionIdx = -1;
                            for (let i = 0; i < lines.length; i++) {
                                if (lines[i].trim() === `${section.key}:`) {
                                    sectionIdx = i;
                                    break;
                                }
                            }
                            
                            if (sectionIdx === -1) continue;
                            
                            const sectionIndent = lines[sectionIdx].match(/^(\s*)/)[1].length;
                            
                            let nextSectionIdx = sectionIdx + 1;
                            while (nextSectionIdx < lines.length) {
                                const line = lines[nextSectionIdx];
                                const trimmed = line.trim();
                                if (trimmed === '') {
                                    nextSectionIdx++;
                                    continue;
                                }
                                if (trimmed.startsWith('#')) {
                                    nextSectionIdx++;
                                    continue;
                                }
                                const lineIndent = line.match(/^(\s*)/)[1].length;
                                if (lineIndent <= sectionIndent) break;
                                nextSectionIdx++;
                            }
                            
                            let preservedLines = [];
                            if (section.key === 'SuggestionAcceptEmbed' || section.key === 'SuggestionDenyEmbed') {
                                for (let i = sectionIdx + 1; i < nextSectionIdx; i++) {
                                    const trimmed = lines[i].trim();
                                    if (trimmed.startsWith('AcceptChannelID:') || trimmed.startsWith('DenyChannelID:')) {
                                        preservedLines.push(lines[i]);
                                    }
                                }
                            }
                            
                            if (!hasNewFormat) {
                                const newComponents = migrateEmbedToComponents(section.data, section.key);
                                if (newComponents) {
                                    const componentsYaml = yamlModule.dump({ Components: newComponents.Components }, { 
                                        indent: 2, 
                                        lineWidth: -1,
                                        noRefs: true 
                                    });
                                    
                                    const indentedComponents = componentsYaml.split('\n').map(line => {
                                        if (line.trim() === '') return '';
                                        return ' '.repeat(sectionIndent + 2) + line;
                                    }).filter(line => line.trim() !== '');
                                    
                                    const newContent = [
                                        ...preservedLines,
                                        ...indentedComponents
                                    ];
                                    
                                    lines.splice(sectionIdx + 1, nextSectionIdx - sectionIdx - 1, ...newContent);
                                    changed = true;
                                }
                            } else {
                                const removeFrom = sectionIdx + 1;
                                const removeTo = nextSectionIdx;
                                
                                for (let i = removeTo - 1; i >= removeFrom; i--) {
                                    const trimmed = lines[i].trim();
                                    if (trimmed.startsWith('Components:') || 
                                        trimmed.startsWith('AcceptChannelID:') || 
                                        trimmed.startsWith('DenyChannelID:')) {
                                        continue;
                                    }
                                    const lineIndent = lines[i].match(/^(\s*)/)[1].length;
                                    if (lineIndent === sectionIndent + 2) {
                                        const isOldField = trimmed.startsWith('EmbedColor:') || 
                                                          trimmed.startsWith('EmbedTitle:') ||
                                                          trimmed.startsWith('EmbedDescription:') ||
                                                          trimmed.startsWith('EmbedBody:') ||
                                                          trimmed.startsWith('EmbedFooter:') ||
                                                          trimmed.startsWith('Thumbnail:') ||
                                                          trimmed.startsWith('AuthorIcon:') ||
                                                          trimmed.startsWith('UseComponentsV2:') ||
                                                          trimmed.startsWith('ComponentsV2:') ||
                                                          trimmed.startsWith('-');
                                        
                                        if (isOldField) {
                                            lines.splice(i, 1);
                                            changed = true;
                                        }
                                    } else if (lineIndent > sectionIndent + 2 && i > removeFrom) {
                                        const prevLine = lines[i-1].trim();
                                        if (prevLine.startsWith('-') || prevLine === '') {
                                            lines.splice(i, 1);
                                            changed = true;
                                        }
                                    }
                                }
                            }
                        }
                    }
                    
                    if (changed) {
                        suggestions = lines.join('\n');
                        writeYaml(suggestionsPath, suggestions);
                    }
                } catch (err) {
                }
            }
        }
    } catch {}
};
