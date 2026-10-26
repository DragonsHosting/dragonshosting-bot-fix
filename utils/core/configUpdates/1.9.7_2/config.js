module.exports = function applyConfigUpdates(helpers) {
    const {
        fs, path, yaml, colors,
        CONFIG_DIR, MODULES_DIR, CORE_CONFIG_PATH,
        readYamlIfExists, writeYaml, computeIndent,
        removeTopKey
    } = helpers;

    try {
        const verificationPath = path.join(MODULES_DIR, 'verification.yml');
        let content = readYamlIfExists(verificationPath) || '';
        if (!content) return;

        const yamlModule = require('js-yaml');
        const parsed = yamlModule.load(content);
        if (!parsed) return;

        if (parsed.VerificationButton && parsed.VerificationButton.Text === undefined) {
            const lines = content.split('\n');
            const colorLineIdx = lines.findIndex(l => /^\s+Color\s*:/.test(l));
            if (colorLineIdx !== -1) {
                const indent = lines[colorLineIdx].match(/^(\s*)/)[1];
                lines.splice(colorLineIdx + 1, 0, `${indent}Text: "Click the button to verify!"`);
                content = lines.join('\n');
                writeYaml(verificationPath, content);
                const reparsed = yamlModule.load(content);
                Object.assign(parsed, reparsed);
            }
        }

        const hasNewFormat = parsed.VerificationEmbed && parsed.VerificationEmbed.Components;
        if (hasNewFormat) {
            let changed = false;

            if (parsed.UseComponentsV2 !== undefined) {
                content = removeTopKey(content, 'UseComponentsV2');
                changed = true;
            }
            if (parsed.ComponentsV2) {
                content = removeTopKey(content, 'ComponentsV2');
                changed = true;
            }

            const oldEmbedFields = ['Title', 'Description', 'Footer', 'Author', 'Color', 'Image', 'Thumbnail'];
            if (parsed.VerificationEmbed && oldEmbedFields.some(f => parsed.VerificationEmbed[f])) {
                const lines = content.split('\n');
                const embedIdx = lines.findIndex(l => /^VerificationEmbed\s*:\s*(?:#.*)?$/.test(l.trim()));
                if (embedIdx !== -1) {
                    const embedIndent = computeIndent(lines[embedIdx]);
                    let embedEnd = embedIdx + 1;
                    while (embedEnd < lines.length) {
                        const t = lines[embedEnd].trim();
                        const ind = computeIndent(lines[embedEnd]);
                        if (t !== '' && ind <= embedIndent) break;
                        embedEnd++;
                    }

                    for (let i = embedEnd - 1; i > embedIdx; i--) {
                        const t = lines[i].trim();
                        const ind = computeIndent(lines[i]);
                        if (ind === embedIndent + 2 && oldEmbedFields.some(f => t.startsWith(f + ':'))) {
                            let blockEnd = i + 1;
                            while (blockEnd < embedEnd) {
                                const bt = lines[blockEnd].trim();
                                const bind = computeIndent(lines[blockEnd]);
                                if (bt !== '' && bind <= ind) break;
                                blockEnd++;
                            }
                            lines.splice(i, blockEnd - i);
                            changed = true;
                        }
                    }
                    content = lines.join('\n');
                }
            }

            const cleaned1 = cleanGapBetweenKeys(content, 'VerificationSettings', 'VerificationButton', '');
            if (cleaned1 !== content) { content = cleaned1; changed = true; }
            const cleaned2 = cleanGapBetweenKeys(content, 'VerificationButton', 'VerificationEmbed', EMBED_HEADER);
            if (cleaned2 !== content) { content = cleaned2; changed = true; }

            if (changed) {
                writeYaml(verificationPath, content);
            }
            return;
        }

        const hasOldEmbed = parsed.VerificationEmbed &&
            (parsed.VerificationEmbed.Title || parsed.VerificationEmbed.Description ||
             parsed.VerificationEmbed.Footer || parsed.VerificationEmbed.Image);

        let componentsData = null;

        if (hasOldEmbed) {
            componentsData = migrateOldEmbed(parsed.VerificationEmbed);
        } else if (parsed.ComponentsV2 && parsed.ComponentsV2.Components) {
            componentsData = stripButtonFromComponents(parsed.ComponentsV2.Components);
        }

        if (!componentsData) return;

        content = removeTopKey(content, 'UseComponentsV2');
        content = removeTopKey(content, 'ComponentsV2');
        content = removeTopKey(content, 'VerificationEmbed');

        content = cleanGapBetweenKeys(content, 'VerificationSettings', 'VerificationButton', '');
        content = cleanGapBetweenKeys(content, 'VerificationButton', null, '');

        const newEmbedYaml = yamlModule.dump(
            { VerificationEmbed: { Components: componentsData } },
            { indent: 2, lineWidth: -1, noRefs: true, quotingType: '"', forceQuotes: false }
        );

        const sep = content.endsWith('\n') ? '' : '\n';
        content = content + sep + '\n' + EMBED_HEADER + '\n' + newEmbedYaml;

        writeYaml(verificationPath, content);
    } catch {}
};

const EMBED_HEADER = [
    '# ===========================================================================',
    '# VERIFICATION MESSAGE DESIGN',
    '# ===========================================================================',
    '# Placeholders available:',
    '# {guildName} - Server name',
    '# {guildIcon} - Server icon URL',
    '# {memberCount} - Current member count'
].join('\n');

function cleanGapBetweenKeys(content, afterKey, beforeKey, replacement) {
    const lines = content.split('\n');

    const afterKeyRe = new RegExp(`^${afterKey}\\s*:`);
    const afterIdx = lines.findIndex(l => afterKeyRe.test(l.trim()));
    if (afterIdx === -1) return content;

    const afterIndent = computeIndentLocal(lines[afterIdx]);
    let blockEnd = afterIdx + 1;
    while (blockEnd < lines.length) {
        const t = lines[blockEnd].trim();
        if (t === '') { blockEnd++; continue; }
        const ind = computeIndentLocal(lines[blockEnd]);
        if (ind <= afterIndent) break;
        blockEnd++;
    }
    while (blockEnd > afterIdx + 1 && lines[blockEnd - 1].trim() === '') {
        blockEnd--;
    }

    let targetIdx;
    if (beforeKey) {
        const beforeKeyRe = new RegExp(`^${beforeKey}\\s*:`);
        targetIdx = lines.findIndex((l, i) => i >= blockEnd && beforeKeyRe.test(l.trim()));
        if (targetIdx === -1) return content;
    } else {
        targetIdx = lines.length;
    }

    const gapLines = lines.slice(blockEnd, targetIdx);
    const isAllCommentsOrEmpty = gapLines.every(l => l.trim() === '' || l.trim().startsWith('#'));

    if (!isAllCommentsOrEmpty) return content;

    const replacementLines = replacement ? ['', replacement] : [''];

    const result = [
        ...lines.slice(0, blockEnd),
        ...replacementLines,
        ...lines.slice(targetIdx)
    ];

    return result.join('\n');
}

function computeIndentLocal(line) {
    return line.length - line.trimStart().length;
}

function migrateOldEmbed(embed) {
    if (!embed) return null;

    const accentColor = embed.Color || '#5865F2';

    let textContent = '';
    const title = embed.Title?.trim() || '';
    const description = embed.Description || '';

    if (title && title !== '') {
        textContent = description ? `**${title}**\\n\\n${description}` : `**${title}**`;
    } else {
        textContent = description || '';
    }

    const footer = embed.Footer;
    if (footer && footer.Text) {
        textContent += `\\n\\n-# ${footer.Text}`;
    }

    const author = embed.Author;
    if (author && author.Text) {
        textContent = `**${author.Text}**\\n\\n${textContent}`;
    }

    const containerComponents = [];

    const sectionComponent = {
        Type: 'section',
        Text: { Content: textContent }
    };

    if (embed.Thumbnail && embed.Thumbnail.trim() !== '') {
        sectionComponent.Accessory = {
            Type: 'thumbnail',
            Media: { Url: embed.Thumbnail }
        };
    } else if (footer?.Icon && footer.Icon.trim() !== '') {
        sectionComponent.Accessory = {
            Type: 'thumbnail',
            Media: { Url: footer.Icon }
        };
    } else {
        sectionComponent.Accessory = {
            Type: 'thumbnail',
            Media: { Url: '{guildIcon}' }
        };
    }

    containerComponents.push(sectionComponent);

    if (embed.Image && embed.Image.trim() !== '') {
        containerComponents.push({
            Type: 'separator',
            Divider: true,
            Spacing: 'small'
        });
        containerComponents.push({
            Type: 'media_gallery',
            Items: [{ Media: { Url: embed.Image } }]
        });
    }

    return [{
        Type: 'container',
        AccentColor: accentColor,
        Spoiler: false,
        Components: containerComponents
    }];
}

function stripButtonFromComponents(components) {
    if (!Array.isArray(components)) return components;

    return components.filter(comp => {
        if (!comp || !comp.Components) return true;

        const hasOnlyButtonSection = comp.Components.length === 1 &&
            comp.Components[0]?.Type?.toLowerCase() === 'section' &&
            comp.Components[0]?.Accessory?.Type?.toLowerCase() === 'button' &&
            comp.Components[0]?.Accessory?.CustomId === 'verifyButton';

        return !hasOnlyButtonSection;
    });
}
