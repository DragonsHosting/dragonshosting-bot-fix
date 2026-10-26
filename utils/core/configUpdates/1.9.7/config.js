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
        const lines = suggestions.split('\n');
        let modified = false;

        const addComponentsV2ToEmbed = (embedKey) => {
            const embedRe = new RegExp(`^${embedKey}\\s*:\\s*(?:#.*)?$`);
            const embedIdx = lines.findIndex(l => embedRe.test(l.trim()));
            if (embedIdx === -1) return;
            
            const embedIndent = computeIndent(lines[embedIdx]);
            let embedEnd = embedIdx + 1;
            for (let i = embedIdx + 1; i < lines.length; i++) {
                const t = lines[i].trim();
                const ind = computeIndent(lines[i]);
                if (t !== '' && ind <= embedIndent) { embedEnd = i; break; }
                embedEnd = i + 1;
            }

            let hasUseComponentsV2 = false;
            let hasComponentsV2 = false;
            let hasComponents = false;
            for (let i = embedIdx + 1; i < embedEnd; i++) {
                const t = lines[i].trim();
                const ind = computeIndent(lines[i]);
                if (ind === embedIndent + 2) {
                    if (/^UseComponentsV2\s*:/i.test(t)) hasUseComponentsV2 = true;
                    if (/^ComponentsV2\s*:/i.test(t)) hasComponentsV2 = true;
                    if (/^Components\s*:/i.test(t)) hasComponents = true;
                }
            }

            if (!hasUseComponentsV2 && !hasComponentsV2 && !hasComponents) {
                const i1 = ' '.repeat(embedIndent + 2);
                const i2 = ' '.repeat(embedIndent + 4);
                const i3 = ' '.repeat(embedIndent + 6);
                const i4 = ' '.repeat(embedIndent + 8);
                const i5 = ' '.repeat(embedIndent + 10);
                const i6 = ' '.repeat(embedIndent + 12);

                let accentColor = '#5865F2';
                let sectionContent = '**NEW SUGGESTION**\\nby {user}\\n\\n```{suggestion}```\\n\\n­ƒæì **{upvotecount}** upvotes  ┬À  ­ƒæÄ **{downvotecount}** downvotes\\n\\n-# Product: {modal_product_label}  ┬À  ID: {SuggestionID}';

                if (embedKey === 'SuggestionAcceptEmbed') {
                    accentColor = '#57F287';
                    sectionContent = '**SUGGESTION ACCEPTED**\\nby {user}\\n\\n**Suggestion**\\n```{suggestion}```\\n\\n**Reason**\\n```{reason}```\\n\\n**Product:** {modal_product_formatted}\\n\\n-# Suggestion ID: {SuggestionID}  ┬À  {LongTime}';
                } else if (embedKey === 'SuggestionDenyEmbed') {
                    accentColor = '#ED4245';
                    sectionContent = '**SUGGESTION DECLINED**\\nby {user}\\n\\n**Suggestion**\\n```{suggestion}```\\n\\n**Reason**\\n```{reason}```\\n\\n**Product:** {modal_product_formatted}\\n\\n-# Suggestion ID: {SuggestionID}  ┬À  {LongTime}';
                }

                const block = [
                    '',
                    `${i1}# ---------------------------------------------------------------------------`,
                    `${i1}# COMPONENTS V2 FORMAT (when UseComponentsV2 is true)`,
                    `${i1}# ---------------------------------------------------------------------------`,
                    `${i1}UseComponentsV2: false`,
                    '',
                    `${i1}ComponentsV2:`,
                    `${i2}Components:`,
                    `${i3}- Type: "container"`,
                    `${i4}AccentColor: "${accentColor}"`,
                    `${i4}Spoiler: false`,
                    `${i4}Components:`,
                    `${i5}- Type: "section"`,
                    `${i6}Text:`,
                    `${i6}  Content: "${sectionContent}"`,
                    `${i6}Accessory:`,
                    `${i6}  Type: "thumbnail"`,
                    `${i6}  Media:`,
                    `${i6}    Url: "{userIcon}"`,
                    ''
                ];
                lines.splice(embedEnd, 0, ...block);
                modified = true;
            }
        };

        addComponentsV2ToEmbed('SuggestionEmbed');
        addComponentsV2ToEmbed('SuggestionAcceptEmbed');
        addComponentsV2ToEmbed('SuggestionDenyEmbed');

        if (modified) {
            suggestions = lines.join('\n');
            writeYaml(suggestionsPath, suggestions);
        }
    }
} catch {}

