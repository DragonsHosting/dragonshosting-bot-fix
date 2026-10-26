module.exports = function apply(helpers) {
    const {
        fs, crypto, path, yaml, colors,
        CONFIG_DIR, MODULES_DIR, CORE_CONFIG_PATH,
        compareVersions, readYamlIfExists, writeYaml, computeIndent,
        appendSubblockAtBottom, insertSubblockAfterEmbedThumbnail,
        insertSubblockBeforeChild, ensureTopKey, renameTopKey, removeTopKey,
        addNestedDefault
    } = helpers;

try {
    const corePath = path.join(CONFIG_DIR, 'core.yml');
    let core = readYamlIfExists(corePath) || '';
    if (core) {
        let lines = core.split('\n');
        const hasKey = (k) => lines.some(l => new RegExp(`^${k.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\s*:`).test(l.trim()));
        const legacyPath = path.join(__dirname, '..', '..', '..', '..', 'config_legacy.yml');
        let legacyLines = null;
        if (fs.existsSync(legacyPath)) {
            try { 
                const legacyContent = fs.readFileSync(legacyPath, 'utf8');
                const legacyConfig = yaml.load(legacyContent);
                
                const minSupportedVersion = "1.8.5";
                if (legacyConfig && legacyConfig.Version && compareVersions(legacyConfig.Version, minSupportedVersion) < 0) {
                    console.log('\n' + colors.bold.red('═══════════════════════════════════════════════════════════════════════'));
                    console.log(colors.bold.red('⚠️ UNSUPPORTED CONFIG VERSION'));
                    console.log(colors.bold.red('═══════════════════════════════════════════════════════════════════════'));
                    console.log(colors.red(`Your config version (${legacyConfig.Version}) is not supported!`));
                    console.log(colors.red(`Minimum required version: ${minSupportedVersion}`));
                    console.log('');
                    console.log(colors.yellow('Please update your configuration to match the current bot version.'));
                    console.log(colors.yellow('Do not manually change the version, the bot will not work.'));
                    console.log(colors.yellow('Visit: https://feather.dragonshosting.nl/'));
                    console.log(colors.bold.red('═══════════════════════════════════════════════════════════════════════'));
                    console.log('');
                    
                    process.exit(1);
                }
                
                legacyLines = legacyContent.split('\n'); 
            } catch {}
        }
        const getLegacyVal = (k, fb) => {
            if (!legacyLines) return fb;
            for (const ln of legacyLines) {
                const m = ln.match(new RegExp(`^${k.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\s*:\\s*(.*)$`));
                if (m) {
                    let value = m[1] || '';
                    if (value.startsWith('"') && value.includes('"', 1)) {
                        const endQuoteIndex = value.indexOf('"', 1);
                        value = value.substring(0, endQuoteIndex + 1);
                    } else if (value.startsWith("'") && value.includes("'", 1)) {
                        const endQuoteIndex = value.indexOf("'", 1);
                        value = value.substring(0, endQuoteIndex + 1);
                    } else {
                        const commentMatch = value.match(/^(.*?)(\s*#.*)?$/);
                        if (commentMatch) {
                            value = commentMatch[1];
                        }
                    }
                    return value.trim().replace(/^"|"$/g, '') || fb;
                }
            }
            return fb;
        };
        const insertAfterVersion = (arr, newLine) => {
            const idx = arr.findIndex(l => /^Version\s*:/i.test(l.trim()));
            const at = idx !== -1 ? idx + 1 : 0;
            const out = [...arr];
            out.splice(at, 0, newLine);
            return out;
        };
        let modified = false;
        if (!hasKey('BotToken')) {
            const v = getLegacyVal('BotToken', 'BOT_TOKEN');
            lines = insertAfterVersion(lines, `BotToken: "${v}"`);
            modified = true;
        }
        if (!hasKey('AutoUpdate')) {
            lines.push('');
            lines.push('# ===========================================================================');
            lines.push('# AUTO-UPDATE SETTINGS');
            lines.push('# ===========================================================================');
            lines.push('# When enabled, the bot will automatically check for and install updates.');
            lines.push('# Your config files and addons are preserved during updates.');
            lines.push('AutoUpdate: false');
            modified = true;
        }
        if (modified) {
            core = lines.join('\n');
            writeYaml(corePath, core);
        }
    }
} catch {}

try {
    const welcomePath = path.join(MODULES_DIR, 'welcome.yml');
    let welcome = readYamlIfExists(welcomePath) || '';
    const autoDeleteBlock = [
        'AutoDelete: # Auto delete the message after a certain time',
        '  Enabled: false',
        '  Delay: "15s"'
    ].join('\n');
    welcome = insertSubblockAfterEmbedThumbnail(welcome, 'WelcomeMessage', autoDeleteBlock);
    welcome = insertSubblockAfterEmbedThumbnail(welcome, 'LeaveMessage', autoDeleteBlock);
    if (welcome) writeYaml(welcomePath, welcome);
} catch {}

try {
    const welcomePath = path.join(MODULES_DIR, 'welcome.yml');
    let welcome = readYamlIfExists(welcomePath) || '';
    if (welcome) {
        const convertChannelIdToArray = (content, sectionKey) => {
            const lines = content.split('\n');
            const secRe = new RegExp(`^${sectionKey.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\s*:\\s*(?:#.*)?$`);
            const secStart = lines.findIndex(l => secRe.test(l.trim()));
            if (secStart === -1) return content;
            const secIndent = computeIndent(lines[secStart]);
            let secEnd = secStart + 1;
            for (let i = secStart + 1; i < lines.length; i++) {
                const t = lines[i].trim();
                const ind = computeIndent(lines[i]);
                if (t !== '' && ind <= secIndent) { secEnd = i; break; }
                secEnd = i + 1;
            }
            for (let i = secStart + 1; i < secEnd; i++) {
                const raw = lines[i];
                const t = raw.trim();
                const ind = computeIndent(raw);
                if (ind === secIndent + 2 && /^ChannelID\s*:\s*"[^"]*"\s*(?:#.*)?$/.test(t)) {
                    const match = t.match(/^ChannelID\s*:\s*"([^"]*)"\s*(#.*)?$/);
                    if (match) {
                        const value = match[1];
                        const comment = match[2] || '';
                        lines[i] = ' '.repeat(ind) + `ChannelID: ["${value}"]${comment ? ' ' + comment : ''}`;
                    }
                }
            }
            return lines.join('\n');
        };
        welcome = convertChannelIdToArray(welcome, 'WelcomeMessage');
        welcome = convertChannelIdToArray(welcome, 'LeaveMessage');
        writeYaml(welcomePath, welcome);
    }
} catch {}

try {
    const dashPath = path.join(MODULES_DIR, 'dashboard.yml');
    let dash = readYamlIfExists(dashPath) || '';
    if (dash) {
        const lines = dash.split('\n');
        const dIdx = lines.findIndex(l => /^Dashboard\s*:\s*(?:#.*)?$/.test(l.trim()));
        if (dIdx !== -1) {
            const dIndent = computeIndent(lines[dIdx]);
            let dEnd = dIdx + 1;
            for (let i = dIdx + 1; i < lines.length; i++) {
                const t = lines[i].trim();
                const ind = computeIndent(lines[i]);
                if (t !== '' && ind <= dIndent) { dEnd = i; break; }
                dEnd = i + 1;
            }
            let aIdx = -1, aIndent = 0;
            for (let i = dIdx + 1; i < dEnd; i++) {
                const t = lines[i].trim();
                const ind = computeIndent(lines[i]);
                if (ind === dIndent + 2 && /^Auth\s*:\s*(?:#.*)?$/.test(t)) { aIdx = i; aIndent = ind; break; }
            }
            if (aIdx === -1) {
                const ins = [];
                const is = ' '.repeat(dIndent + 2);
                const js = ' '.repeat(dIndent + 4);
                const gen = crypto.randomBytes(32).toString('hex');
                ins.push(`${is}Auth:`);
                ins.push(`${js}JWTSecret: "${gen}"`);
                const out = [...lines];
                out.splice(dEnd, 0, ...ins);
                dash = out.join('\n');
                writeYaml(dashPath, dash);
            } else {
                const jwtIdxs = [];
                for (let i = aIdx + 1; i < dEnd; i++) {
                    const t = lines[i].trim();
                    const ind = computeIndent(lines[i]);
                    if (t !== '' && ind <= aIndent) break;
                    if (/^JWTSecret\s*:\s*/.test(t)) jwtIdxs.push(i);
                }
                if (jwtIdxs.length === 0) {
                    const gen = crypto.randomBytes(32).toString('hex');
                    const line = ' '.repeat(aIndent + 2) + `JWTSecret: "${gen}"`;
                    const out = [...lines];
                    out.splice(aIdx + 1, 0, line);
                    dash = out.join('\n');
                    writeYaml(dashPath, dash);
                } else {
                    const keep = jwtIdxs[0];
                    const raw = lines[keep];
                    const m = raw.match(/^(\s*)JWTSecret\s*:\s*([^#]*?)(\s*(#.*)?)?$/);
                    const valPart = m ? (m[2] || '') : '';
                    const tail = m ? (m[3] || '') : '';
                    const valueOnly = valPart.trim().replace(/^\"|\"$/g,'');
                    const finalVal = (!valueOnly || valueOnly.length < 32) ? crypto.randomBytes(32).toString('hex') : valueOnly;
                    lines[keep] = ' '.repeat(aIndent + 2) + `JWTSecret: \"${finalVal}\"${tail ? ' ' + tail.trim() : ''}`;
                    for (let k = jwtIdxs.length - 1; k >= 1; k--) {
                        lines.splice(jwtIdxs[k], 1);
                        dEnd--;
                    }
                    dash = lines.join('\n');
                    writeYaml(dashPath, dash);
                }
            }
        }
    }
} catch {}

try {
    const rolesPath = path.join(MODULES_DIR, 'roles.yml');
    let roles = readYamlIfExists(rolesPath) || '';
    const inviteHeaderRe = /^InviteRoles\s*:\s*(?:#.*)?$/;
    if (roles && !roles.split('\n').some(l => inviteHeaderRe.test(l.trim()))) {
        const block = [
            'InviteRoles:',
            '  Enabled: false',
            '  Stack: true # If false, previous tier roles will be removed when reaching a new tier',
            '',
            '  Tiers:',
            '    1:',
            '      Roles: ["ROLE_ID", "ROLE_ID"]',
            '      Amount: 1 # Amount of invites to get the role',
            '    2:',
            '      Roles: ["ROLE_ID", "ROLE_ID"]',
            '      Amount: 10 # Amount of invites to get the role'
        ].join('\n');
        const sep = roles && !roles.endsWith('\n') ? '\n' : '';
        roles = roles + sep + block + '\n';
        writeYaml(rolesPath, roles);
    }
} catch {}

try {
    const rolesPath = path.join(MODULES_DIR, 'roles.yml');
    let roles = readYamlIfExists(rolesPath) || '';
    if (roles) {
        const lines = roles.split('\n');
        const irIdx = lines.findIndex(l => /^InviteRoles\s*:\s*(?:#.*)?$/.test(l.trim()));
        if (irIdx !== -1) {
            const irIndent = computeIndent(lines[irIdx]);
            let irEnd = irIdx + 1;
            for (let i = irIdx + 1; i < lines.length; i++) {
                const t = lines[i].trim();
                const ind = computeIndent(lines[i]);
                if (t !== '' && ind <= irIndent) { irEnd = i; break; }
                irEnd = i + 1;
            }
            
            let hasStack = false;
            let enabledIdx = -1;
            for (let i = irIdx + 1; i < irEnd; i++) {
                const t = lines[i].trim();
                const ind = computeIndent(lines[i]);
                if (ind === irIndent + 2) {
                    if (/^Stack\s*:/i.test(t)) hasStack = true;
                    if (/^Enabled\s*:/i.test(t)) enabledIdx = i;
                }
            }
            
            if (!hasStack && enabledIdx !== -1) {
                const indentStr = ' '.repeat(irIndent + 2);
                lines.splice(enabledIdx + 1, 0, `${indentStr}Stack: true # If false, previous tier roles will be removed when reaching a new tier`);
                roles = lines.join('\n');
                writeYaml(rolesPath, roles);
            }
        }
    }
} catch {}

try {
    const rolesPath = path.join(MODULES_DIR, 'roles.yml');
    let roles = readYamlIfExists(rolesPath) || '';
    if (roles) {
        const lines = roles.split('\n');
        const rrIdx = lines.findIndex(l => /^ReactionRoles\s*:\s*(?:#.*)?$/.test(l.trim()));
        if (rrIdx !== -1) {
            const rrIndent = computeIndent(lines[rrIdx]);
            let rrEnd = rrIdx + 1;
            for (let i = rrIdx + 1; i < lines.length; i++) {
                const t = lines[i].trim();
                const ind = computeIndent(lines[i]);
                if (t !== '' && ind <= rrIndent) { rrEnd = i; break; }
                rrEnd = i + 1;
            }
            
            let i = rrIdx + 1;
            while (i < rrEnd) {
                const raw = lines[i];
                const t = raw.trim();
                const ind = computeIndent(raw);
                if (t !== '' && ind <= rrIndent) break;
                if (ind === rrIndent + 2 && t.endsWith(':') && !t.startsWith('-') && t !== 'Enabled:') {
                    const panelIndent = ind;
                    const panelStart = i;
                    let panelEnd = i + 1;
                    for (let k = panelStart + 1; k < rrEnd; k++) {
                        const tt = lines[k].trim();
                        const ii = computeIndent(lines[k]);
                        if (tt !== '' && ii <= panelIndent) { panelEnd = k; break; }
                        panelEnd = k + 1;
                    }
                    
                    let reactionsStart = -1;
                    let reactionsIndent = 0;
                    for (let j = panelStart + 1; j < panelEnd; j++) {
                        const t2 = lines[j].trim();
                        const ind2 = computeIndent(lines[j]);
                        if (ind2 === panelIndent + 2 && /^Reactions\s*:\s*$/.test(t2)) { 
                            reactionsStart = j; 
                            reactionsIndent = ind2;
                            break; 
                        }
                    }
                    
                    if (reactionsStart !== -1) {
                        let reactionsEnd = reactionsStart + 1;
                        for (let k = reactionsStart + 1; k < panelEnd; k++) {
                            const tt = lines[k].trim();
                            const ii = computeIndent(lines[k]);
                            if (tt !== '' && ii <= reactionsIndent) { reactionsEnd = k; break; }
                            reactionsEnd = k + 1;
                        }
                        
                        let j = reactionsStart + 1;
                        while (j < reactionsEnd) {
                            const rraw = lines[j];
                            const rt = rraw.trim();
                            const rind = computeIndent(rraw);
                            if (rt !== '' && rind <= reactionsIndent) break;
                            if (rind === reactionsIndent + 2 && rt.startsWith('- Name:')) {
                                const reactionStart = j;
                                let reactionEnd = reactionStart + 1;
                                for (let m = reactionStart + 1; m < reactionsEnd; m++) {
                                    const mraw = lines[m];
                                    const mt = mraw.trim();
                                    const mind = computeIndent(mraw);
                                    if (mind === reactionsIndent + 2 && mt.startsWith('- Name:')) {
                                        reactionEnd = m;
                                        break;
                                    }
                                    if (mt !== '' && mind <= reactionsIndent) { reactionEnd = m; break; }
                                    reactionEnd = m + 1;
                                }
                                
                                let hasRemoveRoles = false;
                                let roleIDIdx = -1;
                                for (let n = reactionStart; n < reactionEnd; n++) {
                                    const nt = lines[n].trim();
                                    const nind = computeIndent(lines[n]);
                                    if (nind === reactionsIndent + 4) {
                                        if (/^RemoveRoles\s*:/i.test(nt)) hasRemoveRoles = true;
                                        if (/^RoleID\s*:/i.test(nt)) roleIDIdx = n;
                                    }
                                }
                                
                                if (!hasRemoveRoles && roleIDIdx !== -1) {
                                    const newLine = ' '.repeat(reactionsIndent + 4) + 'RemoveRoles: []';
                                    lines.splice(roleIDIdx + 1, 0, newLine);
                                    const delta = 1;
                                    reactionsEnd += delta;
                                    panelEnd += delta;
                                    rrEnd += delta;
                                    j = reactionEnd + delta;
                                    continue;
                                }
                                
                                j = reactionEnd;
                                continue;
                            }
                            j++;
                        }
                    }
                    
                    i = panelEnd;
                    continue;
                }
                i++;
            }
            
            roles = lines.join('\n');
            writeYaml(rolesPath, roles);
        }
    }
} catch {}

try {
    const loggingPath = path.join(MODULES_DIR, 'logging.yml');
    let logging = readYamlIfExists(loggingPath) || '';
    if (logging) {
        const ensureBlock = (content, key) => {
            const headerRe = new RegExp(`^${key.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\s*:\\s*(?:#.*)?$`);
            if (content.split('\n').some(l => headerRe.test(l.trim()))) return content;
            const block = [
                `${key}:`,
                '  Enabled: false',
                '  LogsChannelID: "CHANNEL_ID"'
            ].join('\n');
            const sep = content && !content.endsWith('\n') ? '\n' : '';
            return content + sep + block + '\n';
        };
        logging = ensureBlock(logging, 'InviteCreateLogs');
        logging = ensureBlock(logging, 'InviteDeleteLogs');
        logging = ensureBlock(logging, 'InviteJoinLogs');
        writeYaml(loggingPath, logging);
    }
} catch {}

try {
    const loggingPath = path.join(MODULES_DIR, 'logging.yml');
    let logging = readYamlIfExists(loggingPath) || '';
    if (logging) {
        const lines = logging.split('\n');
        let modified = false;
        for (let i = 0; i < lines.length; i++) {
            const raw = lines[i];
            const t = raw.trim();
            if (/^LogsChannelID\s*:\s*"[^"]*"\s*(?:#.*)?$/.test(t)) {
                const match = t.match(/^LogsChannelID\s*:\s*"([^"]*)"\s*(#.*)?$/);
                if (match) {
                    const value = match[1];
                    const comment = match[2] || '';
                    const ind = computeIndent(raw);
                    lines[i] = ' '.repeat(ind) + `LogsChannelID: ["${value}"]${comment ? ' ' + comment : ''}`;
                    modified = true;
                }
            }
            if (/^PurgeLogChannel\s*:\s*"[^"]*"\s*(?:#.*)?$/.test(t)) {
                const match = t.match(/^PurgeLogChannel\s*:\s*"([^"]*)"\s*(#.*)?$/);
                if (match) {
                    const value = match[1];
                    const comment = match[2] || '';
                    const ind = computeIndent(raw);
                    lines[i] = ' '.repeat(ind) + `PurgeLogChannel: ["${value}"]${comment ? ' ' + comment : ''}`;
                    modified = true;
                }
            }
        }
        if (modified) {
            writeYaml(loggingPath, lines.join('\n'));
        }
    }
} catch {}

try {
    const moderationPath = path.join(MODULES_DIR, 'moderation.yml');
    let moderation = readYamlIfExists(moderationPath) || '';
    if (moderation) {
        const lines = moderation.split('\n');
        let modified = false;
        for (let i = 0; i < lines.length; i++) {
            const raw = lines[i];
            const t = raw.trim();
            if (/^LogsChannelID\s*:\s*"[^"]*"\s*(?:#.*)?$/.test(t)) {
                const match = t.match(/^LogsChannelID\s*:\s*"([^"]*)"\s*(#.*)?$/);
                if (match) {
                    const value = match[1];
                    const comment = match[2] || '';
                    const ind = computeIndent(raw);
                    lines[i] = ' '.repeat(ind) + `LogsChannelID: ["${value}"]${comment ? ' ' + comment : ''}`;
                    modified = true;
                }
            }
            if (/^LogsChannelID\s*:\s*[A-Za-z0-9_]+\s*(?:#.*)?$/.test(t) && !/^\[/.test(t.split(':')[1]?.trim() || '')) {
                const match = t.match(/^LogsChannelID\s*:\s*([A-Za-z0-9_]+)\s*(#.*)?$/);
                if (match) {
                    const value = match[1];
                    const comment = match[2] || '';
                    const ind = computeIndent(raw);
                    lines[i] = ' '.repeat(ind) + `LogsChannelID: ["${value}"]${comment ? ' ' + comment : ''}`;
                    modified = true;
                }
            }
        }
        if (modified) {
            writeYaml(moderationPath, lines.join('\n'));
        }
    }
} catch {}

try {
    const ccPath = path.join(MODULES_DIR, 'custom-commands.yml');
    let cc = readYamlIfExists(ccPath) || '';
    if (cc) {
        const lines = cc.split('\n');
        const hasEnabled = lines.some(l => /^CommandsEnabled\s*:/i.test(l.trim()));
        const hasPrefix = lines.some(l => /^CommandsPrefix\s*:/i.test(l.trim()));
        if (!hasEnabled || !hasPrefix) {
            let insertAt = 0;
            const ccIdx = lines.findIndex(l => /^CustomCommands\s*:\s*(?:#.*)?$/.test(l.trim()));
            insertAt = ccIdx !== -1 ? ccIdx : 0;
            const insertLines = [];
            if (!hasEnabled) insertLines.push('CommandsEnabled: false');
            if (!hasPrefix) insertLines.push('CommandsPrefix: "!"');
            if (insertLines.length) {
                const out = [...lines];
                out.splice(insertAt, 0, ...insertLines);
                cc = out.join('\n');
                writeYaml(ccPath, cc);
            }
        }
    }
} catch {}

    // tickets = ensureAutoClaim(tickets);
    // if (tickets) writeYaml(ticketsPath, tickets);
// } catch {}

try {
    const ticketsPath = path.join(MODULES_DIR, 'tickets.yml');
    let tickets = readYamlIfExists(ticketsPath) || '';
    if (tickets) {
        const convertStringToArray = (line, key) => {
            const regex = new RegExp(`^(\\s*)(${key})\\s*:\\s*"([^"]*)"\\s*(#.*)?$`);
            const match = line.match(regex);
            if (match) {
                const indent = match[1];
                const keyName = match[2];
                const value = match[3];
                const comment = match[4] || '';
                return `${indent}${keyName}: ["${value}"]${comment ? ' ' + comment : ''}`;
            }
            return null;
        };

        let lines = tickets.split('\n');
        let modified = false;

        const tsIdx = lines.findIndex(l => /^TicketSettings\s*:\s*(?:#.*)?$/.test(l.trim()));
        if (tsIdx !== -1) {
            const tsIndent = computeIndent(lines[tsIdx]);
            let tsEnd = tsIdx + 1;
            for (let i = tsIdx + 1; i < lines.length; i++) {
                const t = lines[i].trim();
                const ind = computeIndent(lines[i]);
                if (t !== '' && ind <= tsIndent) { tsEnd = i; break; }
                tsEnd = i + 1;
            }
            for (let i = tsIdx + 1; i < tsEnd; i++) {
                const raw = lines[i];
                const ind = computeIndent(raw);
                if (ind === tsIndent + 2 && /^LogsChannelID\s*:\s*"[^"]*"\s*(?:#.*)?$/.test(raw.trim())) {
                    const newLine = convertStringToArray(raw, 'LogsChannelID');
                    if (newLine) { lines[i] = newLine; modified = true; }
                }
            }
        }

        const ttIdx = lines.findIndex(l => /^TicketTypes\s*:\s*(?:#.*)?$/.test(l.trim()));
        if (ttIdx !== -1) {
            const ttIndent = computeIndent(lines[ttIdx]);
            let ttEnd = ttIdx + 1;
            for (let k = ttIdx + 1; k < lines.length; k++) {
                const t = lines[k].trim();
                const ind = computeIndent(lines[k]);
                if (t !== '' && ind <= ttIndent) { ttEnd = k; break; }
                ttEnd = k + 1;
            }
            for (let i = ttIdx + 1; i < ttEnd; i++) {
                const raw = lines[i];
                const t = raw.trim();
                const ind = computeIndent(raw);
                if (/^CategoryID\s*:\s*"[^"]*"\s*(?:#.*)?$/.test(t)) {
                    const newLine = convertStringToArray(raw, 'CategoryID');
                    if (newLine) { lines[i] = newLine; modified = true; }
                }
                if (/^ArchiveCategory\s*:\s*"[^"]*"\s*(?:#.*)?$/.test(t)) {
                    const newLine = convertStringToArray(raw, 'ArchiveCategory');
                    if (newLine) { lines[i] = newLine; modified = true; }
                }
            }
        }

        if (modified) {
            tickets = lines.join('\n');
            writeYaml(ticketsPath, tickets);
        }
    }
} catch {}

try {
    const ticketsPath = path.join(MODULES_DIR, 'tickets.yml');
    let tickets = readYamlIfExists(ticketsPath) || '';
    const ensureRestrictView = (content) => {
        if (!content) return content;
        const lines = content.split('\n');
        const ttStart = lines.findIndex(l => /^TicketTypes\s*:\s*$/.test(l.trim()));
        if (ttStart === -1) return content;
        const ttIndent = computeIndent(lines[ttStart]);
        let ttEnd = ttStart + 1;
        for (let k = ttStart + 1; k < lines.length; k++) {
            const t = lines[k].trim();
            const ind = computeIndent(lines[k]);
            if (t !== '' && ind <= ttIndent) { ttEnd = k; break; }
            ttEnd = k + 1;
        }
        let i = ttStart + 1;
        while (i < ttEnd) {
            const raw = lines[i];
            const t = raw.trim();
            const ind = computeIndent(raw);
            if (t !== '' && ind <= ttIndent) break;
            if (ind === ttIndent + 2 && t.endsWith(':') && !t.startsWith('-')) {
                const childIndent = ind;
                const childStart = i;
                let childEnd = i + 1;
                for (let k = childStart + 1; k < ttEnd; k++) {
                    const tt = lines[k].trim();
                    const ii = computeIndent(lines[k]);
                    if (tt !== '' && ii <= childIndent) { childEnd = k; break; }
                    childEnd = k + 1;
                }
                let claimStart = -1;
                let claimIndent = 0;
                for (let j = childStart + 1; j < childEnd; j++) {
                    const t2 = lines[j].trim();
                    const ind2 = computeIndent(lines[j]);
                    if (ind2 === childIndent + 2 && /^Claiming\s*:\s*$/.test(t2)) { claimStart = j; claimIndent = ind2; break; }
                }
                if (claimStart === -1) {
                    const insIndent = ' '.repeat(childIndent + 2);
                    const block = [
                        `${insIndent}Claiming:`,
                        `${insIndent}  RestrictView: false # If true, only the ticket owner and claimer can view the ticket when claimed`
                    ];
                    lines.splice(childEnd, 0, ...block);
                    const delta = block.length;
                    ttEnd += delta;
                    i = childEnd + delta;
                    continue;
                }
                let claimingEnd = claimStart + 1;
                for (let k = claimStart + 1; k < childEnd; k++) {
                    const tt = lines[k].trim();
                    const ii = computeIndent(lines[k]);
                    if (tt !== '' && ii <= claimIndent) { claimingEnd = k; break; }
                    claimingEnd = k + 1;
                }
                let rrIdx = -1, rvIdx = -1, rvLine = '';
                for (let j = claimStart + 1; j < claimingEnd; j++) {
                    const rawLine = lines[j];
                    const tt = rawLine.trim();
                    if (/^RestrictResponse\s*:/i.test(tt)) rrIdx = j;
                    if (/^RestrictView\s*:/i.test(tt)) { rvIdx = j; rvLine = rawLine; }
                }
                if (rvIdx === -1) {
                    const newLine = ' '.repeat(claimIndent + 2) + 'RestrictView: false # If true, only the ticket owner and claimer can view the ticket when claimed';
                    if (rrIdx !== -1) {
                        lines.splice(rrIdx + 1, 0, newLine);
                        ttEnd += 1;
                        i = claimingEnd + 1;
                        continue;
                    } else {
                        lines.splice(claimingEnd, 0, newLine);
                        ttEnd += 1;
                        i = claimingEnd + 1;
                        continue;
                    }
                }
                if (rrIdx !== -1 && rvIdx !== rrIdx + 1) {
                    lines.splice(rvIdx, 1);
                    if (rvIdx < rrIdx) rrIdx -= 1;
                    lines.splice(rrIdx + 1, 0, rvLine);
                    i = childEnd;
                    continue;
                }
                i = childEnd;
                continue;
            }
            i++;
        }
        return lines.join('\n');
    };
    tickets = ensureRestrictView(tickets);
    if (tickets) writeYaml(ticketsPath, tickets);
} catch {}

try {
    const suggestionsPath = path.join(MODULES_DIR, 'suggestions.yml');
    let suggestions = readYamlIfExists(suggestionsPath) || '';
    if (suggestions) {
        const lines = suggestions.split('\n');
        const ssIdx = lines.findIndex(l => /^SuggestionSettings\s*:\s*(?:#.*)?$/.test(l.trim()));
        if (ssIdx !== -1) {
            const ssIndent = computeIndent(lines[ssIdx]);
            let amiStart = -1, amiIndent = 0, ssEnd = ssIdx + 1;
            for (let i = ssIdx + 1; i < lines.length; i++) {
                const t = lines[i].trim();
                const ind = computeIndent(lines[i]);
                if (t !== '' && ind <= ssIndent) { ssEnd = i; break; }
                if (amiStart === -1 && /^AdditionalModalInputs\s*:\s*(?:#.*)?$/.test(t) && ind === ssIndent + 2) {
                    amiStart = i; amiIndent = ind;
                }
            }
            if (ssEnd === ssIdx + 1) ssEnd = lines.length;
            if (amiStart !== -1) {
                let i = amiStart + 1;
                while (i < ssEnd) {
                    const raw = lines[i];
                    const t = raw.trim();
                    const ind = computeIndent(raw);
                    if (t !== '' && ind <= amiIndent) break;
                    if (ind === amiIndent + 2 && /^\d+\s*:\s*(?:#.*)?$/.test(t)) {
                        const childIndent = ind;
                        const childStart = i;
                        let childEnd = i + 1;
                        for (let k = childStart + 1; k < ssEnd; k++) {
                            const tt = lines[k].trim();
                            const ii = computeIndent(lines[k]);
                            if (tt !== '' && ii <= childIndent) { childEnd = k; break; }
                            childEnd = k + 1;
                        }
                        let idIdx = -1, typeIdx = -1, typeLine = '';
                        let hasOptions = false, hasQuestion = false, hasStyle = false;
                        for (let j = childStart + 1; j < childEnd; j++) {
                            const rawLine = lines[j];
                            const tt = rawLine.trim();
                            const ii = computeIndent(rawLine);
                            if (ii === childIndent + 2) {
                                if (/^ID\s*:/i.test(tt)) idIdx = j;
                                if (/^Type\s*:/i.test(tt)) { typeIdx = j; typeLine = rawLine; }
                                if (/^Options\s*:/i.test(tt)) hasOptions = true;
                                if (/^Question\s*:/i.test(tt)) hasQuestion = true;
                                if (/^Style\s*:/i.test(tt)) hasStyle = true;
                            }
                        }
                        if (idIdx !== -1) {
                            if (typeIdx === -1) {
                                const typeValue = hasOptions ? 'StringSelect' : (hasQuestion || hasStyle ? 'TextInput' : 'TextInput');
                                const newLine = ' '.repeat(childIndent + 2) + `Type: "${typeValue}"`;
                                lines.splice(idIdx, 0, newLine);
                                const delta = 1;
                                if (childEnd >= idIdx) childEnd += delta;
                                if (ssEnd >= idIdx) ssEnd += delta;
                                i = childEnd;
                                continue;
                            } else if (typeIdx > idIdx) {
                                const moved = typeLine;
                                lines.splice(typeIdx, 1);
                                if (typeIdx < idIdx) idIdx -= 1;
                                lines.splice(idIdx, 0, moved);
                                i = childEnd;
                                continue;
                            }
                        }
                        i = childEnd;
                        continue;
                    }
                    i++;
                }
                suggestions = lines.join('\n');
            }
        }
        writeYaml(suggestionsPath, suggestions);
    }
} catch {}

try {
    const suggestionsPath = path.join(MODULES_DIR, 'suggestions.yml');
    let suggestions = readYamlIfExists(suggestionsPath) || '';
    if (suggestions) {
        const lines = suggestions.split('\n');
        let modified = false;
        for (let i = 0; i < lines.length; i++) {
            const raw = lines[i];
            const t = raw.trim();
            if (/^(ChannelID|ChannelSuggestionID|AcceptChannelID|DenyChannelID)\s*:\s*"[^"]*"\s*(?:#.*)?$/.test(t)) {
                const match = t.match(/^(ChannelID|ChannelSuggestionID|AcceptChannelID|DenyChannelID)\s*:\s*"([^"]*)"\s*(#.*)?$/);
                if (match) {
                    const key = match[1];
                    const value = match[2];
                    const comment = match[3] || '';
                    const ind = computeIndent(raw);
                    lines[i] = ' '.repeat(ind) + `${key}: ["${value}"]${comment ? ' ' + comment : ''}`;
                    modified = true;
                }
            }
        }
        if (modified) {
            writeYaml(suggestionsPath, lines.join('\n'));
        }
    }
} catch {}

try {
    const ticketsPath = path.join(MODULES_DIR, 'tickets.yml');
    let tickets = readYamlIfExists(ticketsPath) || '';
    if (tickets) {
        const lines = tickets.split('\n');
        const reviewsIdx = lines.findIndex(l => /^Reviews\s*:\s*$/.test(l.trim()));
        if (reviewsIdx !== -1) {
            const reviewsIndent = computeIndent(lines[reviewsIdx]);
            let reviewsEnd = reviewsIdx + 1;
            
            for (let i = reviewsIdx + 1; i < lines.length; i++) {
                const t = lines[i].trim();
                const ind = computeIndent(lines[i]);
                if (t !== '' && ind <= reviewsIndent) { 
                    reviewsEnd = i; 
                    break; 
                }
                reviewsEnd = i + 1;
            }
            
            let hasOldFormat = false;
            let hasNewFormat = false;
            let hasEmoji = false, hasText = false, hasAskWhy = false;
            
            for (let i = reviewsIdx + 1; i < reviewsEnd; i++) {
                const t = lines[i].trim();
                const ind = computeIndent(lines[i]);
                if (ind === reviewsIndent + 2) {
                    if (/^Emoji\s*:/i.test(t)) hasEmoji = true;
                    if (/^Text\s*:/i.test(t)) hasText = true;
                    if (/^askWhy\s*:/i.test(t)) hasAskWhy = true;
                    if (/^Questions\s*:/i.test(t)) hasNewFormat = true;
                    if (/^ButtonEmoji\s*:/i.test(t)) hasNewFormat = true;
                }
            }
            
            hasOldFormat = (hasEmoji || hasText || hasAskWhy) && !hasNewFormat;
            
            if (hasOldFormat) {
                let enabled = 'true';
                let placeholder = '"Leave a Review"';
                let buttonEmoji = '"⭐"';
                let feedbackEnabled = 'true';
                
                for (let i = reviewsIdx + 1; i < reviewsEnd; i++) {
                    const rawLine = lines[i];
                    const t = rawLine.trim();
                    const ind = computeIndent(rawLine);
                    if (ind === reviewsIndent + 2) {
                        const enabledMatch = t.match(/^Enabled\s*:\s*(.*)$/i);
                        if (enabledMatch) enabled = enabledMatch[1].trim();
                        
                        const placeholderMatch = t.match(/^Placeholder\s*:\s*(.*)$/i);
                        if (placeholderMatch) placeholder = placeholderMatch[1].trim();
                        
                        const emojiMatch = t.match(/^Emoji\s*:\s*(.*)$/i);
                        if (emojiMatch) buttonEmoji = emojiMatch[1].trim();
                        
                        const askWhyMatch = t.match(/^askWhy\s*:\s*(.*)$/i);
                        if (askWhyMatch) feedbackEnabled = askWhyMatch[1].trim();
                    }
                }

                const newReviewsBlock = [
                    'Reviews:',
                    `  Enabled: ${enabled}`,
                    `  Placeholder: ${placeholder}`,
                    `  ButtonEmoji: ${buttonEmoji}`,
                    '  ButtonStyle: "Secondary" # Primary, Secondary, Success, Danger',
                    '  ',
                    '  # Multiple rating questions that will appear as select dropdowns in the modal',
                    '  Questions:',
                    '    1:',
                    '      ID: "support_quality"',
                    '      Label: "Support Quality (1-5)"',
                    '      Description: "Rate the quality of support you received"',
                    '      Required: true',
                    '      Options:',
                    '        - Label: "Very Poor"',
                    '          Value: "1"',
                    '          Emoji: "😞"',
                    '        - Label: "Poor"',
                    '          Value: "2"',
                    '          Emoji: "😐"',
                    '        - Label: "Average"',
                    '          Value: "3"',
                    '          Emoji: "🙂"',
                    '        - Label: "Good"',
                    '          Value: "4"',
                    '          Emoji: "😊"',
                    '        - Label: "Excellent"',
                    '          Value: "5"',
                    '          Emoji: "😍"',
                    '    ',
                    '    2:',
                    '      ID: "response_time"',
                    '      Label: "Response Time (1-5)"',
                    '      Description: "Rate how quickly we responded to your ticket"',
                    '      Required: true',
                    '      Options:',
                    '        - Label: "Very Slow"',
                    '          Value: "1"',
                    '          Emoji: "🐌"',
                    '        - Label: "Slow"',
                    '          Value: "2"',
                    '          Emoji: "⏱️"',
                    '        - Label: "Average"',
                    '          Value: "3"',
                    '          Emoji: "⏰"',
                    '        - Label: "Fast"',
                    '          Value: "4"',
                    '          Emoji: "⚡"',
                    '        - Label: "Very Fast"',
                    '          Value: "5"',
                    '          Emoji: "🚀"',
                    '  ',
                    '  # Optional feedback text input',
                    '  FeedbackInput:',
                    `    Enabled: ${feedbackEnabled}`,
                    '    Label: "Additional Feedback"',
                    '    Placeholder: "Please share any additional thoughts or suggestions..."',
                    '    Style: "Paragraph" # Short, Paragraph',
                    '    Required: false',
                    '    MaxLength: 1000'
                ];
                
                const before = lines.slice(0, reviewsIdx);
                const after = lines.slice(reviewsEnd);
                const newLines = [...before, ...newReviewsBlock, ...after];
                tickets = newLines.join('\n');
                writeYaml(ticketsPath, tickets);
            }
        }
    }
} catch {}

try {
    const ticketsPath = path.join(MODULES_DIR, 'tickets.yml');
    let tickets = readYamlIfExists(ticketsPath) || '';
    if (tickets) {
        const lines = tickets.split('\n');
        const reviewsIdx = lines.findIndex(l => /^Reviews\s*:\s*$/.test(l.trim()));
        if (reviewsIdx !== -1) {
            const reviewsIndent = computeIndent(lines[reviewsIdx]);
            let reviewsEnd = reviewsIdx + 1;
            for (let i = reviewsIdx + 1; i < lines.length; i++) {
                const t = lines[i].trim();
                const ind = computeIndent(lines[i]);
                if (t !== '' && ind <= reviewsIndent) { 
                    reviewsEnd = i; 
                    break; 
                }
                reviewsEnd = i + 1;
            }
            
            let hasChannelID = false;
            let hasEmbed = false;
            let buttonStyleIdx = -1;
            
            for (let i = reviewsIdx + 1; i < reviewsEnd; i++) {
                const t = lines[i].trim();
                const ind = computeIndent(lines[i]);
                if (ind === reviewsIndent + 2) {
                    if (/^ChannelID\s*:/i.test(t)) hasChannelID = true;
                    if (/^Embed\s*:/i.test(t)) hasEmbed = true;
                    if (/^ButtonStyle\s*:/i.test(t)) buttonStyleIdx = i;
                }
            }
            
            if (!hasChannelID && buttonStyleIdx !== -1) {
                const indentStr = ' '.repeat(reviewsIndent + 2);
                lines.splice(buttonStyleIdx, 0, `${indentStr}ChannelID: ["CHANNEL", ""]`);
                reviewsEnd++;
                tickets = lines.join('\n');
                writeYaml(ticketsPath, tickets);
            }
            
            if (!hasEmbed) {
                const feedbackInputIdx = lines.findIndex((l, idx) => idx > reviewsIdx && idx < reviewsEnd && /^\s*FeedbackInput\s*:\s*$/.test(l));
                let feedbackInputEnd = feedbackInputIdx + 1;
                if (feedbackInputIdx !== -1) {
                    const feedbackIndent = computeIndent(lines[feedbackInputIdx]);
                    for (let i = feedbackInputIdx + 1; i < reviewsEnd; i++) {
                        const t = lines[i].trim();
                        const ind = computeIndent(lines[i]);
                        if (t !== '' && ind <= feedbackIndent) { 
                            feedbackInputEnd = i; 
                            break; 
                        }
                        feedbackInputEnd = i + 1;
                    }
                }
                
                const insertIdx = feedbackInputIdx !== -1 ? feedbackInputEnd : reviewsEnd;
                const indentStr = ' '.repeat(reviewsIndent + 2);
                const embedBlock = [
                    '',
                    `${indentStr}Embed:`,
                    `${indentStr}  Title: "⭐ Ticket Review"`,
                    `${indentStr}  Description:`,
                    `${indentStr}    - "### Review Submitted"`,
                    `${indentStr}    - ""`,
                    `${indentStr}    - "**Ticket Information**"`,
                    `${indentStr}    - "> **Creator:** {ticketCreator}"`,
                    `${indentStr}    - "> **Ticket:** {channelName}"`,
                    `${indentStr}    - "> **Handled By:** {claimer}"`,
                    `${indentStr}    - ""`,
                    `${indentStr}    - "**Ratings**"`,
                    `${indentStr}    - "{ratings}"`,
                    `${indentStr}    - ""`,
                    `${indentStr}    - "**Additional Feedback**"`,
                    `${indentStr}    - "\`\`\`{feedback}\`\`\`"`,
                    `${indentStr}  Footer:`,
                    `${indentStr}    Text: "DragonHosting Development | Ticket Reviews"`,
                    `${indentStr}    Icon: "https://i.imgur.com/w5XxKpc.png"`,
                    `${indentStr}  Author:`,
                    `${indentStr}    Text: "Ticket Review System"`,
                    `${indentStr}    Icon: "https://i.imgur.com/w5XxKpc.png"`,
                    `${indentStr}  Color: "#FFD700"`,
                    `${indentStr}  Image: ""`,
                    `${indentStr}  Thumbnail: "{userIcon}"`
                ];
                
                lines.splice(insertIdx, 0, ...embedBlock);
                tickets = lines.join('\n');
                writeYaml(ticketsPath, tickets);
            }
        }
        
        const logsCloseIdx = tickets.split('\n').findIndex(l => /^Logs\s*:\s*$/.test(l.trim()));
        if (logsCloseIdx !== -1) {
            const logsLines = tickets.split('\n');
            let descIdx = -1;
            let descEnd = -1;
            let logsIndent = computeIndent(logsLines[logsCloseIdx]);
            
            for (let i = logsCloseIdx + 1; i < logsLines.length; i++) {
                const t = logsLines[i].trim();
                const ind = computeIndent(logsLines[i]);
                if (t !== '' && ind <= logsIndent) break;
                if (/^Description\s*:\s*$/.test(t)) {
                    descIdx = i;
                    const descIndent = ind;
                    for (let j = i + 1; j < logsLines.length; j++) {
                        const dt = logsLines[j].trim();
                        const dind = computeIndent(logsLines[j]);
                        if (dt !== '' && dind <= descIndent) {
                            descEnd = j;
                            break;
                        }
                        descEnd = j + 1;
                    }
                    break;
                }
            }
            
            if (descIdx !== -1 && descEnd !== -1) {
                let hasReviewLine = false;
                let hasRatingLine = false;
                for (let i = descIdx + 1; i < descEnd; i++) {
                    const t = logsLines[i].trim();
                    if (t.includes('{rating}')) hasRatingLine = true;
                    if (t.includes('**Review**') || t.includes('Review')) hasReviewLine = true;
                }
                
                if (hasReviewLine || hasRatingLine) {
                    const newDescLines = [];
                    for (let i = descIdx + 1; i < descEnd; i++) {
                        const t = logsLines[i].trim();
                        if (!t.includes('{rating}') && !t.includes('**Review**')) {
                            newDescLines.push(logsLines[i]);
                        }
                    }
                    
                    const before = logsLines.slice(0, descIdx + 1);
                    const after = logsLines.slice(descEnd);
                    const finalLines = [...before, ...newDescLines, ...after];
                    tickets = finalLines.join('\n');
                }
            }
            
            writeYaml(ticketsPath, tickets);
        }
    }
} catch {}

try {
    const ticketsPath = path.join(MODULES_DIR, 'tickets.yml');
    let tickets = readYamlIfExists(ticketsPath) || '';
    if (tickets) {
        const lines = tickets.split('\n');
        let modified = false;
        
        const reviewsIdx = lines.findIndex(l => /^Reviews\s*:\s*$/.test(l.trim()));
        if (reviewsIdx !== -1) {
            const reviewsIndent = computeIndent(lines[reviewsIdx]);
            let reviewsEnd = reviewsIdx + 1;
            for (let i = reviewsIdx + 1; i < lines.length; i++) {
                const t = lines[i].trim();
                const ind = computeIndent(lines[i]);
                if (t !== '' && ind <= reviewsIndent) { 
                    reviewsEnd = i; 
                    break; 
                }
                reviewsEnd = i + 1;
            }
            
            for (let i = reviewsIdx + 1; i < reviewsEnd; i++) {
                const raw = lines[i];
                const t = raw.trim();
                const ind = computeIndent(raw);
                if (ind === reviewsIndent + 2 && /^ChannelID\s*:\s*"[^"]*"\s*(?:#.*)?$/.test(t)) {
                    const match = t.match(/^ChannelID\s*:\s*"([^"]*)"\s*(#.*)?$/);
                    if (match) {
                        const value = match[1];
                        if (value === '' || value === 'CHANNEL_ID') {
                            lines[i] = ' '.repeat(ind) + `ChannelID: ["CHANNEL", ""]`;
                        } else {
                            lines[i] = ' '.repeat(ind) + `ChannelID: ["${value}"]`;
                        }
                        modified = true;
                    }
                }
            }
        }
        
        if (modified) {
            tickets = lines.join('\n');
            writeYaml(ticketsPath, tickets);
        }
    }
} catch {}

try {
    const levelingPath = path.join(MODULES_DIR, 'leveling.yml');
    let leveling = readYamlIfExists(levelingPath) || '';
    if (leveling) {
        const lines = leveling.split('\n');
        const lsIdx = lines.findIndex(l => /^LevelingSystem\s*:\s*(?:#.*)?$/.test(l.trim()));
        if (lsIdx !== -1) {
            const lsIndent = computeIndent(lines[lsIdx]);
            let lumsIdx = -1, lumsIndent = 0, lsEnd = lsIdx + 1;
            let xpNeededIdx = -1;
            for (let i = lsIdx + 1; i < lines.length; i++) {
                const t = lines[i].trim();
                const ind = computeIndent(lines[i]);
                if (t !== '' && ind <= lsIndent) { lsEnd = i; break; }
                if (lumsIdx === -1 && /^LevelUpMessageSettings\s*:\s*(?:#.*)?$/.test(t) && ind === lsIndent + 2) {
                    lumsIdx = i; lumsIndent = ind;
                }
                if (xpNeededIdx === -1 && /^XPNeeded\s*:/i.test(t) && ind === lsIndent + 2) {
                    xpNeededIdx = i;
                }
            }
            if (lsEnd === lsIdx + 1) lsEnd = lines.length;
            
            let hasUseFormula = false;
            let hasFormula = false;
            for (let i = lsIdx + 1; i < lsEnd; i++) {
                const t = lines[i].trim();
                const ind = computeIndent(lines[i]);
                if (ind === lsIndent + 2) {
                    if (/^UseFormula\s*:/i.test(t)) hasUseFormula = true;
                    if (/^Formula\s*:/i.test(t)) hasFormula = true;
                }
            }
            
            if ((!hasUseFormula || !hasFormula) && xpNeededIdx !== -1) {
                const insertLines = [];
                const indentStr = ' '.repeat(lsIndent + 2);
                if (!hasUseFormula) {
                    insertLines.push(`${indentStr}UseFormula: false # Use a formula to calculate XP needed per level`);
                }
                if (!hasFormula) {
                    insertLines.push(`${indentStr}Formula: "100 * {level}^2" # Formula for XP calculation. Available variables: {level}`);
                }
                lines.splice(xpNeededIdx + 1, 0, ...insertLines);
                leveling = lines.join('\n');
                lsEnd += insertLines.length;
                if (lumsIdx !== -1 && lumsIdx > xpNeededIdx) {
                    lumsIdx += insertLines.length;
                }
            }
            
            if (lumsIdx !== -1) {
                let lumsEnd = lumsIdx + 1;
                for (let i = lumsIdx + 1; i < lsEnd; i++) {
                    const t = lines[i].trim();
                    const ind = computeIndent(lines[i]);
                    if (t !== '' && ind <= lumsIndent) { lumsEnd = i; break; }
                    lumsEnd = i + 1;
                }
                
                let hasEnabled = false;
                for (let i = lumsIdx + 1; i < lumsEnd; i++) {
                    const t = lines[i].trim();
                    const ind = computeIndent(lines[i]);
                    if (ind === lumsIndent + 2 && /^Enabled\s*:/i.test(t)) {
                        hasEnabled = true;
                        break;
                    }
                }
                
                if (!hasEnabled) {
                    const enabledLine = ' '.repeat(lumsIndent + 2) + 'Enabled: true # Enable level up messages';
                    lines.splice(lumsIdx + 1, 0, enabledLine);
                    leveling = lines.join('\n');
                }
            }
            
            writeYaml(levelingPath, leveling);
        }
    }
} catch {}

try {
    const levelingPath = path.join(MODULES_DIR, 'leveling.yml');
    let leveling = readYamlIfExists(levelingPath) || '';
    if (leveling) {
        const lines = leveling.split('\n');
        let modified = false;
        for (let i = 0; i < lines.length; i++) {
            const raw = lines[i];
            const t = raw.trim();
            if (/^roleID\s*:\s*"[^"]*"\s*(?:#.*)?$/.test(t)) {
                const match = t.match(/^roleID\s*:\s*"([^"]*)"\s*(#.*)?$/);
                if (match) {
                    const value = match[1];
                    const comment = match[2] || '';
                    const ind = computeIndent(raw);
                    lines[i] = ' '.repeat(ind) + `roleID: ["${value}"]${comment ? ' ' + comment : ''}`;
                    modified = true;
                }
            }
        }
        if (modified) {
            writeYaml(levelingPath, lines.join('\n'));
        }
    }
} catch {}


try {
    const giveawaysPath = path.join(MODULES_DIR, 'giveaways.yml');
    let giveaways = readYamlIfExists(giveawaysPath) || '';
    if (giveaways) {
        const lines = giveaways.split('\n');
        const gIdx = lines.findIndex(l => /^Giveaways\s*:\s*(?:#.*)?$/.test(l.trim()));
        if (gIdx !== -1) {
            const gIndent = computeIndent(lines[gIdx]);
            let gEnd = gIdx + 1;
            for (let i = gIdx + 1; i < lines.length; i++) {
                const t = lines[i].trim();
                const ind = computeIndent(lines[i]);
                if (t !== '' && ind <= gIndent) { gEnd = i; break; }
                gEnd = i + 1;
            }
            
            let hasButtons = false;
            let hasDirectActiveGiveaway = false;
            let hasOldEmbed = false;
            let hasNestedActiveGiveaway = false;
            
            for (let i = gIdx + 1; i < gEnd; i++) {
                const t = lines[i].trim();
                const ind = computeIndent(lines[i]);
                if (/^ActiveGiveaway\s*:/i.test(t)) hasNestedActiveGiveaway = true;
                if (ind === gIndent + 2) {
                    if (/^Buttons\s*:/i.test(t)) hasButtons = true;
                    if (/^ActiveGiveaway\s*:/i.test(t)) hasDirectActiveGiveaway = true;
                    if (/^Embed\s*:/i.test(t)) hasOldEmbed = true;
                }
            }
            
            const needsMigration = hasOldEmbed && !hasButtons && !hasDirectActiveGiveaway && hasNestedActiveGiveaway;
            const needsDefault = hasOldEmbed && !hasButtons && !hasDirectActiveGiveaway && !hasNestedActiveGiveaway;
            
            if (needsMigration) {
                try {
                    const parsed = yaml.load(giveaways);
                    const g = parsed?.Giveaways || {};
                    const embed = g.Embed || {};
                    const active = embed.ActiveGiveaway || {};
                    const ended = embed.EndedGiveaway || {};
                    const btn = active.Button || {};
                    const join = btn.JoinButton || {};
                    const odds = btn.CheckPercent || {};
                    const entries = btn.ShowEntries || {};
                    const entrants = btn.ShowEntrantsList || {};
                    const entrantsEmbed = entrants.Embed || {};

                    const allowRoles = JSON.stringify(g.AllowRoles || ["ROLE_ID", "ROLE_ID"]);
                    const statusCheck = g.GiveawayStatusCheck || 7500;
                    const dmWinners = g.DirectMessageWinners !== undefined ? g.DirectMessageWinners : true;

                    const esc = (s) => {
                        if (!s) return '""';
                        if (typeof s !== 'string') return String(s);
                        return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
                    };

                    const activeThumbnail = active.EmbedThumbnail || 'https://i.imgur.com/ewT6bOT.png';
                    const activeImage = active.EmbedImage || 'https://i.imgur.com/yw6UcuW.jpg';
                    const activeColor = active.EmbedColor || '#5865F2';
                    const endedThumbnail = ended.EmbedThumbnail || 'https://i.imgur.com/ewT6bOT.png';
                    const endedImage = ended.EmbedImage || 'https://i.imgur.com/7TQDDAy.png';
                    const endedColor = ended.EmbedColor || '#2b2d31';
                    const entrantsTitle = (entrantsEmbed.Title || 'Giveaway Entrants - {prize}').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').trim();
                    const entrantsDesc = Array.isArray(entrantsEmbed.Description) ? entrantsEmbed.Description.join('\\n') : (entrantsEmbed.Description || '{entrantsList}');
                    const entrantsFooterText = entrantsEmbed.Footer?.Text || 'Total: {totalEntrants} \u2022 Page {currentPage}/{totalPages}';
                    const entrantsColor = entrantsEmbed.Color || '#5865F2';

                    const newConfig = `# ===========================================================================
# GIVEAWAYS SYSTEM CONFIGURATION
# ===========================================================================
# Placeholders: {prize}, {hostedBy}, {endsIn}, {entries}, {winners}, {giveawayId},
# {whitelistRoles}, {blacklistRoles}, {minServerJoinDate}, {minAccountAge},
# {minInvites}, {minMessages}, {winnerCount}, {serverName}

Giveaways:
  AllowRoles: ${allowRoles}
  GiveawayStatusCheck: ${statusCheck}
  DirectMessageWinners: ${dmWinners}

  Buttons:
    Enter:
      Style: ${esc(join.ButtonStyle || 'Primary')}
      Emoji: ${esc(join.ButtonEmoji || '\uD83C\uDF89')}
      Label: ${esc(join.ButtonText || 'Enter')}
      ShowEntries: true
    Odds:
      Style: ${esc(odds.ButtonStyle || 'Secondary')}
      Emoji: ${esc(odds.ButtonEmoji || '\uD83D\uDCC8')}
      Label: ${esc(odds.ButtonText || 'Odds')}
    Entrants:
      Style: ${esc(entries.ButtonStyle || 'Secondary')}
      Emoji: ${esc(entries.ButtonEmoji || '\uD83D\uDC65')}
      Label: ${esc(entries.ButtonText || 'Entries')}

  ActiveGiveaway:
    Thumbnail: ${esc(activeThumbnail)}
    Image: ${esc(activeImage)}
    Components:
      - Type: "container"
        AccentColor: ${esc(activeColor)}
        Components:
          - Type: "section"
            Text:
              Content: "# {prize}  [amount: {winnerCount}]\\n\\n> **Hosted by:** {hostedBy}\\n> **Ends:** {endsIn}\\n> **Entries:** {entries}"
            Accessory:
              Type: "thumbnail"
              Media:
                URL: "{thumbnail}"
          
          - Type: "media_gallery"
            Items:
              - URL: "{image}"
          
          - Type: "text_display"
            Content: "-# ID: {giveawayId}"

  EndedGiveaway:
    Thumbnail: ${esc(endedThumbnail)}
    Image: ${esc(endedImage)}
    Components:
      - Type: "container"
        AccentColor: ${esc(endedColor)}
        Components:
          - Type: "section"
            Text:
              Content: "# {prize}\\n\\n**Winner**\\n{winners}"
            Accessory:
              Type: "thumbnail"
              Media:
                URL: "{thumbnail}"
          
          - Type: "media_gallery"
            Items:
              - URL: "{image}"
          
          - Type: "text_display"
            Content: "-# ID: {entries} entries  \u00B7  {giveawayId}"

  EntrantsEmbed:
    Title: ${esc(entrantsTitle)}
    Description: ${esc(entrantsDesc)}
    Footer: ${esc(entrantsFooterText)}
    Color: ${esc(entrantsColor)}
`;
                    writeYaml(giveawaysPath, newConfig);
                } catch {}
            } else if (needsDefault) {
                const newConfig = `# ===========================================================================
# GIVEAWAYS SYSTEM CONFIGURATION
# ===========================================================================
# Placeholders: {prize}, {hostedBy}, {endsIn}, {entries}, {winners}, {giveawayId},
# {whitelistRoles}, {blacklistRoles}, {minServerJoinDate}, {minAccountAge},
# {minInvites}, {minMessages}, {winnerCount}, {serverName}

Giveaways:
  AllowRoles: ["ROLE_ID", "ROLE_ID"]
  GiveawayStatusCheck: 7500
  DirectMessageWinners: true

  Buttons:
    Enter:
      Style: "Primary"
      Emoji: "\uD83C\uDF89"
      Label: "Enter"
      ShowEntries: true
    Odds:
      Style: "Secondary"
      Emoji: "\uD83D\uDCC8"
      Label: "Odds"
    Entrants:
      Style: "Secondary"
      Emoji: "\uD83D\uDC65"
      Label: "Entrants"

  ActiveGiveaway:
    Thumbnail: "https://i.imgur.com/ewT6bOT.png"
    Image: "https://i.imgur.com/yw6UcuW.jpg"
    Components:
      - Type: "container"
        AccentColor: "#5865F2"
        Components:
          - Type: "section"
            Text:
              Content: "# {prize}  [amount: {winnerCount}]\\n\\n> **Hosted by:** {hostedBy}\\n> **Ends:** {endsIn}\\n> **Entries:** {entries}"
            Accessory:
              Type: "thumbnail"
              Media:
                URL: "{thumbnail}"
          
          - Type: "media_gallery"
            Items:
              - URL: "{image}"
          
          - Type: "text_display"
            Content: "-# ID: {giveawayId}"

  EndedGiveaway:
    Thumbnail: "https://i.imgur.com/ewT6bOT.png"
    Image: "https://i.imgur.com/7TQDDAy.png"
    Components:
      - Type: "container"
        AccentColor: "#2b2d31"
        Components:
          - Type: "section"
            Text:
              Content: "# {prize}\\n\\n**Winner**\\n{winners}"
            Accessory:
              Type: "thumbnail"
              Media:
                URL: "{thumbnail}"
          
          - Type: "media_gallery"
            Items:
              - URL: "{image}"
          
          - Type: "text_display"
            Content: "-# ID: {entries} entries  \u00B7  {giveawayId}"

  EntrantsEmbed:
    Title: "Giveaway Entrants - {prize}"
    Description: "{entrantsList}"
    Footer: "Total: {totalEntrants} \u2022 Page {currentPage}/{totalPages}"
    Color: "#5865F2"
`;
                writeYaml(giveawaysPath, newConfig);
            }
        }
    }
} catch {}

try {
    const ticketsPath = path.join(MODULES_DIR, 'tickets.yml');
    let tickets = readYamlIfExists(ticketsPath) || '';
    if (tickets) {
        const lines = tickets.split('\n');
        const logsIdx = lines.findIndex(l => /^Logs\s*:\s*(?:#.*)?$/.test(l.trim()));
        if (logsIdx !== -1) {
            const logsIndent = computeIndent(lines[logsIdx]);
            let logsEnd = logsIdx + 1;
            for (let i = logsIdx + 1; i < lines.length; i++) {
                const t = lines[i].trim();
                const ind = computeIndent(lines[i]);
                if (t !== '' && ind <= logsIndent) { logsEnd = i; break; }
                logsEnd = i + 1;
            }
            
            let closeIdx = -1;
            for (let i = logsIdx + 1; i < logsEnd; i++) {
                const t = lines[i].trim();
                const ind = computeIndent(lines[i]);
                if (ind === logsIndent + 2 && /^Close\s*:\s*(?:#.*)?$/.test(t)) {
                    closeIdx = i;
                    break;
                }
            }
            
            if (closeIdx !== -1) {
                const closeIndent = computeIndent(lines[closeIdx]);
                let closeEnd = closeIdx + 1;
                for (let i = closeIdx + 1; i < logsEnd; i++) {
                    const t = lines[i].trim();
                    const ind = computeIndent(lines[i]);
                    if (t !== '' && ind <= closeIndent) { closeEnd = i; break; }
                    closeEnd = i + 1;
                }
                
                let hasReviewFormat = false;
                for (let i = closeIdx + 1; i < closeEnd; i++) {
                    const t = lines[i].trim();
                    const ind = computeIndent(lines[i]);
                    if (ind === closeIndent + 2 && /^ReviewFormat\s*:/i.test(t)) {
                        hasReviewFormat = true;
                        break;
                    }
                }
                
                if (!hasReviewFormat) {
                    const indentStr = ' '.repeat(closeIndent + 2);
                    const indentStr2 = ' '.repeat(closeIndent + 4);
                    const reviewFormatBlock = [
                        `${indentStr}ReviewFormat:`,
                        `${indentStr2}AverageRating: "Average Rating"`,
                        `${indentStr2}Rating: "Rating"`,
                        `${indentStr2}Review: "Review"`,
                        `${indentStr2}AdditionalFeedback: "Additional Feedback"`,
                        `${indentStr2}NoRating: "No Rating Yet"`,
                        `${indentStr2}CloseReason: "Close Reason"`
                    ];
                    lines.splice(closeEnd, 0, ...reviewFormatBlock);
                    tickets = lines.join('\n');
                    writeYaml(ticketsPath, tickets);
                }
            }
        }
    }
} catch {}

try {
    const langPath = path.join(CONFIG_DIR, 'lang.yml');
    let lang = readYamlIfExists(langPath) || '';
    if (lang) {
        const lines = lang.split('\n');
        let modified = false;
        
        const ticketsIdx = lines.findIndex(l => /^Tickets\s*:\s*(?:#.*)?$/.test(l.trim()));
        if (ticketsIdx !== -1) {
            const ticketsIndent = computeIndent(lines[ticketsIdx]);
            let ticketsEnd = ticketsIdx + 1;
            
            for (let i = ticketsIdx + 1; i < lines.length; i++) {
                const t = lines[i].trim();
                const ind = computeIndent(lines[i]);
                if (t !== '' && ind <= ticketsIndent) { 
                    ticketsEnd = i; 
                    break; 
                }
                ticketsEnd = i + 1;
            }
            
            let hasViewTranscriptButton = false;
            let claimIdx = -1;
            let claimIndent = 0;
            
            for (let i = ticketsIdx + 1; i < ticketsEnd; i++) {
                const t = lines[i].trim();
                const ind = computeIndent(lines[i]);
                if (ind === ticketsIndent + 2) {
                    if (/^ViewTranscriptButton\s*:/i.test(t)) hasViewTranscriptButton = true;
                    if (/^Claim\s*:\s*(?:#.*)?$/.test(t)) { claimIdx = i; claimIndent = ind; }
                }
            }
            
            if (!hasViewTranscriptButton) {
                const indentStr = ' '.repeat(ticketsIndent + 2);
                const transcriptNotEnoughIdx = lines.findIndex((l, idx) => 
                    idx > ticketsIdx && idx < ticketsEnd && /^(\s*)TranscriptNotEnough\s*:/i.test(l)
                );
                if (transcriptNotEnoughIdx !== -1) {
                    lines.splice(transcriptNotEnoughIdx + 1, 0, `${indentStr}ViewTranscriptButton: "View Transcript"`);
                    modified = true;
                    ticketsEnd++;
                    if (claimIdx > transcriptNotEnoughIdx) claimIdx++;
                }
            }
            
            if (claimIdx !== -1) {
                let claimEnd = claimIdx + 1;
                for (let i = claimIdx + 1; i < ticketsEnd; i++) {
                    const t = lines[i].trim();
                    const ind = computeIndent(lines[i]);
                    if (t !== '' && ind <= claimIndent) { claimEnd = i; break; }
                    claimEnd = i + 1;
                }
                
                let hasClaimedByButton = false;
                let notClaimableIdx = -1;
                
                for (let i = claimIdx + 1; i < claimEnd; i++) {
                    const t = lines[i].trim();
                    const ind = computeIndent(lines[i]);
                    if (ind === claimIndent + 2) {
                        if (/^ClaimedByButton\s*:/i.test(t)) hasClaimedByButton = true;
                        if (/^NotClaimable\s*:/i.test(t)) notClaimableIdx = i;
                    }
                }
                
                if (!hasClaimedByButton && notClaimableIdx !== -1) {
                    const indentStr = ' '.repeat(claimIndent + 2);
                    lines.splice(notClaimableIdx + 1, 0, `${indentStr}ClaimedByButton: "Claimed by {claimer}"`);
                    modified = true;
                    claimEnd++;
                }
                
                let hasAnnouncements = false;
                for (let i = claimIdx + 1; i < claimEnd; i++) {
                    const t = lines[i].trim();
                    const ind = computeIndent(lines[i]);
                    if (ind === claimIndent + 2 && /^Announcements\s*:\s*(?:#.*)?$/i.test(t)) {
                        hasAnnouncements = true;
                        break;
                    }
                }
                
                if (!hasAnnouncements) {
                    const indentStr = ' '.repeat(claimIndent + 2);
                    const indentStr2 = ' '.repeat(claimIndent + 4);
                    const announcementsBlock = [
                        `${indentStr}Announcements:`,
                        `${indentStr2}Claimed: "🔒 {user} has claimed this ticket and will be assisting you."`,
                        `${indentStr2}Unclaimed: "🔓 {user} has unclaimed this ticket. Any support staff member can now respond."`
                    ];
                    lines.splice(claimEnd, 0, ...announcementsBlock);
                    modified = true;
                    ticketsEnd += announcementsBlock.length;
                }
            } else {
                const indentStr = ' '.repeat(ticketsIndent + 2);
                const indentStr2 = ' '.repeat(ticketsIndent + 4);
                const indentStr3 = ' '.repeat(ticketsIndent + 6);
                const claimBlock = [
                    `${indentStr}Claim:`,
                    `${indentStr2}AlreadyClaimed: "This ticket is already claimed by {claimer}."`,
                    `${indentStr2}NoPermission: "You do not have permission to claim tickets."`,
                    `${indentStr2}Success: "You have successfully claimed this ticket."`,
                    `${indentStr2}Unclaimed: "You have unclaimed this ticket."`,
                    `${indentStr2}NotClaimable: "Ticket claiming is not enabled for this ticket type."`,
                    `${indentStr2}ClaimedByButton: "Claimed by {claimer}"`,
                    `${indentStr2}Announcements:`,
                    `${indentStr3}Claimed: "🔒 {user} has claimed this ticket and will be assisting you."`,
                    `${indentStr3}Unclaimed: "🔓 {user} has unclaimed this ticket. Any support staff member can now respond."`,
                    ''
                ];
                lines.splice(ticketsEnd, 0, ...claimBlock);
                modified = true;
                ticketsEnd += claimBlock.length;
            }
            
            let hasReviewSelectPlaceholder = false;
            let hasCloseReasonLabel = false;
            let hasCloseReasonPlaceholder = false;
            let reviewCompleteIdx = -1;
            let reviewSelectPlaceholderIdx = -1;
            
            for (let i = ticketsIdx + 1; i < ticketsEnd; i++) {
                const t = lines[i].trim();
                const ind = computeIndent(lines[i]);
                if (ind === ticketsIndent + 2) {
                    if (/^ReviewSelectPlaceholder\s*:/i.test(t)) { hasReviewSelectPlaceholder = true; reviewSelectPlaceholderIdx = i; }
                    if (/^CloseReasonLabel\s*:/i.test(t)) hasCloseReasonLabel = true;
                    if (/^CloseReasonPlaceholder\s*:/i.test(t)) hasCloseReasonPlaceholder = true;
                    if (/^ReviewComplete\s*:/i.test(t)) reviewCompleteIdx = i;
                }
            }
            
            if (!hasReviewSelectPlaceholder && reviewCompleteIdx !== -1) {
                const indentStr = ' '.repeat(ticketsIndent + 2);
                lines.splice(reviewCompleteIdx + 1, 0, `${indentStr}ReviewSelectPlaceholder: "Choose your rating..."`);
                modified = true;
                ticketsEnd++;
                reviewSelectPlaceholderIdx = reviewCompleteIdx + 1;
            }
            
            if (!hasCloseReasonLabel && reviewSelectPlaceholderIdx !== -1) {
                const indentStr = ' '.repeat(ticketsIndent + 2);
                lines.splice(reviewSelectPlaceholderIdx + 1, 0, `${indentStr}CloseReasonLabel: "Reason for closing (optional)"`);
                modified = true;
                ticketsEnd++;
                reviewSelectPlaceholderIdx++;
            }
            
            if (!hasCloseReasonPlaceholder) {
                const closeReasonLabelIdx = lines.findIndex((l, idx) => 
                    idx > ticketsIdx && idx < ticketsEnd && /^(\s*)CloseReasonLabel\s*:/i.test(l)
                );
                if (closeReasonLabelIdx !== -1) {
                    const indentStr = ' '.repeat(ticketsIndent + 2);
                    lines.splice(closeReasonLabelIdx + 1, 0, `${indentStr}CloseReasonPlaceholder: "Enter a reason for closing the ticket"`);
                    modified = true;
                    ticketsEnd++;
                }
            }
            
            let hasAlertCancelledBy = false;
            let hasCloseTicketTitle = false;
            for (let i = ticketsIdx + 1; i < ticketsEnd; i++) {
                const t = lines[i].trim();
                const ind = computeIndent(lines[i]);
                if (ind === ticketsIndent + 2 && /^AlertCancelledBy\s*:/i.test(t)) {
                    hasAlertCancelledBy = true;
                }
                if (ind === ticketsIndent + 2 && /^CloseTicketTitle\s*:/i.test(t)) {
                    hasCloseTicketTitle = true;
                }
            }
            
            if (!hasAlertCancelledBy) {
                const closeReasonPlaceholderIdx = lines.findIndex((l, idx) => 
                    idx > ticketsIdx && idx < ticketsEnd && /^(\s*)CloseReasonPlaceholder\s*:/i.test(l)
                );
                if (closeReasonPlaceholderIdx !== -1) {
                    const indentStr = ' '.repeat(ticketsIndent + 2);
                    lines.splice(closeReasonPlaceholderIdx + 1, 0, `${indentStr}AlertCancelledBy: "Alert has been cancelled by {user}."`);
                    modified = true;
                    ticketsEnd++;
                }
            }
            
            if (!hasCloseTicketTitle) {
                const alertCancelledByIdx = lines.findIndex((l, idx) => 
                    idx > ticketsIdx && idx < ticketsEnd && /^(\s*)AlertCancelledBy\s*:/i.test(l)
                );
                if (alertCancelledByIdx !== -1) {
                    const indentStr = ' '.repeat(ticketsIndent + 2);
                    lines.splice(alertCancelledByIdx + 1, 0, `${indentStr}CloseTicketTitle: "Close Ticket"`);
                    modified = true;
                    ticketsEnd++;
                }
            }
            
            let hasBlacklisted = false;
            for (let i = ticketsIdx + 1; i < ticketsEnd; i++) {
                const t = lines[i].trim();
                const ind = computeIndent(lines[i]);
                if (ind === ticketsIndent + 2 && /^Blacklisted\s*:\s*(?:#.*)?$/i.test(t)) {
                    hasBlacklisted = true;
                    break;
                }
            }
            
            if (!hasBlacklisted) {
                const claimIdx = lines.findIndex((l, idx) => 
                    idx > ticketsIdx && idx < ticketsEnd && /^(\s*)Claim\s*:\s*(?:#.*)?$/i.test(l)
                );
                if (claimIdx !== -1) {
                    const indentStr = ' '.repeat(ticketsIndent + 2);
                    const indentStr2 = ' '.repeat(ticketsIndent + 4);
                    const indentStr3 = ' '.repeat(ticketsIndent + 6);
                    const indentStr4 = ' '.repeat(ticketsIndent + 8);
                    const blacklistedBlock = [
                        `${indentStr}Blacklisted:`,
                        `${indentStr2}Embed:`,
                        `${indentStr3}Title: "⚠️ Blacklisted from Opening Tickets"`,
                        `${indentStr3}Description:`,
                        `${indentStr4}- "You are blacklisted from opening tickets."`,
                        `${indentStr4}- "Contact an administator if you'd like to appeal the ban."`,
                        `${indentStr4}- " "`,
                        `${indentStr4}- "> **Blacklist By:** {user}"`,
                        `${indentStr4}- "> **Reason:** {reason}"`,
                        `${indentStr4}- "> **Banned At:** {time}"`,
                        `${indentStr3}Footer:`,
                        `${indentStr4}Text: "Contact an admin if you believe this is a mistake."`,
                        `${indentStr4}Icon: "https://e7.pngegg.com/pngimages/1003/312/png-clipart-hammer-game-pension-review-internet-crouton-hammer-technic-discord-thumbnail.png"`,
                        `${indentStr3}Author:`,
                        `${indentStr4}Text: ""`,
                        `${indentStr4}Icon: ""`,
                        `${indentStr3}Color: "#FF0000"`,
                        `${indentStr3}Image: ""`,
                        `${indentStr3}Thumbnail: ""`,
                        ''
                    ];
                    lines.splice(claimIdx, 0, ...blacklistedBlock);
                    modified = true;
                    ticketsEnd += blacklistedBlock.length;
                }
            }
            
            let hasBlacklistManagement = false;
            for (let i = ticketsIdx + 1; i < ticketsEnd; i++) {
                const t = lines[i].trim();
                const ind = computeIndent(lines[i]);
                if (ind === ticketsIndent + 2 && /^BlacklistManagement\s*:/i.test(t)) {
                    hasBlacklistManagement = true;
                    break;
                }
            }
            
            if (!hasBlacklistManagement) {
                const blacklistedIdx = lines.findIndex((l, idx) => 
                    idx > ticketsIdx && idx < ticketsEnd && /^(\s*)Blacklisted\s*:\s*(?:#.*)?$/i.test(l)
                );
                if (blacklistedIdx !== -1) {
                    const blacklistedIndent = computeIndent(lines[blacklistedIdx]);
                    let blacklistedEnd = blacklistedIdx + 1;
                    for (let i = blacklistedIdx + 1; i < ticketsEnd; i++) {
                        const t = lines[i].trim();
                        const ind = computeIndent(lines[i]);
                        if (t !== '' && ind <= blacklistedIndent) { blacklistedEnd = i; break; }
                        blacklistedEnd = i + 1;
                    }
                    
                    const indentStr = ' '.repeat(ticketsIndent + 2);
                    const indentStr2 = ' '.repeat(ticketsIndent + 4);
                    const indentStr3 = ' '.repeat(ticketsIndent + 6);
                    const blacklistBlock = [
                        '',
                        `${indentStr}BlacklistManagement:`,
                        `${indentStr2}UserBlacklisted:`,
                        `${indentStr3}Title: "⚠️ User Blacklisted"`,
                        `${indentStr3}Description: "{user} has been blacklisted from opening tickets."`,
                        `${indentStr3}Fields:`,
                        `${' '.repeat(ticketsIndent + 8)}Reason: "Reason"`,
                        `${' '.repeat(ticketsIndent + 8)}BlacklistedBy: "Blacklisted By"`,
                        `${' '.repeat(ticketsIndent + 8)}Date: "Date"`,
                        `${indentStr3}Footer: "Contact an admin if you believe this is a mistake."`,
                        `${indentStr3}Color: "#FF0000"`,
                        `${indentStr2}BlacklistInfo:`,
                        `${indentStr3}Title: "📋 Blacklist Information"`,
                        `${indentStr3}Fields:`,
                        `${' '.repeat(ticketsIndent + 8)}User: "User"`,
                        `${' '.repeat(ticketsIndent + 8)}BlacklistedBy: "Blacklisted By"`,
                        `${' '.repeat(ticketsIndent + 8)}Reason: "Reason"`,
                        `${' '.repeat(ticketsIndent + 8)}Date: "Date"`,
                        `${indentStr3}Footer: "Contact an admin if you need more information."`,
                        `${indentStr3}Color: "#FFA500"`,
                        `${indentStr2}UserUnblacklisted:`,
                        `${indentStr3}Title: "✅ User Removed from Blacklist"`,
                        `${indentStr3}Description: "{user} has been removed from the blacklist."`,
                        `${indentStr3}Fields:`,
                        `${' '.repeat(ticketsIndent + 8)}RemovedBy: "Removed By"`,
                        `${' '.repeat(ticketsIndent + 8)}Date: "Date"`,
                        `${indentStr3}Footer: "The user can now open tickets again."`,
                        `${indentStr3}Color: "#00FF00"`
                    ];
                    lines.splice(blacklistedEnd, 0, ...blacklistBlock);
                    modified = true;
                    ticketsEnd += blacklistBlock.length;
                }
            }
            
            let hasTicketCreated = false;
            for (let i = ticketsIdx + 1; i < ticketsEnd; i++) {
                const t = lines[i].trim();
                const ind = computeIndent(lines[i]);
                if (ind === ticketsIndent + 2 && /^TicketCreated\s*:\s*(?:#.*)?$/i.test(t)) {
                    hasTicketCreated = true;
                    break;
                }
            }
            
            if (!hasTicketCreated) {
                const indentStr = ' '.repeat(ticketsIndent + 2);
                const indentStr2 = ' '.repeat(ticketsIndent + 4);
                const indentStr3 = ' '.repeat(ticketsIndent + 6);
                const indentStr4 = ' '.repeat(ticketsIndent + 8);
                const ticketCreatedBlock = [
                    '',
                    `${indentStr}TicketCreated:`,
                    `${indentStr2}LinkText: "Go to ticket"`,
                    `${indentStr2}Embed:`,
                    `${indentStr3}Title: "Ticket Created"`,
                    `${indentStr3}Description:`,
                    `${indentStr4}- "Your ticket has been created. {link}"`,
                    `${indentStr3}Footer:`,
                    `${indentStr4}Text: ""`,
                    `${indentStr4}Icon: ""`,
                    `${indentStr3}Author:`,
                    `${indentStr4}Text: ""`,
                    `${indentStr4}Icon: ""`,
                    `${indentStr3}Color: "#00FF00"`,
                    `${indentStr3}Image: ""`,
                    `${indentStr3}Thumbnail: ""`,
                    `${indentStr2}Button:`,
                    `${indentStr3}Text: "Go to Ticket"`,
                    `${indentStr3}Emoji: "🎫"`
                ];
                lines.splice(ticketsEnd, 0, ...ticketCreatedBlock);
                modified = true;
                ticketsEnd += ticketCreatedBlock.length;
            }
        }
        
        if (modified) {
            lang = lines.join('\n');
            writeYaml(langPath, lang);
        }
    }
} catch {}

try {
        const backupPath = path.join(MODULES_DIR, 'backup.yml');
        let backup = readYamlIfExists(backupPath) || '';
        if (backup) {
            const lines = backup.split('\n');
            const backupIdx = lines.findIndex(l => /^Backup\s*:\s*(?:#.*)?$/.test(l.trim()));
            if (backupIdx !== -1) {
                const backupIndent = computeIndent(lines[backupIdx]);
                let backupEnd = backupIdx + 1;
                for (let i = backupIdx + 1; i < lines.length; i++) {
                    const t = lines[i].trim();
                    const ind = computeIndent(lines[i]);
                    if (t !== '' && ind <= backupIndent) { backupEnd = i; break; }
                    backupEnd = i + 1;
                }
                
                let hasContent = false;
                let hasMessages = false;
                let hasInclude = false;
                let hasExclude = false;
                
                for (let i = backupIdx + 1; i < backupEnd; i++) {
                    const t = lines[i].trim();
                    const ind = computeIndent(lines[i]);
                    if (ind === backupIndent + 2) {
                        if (/^Content\s*:/i.test(t)) hasContent = true;
                        if (/^Messages\s*:/i.test(t)) hasMessages = true;
                        if (/^Include\s*:/i.test(t)) hasInclude = true;
                        if (/^Exclude\s*:/i.test(t)) hasExclude = true;
                    }
                }
                
                let changed = false;

                if (!hasContent || !hasMessages || !hasInclude || !hasExclude) {
                    const indentStr = ' '.repeat(backupIndent + 2);
                    const indentStr2 = ' '.repeat(backupIndent + 4);
                    const insertLines = [];
                    
                    if (!hasContent) {
                        insertLines.push('');
                        insertLines.push(`${indentStr}Content:`);
                        insertLines.push(`${indentStr2}Channels: true`);
                        insertLines.push(`${indentStr2}Roles: true`);
                        insertLines.push(`${indentStr2}RolePermissions: true`);
                        insertLines.push(`${indentStr2}Members: true`);
                        insertLines.push(`${indentStr2}MemberRoles: true`);
                        insertLines.push(`${indentStr2}MemberNicknames: true`);
                        insertLines.push(`${indentStr2}Bans: true`);
                        insertLines.push(`${indentStr2}Emojis: true`);
                        insertLines.push(`${indentStr2}ServerSettings: true`);
                    }
                    
                    if (!hasMessages) {
                        insertLines.push('');
                        insertLines.push(`${indentStr}Messages:`);
                        insertLines.push(`${indentStr2}Enabled: true`);
                        insertLines.push(`${indentStr2}MaxPerChannel: 50`);
                        insertLines.push(`${indentStr2}SaveImages: false`);
                    }
                    
                    if (!hasInclude) {
                        insertLines.push('');
                        insertLines.push(`${indentStr}Include:`);
                        insertLines.push(`${indentStr2}Channels: []`);
                        insertLines.push(`${indentStr2}Categories: []`);
                    }

                    if (!hasExclude) {
                        insertLines.push('');
                        insertLines.push(`${indentStr}Exclude:`);
                        insertLines.push(`${indentStr2}Channels: []`);
                        insertLines.push(`${indentStr2}Categories: []`);
                    }
                    
                    lines.splice(backupEnd, 0, ...insertLines);
                    changed = true;
                }

                if (hasExclude) {
                    let excludeIdx = -1;
                    let excludeEnd = -1;
                    let hasExcludeCategories = false;
                    for (let i = backupIdx + 1; i < lines.length; i++) {
                        const t = lines[i].trim();
                        const ind = computeIndent(lines[i]);
                        if (ind === backupIndent + 2 && /^Exclude\s*:/i.test(t)) {
                            excludeIdx = i;
                            excludeEnd = i + 1;
                            for (let j = i + 1; j < lines.length; j++) {
                                const t2 = lines[j].trim();
                                const ind2 = computeIndent(lines[j]);
                                if (t2 !== '' && ind2 <= backupIndent + 2) { excludeEnd = j; break; }
                                if (/^Categories\s*:/i.test(t2)) hasExcludeCategories = true;
                                excludeEnd = j + 1;
                            }
                            break;
                        }
                    }
                    if (excludeIdx !== -1 && !hasExcludeCategories) {
                        const indentStr2 = ' '.repeat(backupIndent + 4);
                        lines.splice(excludeEnd, 0, `${indentStr2}Categories: []`);
                        changed = true;
                    }
                }

                if (hasInclude) {
                    let includeIdx = -1;
                    let includeEnd = -1;
                    let hasIncludeChannels = false;
                    let hasIncludeCategories = false;
                    for (let i = backupIdx + 1; i < lines.length; i++) {
                        const t = lines[i].trim();
                        const ind = computeIndent(lines[i]);
                        if (ind === backupIndent + 2 && /^Include\s*:/i.test(t)) {
                            includeIdx = i;
                            includeEnd = i + 1;
                            for (let j = i + 1; j < lines.length; j++) {
                                const t2 = lines[j].trim();
                                const ind2 = computeIndent(lines[j]);
                                if (t2 !== '' && ind2 <= backupIndent + 2) { includeEnd = j; break; }
                                if (/^Channels\s*:/i.test(t2)) hasIncludeChannels = true;
                                if (/^Categories\s*:/i.test(t2)) hasIncludeCategories = true;
                                includeEnd = j + 1;
                            }
                            break;
                        }
                    }
                    if (includeIdx !== -1) {
                        const indentStr2 = ' '.repeat(backupIndent + 4);
                        const insertAt = [];
                        if (!hasIncludeCategories) insertAt.push(`${indentStr2}Categories: []`);
                        if (!hasIncludeChannels) insertAt.push(`${indentStr2}Channels: []`);
                        if (insertAt.length > 0) {
                            lines.splice(includeEnd, 0, ...insertAt);
                            changed = true;
                        }
                    }
                }

                if (changed) {
                    backup = lines.join('\n');
                    writeYaml(backupPath, backup);
                }
            }
        }
    } catch {}

    try {
        const ticketsPath = path.join(MODULES_DIR, 'tickets.yml');
        let tickets = readYamlIfExists(ticketsPath) || '';
        if (tickets) {
            if (!/StaffMentionAlert\s*:/i.test(tickets)) {
                const lines = tickets.split('\n');
                const tsIdx = lines.findIndex(l => /^TicketSettings\s*:\s*(?:#.*)?$/.test(l.trim()));
                if (tsIdx !== -1) {
                    const tsIndent = computeIndent(lines[tsIdx]);
                    let tsEnd = tsIdx + 1;
                    for (let i = tsIdx + 1; i < lines.length; i++) {
                        const t = lines[i].trim();
                        const ind = computeIndent(lines[i]);
                        if (t !== '' && ind <= tsIndent) { tsEnd = i; break; }
                        tsEnd = i + 1;
                    }
                    
                    const indentStr = ' '.repeat(tsIndent + 2);
                    const indentStr2 = ' '.repeat(tsIndent + 4);
                    const indentStr3 = ' '.repeat(tsIndent + 6);
                    const staffMentionBlock = [
                        '',
                        `${indentStr}StaffMentionAlert:`,
                        `${indentStr2}Enabled: true`,
                        `${indentStr2}AlertStatuses: ["offline", "idle", "dnd"]`,
                        `${indentStr2}EmbedColor: "#FFA500"`,
                        `${indentStr2}ShowAlternatives: true`,
                        `${indentStr2}AlternativesTitle: "🟢 Available Staff"`,
                        `${indentStr2}Messages:`,
                        `${indentStr3}Offline: "⚠️ {staff} is currently **offline** and may not see your message right away."`,
                        `${indentStr3}Idle: "⚠️ {staff} is currently **away** and may take longer to respond."`,
                        `${indentStr3}DND: "⚠️ {staff} has **Do Not Disturb** enabled and may not respond immediately."`
                    ];
                    lines.splice(tsEnd, 0, ...staffMentionBlock);
                    tickets = lines.join('\n');
                    writeYaml(ticketsPath, tickets);
                }
            }
        }
    } catch {}

    try {
        const ticketsPath = path.join(MODULES_DIR, 'tickets.yml');
        let tickets = readYamlIfExists(ticketsPath) || '';
        if (tickets) {
            if (!/CloseRequest\s*:/i.test(tickets)) {
                const lines = tickets.split('\n');
                const tsIdx = lines.findIndex(l => /^TicketSettings\s*:\s*(?:#.*)?$/.test(l.trim()));
                if (tsIdx !== -1) {
                    const tsIndent = computeIndent(lines[tsIdx]);
                    let tsEnd = tsIdx + 1;
                    for (let i = tsIdx + 1; i < lines.length; i++) {
                        const t = lines[i].trim();
                        const ind = computeIndent(lines[i]);
                        if (t !== '' && ind <= tsIndent) { tsEnd = i; break; }
                        tsEnd = i + 1;
                    }
                    
                    const closeRequestBlock = [
                        '',
                        '# ===========================================================================',
                        '# CLOSE REQUEST SYSTEM',
                        '# ===========================================================================',
                        '# Allows staff to request the ticket creator to close the ticket',
                        '# The user can accept or decline the request',
                        'CloseRequest:',
                        '  Enabled: true',
                        '  DefaultReason: "Issue has been resolved"',
                        '  AutoCloseOnAccept: true',
                        '  ',
                        '  Embed:',
                        '    Title: "📩 Close Request"',
                        '    Description:',
                        '      - "Hey {user}!"',
                        '      - ""',
                        '      - "**{staff}** has requested to close this ticket."',
                        '      - ""',
                        '      - "**Reason:** {reason}"',
                        '      - ""',
                        '      - "If your issue has been resolved, please click **Accept** to close the ticket."',
                        '      - "If you still need help, click **Decline** and let us know."',
                        '    Footer:',
                        '      Text: "Ticket System"',
                        '      Icon: ""',
                        '    Color: "#FFA500"',
                        '    Image: ""',
                        '    Thumbnail: ""',
                        '',
                        '  Buttons:',
                        '    Accept:',
                        '      Label: "Accept & Close"',
                        '      Emoji: "✅"',
                        '      Style: "Success"',
                        '    Decline:',
                        '      Label: "Decline"',
                        '      Emoji: "❌"',
                        '      Style: "Secondary"',
                        '',
                        '  Messages:',
                        '    Accepted: "Close request accepted by {user}. Closing ticket..."',
                        '    Declined: "Close request declined by {user}. Staff will continue to assist."',
                        '    DeclinedStaff: "{user} has declined the close request. Please continue assisting them."'
                    ];
                    lines.splice(tsEnd, 0, ...closeRequestBlock);
                    tickets = lines.join('\n');
                    writeYaml(ticketsPath, tickets);
                }
            }
        }
    } catch {}

        // tickets = ensureAutoUnclaim(tickets);
        // if (tickets) writeYaml(ticketsPath, tickets);
    // } catch {}

    try {
        const langPath = path.join(CONFIG_DIR, 'lang.yml');
        let lang = readYamlIfExists(langPath) || '';
        if (lang) {
            const hasAutoUnclaim = /^\s{2}AutoUnclaim\s*:/m.test(lang);
            const hasStaffMentionAlert = /^\s{2}StaffMentionAlert\s*:/m.test(lang);
            
            if (!hasAutoUnclaim || !hasStaffMentionAlert) {
                const lines = lang.split('\n');
                const ticketsIdx = lines.findIndex(l => /^Tickets\s*:\s*(?:#.*)?$/.test(l.trim()));
                if (ticketsIdx !== -1) {
                    const ticketsIndent = computeIndent(lines[ticketsIdx]);
                    let ticketsEnd = ticketsIdx + 1;
                    for (let i = ticketsIdx + 1; i < lines.length; i++) {
                        const t = lines[i].trim();
                        const ind = computeIndent(lines[i]);
                        if (t !== '' && ind <= ticketsIndent) { ticketsEnd = i; break; }
                        ticketsEnd = i + 1;
                    }
                    
                    let claimEnd = -1;
                    for (let i = ticketsIdx + 1; i < ticketsEnd; i++) {
                        const t = lines[i].trim();
                        const ind = computeIndent(lines[i]);
                        if (ind === ticketsIndent + 2 && /^Claim\s*:\s*(?:#.*)?$/.test(t)) {
                            const claimIndent = ind;
                            claimEnd = i + 1;
                            for (let j = i + 1; j < ticketsEnd; j++) {
                                const ct = lines[j].trim();
                                const cind = computeIndent(lines[j]);
                                if (ct !== '' && cind <= claimIndent) { claimEnd = j; break; }
                                claimEnd = j + 1;
                            }
                            break;
                        }
                    }
                    
                    let modified = false;
                    
                    if (!hasAutoUnclaim && claimEnd !== -1) {
                        const indentStr = ' '.repeat(ticketsIndent + 2);
                        const indentStr2 = ' '.repeat(ticketsIndent + 4);
                        const autoUnclaimBlock = [
                            '',
                            `${indentStr}AutoUnclaim:`,
                            `${indentStr2}Message: "⚠️ This ticket has been automatically unclaimed due to inactivity from <@{claimer}>. Any available staff member can now respond."`
                        ];
                        lines.splice(claimEnd, 0, ...autoUnclaimBlock);
                        modified = true;
                        ticketsEnd += autoUnclaimBlock.length;
                        claimEnd += autoUnclaimBlock.length;
                    }
                    
                    if (!hasStaffMentionAlert && claimEnd !== -1) {
                        const indentStr = ' '.repeat(ticketsIndent + 2);
                        const indentStr2 = ' '.repeat(ticketsIndent + 4);
                        const staffAlertBlock = [
                            '',
                            `${indentStr}StaffMentionAlert:`,
                            `${indentStr2}Offline: "⚠️ {staff} is currently **offline** and may not see your message right away."`,
                            `${indentStr2}Idle: "⚠️ {staff} is currently **away** and may take longer to respond."`,
                            `${indentStr2}DND: "⚠️ {staff} has **Do Not Disturb** enabled and may not respond immediately."`
                        ];
                        
                        let insertAt = claimEnd;
                        for (let i = ticketsIdx + 1; i < ticketsEnd; i++) {
                            const t = lines[i].trim();
                            const ind = computeIndent(lines[i]);
                            if (ind === ticketsIndent + 2 && /^AutoUnclaim\s*:/i.test(t)) {
                                const auIndent = ind;
                                insertAt = i + 1;
                                for (let j = i + 1; j < ticketsEnd; j++) {
                                    const at = lines[j].trim();
                                    const aind = computeIndent(lines[j]);
                                    if (at !== '' && aind <= auIndent) { insertAt = j; break; }
                                    insertAt = j + 1;
                                }
                                break;
                            }
                        }
                        
                        lines.splice(insertAt, 0, ...staffAlertBlock);
                        modified = true;
                    }
                    
                    if (modified) {
                        lang = lines.join('\n');
                        writeYaml(langPath, lang);
                    }
                }
            }
        }
    } catch {}

    try {
        const langPath = path.join(CONFIG_DIR, 'lang.yml');
        let lang = readYamlIfExists(langPath) || '';
        if (lang) {
            const hasCloseRequest = /^\s{2}CloseRequest\s*:/m.test(lang);
            
            if (!hasCloseRequest) {
                const lines = lang.split('\n');
                const ticketsIdx = lines.findIndex(l => /^Tickets\s*:\s*(?:#.*)?$/.test(l.trim()));
                if (ticketsIdx !== -1) {
                    const ticketsIndent = computeIndent(lines[ticketsIdx]);
                    let ticketsEnd = ticketsIdx + 1;
                    for (let i = ticketsIdx + 1; i < lines.length; i++) {
                        const t = lines[i].trim();
                        const ind = computeIndent(lines[i]);
                        if (t !== '' && ind <= ticketsIndent) { ticketsEnd = i; break; }
                        ticketsEnd = i + 1;
                    }
                    
                    let staffMentionAlertEnd = -1;
                    for (let i = ticketsIdx + 1; i < ticketsEnd; i++) {
                        const t = lines[i].trim();
                        const ind = computeIndent(lines[i]);
                        if (ind === ticketsIndent + 2 && /^StaffMentionAlert\s*:/i.test(t)) {
                            const smaIndent = ind;
                            staffMentionAlertEnd = i + 1;
                            for (let j = i + 1; j < ticketsEnd; j++) {
                                const st = lines[j].trim();
                                const sind = computeIndent(lines[j]);
                                if (st !== '' && sind <= smaIndent) { staffMentionAlertEnd = j; break; }
                                staffMentionAlertEnd = j + 1;
                            }
                            break;
                        }
                    }
                    
                    if (staffMentionAlertEnd !== -1) {
                        const indentStr = ' '.repeat(ticketsIndent + 2);
                        const closeRequestBlock = [
                            '',
                            `${indentStr}CloseRequest:`,
                            `${indentStr}  Sent: "Close request sent to {user}."`,
                            `${indentStr}  AlreadyPending: "A close request is already pending for this ticket."`,
                            `${indentStr}  Accepted: "Close request accepted by {user}. Closing ticket..."`,
                            `${indentStr}  Declined: "Close request declined by {user}. Staff will continue to assist."`,
                            `${indentStr}  NotTicketOwner: "Only the ticket creator can respond to close requests."`,
                            `${indentStr}  NoPending: "No pending close request for this ticket."`,
                            `${indentStr}  Disabled: "Close request feature is disabled."`,
                            `${indentStr}  NoPermission: "You do not have permission to send close requests."`
                        ];
                        lines.splice(staffMentionAlertEnd, 0, ...closeRequestBlock);
                        lang = lines.join('\n');
                        writeYaml(langPath, lang);
                    }
                }
            }
        }
    } catch {}

    try {
        const langPath = path.join(CONFIG_DIR, 'lang.yml');
        let lang = readYamlIfExists(langPath) || '';
        if (lang) {
            let lines = lang.split('\n');
            
            const removeSection = (parentKey, childKey, parentIndent) => {
                const parentIdx = lines.findIndex(l => {
                    const t = l.trim();
                    const ind = computeIndent(l);
                    return ind === parentIndent && new RegExp(`^${parentKey}\\s*:\\s*(?:#.*)?$`).test(t);
                });
                if (parentIdx === -1) return;
                
                let parentEnd = parentIdx + 1;
                for (let i = parentIdx + 1; i < lines.length; i++) {
                    const t = lines[i].trim();
                    const ind = computeIndent(lines[i]);
                    if (t !== '' && ind <= parentIndent) { parentEnd = i; break; }
                    parentEnd = i + 1;
                }
                
                let childIdx = -1;
                let childIndent = 0;
                for (let i = parentIdx + 1; i < parentEnd; i++) {
                    const t = lines[i].trim();
                    const ind = computeIndent(lines[i]);
                    if (ind === parentIndent + 2 && new RegExp(`^${childKey}\\s*:\\s*(?:#.*)?$`).test(t)) {
                        childIdx = i;
                        childIndent = ind;
                        break;
                    }
                }
                
                if (childIdx !== -1) {
                    let childEnd = childIdx + 1;
                    for (let i = childIdx + 1; i < parentEnd; i++) {
                        const t = lines[i].trim();
                        const ind = computeIndent(lines[i]);
                        if (t !== '' && ind <= childIndent) { childEnd = i; break; }
                        childEnd = i + 1;
                    }
                    lines.splice(childIdx, childEnd - childIdx);
                }
            };
            
            const econIdx = lines.findIndex(l => /^Economy\s*:\s*(?:#.*)?$/.test(l.trim()));
            if (econIdx !== -1) {
                const econIndent = computeIndent(lines[econIdx]);
                
                const activitiesIdx = lines.findIndex((l, idx) => {
                    if (idx <= econIdx) return false;
                    const t = l.trim();
                    const ind = computeIndent(l);
                    return ind === econIndent + 2 && /^Activities\s*:\s*(?:#.*)?$/.test(t);
                });
                
                if (activitiesIdx !== -1) {
                    const actIndent = computeIndent(lines[activitiesIdx]);
                    let actEnd = activitiesIdx + 1;
                    for (let i = activitiesIdx + 1; i < lines.length; i++) {
                        const t = lines[i].trim();
                        const ind = computeIndent(lines[i]);
                        if (t !== '' && ind <= actIndent) { actEnd = i; break; }
                        actEnd = i + 1;
                    }
                    
                    let fishIdx = -1;
                    for (let i = activitiesIdx + 1; i < actEnd; i++) {
                        const t = lines[i].trim();
                        const ind = computeIndent(lines[i]);
                        if (ind === actIndent + 2 && /^Fishing\s*:\s*(?:#.*)?$/.test(t)) {
                            fishIdx = i;
                            break;
                        }
                    }
                    
                    if (fishIdx !== -1) {
                        let fishEnd = fishIdx + 1;
                        for (let i = fishIdx + 1; i < actEnd; i++) {
                            const t = lines[i].trim();
                            const ind = computeIndent(lines[i]);
                            if (t !== '' && ind <= actIndent + 2) { fishEnd = i; break; }
                            fishEnd = i + 1;
                        }
                        lines.splice(fishIdx, fishEnd - fishIdx);
                    }
                }
                
                const otherIdx = lines.findIndex((l, idx) => {
                    if (idx <= econIdx) return false;
                    const t = l.trim();
                    const ind = computeIndent(l);
                    return ind === econIndent + 2 && /^Other\s*:\s*(?:#.*)?$/.test(t);
                });
                
                if (otherIdx !== -1) {
                    const otherIndent = computeIndent(lines[otherIdx]);
                    let otherEnd = otherIdx + 1;
                    for (let i = otherIdx + 1; i < lines.length; i++) {
                        const t = lines[i].trim();
                        const ind = computeIndent(lines[i]);
                        if (t !== '' && ind <= otherIndent) { otherEnd = i; break; }
                        otherEnd = i + 1;
                    }
                    
                    let fishIdx = -1;
                    for (let i = otherIdx + 1; i < otherEnd; i++) {
                        const t = lines[i].trim();
                        const ind = computeIndent(lines[i]);
                        if (ind === otherIndent + 2 && /^Fishing\s*:\s*(?:#.*)?$/.test(t)) {
                            fishIdx = i;
                            break;
                        }
                    }
                    
                    if (fishIdx !== -1) {
                        let fishEnd = fishIdx + 1;
                        for (let i = fishIdx + 1; i < otherEnd; i++) {
                            const t = lines[i].trim();
                            const ind = computeIndent(lines[i]);
                            if (t !== '' && ind <= otherIndent + 2) { fishEnd = i; break; }
                            fishEnd = i + 1;
                        }
                        lines.splice(fishIdx, fishEnd - fishIdx);
                    }
                }
            }
            
            lang = lines.join('\n');
            writeYaml(langPath, lang);
        }
    } catch {}

    try {
        const verificationPath = path.join(MODULES_DIR, 'verification.yml');
        let verification = readYamlIfExists(verificationPath) || '';
        if (verification) {
            const lines = verification.split('\n');
            let modified = false;
            for (let i = 0; i < lines.length; i++) {
                const raw = lines[i];
                const t = raw.trim();
                if (/^ChannelID\s*:\s*"[^"]*"\s*(?:#.*)?$/.test(t)) {
                    const match = t.match(/^ChannelID\s*:\s*"([^"]*)"\s*(#.*)?$/);
                    if (match) {
                        const value = match[1];
                        const ind = computeIndent(raw);
                        lines[i] = ' '.repeat(ind) + `ChannelID: ["${value}"] # Supports multiple channel IDs for different guilds`;
                        modified = true;
                    }
                }
                if (/^RoleToRemove\s*:\s*(?:"[^"]*")?\s*(?:#.*)?$/.test(t) && !/^\s*RoleToRemove\s*:\s*\[/.test(raw)) {
                    const match = t.match(/^RoleToRemove\s*:\s*"?([^"#]*)"?\s*(#.*)?$/);
                    if (match) {
                        const value = match[1]?.trim() || '';
                        const ind = computeIndent(raw);
                        lines[i] = ' '.repeat(ind) + `RoleToRemove: ["${value}"] # Supports multiple role IDs for different guilds`;
                        modified = true;
                    }
                }
            }
            if (modified) {
                writeYaml(verificationPath, lines.join('\n'));
            }
        }
    } catch {}

    try {
        const backupPath = path.join(MODULES_DIR, 'backup.yml');
        let backup = readYamlIfExists(backupPath) || '';
        if (backup) {
            const lines = backup.split('\n');
            let modified = false;
            for (let i = 0; i < lines.length; i++) {
                const raw = lines[i];
                const t = raw.trim();
                if (/^LogsChannelID\s*:\s*"[^"]*"\s*(?:#.*)?$/.test(t)) {
                    const match = t.match(/^LogsChannelID\s*:\s*"([^"]*)"\s*(#.*)?$/);
                    if (match) {
                        const value = match[1];
                        const ind = computeIndent(raw);
                        lines[i] = ' '.repeat(ind) + `LogsChannelID: ["${value}"] # Supports multiple channel IDs for different guilds`;
                        modified = true;
                    }
                }
            }
            if (modified) {
                writeYaml(backupPath, lines.join('\n'));
            }
        }
    } catch {}

    try {
        const levelingPath = path.join(MODULES_DIR, 'leveling.yml');
        let leveling = readYamlIfExists(levelingPath) || '';
        if (leveling) {
            const lines = leveling.split('\n');
            let modified = false;
            for (let i = 0; i < lines.length; i++) {
                const raw = lines[i];
                const t = raw.trim();
                if (/^LevelUpChannelID\s*:\s*"[^"]*"\s*(?:#.*)?$/.test(t)) {
                    const match = t.match(/^LevelUpChannelID\s*:\s*"([^"]*)"\s*(#.*)?$/);
                    if (match) {
                        const value = match[1];
                        const ind = computeIndent(raw);
                        lines[i] = ' '.repeat(ind) + `LevelUpChannelID: ["${value}"] # Supports multiple channel IDs for different guilds`;
                        modified = true;
                    }
                }
            }
            if (modified) {
                writeYaml(levelingPath, lines.join('\n'));
            }
        }
    } catch {}

    try {
        const rolesPath = path.join(MODULES_DIR, 'roles.yml');
        let roles = readYamlIfExists(rolesPath) || '';
        if (roles) {
            const lines = roles.split('\n');
            let modified = false;
            let inReactionRoles = false;
            for (let i = 0; i < lines.length; i++) {
                const raw = lines[i];
                const t = raw.trim();
                if (/^ReactionRoles\s*:\s*(?:#.*)?$/.test(t)) {
                    inReactionRoles = true;
                }
                if (inReactionRoles) {
                    if (/^ChannelID\s*:\s*"[^"]*"\s*(?:#.*)?$/.test(t)) {
                        const match = t.match(/^ChannelID\s*:\s*"([^"]*)"\s*(#.*)?$/);
                        if (match) {
                            const value = match[1];
                            const ind = computeIndent(raw);
                            lines[i] = ' '.repeat(ind) + `ChannelID: ["${value}"] # Supports multiple channel IDs for different guilds`;
                            modified = true;
                        }
                    }
                    if (/^RoleID\s*:\s*"[^"]*"\s*(?:#.*)?$/.test(t)) {
                        const match = t.match(/^RoleID\s*:\s*"([^"]*)"\s*(#.*)?$/);
                        if (match) {
                            const value = match[1];
                            const ind = computeIndent(raw);
                            lines[i] = ' '.repeat(ind) + `RoleID: ["${value}"] # Supports multiple role IDs for different guilds`;
                            modified = true;
                        }
                    }
                }
            }
            if (modified) {
                writeYaml(rolesPath, lines.join('\n'));
            }
        }
    } catch {}

    try {
        const economyPath = path.join(MODULES_DIR, 'economy.yml');
        let economy = readYamlIfExists(economyPath) || '';
        if (economy) {
            let modified = false;
            const lines = economy.split('\n');
            
            const prestigeIdx = lines.findIndex(l => /^Prestige\s*:\s*(?:#.*)?$/.test(l.trim()));
            if (prestigeIdx !== -1) {
                const prestigeIndent = computeIndent(lines[prestigeIdx]);
                let prestigeEnd = prestigeIdx + 1;
                for (let i = prestigeIdx + 1; i < lines.length; i++) {
                    const t = lines[i].trim();
                    const ind = computeIndent(lines[i]);
                    if (t !== '' && ind <= prestigeIndent) { prestigeEnd = i; break; }
                    prestigeEnd = i + 1;
                }
                
                const hasGrantRoles = lines.slice(prestigeIdx, prestigeEnd).some(l => /^\s+grantRoles\s*:/.test(l));
                if (!hasGrantRoles) {
                    for (let i = prestigeIdx + 1; i < prestigeEnd; i++) {
                        if (/^\s+maxLevel\s*:/.test(lines[i])) {
                            lines.splice(i + 1, 0, '  grantRoles: false');
                            prestigeEnd++;
                            modified = true;
                            break;
                        }
                    }
                }
                
                for (let i = prestigeIdx; i < prestigeEnd; i++) {
                    if (/^\s+color\s*:\s*"#[A-Fa-f0-9]+"/.test(lines[i])) {
                        const nextLine = lines[i + 1] || '';
                        if (!/^\s+roleId\s*:/.test(nextLine)) {
                            const indent = computeIndent(lines[i]);
                            lines.splice(i + 1, 0, ' '.repeat(indent) + 'roleId: ""');
                            prestigeEnd++;
                            modified = true;
                        }
                    }
                }
            }
            
            if (modified) {
                economy = lines.join('\n');
                writeYaml(economyPath, economy);
            }
        }
    } catch {}

    try {
        const economyPath = path.join(MODULES_DIR, 'economy.yml');
        let economy = readYamlIfExists(economyPath) || '';
        if (economy) {
            const lines = economy.split('\n');
            const hasStore = lines.some(l => /^Store\s*:\s*(?:#.*)?$/.test(l.trim()));
            
            if (!hasStore) {
                const storeBlock = `
# ===========================================================================
# STORE CONFIGURATION
# ===========================================================================
Store:
  enabled: true

  Items:
    # PETS - rewardType: pet
    dog:
      name: "Dog"
      description: "A loyal companion that boosts your earnings"
      category: "pets"
      price: 5000
      rewardType: "pet"
      rewardData:
        petType: "Dog"
        petMultiplier: 1.05
        petPassiveIncome: 20
      emoji: "🐕"
      sortOrder: 1

    cat:
      name: "Cat"
      description: "A mysterious friend with higher bonuses"
      category: "pets"
      price: 7500
      rewardType: "pet"
      rewardData:
        petType: "Cat"
        petMultiplier: 1.07
        petPassiveIncome: 25
      emoji: "🐱"
      sortOrder: 2

    dragon:
      name: "Dragon"
      description: "A legendary beast with massive bonuses"
      category: "pets"
      price: 50000
      rewardType: "pet"
      rewardData:
        petType: "Dragon"
        petMultiplier: 1.15
        petPassiveIncome: 100
      emoji: "🐉"
      sortOrder: 3
      featured: true

    phoenix:
      name: "Phoenix"
      description: "A mythical bird of fire and rebirth"
      category: "pets"
      price: 75000
      rewardType: "pet"
      rewardData:
        petType: "Phoenix"
        petMultiplier: 1.20
        petPassiveIncome: 150
      emoji: "🔥"
      sortOrder: 4
      featured: true

    # BOOSTERS - rewardType: booster
    money_booster_1d:
      name: "Money Booster (1 Day)"
      description: "Boost your earnings by 50% for 24 hours"
      category: "boosters"
      price: 15000
      rewardType: "booster"
      rewardData:
        boosterType: "Money"
        boosterMultiplier: 1.5
        boosterDuration: 86400000
      emoji: "💰"
      sortOrder: 1

    money_booster_7d:
      name: "Money Booster (7 Days)"
      description: "Boost your earnings by 50% for 7 days"
      category: "boosters"
      price: 75000
      rewardType: "booster"
      rewardData:
        boosterType: "Money"
        boosterMultiplier: 1.5
        boosterDuration: 604800000
      emoji: "💵"
      sortOrder: 2
      featured: true

    xp_booster_1d:
      name: "XP Booster (1 Day)"
      description: "Boost your XP gains by 50% for 24 hours"
      category: "boosters"
      price: 10000
      rewardType: "booster"
      rewardData:
        boosterType: "XP"
        boosterMultiplier: 1.5
        boosterDuration: 86400000
      emoji: "⭐"
      sortOrder: 3

    # TITLES - rewardType: title
    rich_title:
      name: "Rich Title"
      description: "Show off your wealth with this exclusive title"
      category: "titles"
      price: 100000
      maxPerUser: 1
      rewardType: "title"
      rewardData:
        title: "💰 Rich"
        roleId: ""
      emoji: "💎"
      sortOrder: 1

    legend_title:
      name: "Legend Title"
      description: "A title for the truly legendary"
      category: "titles"
      price: 500000
      maxPerUser: 1
      rewardType: "title"
      rewardData:
        title: "🏆 Legend"
        roleId: ""
      emoji: "👑"
      sortOrder: 2
      featured: true

    # ITEMS - rewardType: item
    lucky_charm:
      name: "Lucky Charm"
      description: "Increases your luck in games slightly"
      category: "items"
      price: 2500
      rewardType: "item"
      rewardData:
        itemType: "charm"
        itemData:
          luckBonus: 0.05
      emoji: "🍀"
      sortOrder: 1
`;
                const prestigeIdx = lines.findIndex(l => /^Prestige\s*:\s*(?:#.*)?$/.test(l.trim()));
                if (prestigeIdx !== -1) {
                    const insertIdx = lines.slice(0, prestigeIdx).reverse().findIndex(l => l.trim() !== '');
                    const actualIdx = insertIdx === -1 ? prestigeIdx : prestigeIdx - insertIdx;
                    lines.splice(actualIdx, 0, storeBlock);
                } else {
                    lines.push(storeBlock);
                }
                economy = lines.join('\n');
                writeYaml(economyPath, economy);
            }
        }
    } catch {}

    // Leaderboard Position lang.yml migration
    try {
        const langPath = path.join(CONFIG_DIR, 'lang.yml');
        let lang = readYamlIfExists(langPath) || '';
        if (lang) {
            const hasPosition = /^\s{2}Position\s*:/m.test(lang);
            
            if (!hasPosition) {
                lang = appendSubblockAtBottom(lang, 'Leaderboard', 'Position: "Your position: #{position} - Page {pageMin}/{pageMax}"');
                writeYaml(langPath, lang);
            }
        }
    } catch {}

    // Levels RankCard lang.yml migration
    try {
        const langPath = path.join(CONFIG_DIR, 'lang.yml');
        let lang = readYamlIfExists(langPath) || '';
        if (lang) {
            const hasRankCard = /^\s{2}RankCard\s*:/m.test(lang);
            
            if (!hasRankCard) {
                const rankCardBlock = `RankCard:
    LevelText: "Level"
    RankText: "Rank"`;
                lang = appendSubblockAtBottom(lang, 'Levels', rankCardBlock);
                writeYaml(langPath, lang);
            }
        }
    } catch {}

    // Economy lang.yml migration
    try {
        const langPath = path.join(CONFIG_DIR, 'lang.yml');
        let lang = readYamlIfExists(langPath) || '';
        if (lang) {
            const lines = lang.split('\n');
            const hasEconomySection = lines.some(l => /^Economy\s*:\s*(?:#.*)?$/.test(l.trim()));
            
            if (!hasEconomySection) {
                const economyLangBlock = `
# ===========================================================================
# ECONOMY LANGUAGE
# ===========================================================================
Economy:
  Error:
    Generic: "An unexpected error occurred. Please try again later."
    NoMoney: "You don't have enough coins for this action."
    InvalidAmount: "Invalid amount entered."
    BetAmountError: "Invalid or insufficient bet amount."
    NoPermission: "You don't have permission to use this command."
    InsufficientFunds: "Insufficient funds."
    TargetRob: "Your target doesn't have enough to rob."
    CannotTransferSelf: "You cannot transfer coins to yourself."
    InvalidTransferAmount: "Transfer amount must be greater than 0."
    NoBoosters: "You have no active boosters."

  Beg:
    Messages:
      - "A kind stranger gave you **{balance}** coins."
      - "Someone felt generous and gave you **{balance}** coins."
      - "You received **{balance}** coins from a passerby."
      - "A mysterious benefactor dropped **{balance}** coins."
      - "Your persistence paid off! **+{balance}** coins."
      - "You earned **{balance}** coins."

  Work:
    Messages:
      - "You completed your shift and earned **{balance}** coins."
      - "Great work! You received **{balance}** coins."
      - "Job well done. **+{balance}** coins."
      - "Productive day! You earned **{balance}** coins."
      - "Task completed. **{balance}** coins deposited."
      - "Another successful shift. **+{balance}** coins."

  Crime:
    Win:
      - "You got away with **{balance}** coins."
      - "The perfect crime. **+{balance}** coins."
      - "You made off with **{balance}** coins."
      - "Success! **{balance}** coins secured."
      - "Clean getaway. **+{balance}** coins."
    Lose:
      - "Busted. You lost **{balance}** coins in fines."
      - "You got caught and lost **{balance}** coins."
      - "Your plan backfired. **-{balance}** coins."
      - "Crime doesn't always pay. **-{balance}** coins."
      - "Caught! **{balance}** coins confiscated."

  Rob:
    Win:
      - "You robbed {victim} for **{balance}** coins."
      - "You took **{balance}** coins from {victim}."
      - "You swiped **{balance}** coins from {victim}."
      - "Success! **+{balance}** coins from {victim}."
    Lose:
      - "{victim} caught you. Robbery failed."
      - "{victim} was too quick. You got nothing."
      - "{victim} fought back. Better luck next time."
      - "{victim} spotted you. The heist is off."

  Boosters:
    Title: "Active Boosters"
    Description: "**{type} Booster** ┬À {multiplier}x ┬À Expires <t:{endTime}:R>"

  Inventory:
    Empty: "Your inventory is empty."
    NoItems: "No items in this category."
    Redeem: "Redeemed: **{item}**"
    CategoryPlaceholder: "Select a category"
    Title: "{category}"
    ItemFormat: "{itemNum}. **{item}** ├ù{amount}"
    Footer: "Page {pageCurrent}/{pageMax}"
    Color: "#6366F1"

  Balance:
    TransactionLog: "{user}'s Transactions"
    Gained: "Total Gained"
    Lost: "Total Lost"

  Admin:
    Give: "Gave **{amount}** coins to **{user}**\\n\\nWallet: {balance}\\nBank: {bank}"
    Take: "Took **{amount}** coins from **{user}**\\n\\nWallet: {balance}\\nBank: {bank}"
    Set: "Set **{user}**'s balance to **{amount}**\\n\\nWallet: {balance}\\nBank: {bank}"
`;
                const sep = lang.endsWith('\n') ? '' : '\n';
                lang = lang + sep + economyLangBlock;
                writeYaml(langPath, lang);
            }
        }
    } catch {}

    // Add missing required sections to tickets.yml without reformatting
    try {
        const ticketsPath = path.join(MODULES_DIR, 'tickets.yml');
        let tickets = readYamlIfExists(ticketsPath) || '';
        if (tickets) {
            let modified = false;
            
            // Check and add TicketPanelSettings if missing
            if (!/^TicketPanelSettings\s*:/m.test(tickets)) {
                const panelSettings = `
TicketPanelSettings:
  Panel1:
    Components:
      - Type: container
        AccentColor: "#2b2d31"
        Components:
          - Type: section
            Text:
              Content:
                - "# Get Support"
                - ""
                - "Select a ticket category below to get started."
                - "A staff member will be with you shortly."
            Accessory:
              Type: thumbnail
              Media:
                URL: "{guildIcon}"
          - Type: separator
            Spacing: small
          - Type: text_display
            Content: "-# Available {workinghours_start_monday} – {workinghours_end_monday}"
`;
                const ticketTypesMatch = tickets.match(/^TicketTypes\s*:/m);
                if (ticketTypesMatch) {
                    tickets = tickets.replace(/^TicketTypes\s*:/m, panelSettings + '\nTicketTypes:');
                } else {
                    tickets += panelSettings;
                }
                modified = true;
            }
            
            // Check and add Priority if missing
            if (!/^Priority\s*:/m.test(tickets)) {
                const priority = `
Priority:
  Enabled: true
  DefaultPriority: "Low"
  Levels:
    Low:
      Roles: [""]
      Tag: [""]
      MoveTop: false
    Medium:
      Roles: [""]
      Tag: [""]
      MoveTop: true
    High:
      Roles: [""]
      Tag: [""]
      MoveTop: true
`;
                const panelMatch = tickets.match(/^TicketPanelSettings\s*:/m);
                if (panelMatch) {
                    tickets = tickets.replace(/^TicketPanelSettings\s*:/m, priority + '\nTicketPanelSettings:');
                } else {
                    const ticketTypesMatch = tickets.match(/^TicketTypes\s*:/m);
                    if (ticketTypesMatch) {
                        tickets = tickets.replace(/^TicketTypes\s*:/m, priority + '\nTicketTypes:');
                    } else {
                        tickets += priority;
                    }
                }
                modified = true;
            }
            
            // Check and add TicketTranscript if missing
            if (!/^TicketTranscript\s*:/m.test(tickets)) {
                const transcript = `
TicketTranscript:
  Type: "TXT"
  Save: true
  MinMessages: "1"
  SavePath: "./transcripts/"
`;
                const ticketTypesMatch = tickets.match(/^TicketTypes\s*:/m);
                if (ticketTypesMatch) {
                    tickets = tickets.replace(/^TicketTypes\s*:/m, transcript + '\nTicketTypes:');
                } else {
                    tickets += transcript;
                }
                modified = true;
            }
            
            // Check and add TicketCreation if missing
            if (!/^TicketCreation\s*:/m.test(tickets)) {
                const creation = `
TicketCreation:
  Default:
    Followup:
      Message: ""
    QuestionFormat:
      - "**{question}**"
      - "\`\`\`{answer}\`\`\`"
    Components:
      - Type: container
        AccentColor: "#2b2d31"
        Components:
          - Type: section
            Text:
              Content:
                - "# Ticket Created"
                - ""
                - "Hey {user}, a staff member will be with you shortly."
            Accessory:
              Type: thumbnail
              Media:
                URL: "{userIcon}"
          - Type: separator
            Spacing: small
          - Type: text_display
            Content: "{questions}"
          - Type: text_display
            Content: "-# {ticketType} ┬À {claimer}"
`;
                const ticketTypesMatch = tickets.match(/^TicketTypes\s*:/m);
                if (ticketTypesMatch) {
                    tickets = tickets.replace(/^TicketTypes\s*:/m, creation + '\nTicketTypes:');
                } else {
                    tickets += creation;
                }
                modified = true;
            }
            
            // Check and add ArchiveDesign if missing
            if (!/^ArchiveDesign\s*:/m.test(tickets)) {
                const archive = `
ArchiveDesign:
  Buttons:
    "1":
      Name: "Reopen"
      Emoji: "🔓"
      Style: "Primary"
      Type: "REOPEN"
    "2":
      Name: "Transcript"
      Emoji: "📜"
      Style: "Secondary"
      Type: "TRANSCRIPT"
    "3":
      Name: "Delete"
      Emoji: "🗑️"
      Style: "Danger"
      Type: "DELETE"
  Components:
    - Type: container
      AccentColor: "#2B2D31"
      Components:
        - Type: section
          Text:
            Content:
              - "# 🗄️ Ticket Archived"
              - ""
              - "This ticket has been closed."
          Accessory:
            Type: thumbnail
            Media:
              URL: "https://i.imgur.com/1SbfB8i.png"
        - Type: separator
        - Type: text_display
          Content:
            - "**Creator:** {userTag}"
            - "**Reason:** {reason}"
        - Type: separator
        - Type: text_display
          Content: "-# Use the buttons below to manage this ticket"
`;
                const ticketTypesMatch = tickets.match(/^TicketTypes\s*:/m);
                if (ticketTypesMatch) {
                    tickets = tickets.replace(/^TicketTypes\s*:/m, archive + '\nTicketTypes:');
                } else {
                    tickets += archive;
                }
                modified = true;
            }
            
            // Check and add UserLeftDesign if missing
            if (!/^UserLeftDesign\s*:/m.test(tickets)) {
                const userLeft = `
UserLeftDesign:
  Button:
    Name: "Delete Ticket"
    Emoji: "🗑️"
    Style: "Secondary"
  Components:
    - Type: container
      AccentColor: "#ef4444"
      Components:
        - Type: section
          Text:
            Content:
              - "# ⚠️ User Left"
              - ""
              - "The creator of this ticket, **{user}**, has left the server."
          Accessory:
            Type: thumbnail
            Media:
              URL: "{userIcon}"
        - Type: text_display
          Content: "-# User ID: {userId}"
`;
                const ticketTypesMatch = tickets.match(/^TicketTypes\s*:/m);
                if (ticketTypesMatch) {
                    tickets = tickets.replace(/^TicketTypes\s*:/m, userLeft + '\nTicketTypes:');
                } else {
                    tickets += userLeft;
                }
                modified = true;
            }
            
            // Check and add TicketNotifications if missing
            if (!/^TicketNotifications\s*:/m.test(tickets)) {
                const notifications = `
TicketNotifications:
  UserAdded:
    Components:
      - Type: container
        AccentColor: "#22c55e"
        Components:
          - Type: text_display
            Content:
              - "## ➕ User Added"
              - ""
              - "<@{addedUser}> has been added to the ticket by <@{addedBy}>."
          - Type: separator
          - Type: text_display
            Content: "-# Ticket System"
  UserRemoved:
    Components:
      - Type: container
        AccentColor: "#ef4444"
        Components:
          - Type: text_display
            Content:
              - "## ➖ User Removed"
              - ""
              - "<@{removedUser}> has been removed from the ticket by <@{removedBy}>."
          - Type: separator
          - Type: text_display
            Content: "-# Ticket System"
  Renamed:
    Components:
      - Type: container
        AccentColor: "#3b82f6"
        Components:
          - Type: text_display
            Content:
              - "## ✏️ Ticket Renamed"
              - ""
              - "The ticket has been renamed to **{newName}** by <@{renamedBy}>."
          - Type: separator
          - Type: text_display
            Content: "-# Ticket System"
  Transferred:
    Components:
      - Type: container
        AccentColor: "#8b5cf6"
        Components:
          - Type: text_display
            Content:
              - "## 🔄 Ticket Transferred"
              - ""
              - "Ticket has been transferred to **{newType}** by <@{transferredBy}>."
          - Type: separator
          - Type: text_display
            Content: "-# Ticket System"
  PriorityChanged:
    Components:
      - Type: container
        AccentColor: "{priorityColor}"
        Components:
          - Type: text_display
            Content:
              - "## 📋 Priority Update"
              - ""
              - "Priority changed from **{oldPriority}** to **{newPriority}**"
              - "Updated by: <@{changedBy}>"
          - Type: separator
          - Type: text_display
            Content: "-# Ticket System"
  AlertCancelled:
    Components:
      - Type: container
        AccentColor: "#22c55e"
        Components:
          - Type: text_display
            Content:
              - "## ✅ Alert Cancelled"
              - ""
              - "The alert for this ticket has been cancelled by <@{cancelledBy}>."
          - Type: separator
          - Type: text_display
            Content: "-# Ticket System"
  Watch:
    Components:
      - Type: container
        AccentColor: "#3b82f6"
        Components:
          - Type: text_display
            Content:
              - "## 👁️ Watcher Added"
              - ""
              - "<@{watcherId}> is now watching this ticket."
          - Type: separator
          - Type: text_display
            Content: "-# Ticket System"
  CloseRequestSent:
    Components:
      - Type: container
        AccentColor: "#22c55e"
        Components:
          - Type: text_display
            Content: "✅ Close request sent to <@{userId}>."
  Blacklist:
    Added:
      Components:
        - Type: container
          AccentColor: "#ef4444"
          Components:
            - Type: section
              Text:
                Content:
                  - "## ⚠️ User Blacklisted"
                  - ""
                  - "<@{userId}> has been blacklisted from opening tickets."
                  - ""
                  - "**Reason:** {reason}"
                  - "**Blacklisted By:** <@{addedBy}>"
                  - "**Date:** {date}"
              Accessory:
                Type: thumbnail
                Media:
                  URL: "{userIcon}"
            - Type: separator
            - Type: text_display
              Content: "-# Contact an admin if you believe this is a mistake."
    View:
      Components:
        - Type: container
          AccentColor: "#f59e0b"
          Components:
            - Type: section
              Text:
                Content:
                  - "## 📋 Blacklist Information"
                  - ""
                  - "**User:** <@{userId}>"
                  - "**Blacklisted By:** <@{addedBy}>"
                  - "**Reason:** {reason}"
                  - "**Date:** {date}"
              Accessory:
                Type: thumbnail
                Media:
                  URL: "{userIcon}"
            - Type: separator
            - Type: text_display
              Content: "-# Contact an admin if you need more information."
    Removed:
      Components:
        - Type: container
          AccentColor: "#22c55e"
          Components:
            - Type: section
              Text:
                Content:
                  - "## ✅ User Removed from Blacklist"
                  - ""
                  - "<@{userId}> has been removed from the blacklist."
                  - ""
                  - "**Removed By:** <@{removedBy}>"
                  - "**Date:** {date}"
              Accessory:
                Type: thumbnail
                Media:
                  URL: "{userIcon}"
            - Type: separator
            - Type: text_display
              Content: "-# The user can now open tickets again."
    TempAdded:
      Components:
        - Type: container
          AccentColor: "#ff8c00"
          Components:
            - Type: section
              Text:
                Content:
                  - "## ⏱️ User Temporarily Blacklisted"
                  - ""
                  - "<@{userId}> has been temporarily blacklisted from opening tickets."
                  - ""
                  - "**Reason:** {reason}"
                  - "**Duration:** {duration}"
                  - "**Expires:** {expiresAt} ({expiresRelative})"
                  - "**Blacklisted By:** <@{addedBy}>"
                  - "**Date:** {date}"
              Accessory:
                Type: thumbnail
                Media:
                  URL: "{userIcon}"
            - Type: separator
            - Type: text_display
              Content: "-# This blacklist will expire automatically."
`;
                const ticketTypesMatch = tickets.match(/^TicketTypes\s*:/m);
                if (ticketTypesMatch) {
                    tickets = tickets.replace(/^TicketTypes\s*:/m, notifications + '\nTicketTypes:');
                } else {
                    tickets += notifications;
                }
                modified = true;
            }

            if (/^TicketNotifications\s*:/m.test(tickets) && !/TempAdded\s*:/m.test(tickets)) {
                const tempAddedBlock = `    TempAdded:
      Components:
        - Type: container
          AccentColor: "#ff8c00"
          Components:
            - Type: section
              Text:
                Content:
                  - "## ⏱️ User Temporarily Blacklisted"
                  - ""
                  - "<@{userId}> has been temporarily blacklisted from opening tickets."
                  - ""
                  - "**Reason:** {reason}"
                  - "**Duration:** {duration}"
                  - "**Expires:** {expiresAt} ({expiresRelative})"
                  - "**Blacklisted By:** <@{addedBy}>"
                  - "**Date:** {date}"
              Accessory:
                Type: thumbnail
                Media:
                  URL: "{userIcon}"
            - Type: separator
            - Type: text_display
              Content: "-# This blacklist will expire automatically."`;
                const removedMatch = tickets.match(/( {4}Removed:\s*\n(?:[\s\S]*?)-# The user can now open tickets again\."\n)/m);
                if (removedMatch) {
                    tickets = tickets.replace(removedMatch[0], removedMatch[0] + tempAddedBlock + '\n');
                    modified = true;
                }
            }

            // Check and add WatcherNotifications if missing
            if (!/^WatcherNotifications\s*:/m.test(tickets)) {
                const watcherNotifs = `
WatcherNotifications:
  Message:
    Components:
      - Type: container
        AccentColor: "#5865F2"
        Components:
          - Type: text_display
            Content:
              - "## 💬 New Message"
              - ""
              - "**Author:** <@{authorId}>"
              - "**Message:** {content}"
          - Type: separator
          - Type: text_display
            Content: "-# Ticket #{ticketId} • {guildName}"
  Claimed:
    Components:
      - Type: container
        AccentColor: "#22c55e"
        Components:
          - Type: text_display
            Content:
              - "## 🔒 Ticket Claimed"
              - ""
              - "Ticket has been claimed by <@{claimerId}>."
          - Type: separator
          - Type: text_display
            Content: "-# Ticket #{ticketId} • {guildName}"
  Unclaimed:
    Components:
      - Type: container
        AccentColor: "#f59e0b"
        Components:
          - Type: text_display
            Content:
              - "## 🔓 Ticket Unclaimed"
              - ""
              - "Ticket has been unclaimed by <@{unclaimerId}>."
          - Type: separator
          - Type: text_display
            Content: "-# Ticket #{ticketId} • {guildName}"
  Priority:
    Components:
      - Type: container
        AccentColor: "{priorityColor}"
        Components:
          - Type: text_display
            Content:
              - "## 📋 Priority Changed"
              - ""
              - "Priority changed from **{oldPriority}** to **{newPriority}** by <@{changedBy}>."
          - Type: separator
          - Type: text_display
            Content: "-# Ticket #{ticketId} • {guildName}"
  UserAdded:
    Components:
      - Type: container
        AccentColor: "#5865F2"
        Components:
          - Type: text_display
            Content:
              - "## ➕ User Added"
              - ""
              - "<@{addedUser}> was added to the ticket by <@{addedBy}>."
          - Type: separator
          - Type: text_display
            Content: "-# Ticket #{ticketId} • {guildName}"
  UserRemoved:
    Components:
      - Type: container
        AccentColor: "#ef4444"
        Components:
          - Type: text_display
            Content:
              - "## ➖ User Removed"
              - ""
              - "<@{removedUser}> was removed from the ticket by <@{removedBy}>."
          - Type: separator
          - Type: text_display
            Content: "-# Ticket #{ticketId} • {guildName}"
  Alert:
    Components:
      - Type: container
        AccentColor: "#ef4444"
        Components:
          - Type: text_display
            Content:
              - "## ⚠️ Ticket Alert Sent"
              - ""
              - "An inactivity alert was sent. The ticket will close if no response is received."
          - Type: separator
          - Type: text_display
            Content: "-# Ticket #{ticketId} • {guildName}"
  Closing:
    Components:
      - Type: container
        AccentColor: "#ef4444"
        Components:
          - Type: text_display
            Content:
              - "## 🔒 Ticket Closing"
              - ""
              - "Ticket is being closed by <@{closedBy}>."
              - "{reason}"
          - Type: separator
          - Type: text_display
            Content: "-# Ticket #{ticketId} • {guildName}"
  CloseRequest:
    Components:
      - Type: container
        AccentColor: "#f59e0b"
        Components:
          - Type: text_display
            Content:
              - "## 📩 Close Request"
              - ""
              - "A close request was sent by <@{requestedBy}>."
              - "**Reason:** {reason}"
          - Type: separator
          - Type: text_display
            Content: "-# Ticket #{ticketId} • {guildName}"
`;
                const ticketTypesMatch = tickets.match(/^TicketTypes\s*:/m);
                if (ticketTypesMatch) {
                    tickets = tickets.replace(/^TicketTypes\s*:/m, watcherNotifs + '\nTicketTypes:');
                } else {
                    tickets += watcherNotifs;
                }
                modified = true;
            }

            if (modified) {
                writeYaml(ticketsPath, tickets);
            }
        }
    } catch {}

    try {
        const levelingPath = path.join(MODULES_DIR, 'leveling.yml');
        let leveling = readYamlIfExists(levelingPath) || '';
        if (leveling) {
            if (!leveling.includes('XPBoostRoles')) {
                const lines = leveling.split('\n');
                const csIdx = lines.findIndex(l => /^\s+CooldownSettings\s*:\s*(?:#.*)?$/.test(l));
                if (csIdx !== -1) {
                    const ind = computeIndent(lines[csIdx]);
                    const block = [
                        '',
                        ' '.repeat(ind) + 'XPBoostRoles:',
                        ' '.repeat(ind + 2) + '- roleID: "ROLE_ID"',
                        ' '.repeat(ind + 2) + '  multiplier: 1.5',
                        ' '.repeat(ind + 2) + '- roleID: "ROLE_ID"',
                        ' '.repeat(ind + 2) + '  multiplier: 2.0',
                        ''
                    ];
                    lines.splice(csIdx, 0, ...block);
                    writeYaml(levelingPath, lines.join('\n'));
                }
            }
        }
    } catch {}

    try {
        const economyPath = path.join(MODULES_DIR, 'economy.yml');
        let economy = readYamlIfExists(economyPath) || '';
        if (economy) {
            let modified = false;

            if (economy.includes('xp_booster_1d') && !economy.includes('xp_booster_3d')) {
                const lines = economy.split('\n');
                let insertIdx = -1;
                for (let i = 0; i < lines.length; i++) {
                    if (/^\s+xp_booster_1d\s*:/.test(lines[i])) {
                        const baseIndent = computeIndent(lines[i]);
                        let j = i + 1;
                        while (j < lines.length) {
                            const t = lines[j].trim();
                            if (t === '') { j++; continue; }
                            if (computeIndent(lines[j]) <= baseIndent) break;
                            j++;
                        }
                        insertIdx = j;
                        break;
                    }
                }
                if (insertIdx !== -1) {
                    const newItems = [
                        '',
                        '    xp_booster_3d:',
                        '      name: "XP Booster (3 Days)"',
                        '      description: "Boost your XP gains by 50% for 3 days"',
                        '      category: "boosters"',
                        '      price: 25000',
                        '      rewardType: "booster"',
                        '      rewardData:',
                        '        boosterType: "XP"',
                        '        boosterMultiplier: 1.5',
                        '        boosterDuration: 259200000',
                        '      emoji: "🏆"',
                        '      sortOrder: 4',
                        '',
                        '    xp_booster_7d:',
                        '      name: "XP Booster (7 Days)"',
                        '      description: "Boost your XP gains by 75% for 7 days"',
                        '      category: "boosters"',
                        '      price: 50000',
                        '      rewardType: "booster"',
                        '      rewardData:',
                        '        boosterType: "XP"',
                        '        boosterMultiplier: 1.75',
                        '        boosterDuration: 604800000',
                        '      emoji: "✨"',
                        '      sortOrder: 5',
                        '      featured: true'
                    ];
                    lines.splice(insertIdx, 0, ...newItems);
                    economy = lines.join('\n');
                    modified = true;
                }
            }

            if (modified) {
                writeYaml(economyPath, economy);
            }
        }
    } catch {}

};