try {
    const levelingPath = path.join(MODULES_DIR, 'leveling.yml');
    let leveling = readYamlIfExists(levelingPath) || '';
    if (leveling) {
        const lines = leveling.split('\n');
        let modified = false;

        const lsIdx = lines.findIndex(l => /^LevelingSystem\s*:\s*(?:#.*)?$/.test(l.trim()));
        if (lsIdx !== -1) {
            const lsIndent = computeIndent(lines[lsIdx]);
            let lsEnd = lsIdx + 1;
            for (let i = lsIdx + 1; i < lines.length; i++) {
                const t = lines[i].trim();
                const ind = computeIndent(lines[i]);
                if (t !== '' && ind <= lsIndent) { lsEnd = i; break; }
                lsEnd = i + 1;
            }

            let lumsIdx = -1;
            for (let i = lsIdx + 1; i < lsEnd; i++) {
                const t = lines[i].trim();
                const ind = computeIndent(lines[i]);
                if (ind === lsIndent + 2 && /^LevelUpMessageSettings\s*:\s*(?:#.*)?$/.test(t)) {
                    lumsIdx = i;
                    break;
                }
            }

            if (lumsIdx !== -1) {
                const lumsIndent = computeIndent(lines[lumsIdx]);
                let lumsEnd = lumsIdx + 1;
                for (let i = lumsIdx + 1; i < lsEnd; i++) {
                    const t = lines[i].trim();
                    const ind = computeIndent(lines[i]);
                    if (t !== '' && ind <= lumsIndent) { lumsEnd = i; break; }
                    lumsEnd = i + 1;
                }

                let hasUseComponentsV2 = false;
                let hasComponentsV2 = false;
                let embedEndIdx = -1;

                for (let i = lumsIdx + 1; i < lumsEnd; i++) {
                    const t = lines[i].trim();
                    const ind = computeIndent(lines[i]);
                    if (ind === lumsIndent + 2) {
                        if (/^UseComponentsV2\s*:/i.test(t)) hasUseComponentsV2 = true;
                        if (/^ComponentsV2\s*:/i.test(t)) hasComponentsV2 = true;
                        if (/^Embed\s*:/i.test(t)) {
                            const embedIndent = ind;
                            embedEndIdx = i + 1;
                            for (let j = i + 1; j < lumsEnd; j++) {
                                const et = lines[j].trim();
                                const eind = computeIndent(lines[j]);
                                if (et !== '' && eind <= embedIndent) { embedEndIdx = j; break; }
                                embedEndIdx = j + 1;
                            }
                        }
                    }
                }

                if (!hasUseComponentsV2 && !hasComponentsV2 && embedEndIdx !== -1) {
                    const i1 = ' '.repeat(lumsIndent + 2);
                    const i2 = ' '.repeat(lumsIndent + 4);
                    const i3 = ' '.repeat(lumsIndent + 6);
                    const i4 = ' '.repeat(lumsIndent + 8);
                    const i5 = ' '.repeat(lumsIndent + 10);
                    const i6 = ' '.repeat(lumsIndent + 12);
                    const componentsBlock = [
                        '',
                        `${i1}# ---------------------------------------------------------------------------`,
                        `${i1}# COMPONENTS V2 FORMAT (when UseComponentsV2 is true)`,
                        `${i1}# ---------------------------------------------------------------------------`,
                        `${i1}# Placeholders: {userName}, {user}, {userIcon}, {oldLevel}, {newLevel},`,
                        `${i1}# {xp}, {xpNeeded}, {guildName}, {guildIcon}, {randomLevelMessage}`,
                        `${i1}UseComponentsV2: false`,
                        '',
                        `${i1}ComponentsV2:`,
                        `${i2}Components:`,
                        `${i3}- Type: "container"`,
                        `${i4}AccentColor: "#eda3f0"`,
                        `${i4}Spoiler: false`,
                        `${i4}Components:`,
                        `${i5}- Type: "section"`,
                        `${i6}Text:`,
                        `${i6}  Content: "# ­ƒÄë Level Up!\\n\\n{randomLevelMessage}"`,
                        `${i6}Accessory:`,
                        `${i6}  Type: "thumbnail"`,
                        `${i6}  Media:`,
                        `${i6}    Url: "{userIcon}"`,
                        ''
                    ];
                    lines.splice(embedEndIdx, 0, ...componentsBlock);
                    modified = true;
                }
            }
        }

        if (modified) {
            leveling = lines.join('\n');
            writeYaml(levelingPath, leveling);
        }
    }
} catch {}

// Ticket ComponentsV2 migration - Converts Embed format to Components format and removes old Embed blocks
try {
    const ticketsPath = path.join(MODULES_DIR, 'tickets.yml');
    let ticketsContent = readYamlIfExists(ticketsPath) || '';
    if (ticketsContent) {
        const hasEmbedFormat = /\n\s+Embed:\s*\n/.test(ticketsContent);
        
        if (hasEmbedFormat) {
            try {
                const yaml = require('js-yaml');
                const ticketsData = yaml.load(ticketsContent);
                
                function escapeYamlString(str) {
                    if (str === '' || str === null || str === undefined) return '""';
                    if (typeof str !== 'string') return String(str);
                    const needsQuotes = /[:#\[\]{}|>&*!?,]/.test(str) || str.includes('"') || str.trim() !== str || str.startsWith('-') || str.startsWith('#');
                    if (needsQuotes) {
                        return '"' + str.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
                    }
                    return str;
                }
                
                function generateComponentsYaml(embed, baseIndent) {
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
                                lines.push(`${i5}  - ${escapeYamlString(line)}`);
                            }
                            lines.push(`${i4}Accessory:`);
                            lines.push(`${i5}Type: thumbnail`);
                            lines.push(`${i5}Media:`);
                            lines.push(`${i5}  URL: ${escapeYamlString(embed.Thumbnail)}`);
                        } else {
                            lines.push(`${i3}- Type: text_display`);
                            lines.push(`${i4}Content:`);
                            for (const line of mainContent) {
                                lines.push(`${i4}  - ${escapeYamlString(line)}`);
                            }
                        }
                    }
                    
                    if (embed.Image) {
                        lines.push(`${i3}- Type: separator`);
                        lines.push(`${i3}- Type: media_gallery`);
                        lines.push(`${i4}Items:`);
                        lines.push(`${i4}  - Media:`);
                        lines.push(`${i4}      URL: ${escapeYamlString(embed.Image)}`);
                    }
                    
                    if (embed.Footer?.Text) {
                        lines.push(`${i3}- Type: separator`);
                        lines.push(`${i3}- Type: text_display`);
                        lines.push(`${i4}Content: ${escapeYamlString(`-# ${embed.Footer.Text}`)}`);
                    }
                    
                    return lines.join('\n');
                }
                
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
                
                function replaceEmbedBlock(lines, embedLineIdx, embed) {
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
                    
                    const componentsYaml = generateComponentsYaml(embed, embedIndent);
                    if (!componentsYaml) return { lines, changed: false };
                    
                    const newLines = [
                        ...lines.slice(0, embedLineIdx),
                        componentsYaml,
                        ...lines.slice(endIdx)
                    ];
                    
                    return { lines: newLines, changed: true };
                }
                
                let lines = ticketsContent.split('\n');
                let changed = false;
                
                const embedSections = [
                    { pattern: /^\s{4}Embed:\s*$/, data: ticketsData.TicketSettings?.DelayedResponse?.Embed, after: 'DelayedResponse:', hasComponents: !!ticketsData.TicketSettings?.DelayedResponse?.Components },
                    { pattern: /^\s{2}Embed:\s*$/, data: ticketsData.CloseRequest?.Embed, after: 'CloseRequest:', hasComponents: !!ticketsData.CloseRequest?.Components },
                    { pattern: /^\s{2}Embed:\s*$/, data: ticketsData.WorkingEmbed?.Embed, after: 'WorkingEmbed:', hasComponents: !!ticketsData.WorkingEmbed?.Components },
                    { pattern: /^\s{2}Embed:\s*$/, data: ticketsData.ArchiveDesign?.Embed, after: 'ArchiveDesign:', hasComponents: !!ticketsData.ArchiveDesign?.Components },
                    { pattern: /^\s{2}Embed:\s*$/, data: ticketsData.UserLeftDesign?.Embed, after: 'UserLeftDesign:', hasComponents: !!ticketsData.UserLeftDesign?.Components },
                    { pattern: /^\s{2}Embed:\s*$/, data: ticketsData.TicketClosureDM?.Embed, after: 'TicketClosureDM:', hasComponents: !!ticketsData.TicketClosureDM?.Components },
                    { pattern: /^\s{2}Embed:\s*$/, data: ticketsData.Alert?.Embed, after: 'Alert:', notAfter: 'DM:', hasComponents: !!ticketsData.Alert?.Components },
                    { pattern: /^\s{4}Embed:\s*$/, data: ticketsData.Alert?.DM?.Embed, after: 'DM:', hasComponents: !!ticketsData.Alert?.DM?.Components },
                    { pattern: /^\s{2}Embed:\s*$/, data: ticketsData.Reviews?.Embed, after: 'Reviews:', hasComponents: !!ticketsData.Reviews?.Components },
                    { pattern: /^\s{4}Embed:\s*$/, data: ticketsData.Logs?.Close?.Embed, after: 'Close:', hasComponents: !!ticketsData.Logs?.Close?.Components },
                ];
                
                if (ticketsData.TicketPanelSettings) {
                    for (const panelKey of Object.keys(ticketsData.TicketPanelSettings)) {
                        if (ticketsData.TicketPanelSettings[panelKey]?.Embed) {
                            embedSections.push({ 
                                pattern: /^\s{4}Embed:\s*$/, 
                                data: ticketsData.TicketPanelSettings[panelKey].Embed, 
                                after: `${panelKey}:`,
                                hasComponents: !!ticketsData.TicketPanelSettings[panelKey]?.Components
                            });
                        }
                    }
                }
                
                if (ticketsData.TicketCreation) {
                    for (const typeKey of Object.keys(ticketsData.TicketCreation)) {
                        if (ticketsData.TicketCreation[typeKey]?.Embed) {
                            embedSections.push({ 
                                pattern: /^\s{4}Embed:\s*$/, 
                                data: ticketsData.TicketCreation[typeKey].Embed, 
                                after: `${typeKey}:`,
                                hasComponents: !!ticketsData.TicketCreation[typeKey]?.Components
                            });
                        }
                    }
                }
                
                for (const section of embedSections) {
                    if (!section.data) continue;
                    
                    let afterIdx = -1;
                    for (let i = 0; i < lines.length; i++) {
                        if (lines[i].includes(section.after)) {
                            afterIdx = i;
                            if (!section.notAfter) break;
                        }
                    }
                    if (afterIdx === -1) continue;
                    
                    for (let i = afterIdx + 1; i < lines.length; i++) {
                        if (section.pattern.test(lines[i])) {
                            if (section.notAfter) {
                                let foundNotAfter = false;
                                for (let j = afterIdx + 1; j < i; j++) {
                                    if (lines[j].includes(section.notAfter)) {
                                        foundNotAfter = true;
                                        break;
                                    }
                                }
                                if (foundNotAfter) continue;
                            }
                            
                            if (section.hasComponents) {
                                lines = removeEmbedBlock(lines, i);
                                changed = true;
                            } else {
                                const result = replaceEmbedBlock(lines, i, section.data);
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
                    writeYaml(ticketsPath, lines.join('\n'));
                }
            } catch (err) {
                // Migration failed - leave file as-is
            }
        }
        
        // Legacy migration checks
        const lines = ticketsContent.split('\n');
        const hasTopLevelUseComponentsV2 = lines.some(l => /^UseComponentsV2\s*:/i.test(l.trim()));
        const hasTopLevelComponentsV2Section = lines.some(l => /^ComponentsV2\s*:\s*(?:#.*)?$/.test(l.trim()));
        const hasPerSectionComponentsV2 = lines.some(l => /^\s+UseComponentsV2\s*:/i.test(l));
        const hasNewFormat = /^\s+Components:\s*$/m.test(ticketsContent);
        
        if (hasPerSectionComponentsV2 || hasNewFormat) {
            // Skip legacy migration
        } else if (false) {
        
        const hasUseComponentsV2 = hasTopLevelUseComponentsV2;
        const hasComponentsV2Section = hasTopLevelComponentsV2Section;
        
        if (!hasUseComponentsV2 || !hasComponentsV2Section) {
            let modified = false;
            
            if (!hasUseComponentsV2) {
                const ticketSystemIdx = lines.findIndex(l => /^#.*TICKET SYSTEM CONFIGURATION/i.test(l));
                if (ticketSystemIdx !== -1) {
                    let insertIdx = ticketSystemIdx;
                    for (let i = ticketSystemIdx + 1; i < lines.length; i++) {
                        if (lines[i].trim().startsWith('#') || lines[i].trim() === '') {
                            insertIdx = i;
                        } else {
                            break;
                        }
                    }
                    const useComponentsV2Block = [
                        '',
                        '# ===========================================================================',
                        '# MESSAGE STYLE - Choose between "embed" or "container"',
                        '# ===========================================================================',
                        '# "embed" - Traditional Discord embeds (default)',
                        '# "container" - Modern ComponentsV2 containers with accent colors',
                        'UseComponentsV2: false',
                        ''
                    ];
                    lines.splice(insertIdx + 1, 0, ...useComponentsV2Block);
                    modified = true;
                }
            }
            
            if (!hasComponentsV2Section) {
                const componentsV2Block = `
# ===========================================================================
# COMPONENTSV2 TEMPLATES (Used when UseComponentsV2: true)
# ===========================================================================
ComponentsV2:
  Panel:
Components:
  - Type: "container"
    AccentColor: "#5865F2"
    Components:
      - Type: "section"
        Text:
          Content: "# ­ƒô® Support Tickets\\n\\nSelect a category below for assistance."
        Accessory:
          Type: "thumbnail"
          Media:
            URL: "{guildIcon}"
      - Type: "separator"
      - Type: "text_display"
        Content: "­ƒòÆ **Working Hours:** {workinghours_start_monday} - {workinghours_end_monday}"
      - Type: "text_display"
        Content: "-# Response times may vary outside working hours"

  TicketCreated:
Default:
  Components:
    - Type: "container"
      AccentColor: "#5865F2"
      Components:
        - Type: "section"
          Text:
            Content: "# ­ƒÄ½ New Support Ticket\\n\\nWelcome {user}!"
          Accessory:
            Type: "thumbnail"
            Media:
              URL: "{userIcon}"
        - Type: "separator"
        - Type: "text_display"
          Content: "­ƒôï **Type:** {ticketType}\\nÔÅ░ **Response Time:** Within 24 hours\\n­ƒæñ **Claimed By:** {claimer}"
        - Type: "text_display"
          Content: "{questions}"
        - Type: "separator"
        - Type: "text_display"
          Content: "-# Our support team will assist you shortly"

  DelayedResponse:
Components:
  - Type: "container"
    AccentColor: "#f59e0b"
    Components:
      - Type: "text_display"
        Content: "# ­ƒÄ½ High Support Volume\\n\\nWe are experiencing higher than usual ticket volume."
      - Type: "separator"
      - Type: "text_display"
        Content: "­ƒôè **Active Tickets:** {openTickets}\\nÔÅ▒´©Å **Est. Response:** 24-48 hours\\n­ƒöä **Status:** Processing in order"
      - Type: "separator"
      - Type: "text_display"
        Content: "-# Your ticket will still be created ┬À Thank you for your patience"

  CloseRequest:
Components:
  - Type: "container"
    AccentColor: "#eab308"
    Components:
      - Type: "text_display"
        Content: "# ­ƒô® Close Request\\n\\nHey {user}!"
      - Type: "separator"
      - Type: "text_display"
        Content: "**{staff}** has requested to close this ticket.\\n\\n­ƒôØ **Reason:** {reason}"
      - Type: "separator"
      - Type: "text_display"
        Content: "Ô£à Click **Accept** if your issue is resolved\\nÔØî Click **Decline** if you still need help"

  WorkingHours:
Components:
  - Type: "container"
    AccentColor: "#eab308"
    Components:
      - Type: "text_display"
        Content: "# ÔÅ░ Outside Working Hours\\n\\nThis ticket has been raised outside of working hours."
      - Type: "separator"
      - Type: "text_display"
        Content: "­ƒòÉ **Working Hours:** {workinghours_start} - {workinghours_end}"
      - Type: "text_display"
        Content: "-# Our response may be delayed"

  Archive:
Components:
  - Type: "container"
    AccentColor: "#6b7280"
    Components:
      - Type: "text_display"
        Content: "# ­ƒÄ½ Ticket Archived\\n\\nThis ticket has been closed and archived."
      - Type: "separator"
      - Type: "text_display"
        Content: "­ƒæñ **Creator:** {userTag}\\n­ƒôØ **Reason:** {reason}"
      - Type: "separator"
      - Type: "text_display"
        Content: "-# Use the buttons below to manage this ticket"

  UserLeft:
Components:
  - Type: "container"
    AccentColor: "#ef4444"
    Components:
      - Type: "section"
        Text:
          Content: "# ÔÜá´©Å User Alert\\n\\nThe creator of this ticket, **{user}** has left the server."
        Accessory:
          Type: "thumbnail"
          Media:
            URL: "{userIcon}"
      - Type: "text_display"
        Content: "-# User ID: {userId}"

  Alert:
Channel:
  Components:
    - Type: "container"
      AccentColor: "#ef4444"
      Components:
        - Type: "text_display"
          Content: "# ÔÜá´©Å Ticket Alert\\n\\nThis ticket requires attention."
        - Type: "separator"
        - Type: "text_display"
          Content: "­ƒæñ **User:** {user}\\nÔÅ░ **Time Until Close:** {time}\\n­ƒôØ **Reason:** {reason}"
        - Type: "separator"
        - Type: "text_display"
          Content: "-# This ticket will be automatically closed if no response is received"
DM:
  Components:
    - Type: "container"
      AccentColor: "#ef4444"
      Components:
        - Type: "text_display"
          Content: "# ÔÜá´©Å Ticket Alert\\n\\nHello {user}, your ticket requires attention."
        - Type: "separator"
        - Type: "text_display"
          Content: "­ƒÅá **Server:** {guild}\\nÔÅ░ **Time Until Close:** {time}\\n­ƒôØ **Reason:** {reason}"
        - Type: "separator"
        - Type: "text_display"
          Content: "-# Click the button below to go to your ticket"

  TicketClosure:
DM:
  Components:
    - Type: "container"
      AccentColor: "#5865F2"
      Components:
        - Type: "text_display"
          Content: "# ­ƒÄ½ Ticket Closed\\n\\n{userTag}, your ticket in **{guild}** has been closed."
        - Type: "separator"
        - Type: "text_display"
          Content: "­ƒôè **Messages:** {messageCount}\\nÔ¡É **Priority:** {priority}\\n­ƒæñ **Handled By:** {claimer}\\n­ƒôØ **Reason:** {reason}"
        - Type: "separator"
        - Type: "text_display"
          Content: "-# We value your feedback! Please leave us a review"

  Review:
Components:
  - Type: "container"
    AccentColor: "#eab308"
    Components:
      - Type: "text_display"
        Content: "# Ô¡É Ticket Review"
      - Type: "separator"
      - Type: "text_display"
        Content: "­ƒæñ **Creator:** {ticketCreator}\\n­ƒÄ½ **Ticket:** {channelName}\\n­ƒæ¿ÔÇì­ƒÆ╝ **Handled By:** {claimer}"
      - Type: "separator"
      - Type: "text_display"
        Content: "**Ratings**\\n{ratings}"
      - Type: "text_display"
        Content: "**Feedback**\\n{feedback}"

  Logs:
Close:
  Components:
    - Type: "container"
      AccentColor: "#5865F2"
      Components:
        - Type: "text_display"
          Content: "# ­ƒöÆ Ticket Closed"
        - Type: "separator"
        - Type: "text_display"
          Content: "**Closed By:** {userTag}\\n**Reason:** {reason}"
        - Type: "separator"
        - Type: "text_display"
          Content: "­ƒæñ **Creator:** {ticketCreator}\\n­ƒôè **Messages:** {messageCount}\\nÔ¡É **Priority:** {priority}\\n­ƒæ¿ÔÇì­ƒÆ╝ **Claimed By:** {claimer}"
        - Type: "separator"
        - Type: "text_display"
          Content: "­ƒÄ½ **Channel:** {channelName}"
`;
                lines.push(componentsV2Block);
                modified = true;
            }
            
            if (modified) {
                tickets = lines.join('\n');
                writeYaml(ticketsPath, tickets);
            }
        }
        } // Close else block for legacy migration
    }
} catch {}

    // Economy ComponentsV2 and Messages migration
    try {
        const economyPath = path.join(MODULES_DIR, 'economy.yml');
        let economy = readYamlIfExists(economyPath) || '';
        if (economy) {
            const lines = economy.split('\n');
            const hasComponentsV2 = lines.some(l => /^ComponentsV2\s*:\s*(?:#.*)?$/.test(l.trim()));
            const hasMessages = lines.some(l => /^Messages\s*:\s*(?:#.*)?$/.test(l.trim()));
            
            if (!hasComponentsV2 || !hasMessages) {
                const componentsV2Block = `
# ===========================================================================
# COMPONENTSV2 TEMPLATES
# ===========================================================================

ComponentsV2:
  Heist:
    MainMenu:
      Components:
        - Type: "container"
          AccentColor: "#1a1a2e"
          Components:
            - Type: "section"
              Text:
                Content: "## Heist HQ\\n\\n> Plan your perfect crime"
              Accessory:
                Type: "thumbnail"
                Media:
                  URL: "{userAvatar}"
            - Type: "text_display"
              Content: "**Balance:** {balance} coins\\n**Gear Bonus:** +{gearBonus}% success{statusText}"
            - Type: "text_display"
              Content: "-# Choose an action below"
    ActiveTarget:
      Content: "**Active Target:** {emoji} {name}\\n> Potential: **{reward}** coins\\n> Supplies: {supplyCost} {canAfford}\\n> Intel expires: {timeLeft}\\n> Plan: {planText}"
    LocationSelect:
      Components:
        - Type: "container"
          AccentColor: "#FF6B35"
          Components:
            - Type: "text_display"
              Content: "## Select Target\\n\\n> Choose your target wisely\\n\\n**Scout Cost:** {scoutCost} coins\\n**Your Balance:** {balance} coins"
            - Type: "text_display"
              Content: "-# Higher tiers require supplies to execute"
    TargetAcquired:
      Components:
        - Type: "container"
          AccentColor: "{color}"
          Components:
            - Type: "text_display"
              Content: "## {emoji} Target Acquired\\n\\n**{name}**\\n\\n> Difficulty: {stars}\\n> Base Success: **{baseSuccess}%**\\n> Potential Take: **{reward}** coins\\n> Supplies: {supplyCost}"
            - Type: "text_display"
              Content: "-# Scout cost: -{scoutCostPaid} ┬À Balance: {balance}"
    ApproachSelect:
      Components:
        - Type: "container"
          AccentColor: "#00CED1"
          Components:
            - Type: "text_display"
              Content: "## Select Approach\\n\\n**Target:** {targetName}\\n\\n> Each approach has different risk/reward trade-offs"
    PlanLocked:
      Components:
        - Type: "container"
          AccentColor: "{color}"
          Components:
            - Type: "text_display"
              Content: "## {emoji} Plan Locked\\n\\n**{approachName}**\\n\\n**Target:** {targetEmoji} {targetName}\\n\\n> Base: {baseSuccess}% + Approach: {approachMod}% + Gear: +{gearBonus}%\\n> **Success Chance: {finalSuccess}%**\\n> Estimated Take: **{estimatedReward}** coins\\n> Supplies: {supplyCost} {canAfford}"
            - Type: "text_display"
              Content: "-# {readyText}"
    HeistPhase:
      Components:
        - Type: "container"
          AccentColor: "{color}"
          Components:
            - Type: "text_display"
              Content: "## Phase {phase}/{total}\\n\\n\`{progressBar}\` **{percent}%**\\n\\n{targetEmoji} **{targetName}** | {approachEmoji} **{approachName}**"
            - Type: "separator"
            - Type: "text_display"
              Content: "**{eventText}**"
    PhaseSuccess:
      Components:
        - Type: "container"
          AccentColor: "#00FF00"
          Components:
            - Type: "text_display"
              Content: "## Ô£à Phase {phase} Complete\\n\\n**{choice}** - Success!\\n\\n> Bonus: +{bonus}% reward"
    PhaseFail:
      Components:
        - Type: "container"
          AccentColor: "#FFA500"
          Components:
            - Type: "text_display"
              Content: "## ÔÜá´©Å Phase {phase} - Complication\\n\\n**{choice}** - Things got messy...\\n\\n> Success chance reduced"
    HeistSuccess:
      Components:
        - Type: "container"
          AccentColor: "#00FF00"
          Components:
            - Type: "text_display"
              Content: "## ­ƒÆ░ Heist Successful\\n\\n{targetEmoji} **{targetName}** has been hit!\\n\\n> Base Take: {baseReward} coins\\n> Multiplier: {multiplier}x\\n> **Final Take: {finalReward} coins**"
            - Type: "text_display"
              Content: "-# Balance: {balance} coins"
    HeistFail:
      Components:
        - Type: "container"
          AccentColor: "#FF0000"
          Components:
            - Type: "text_display"
              Content: "## ­ƒÜö Heist Failed\\n\\nThe **{targetName}** job went south...\\n\\n> You barely escaped with nothing."
            - Type: "text_display"
              Content: "-# Balance: {balance} coins"
    Intel:
      Components:
        - Type: "container"
          AccentColor: "#2C3E50"
          Components:
            - Type: "section"
              Text:
                Content: "## Classified Intel\\n\\n> Known Locations & Approaches\\n\\n**Your Gear Bonus:** +{gearBonus}%"
              Accessory:
                Type: "thumbnail"
                Media:
                  URL: "{userAvatar}"
    History:
      Components:
        - Type: "container"
          AccentColor: "#8B4513"
          Components:
            - Type: "text_display"
              Content: "## Heist History\\n\\n> Your Criminal Record\\n\\n**Successful:** {successCount}\\n**Failed:** {failCount}\\n**Total Earnings:** {totalEarnings} coins"
    GearShop:
      Components:
        - Type: "container"
          AccentColor: "#FFD700"
          Components:
            - Type: "text_display"
              Content: "## Gear Shop\\n\\n> Collect sets for bonus success!\\n\\n**Balance:** {balance} coins\\n**Total Bonus:** +{gearBonus}% success{setsComplete}\\n\\n**Set Progress:**\\n{setDisplay}"
    GearPurchased:
      Components:
        - Type: "container"
          AccentColor: "#00FF00"
          Components:
            - Type: "text_display"
              Content: "## Gear Purchased\\n\\n**{emoji} {name}**\\n> +{bonus}% success bonus gained!\\n\\n**Balance:** {balance} coins\\n**Total Bonus:** +{totalBonus}% success"
    InsufficientFunds:
      Components:
        - Type: "container"
          AccentColor: "#FF0000"
          Components:
            - Type: "text_display"
              Content: "## Insufficient Funds\\n\\n> You need **{required}** coins\\n> Your balance: **{balance}** coins"
    Cooldown:
      Components:
        - Type: "container"
          AccentColor: "#ED4245"
          Components:
            - Type: "text_display"
              Content: "## Heist ┬À Cooldown\\n\\n> Available <t:{nextUse}:R>\\n\\n**Remaining:** {timeRemaining}"

  Booster:
    View:
      Components:
        - Type: "container"
          AccentColor: "#57F287"
          Components:
            - Type: "text_display"
              Content: "## Active Boosters\\n\\n{boosterList}"
    NoBoosters:
      Components:
        - Type: "container"
          AccentColor: "#5865F2"
          Components:
            - Type: "text_display"
              Content: "## Boosters\\n\\n> You don't have any active boosters.\\n\\n-# Purchase boosters from the store"

  Trivia:
    Question:
      Components:
        - Type: "container"
          AccentColor: "#5865F2"
          Components:
            - Type: "text_display"
              Content: "## Trivia ┬À Question {current}/{total}\\n\\n**{question}**\\n\\n-# Category: {category}"
            - Type: "separator"
            - Type: "text_display"
              Content: "\`{progressBar}\` {progressText}\\n\\n**Correct:** {correct} ┬À **Points:** {points}"
    Cooldown:
      Components:
        - Type: "container"
          AccentColor: "#ED4245"
          Components:
            - Type: "text_display"
              Content: "## Trivia ┬À Cooldown\\n\\n> You've already played recently.\\n> Next game: <t:{nextGame}:F>\\n> Remaining: **{timeRemaining}**\\n\\n-# Cooldown is dynamic based on performance"
    Results:
      Components:
        - Type: "container"
          AccentColor: "{color}"
          Components:
            - Type: "text_display"
              Content: "## Trivia ┬À Results\\n\\n**{resultMessage}**\\n\\n> **Score:** {correct}/{total} correct\\n> **Points Earned:** {points}\\n> **Next Game:** {cooldownText}"
            - Type: "text_display"
              Content: "-# Thanks for playing!"
    Roll:
      Components:
        - Type: "container"
          AccentColor: "{color}"
          Components:
            - Type: "text_display"
              Content: "## Roll ┬À {resultText}\\n\\n­ƒÄ▓ You rolled **{roll}**\\n\\n> **Your Bet:** {betType}\\n> **{outcomeLabel}:** {netGain}\\n> **Balance:** {balance}"
            - Type: "text_display"
              Content: "-# Total Games: {totalGames} ┬À Win Rate: {winRate}%"

# ===========================================================================
# COMPONENTSV2 MESSAGE TEMPLATES
# ===========================================================================
Messages:
  Daily:
    Claimed:
      Components:
        - Type: "container"
          AccentColor: "#22c55e"
          Components:
            - Type: "section"
              Text:
                Content: "## Daily Reward\\n\\nYou received **{amount}** coins"
              Accessory:
                Type: "thumbnail"
                Media:
                  URL: "{userAvatar}"
            - Type: "text_display"
              Content: "**Streak** {streak} days  ┬À  **Bonus** +{bonusPercent}%\\n{progressBar}"
            - Type: "text_display"
              Content: "-# {footer}"
    Cooldown:
      Components:
        - Type: "container"
          AccentColor: "#eab308"
          Components:
            - Type: "text_display"
              Content: "## Daily\\n\\nAvailable <t:{nextUse}:R>"
            - Type: "text_display"
              Content: "-# Streak: {streak} days ┬À Bonus: +{bonusPercent}%"
    StreakReset:
      Content: "> Your streak was reset"
    Milestone:
      Content: "> {streak} day streak!"

  Beg:
    Success:
      Components:
        - Type: "container"
          AccentColor: "#a855f7"
          Components:
            - Type: "text_display"
              Content: "{message}"
            - Type: "text_display"
              Content: "-# Balance: {balance}"

  Work:
    Success:
      Components:
        - Type: "container"
          AccentColor: "#3b82f6"
          Components:
            - Type: "text_display"
              Content: "{message}"
            - Type: "text_display"
              Content: "-# Balance: {balance}"

  Crime:
    Success:
      Components:
        - Type: "container"
          AccentColor: "#22c55e"
          Components:
            - Type: "text_display"
              Content: "{message}"
            - Type: "text_display"
              Content: "-# Balance: {balance}"
    Fail:
      Components:
        - Type: "container"
          AccentColor: "#ef4444"
          Components:
            - Type: "text_display"
              Content: "{message}"
            - Type: "text_display"
              Content: "-# Balance: {balance}"

  Rob:
    Success:
      Components:
        - Type: "container"
          AccentColor: "#22c55e"
          Components:
            - Type: "text_display"
              Content: "{message}"
            - Type: "text_display"
              Content: "-# Balance: {balance}"
    Fail:
      Components:
        - Type: "container"
          AccentColor: "#ef4444"
          Components:
            - Type: "text_display"
              Content: "{message}"
            - Type: "text_display"
              Content: "-# Balance: {balance}"

  Deposit:
    Success:
      Components:
        - Type: "container"
          AccentColor: "#6366f1"
          Components:
            - Type: "text_display"
              Content: "## Deposit\\n\\nDeposited **{amount}** coins"
            - Type: "text_display"
              Content: "Bank: {bankBalance}  ┬À  Wallet: {balance}"

  Withdraw:
    Success:
      Components:
        - Type: "container"
          AccentColor: "#6366f1"
          Components:
            - Type: "text_display"
              Content: "## Withdraw\\n\\nWithdrew **{amount}** coins"
            - Type: "text_display"
              Content: "-# Wallet: {balance}"

  Transfer:
    Success:
      Components:
        - Type: "container"
          AccentColor: "#06b6d4"
          Components:
            - Type: "text_display"
              Content: "## Transfer\\n\\nSent **{amount}** coins to {target}"
            - Type: "text_display"
              Content: "-# Remaining: {balance}"

  Cooldown:
    Beg:
      Components:
        - Type: "container"
          AccentColor: "#78716c"
          Components:
            - Type: "text_display"
              Content: "## Beg\\n\\nAvailable <t:{nextUse}:R>"
            - Type: "text_display"
              Content: "-# Balance: {balance}"
    Work:
      Components:
        - Type: "container"
          AccentColor: "#78716c"
          Components:
            - Type: "text_display"
              Content: "## Work\\n\\nAvailable <t:{nextUse}:R>"
            - Type: "text_display"
              Content: "-# Balance: {balance}"
    Crime:
      Components:
        - Type: "container"
          AccentColor: "#78716c"
          Components:
            - Type: "text_display"
              Content: "## Crime\\n\\nAvailable <t:{nextUse}:R>"
            - Type: "text_display"
              Content: "-# Balance: {balance}"
    Rob:
      Components:
        - Type: "container"
          AccentColor: "#78716c"
          Components:
            - Type: "text_display"
              Content: "## Rob\\n\\nAvailable <t:{nextUse}:R>"
            - Type: "text_display"
              Content: "-# Balance: {balance}"

  Error:
    NoMoney:
      Components:
        - Type: "container"
          AccentColor: "#ef4444"
          Components:
            - Type: "text_display"
              Content: "## Insufficient Funds\\n\\nYou don't have enough coins for this action."

  Games:
    Blackjack:
      Components:
        - Type: "container"
          AccentColor: "{color}"
          Components:
            - Type: "text_display"
              Content: "-# Dealer ┬À {dealerValue}\\n{dealerHand}\\n\\n-# You ┬À {playerValue}\\n{playerHand}{result}"
            - Type: "text_display"
              Content: "-# Bet: {bet}  ┬À  Balance: {balance}"
    Slot:
      Components:
        - Type: "container"
          AccentColor: "{color}"
          Components:
            - Type: "text_display"
              Content: "{reels}\\n\\n**{resultText}**"
            - Type: "text_display"
              Content: "{outcomeLabel}: {netGain}  ┬À  Balance: {balance}"
            - Type: "text_display"
              Content: "-# Streak: {streak} ┬À Best: {bestStreak}{bonusText}"
    Coinflip:
      Components:
        - Type: "container"
          AccentColor: "{color}"
          Components:
            - Type: "text_display"
              Content: "The coin landed on **{result}**"
            - Type: "text_display"
              Content: "Guess: {guess}  ┬À  {outcomeLabel}: {netGain}\\nBalance: {balance}"
            - Type: "text_display"
              Content: "-# Streak: {streak} ┬À Best: {bestStreak} ┬À Win Rate: {winRate}%"
    Roulette:
      Components:
        - Type: "container"
          AccentColor: "{color}"
          Components:
            - Type: "text_display"
              Content: "The ball landed on **{resultNum} {resultColor}**"
            - Type: "text_display"
              Content: "Bet: {betType}  ┬À  {outcomeLabel}: {netGain}\\nBalance: {balance}"
            - Type: "text_display"
              Content: "-# Win Rate: {winRate}% ┬À Biggest: {biggestWin}"
`;
                
                if (!hasComponentsV2 && !hasMessages) {
                    // Add both sections at the end
                    const sep = economy.endsWith('\n') ? '' : '\n';
                    economy = economy + sep + componentsV2Block;
                } else if (!hasComponentsV2) {
                    // Find Messages section and insert ComponentsV2 before it
                    const msgIdx = lines.findIndex(l => /^Messages\s*:\s*(?:#.*)?$/.test(l.trim()));
                    if (msgIdx !== -1) {
                        const componentsOnly = componentsV2Block.split('# ===========================================================================\n# COMPONENTSV2 MESSAGE TEMPLATES')[0];
                        lines.splice(msgIdx, 0, ...componentsOnly.split('\n'));
                        economy = lines.join('\n');
                    }
                } else if (!hasMessages) {
                    // Add only Messages at the end
                    const messagesBlock = componentsV2Block.split('# ===========================================================================\n# COMPONENTSV2 MESSAGE TEMPLATES')[1];
                    const sep = economy.endsWith('\n') ? '' : '\n';
                    economy = economy + sep + '# ===========================================================================\n# COMPONENTSV2 MESSAGE TEMPLATES' + messagesBlock;
                }
                
                writeYaml(economyPath, economy);
            }
        }
    } catch {}

    try {
        const rolesPath = path.join(MODULES_DIR, 'roles.yml');
        let roles = readYamlIfExists(rolesPath) || '';
        if (roles) {
            const lines = roles.split('\n');
            let modified = false;
            const rrIdx = lines.findIndex(l => /^ReactionRoles\s*:\s*(?:#.*)?$/.test(l.trim()));
            if (rrIdx !== -1) {
                const rrIndent = computeIndent(lines[rrIdx]);
                let i = rrIdx + 1;
                while (i < lines.length) {
                    const t = lines[i].trim();
                    const ind = computeIndent(lines[i]);
                    if (t !== '' && ind <= rrIndent) break;
                    if (ind === rrIndent + 2 && /^Enabled\s*:/i.test(t)) {
                        i++;
                        continue;
                    }
                    if (ind === rrIndent + 2 && t !== '' && !/^Enabled\s*:/i.test(t)) {
                        let panelEnd = i + 1;
                        for (let j = i + 1; j < lines.length; j++) {
                            const pt = lines[j].trim();
                            const pind = computeIndent(lines[j]);
                            if (pt !== '' && pind <= ind) { panelEnd = j; break; }
                            panelEnd = j + 1;
                        }
                        let hasUseComponentsV2 = false;
                        let hasComponentsV2 = false;
                        let embedEndIdx = -1;
                        for (let k = i + 1; k < panelEnd; k++) {
                            const kt = lines[k].trim();
                            const kind = computeIndent(lines[k]);
                            if (kind === ind + 2) {
                                if (/^UseComponentsV2\s*:/i.test(kt)) hasUseComponentsV2 = true;
                                if (/^ComponentsV2\s*:/i.test(kt)) hasComponentsV2 = true;
                                if (/^Embed\s*:/i.test(kt)) {
                                    embedEndIdx = k + 1;
                                    for (let m = k + 1; m < panelEnd; m++) {
                                        const mt = lines[m].trim();
                                        const mind = computeIndent(lines[m]);
                                        if (mt !== '' && mind <= kind) { embedEndIdx = m; break; }
                                        embedEndIdx = m + 1;
                                    }
                                }
                            }
                        }
                        if (!hasUseComponentsV2 && embedEndIdx !== -1) {
                            const indentStr = ' '.repeat(ind + 2);
                            const insertIdx = lines.findIndex((l, idx) => idx > i && idx < panelEnd && /^Embed\s*:/i.test(l.trim()));
                            if (insertIdx !== -1) {
                                lines.splice(insertIdx, 0, `${indentStr}UseComponentsV2: false`);
                                modified = true;
                                panelEnd++;
                                embedEndIdx++;
                            }
                        }
                        if (!hasComponentsV2 && embedEndIdx !== -1) {
                            const indentStr = ' '.repeat(ind + 2);
                            const componentsBlock = [
                                `${indentStr}ComponentsV2:`,
                                `${indentStr}  Components:`,
                                `${indentStr}    - Type: "container"`,
                                `${indentStr}      AccentColor: "#5865F2"`,
                                `${indentStr}      Components:`,
                                `${indentStr}        - Type: "section"`,
                                `${indentStr}          Text:`,
                                `${indentStr}            Content: "**ROLE SELECTION**\\n\\nSelect your preferences below to customize your server experience.\\n\\n-# React to toggle  ┬À  Reaction Roles"`,
                                `${indentStr}          Accessory:`,
                                `${indentStr}            Type: "thumbnail"`,
                                `${indentStr}            Media:`,
                                `${indentStr}              URL: "https://i.imgur.com/w5XxKpc.png"`
                            ];
                            lines.splice(embedEndIdx, 0, ...componentsBlock);
                            modified = true;
                            panelEnd += componentsBlock.length;
                        }
                        i = panelEnd;
                    } else {
                        i++;
                    }
                }
            }
            if (modified) {
                writeYaml(rolesPath, lines.join('\n'));
            }
        }
    } catch {}

    try {
        const welcomePath = path.join(MODULES_DIR, 'welcome.yml');
        let welcome = readYamlIfExists(welcomePath) || '';
        if (welcome) {
            const lines = welcome.split('\n');
            let modified = false;

            const addComponentsV2ToSection = (sectionKey, componentsBlock, useComponentsV2Line) => {
                const secRe = new RegExp(`^${sectionKey.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\s*:\\s*(?:#.*)?$`);
                const secStart = lines.findIndex(l => secRe.test(l.trim()));
                if (secStart === -1) return;
                const secIndent = computeIndent(lines[secStart]);
                let secEnd = secStart + 1;
                for (let i = secStart + 1; i < lines.length; i++) {
                    const t = lines[i].trim();
                    const ind = computeIndent(lines[i]);
                    if (t !== '' && ind <= secIndent) { secEnd = i; break; }
                    secEnd = i + 1;
                }

                let hasUseComponentsV2 = false;
                let hasComponentsV2 = false;
                let channelIdIdx = -1;
                let embedEndIdx = -1;
                let embedIndent = 0;

                for (let i = secStart + 1; i < secEnd; i++) {
                    const t = lines[i].trim();
                    const ind = computeIndent(lines[i]);
                    if (ind === secIndent + 2) {
                        if (/^UseComponentsV2\s*:/i.test(t)) hasUseComponentsV2 = true;
                        if (/^ComponentsV2\s*:/i.test(t)) hasComponentsV2 = true;
                        if (/^ChannelID\s*:/i.test(t)) channelIdIdx = i;
                        if (/^Embed\s*:/i.test(t)) {
                            embedIndent = ind;
                            embedEndIdx = i + 1;
                            for (let j = i + 1; j < secEnd; j++) {
                                const et = lines[j].trim();
                                const eind = computeIndent(lines[j]);
                                if (et !== '' && eind <= embedIndent) { embedEndIdx = j; break; }
                                embedEndIdx = j + 1;
                            }
                        }
                    }
                }

                if (!hasUseComponentsV2 && channelIdIdx !== -1) {
                    const indentStr = ' '.repeat(secIndent + 2);
                    lines.splice(channelIdIdx + 1, 0, `${indentStr}${useComponentsV2Line}`);
                    modified = true;
                    secEnd++;
                    if (embedEndIdx > channelIdIdx) embedEndIdx++;
                }

                if (!hasComponentsV2 && embedEndIdx !== -1) {
                    const indentStr = ' '.repeat(secIndent + 2);
                    const indentStr2 = ' '.repeat(secIndent + 4);
                    const indentStr3 = ' '.repeat(secIndent + 6);
                    const indentStr4 = ' '.repeat(secIndent + 8);
                    const indentStr5 = ' '.repeat(secIndent + 10);
                    const indentStr6 = ' '.repeat(secIndent + 12);
                    const block = componentsBlock(indentStr, indentStr2, indentStr3, indentStr4, indentStr5, indentStr6);
                    lines.splice(embedEndIdx, 0, ...block);
                    modified = true;
                }
            };

            const welcomeComponentsBlock = (i1, i2, i3, i4, i5, i6) => [
                '',
                `${i1}# ---------------------------------------------------------------------------`,
                `${i1}# COMPONENTS V2 FORMAT (when UseComponentsV2 is true)`,
                `${i1}# ---------------------------------------------------------------------------`,
                `${i1}ComponentsV2:`,
                `${i2}Components:`,
                `${i3}- Type: "container"`,
                `${i4}AccentColor: "#5865F2"`,
                `${i4}Spoiler: false`,
                `${i4}Components:`,
                `${i5}- Type: "section"`,
                `${i6}Text:`,
                `${i6}  Content: "# Welcome, {userName}\\n\\nYou've joined **{guildName}** ÔÇö we're glad to have you."`,
                `${i6}Accessory:`,
                `${i6}  Type: "thumbnail"`,
                `${i6}  Media:`,
                `${i6}    Url: "{userAvatar}"`,
                `${i5}`,
                `${i5}- Type: "separator"`,
                `${i6}Divider: true`,
                `${i6}Spacing: "small"`,
                `${i5}`,
                `${i5}- Type: "text_display"`,
                `${i6}Content: "**Invited by** {invitedBy} ┬À {invitedByCount} invites\\n**Joined** {joinDate}\\n**Account created** {UserCreation}\\n**Member** #{memberCountNumeric}"`,
                `${i5}`,
                `${i5}- Type: "separator"`,
                `${i6}Divider: false`,
                `${i6}Spacing: "small"`,
                `${i5}`,
                `${i5}- Type: "section"`,
                `${i6}Text:`,
                `${i6}  Content: "-# Take a moment to read our rules and introduce yourself."`,
                `${i6}Accessory:`,
                `${i6}  Type: "button"`,
                `${i6}  Style: "Secondary"`,
                `${i6}  Label: "Get Started"`,
                `${i6}  Url: "https://discord.com"`,
                ''
            ];

            const leaveComponentsBlock = (i1, i2, i3, i4, i5, i6) => [
                '',
                `${i1}# ---------------------------------------------------------------------------`,
                `${i1}# COMPONENTS V2 FORMAT (when UseComponentsV2 is true)`,
                `${i1}# ---------------------------------------------------------------------------`,
                `${i1}ComponentsV2:`,
                `${i2}Components:`,
                `${i3}- Type: "container"`,
                `${i4}AccentColor: "#ED4245"`,
                `${i4}Spoiler: false`,
                `${i4}Components:`,
                `${i5}- Type: "section"`,
                `${i6}Text:`,
                `${i6}  Content: "# {userName} left\\n\\n**{memberCountNumeric}** members remain."`,
                `${i6}Accessory:`,
                `${i6}  Type: "thumbnail"`,
                `${i6}  Media:`,
                `${i6}    Url: "{userAvatar}"`,
                ''
            ];

            addComponentsV2ToSection('WelcomeMessage', welcomeComponentsBlock, 'UseComponentsV2: false # Set to true to use Discord\'s new Components V2 format instead of embeds');
            addComponentsV2ToSection('LeaveMessage', leaveComponentsBlock, 'UseComponentsV2: false # Set to true to use Discord\'s new Components V2 format instead of embeds');

            const wmIdx = lines.findIndex(l => /^WelcomeMessage\s*:\s*(?:#.*)?$/.test(l.trim()));
            if (wmIdx !== -1) {
                const wmIndent = computeIndent(lines[wmIdx]);
                let wmEnd = wmIdx + 1;
                for (let i = wmIdx + 1; i < lines.length; i++) {
                    const t = lines[i].trim();
                    const ind = computeIndent(lines[i]);
                    if (t !== '' && ind <= wmIndent) { wmEnd = i; break; }
                    wmEnd = i + 1;
                }

                let dmIdx = -1;
                for (let i = wmIdx + 1; i < wmEnd; i++) {
                    const t = lines[i].trim();
                    const ind = computeIndent(lines[i]);
                    if (ind === wmIndent + 2 && /^DM\s*:\s*(?:#.*)?$/.test(t)) {
                        dmIdx = i;
                        break;
                    }
                }

                if (dmIdx !== -1) {
                    const dmIndent = computeIndent(lines[dmIdx]);
                    let dmEnd = dmIdx + 1;
                    for (let i = dmIdx + 1; i < wmEnd; i++) {
                        const t = lines[i].trim();
                        const ind = computeIndent(lines[i]);
                        if (t !== '' && ind <= dmIndent) { dmEnd = i; break; }
                        dmEnd = i + 1;
                    }

                    let hasUseComponentsV2 = false;
                    let hasComponentsV2 = false;
                    let enabledIdx = -1;
                    let embedEndIdx = -1;

                    for (let i = dmIdx + 1; i < dmEnd; i++) {
                        const t = lines[i].trim();
                        const ind = computeIndent(lines[i]);
                        if (ind === dmIndent + 2) {
                            if (/^UseComponentsV2\s*:/i.test(t)) hasUseComponentsV2 = true;
                            if (/^ComponentsV2\s*:/i.test(t)) hasComponentsV2 = true;
                            if (/^Enabled\s*:/i.test(t)) enabledIdx = i;
                            if (/^Embed\s*:/i.test(t)) {
                                const embedIndent = ind;
                                embedEndIdx = i + 1;
                                for (let j = i + 1; j < dmEnd; j++) {
                                    const et = lines[j].trim();
                                    const eind = computeIndent(lines[j]);
                                    if (et !== '' && eind <= embedIndent) { embedEndIdx = j; break; }
                                    embedEndIdx = j + 1;
                                }
                            }
                        }
                    }

                    if (!hasUseComponentsV2 && enabledIdx !== -1) {
                        const indentStr = ' '.repeat(dmIndent + 2);
                        lines.splice(enabledIdx + 1, 0, `${indentStr}UseComponentsV2: false # Set to true to use Discord's new Components V2 format for DMs`);
                        modified = true;
                        dmEnd++;
                        wmEnd++;
                        if (embedEndIdx > enabledIdx) embedEndIdx++;
                    }

                    if (!hasComponentsV2 && embedEndIdx !== -1) {
                        const i1 = ' '.repeat(dmIndent + 2);
                        const i2 = ' '.repeat(dmIndent + 4);
                        const i3 = ' '.repeat(dmIndent + 6);
                        const i4 = ' '.repeat(dmIndent + 8);
                        const i5 = ' '.repeat(dmIndent + 10);
                        const i6 = ' '.repeat(dmIndent + 12);
                        const dmBlock = [
                            '',
                            `${i1}# ---------------------------------------------------------------------------`,
                            `${i1}# COMPONENTS V2 FORMAT (when UseComponentsV2 is true)`,
                            `${i1}# ---------------------------------------------------------------------------`,
                            `${i1}ComponentsV2:`,
                            `${i2}Components:`,
                            `${i3}- Type: "container"`,
                            `${i4}AccentColor: "#5865F2"`,
                            `${i4}Spoiler: false`,
                            `${i4}Components:`,
                            `${i5}- Type: "section"`,
                            `${i6}Text:`,
                            `${i6}  Content: "# Welcome to {guildName}\\n\\nHey {userName}, thanks for joining. You're member **#{memberCountNumeric}**."`,
                            `${i6}Accessory:`,
                            `${i6}  Type: "thumbnail"`,
                            `${i6}  Media:`,
                            `${i6}    Url: "{guildIcon}"`,
                            `${i5}`,
                            `${i5}- Type: "separator"`,
                            `${i6}Divider: true`,
                            `${i6}Spacing: "small"`,
                            `${i5}`,
                            `${i5}- Type: "text_display"`,
                            `${i6}Content: "Head over to the server to get started. We recommend reading our rules and introducing yourself to the community."`,
                            `${i5}`,
                            `${i5}- Type: "separator"`,
                            `${i6}Divider: false`,
                            `${i6}Spacing: "small"`,
                            `${i5}`,
                            `${i5}- Type: "section"`,
                            `${i6}Text:`,
                            `${i6}  Content: "-# Questions? Open a ticket or ask in our support channel."`,
                            `${i6}Accessory:`,
                            `${i6}  Type: "button"`,
                            `${i6}  Style: "Primary"`,
                            `${i6}  Label: "Open Server"`,
                            `${i6}  Url: "https://discord.com"`,
                            ''
                        ];
                        lines.splice(embedEndIdx, 0, ...dmBlock);
                        modified = true;
                    }
                }
            }

            if (modified) {
                welcome = lines.join('\n');
                writeYaml(welcomePath, welcome);
            }
        }
    } catch {}

    // Verification migration handled entirely by 1.9.7_2 updater

};
