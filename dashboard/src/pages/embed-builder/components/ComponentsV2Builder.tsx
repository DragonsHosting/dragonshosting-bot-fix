import React, { useState, useEffect } from 'react';
import { Reorder, motion, AnimatePresence } from 'framer-motion';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faBox,
    faLayerGroup,
    faFont,
    faImage,
    faMinus,
    faFile,
    faSquare,
    faTrash,
    faGripVertical,
    faPlus,
    faChevronDown,
    faPaperPlane,
    faHashtag,
    faCopy,
    faCode,
    faSave,
    faFolderOpen,
    faTimes,
    faUpload,
    faSpinner
} from '@fortawesome/free-solid-svg-icons';
import axios from 'axios';
import { toast } from '../../../components/ui/Toast';

type V2ComponentType = 'container' | 'section' | 'text_display' | 'media_gallery' | 'separator' | 'file' | 'action_row' | 'button';

interface V2Component {
    id: string;
    type: V2ComponentType;
    properties: Record<string, any>;
    children?: V2Component[];
}

interface ComponentDefinition {
    type: V2ComponentType;
    label: string;
    icon: any;
    description: string;
    defaultProperties: Record<string, any>;
    canHaveChildren?: boolean;
}

const componentDefinitions: ComponentDefinition[] = [
    {
        type: 'container',
        label: 'Container',
        icon: faBox,
        description: 'A container that holds other components',
        defaultProperties: { accent_color: 0x5865F2, spoiler: false },
        canHaveChildren: true
    },
    {
        type: 'section',
        label: 'Section',
        icon: faLayerGroup,
        description: 'A section with text and optional accessory',
        defaultProperties: { 
            text: { content: '' },
            accessory: null
        }
    },
    {
        type: 'text_display',
        label: 'Text Display',
        icon: faFont,
        description: 'Rich text content display',
        defaultProperties: { content: '' }
    },
    {
        type: 'media_gallery',
        label: 'Media Gallery',
        icon: faImage,
        description: 'Display up to 10 media items',
        defaultProperties: { items: [] }
    },
    {
        type: 'separator',
        label: 'Separator',
        icon: faMinus,
        description: 'Visual divider between components',
        defaultProperties: { divider: true, spacing: 'small' }
    },
    {
        type: 'file',
        label: 'File',
        icon: faFile,
        description: 'File attachment display',
        defaultProperties: { file: { url: '', filename: '' }, spoiler: false }
    },
    {
        type: 'button',
        label: 'Link Button',
        icon: faSquare,
        description: 'Button that opens a URL',
        defaultProperties: { 
            style: 'link',
            label: 'Click Here',
            url: '',
            disabled: false
        }
    }
];

const generateId = () => `comp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

interface Channel {
    id: string;
    name: string;
    type: number;
    parent?: { id: string; name: string };
}

interface CategoryGroup {
    id: string;
    name: string;
    channels: Channel[];
}

interface V2Template {
    _id: string;
    name: string;
    components: V2Component[];
    createdAt: string;
    updatedAt: string;
}

const ComponentsV2Builder: React.FC = () => {
    const [components, setComponents] = useState<V2Component[]>([]);
    const [selectedComponent, setSelectedComponent] = useState<string | null>(null);
    const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
    const [channels, setChannels] = useState<Channel[]>([]);
    const [selectedChannel, setSelectedChannel] = useState<string>('');
    const [isSending, setIsSending] = useState(false);
    const [showJson, setShowJson] = useState(false);
    const [templates, setTemplates] = useState<V2Template[]>([]);
    const [isTemplatesModalOpen, setIsTemplatesModalOpen] = useState(false);
    const [uploadingFiles, setUploadingFiles] = useState<Set<string>>(new Set());

    const uploadFile = async (file: File, componentId: string): Promise<{ uploadId: string; filename: string } | null> => {
        if (file.size > 25 * 1024 * 1024) {
            toast.error('File too large (max 25MB)');
            return null;
        }
        
        setUploadingFiles(prev => new Set(prev).add(componentId));
        try {
            const base64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
            
            const csrfToken = document.cookie.match(/XSRF-TOKEN=([^;]+)/)?.[1];
            const response = await fetch('/api/channels/upload', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    ...(csrfToken && { 'X-XSRF-TOKEN': decodeURIComponent(csrfToken) })
                },
                body: JSON.stringify({ data: base64, filename: file.name, mimetype: file.type })
            });
            
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || 'Upload failed');
            }
            return await response.json();
        } catch (error: any) {
            console.error('Upload error:', error);
            toast.error(error.message || 'Failed to upload file');
            return null;
        } finally {
            setUploadingFiles(prev => {
                const next = new Set(prev);
                next.delete(componentId);
                return next;
            });
        }
    };

    useEffect(() => {
        fetchChannels();
        fetchTemplates();
    }, []);

    const fetchChannels = async () => {
        try {
            const response = await axios.get('/api/channels');
            setChannels(response.data.filter((channel: Channel) => channel.type === 0 || channel.type === 5));
        } catch (error) {
            console.error('Error fetching channels:', error);
        }
    };

    const fetchTemplates = async () => {
        try {
            const response = await axios.get('/api/templates/v2');
            setTemplates(Array.isArray(response.data) ? response.data : []);
        } catch (error) {
            console.error('Error fetching templates:', error);
            setTemplates([]);
        }
    };

    const handleSaveTemplate = async () => {
        if (components.length === 0) {
            toast.error('Add at least one component before saving');
            return;
        }

        const name = prompt('Enter a name for this template:');
        if (!name?.trim()) return;

        const existingTemplate = templates.find(t => t.name === name);
        if (existingTemplate) {
            if (!confirm('A template with this name exists. Overwrite it?')) return;
        }

        try {
            await axios.post('/api/templates/v2', { name, components });
            await fetchTemplates();
            toast.success('Template saved! 💾');
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Failed to save template');
        }
    };

    const handleLoadTemplate = (template: V2Template) => {
        const regenerateIds = (comps: V2Component[]): V2Component[] => {
            return comps.map(comp => ({
                ...comp,
                id: generateId(),
                children: comp.children ? regenerateIds(comp.children) : undefined
            }));
        };

        const comps = Array.isArray(template.components) ? template.components : [];
        setComponents(regenerateIds(comps));
        setSelectedComponent(null);
        setSelectedChildId(null);
        setIsTemplatesModalOpen(false);
        toast.success(`Loaded "${template.name}"`);
    };

    const handleDeleteTemplate = async (templateId: string) => {
        if (!confirm('Delete this template?')) return;

        try {
            await axios.delete(`/api/templates/v2/${templateId}`);
            await fetchTemplates();
            toast.success('Template deleted');
        } catch (error) {
            toast.error('Failed to delete template');
        }
    };

    const handleImportJson = () => {
        const json = prompt('Paste your JSON:');
        if (!json?.trim()) return;

        try {
            const parsed = JSON.parse(json);
            
            const convertButton = (comp: any): V2Component => ({
                id: generateId(),
                type: 'button',
                properties: {
                    style: 'link',
                    label: comp.label || 'Click Here',
                    url: comp.url || '',
                    disabled: comp.disabled || false
                }
            });

            const convertDiscordComponent = (comp: any): V2Component | V2Component[] | null => {
                if (comp.type === 1) {
                    return (comp.components || [])
                        .filter((c: any) => c.type === 2)
                        .map((c: any) => convertButton(c));
                }
                
                if (comp.type === 2) {
                    return convertButton(comp);
                }

                const typeMap: Record<number, V2ComponentType> = {
                    17: 'container',
                    9: 'section',
                    10: 'text_display',
                    12: 'media_gallery',
                    14: 'separator',
                    13: 'file'
                };

                const internalType = typeMap[comp.type];
                if (!internalType) return null;

                const converted: V2Component = {
                    id: generateId(),
                    type: internalType,
                    properties: {},
                    children: undefined
                };

                switch (internalType) {
                    case 'container':
                        converted.properties = {
                            accent_color: comp.accent_color != null ? comp.accent_color : undefined,
                            spoiler: comp.spoiler || false
                        };
                        if (comp.components && Array.isArray(comp.components)) {
                            const children: V2Component[] = [];
                            for (const child of comp.components) {
                                const result = convertDiscordComponent(child);
                                if (Array.isArray(result)) {
                                    children.push(...result);
                                } else if (result) {
                                    children.push(result);
                                }
                            }
                            converted.children = children;
                        }
                        break;
                    case 'text_display':
                        converted.properties = { content: comp.content || '' };
                        break;
                    case 'media_gallery':
                        converted.properties = { items: comp.items || [] };
                        break;
                    case 'separator':
                        converted.properties = {
                            divider: comp.divider !== false,
                            spacing: comp.spacing === 2 ? 'large' : 'small'
                        };
                        break;
                    case 'section':
                        const textComp = comp.components?.find((c: any) => c.type === 10);
                        converted.properties = {
                            text: { content: textComp?.content || '' },
                            accessory: comp.accessory || null
                        };
                        break;
                    case 'file':
                        converted.properties = {
                            file: comp.file || { url: '', filename: '' },
                            spoiler: comp.spoiler || false
                        };
                        break;
                }

                return converted;
            };

            let componentsToImport: any[];

            if (parsed.components && Array.isArray(parsed.components)) {
                componentsToImport = parsed.components;
            } else if (Array.isArray(parsed)) {
                componentsToImport = parsed;
            } else {
                toast.error('Invalid format - expected components array or Discord message payload');
                return;
            }

            const hasDiscordTypes = componentsToImport.some(c => typeof c.type === 'number');
            
            if (hasDiscordTypes) {
                const converted: V2Component[] = [];
                for (const comp of componentsToImport) {
                    const result = convertDiscordComponent(comp);
                    if (Array.isArray(result)) {
                        converted.push(...result);
                    } else if (result) {
                        converted.push(result);
                    }
                }
                setComponents(converted);
            } else {
                const regenerateIds = (comps: any[]): V2Component[] => {
                    return comps.map(comp => ({
                        ...comp,
                        id: generateId(),
                        children: comp.children ? regenerateIds(comp.children) : undefined
                    }));
                };
                setComponents(regenerateIds(componentsToImport));
            }
            
            toast.success('Components imported!');
        } catch (e) {
            toast.error('Invalid JSON');
        }
    };

    const groupedChannels = channels.reduce<CategoryGroup[]>((acc, channel) => {
        if (!channel.parent) {
            const noCategoryGroup = acc.find(g => g.id === 'no-category');
            if (noCategoryGroup) {
                noCategoryGroup.channels.push(channel);
            } else {
                acc.push({ id: 'no-category', name: 'No Category', channels: [channel] });
            }
        } else {
            const categoryGroup = acc.find(g => g.id === channel.parent?.id);
            if (categoryGroup) {
                categoryGroup.channels.push(channel);
            } else {
                acc.push({ id: channel.parent.id, name: channel.parent.name, channels: [channel] });
            }
        }
        return acc;
    }, []);

    const addComponent = (type: V2ComponentType) => {
        const definition = componentDefinitions.find(d => d.type === type);
        if (!definition) return;

        const newComponent: V2Component = {
            id: generateId(),
            type,
            properties: { ...definition.defaultProperties },
            children: definition.canHaveChildren ? [] : undefined
        };

        setComponents([...components, newComponent]);
        setSelectedComponent(newComponent.id);
    };

    const removeComponent = (id: string) => {
        setComponents(components.filter(c => c.id !== id));
        if (selectedComponent === id) {
            setSelectedComponent(null);
            setSelectedChildId(null);
        }
    };

    const duplicateComponent = (id: string) => {
        const component = components.find(c => c.id === id);
        if (!component) return;

        const duplicated: V2Component = {
            ...component,
            id: generateId(),
            properties: { ...component.properties },
            children: component.children ? [...component.children] : undefined
        };

        const index = components.findIndex(c => c.id === id);
        const newComponents = [...components];
        newComponents.splice(index + 1, 0, duplicated);
        setComponents(newComponents);
    };

    const updateComponentProperty = (id: string, path: string, value: any) => {
        setComponents(components.map(c => {
            if (c.id !== id) return c;
            
            if (path === '_children') {
                return { ...c, children: value };
            }
            
            const keys = path.split('.');
            const newProperties = { ...c.properties };
            let current: any = newProperties;
            
            for (let i = 0; i < keys.length - 1; i++) {
                current[keys[i]] = { ...current[keys[i]] };
                current = current[keys[i]];
            }
            current[keys[keys.length - 1]] = value;
            
            return { ...c, properties: newProperties };
        }));
    };

    const getSelectedComponentData = () => {
        return components.find(c => c.id === selectedComponent);
    };

    const generateDiscordPayload = () => {
        const cleanObject = (obj: any): any => {
            if (obj === null || obj === undefined) return undefined;
            if (Array.isArray(obj)) return obj.map(cleanObject).filter(v => v !== undefined);
            if (typeof obj !== 'object') return obj;
            
            const cleaned: any = {};
            for (const [key, value] of Object.entries(obj)) {
                const cleanedValue = cleanObject(value);
                if (cleanedValue !== undefined && cleanedValue !== null) {
                    cleaned[key] = cleanedValue;
                }
            }
            return Object.keys(cleaned).length > 0 ? cleaned : undefined;
        };

        const convertButton = (comp: V2Component): any => {
            const btn: any = {
                type: 2,
                style: 5,
                label: comp.properties.label || 'Click Here'
            };
            if (comp.properties.url) {
                btn.url = comp.properties.url;
            }
            if (comp.properties.disabled) {
                btn.disabled = true;
            }
            return btn;
        };

        const convertComponent = (comp: V2Component, isInsideContainer: boolean = false): any => {
            let result: any;
            
            switch (comp.type) {
                case 'container':
                    if (isInsideContainer) {
                        return null;
                    }
                    const childComponents: any[] = [];
                    let buttonBatch: V2Component[] = [];
                    
                    const flushButtons = () => {
                        if (buttonBatch.length > 0) {
                            childComponents.push({
                                type: 1,
                                components: buttonBatch.map(b => convertButton(b))
                            });
                            buttonBatch = [];
                        }
                    };
                    
                    for (const child of (comp.children || [])) {
                        if (child.type === 'button') {
                            buttonBatch.push(child);
                            if (buttonBatch.length >= 5) {
                                flushButtons();
                            }
                        } else {
                            flushButtons();
                            const converted = convertComponent(child, true);
                            if (converted) {
                                childComponents.push(converted);
                            }
                        }
                    }
                    flushButtons();
                    
                    if (childComponents.length === 0) {
                        return null;
                    }
                    
                    result = {
                        type: 17,
                        components: childComponents
                    };
                    if (comp.properties.accent_color != null) {
                        result.accent_color = comp.properties.accent_color;
                    }
                    if (comp.properties.spoiler) {
                        result.spoiler = true;
                    }
                    break;
                case 'section':
                    if (comp.properties.accessory) {
                        result = {
                            type: 9,
                            components: [
                                { type: 10, content: comp.properties.text?.content || '' }
                            ],
                            accessory: cleanObject(comp.properties.accessory)
                        };
                    } else {
                        result = {
                            type: 10,
                            content: comp.properties.text?.content || ''
                        };
                    }
                    break;
                case 'text_display':
                    result = {
                        type: 10,
                        content: comp.properties.content || ''
                    };
                    break;
                case 'media_gallery':
                    result = {
                        type: 12,
                        items: (comp.properties.items || []).filter((item: any) => item?.media?.url || item?.media?.uploadId)
                    };
                    break;
                case 'separator':
                    result = {
                        type: 14,
                        divider: comp.properties.divider !== false,
                        spacing: comp.properties.spacing === 'large' ? 2 : 1
                    };
                    break;
                case 'file':
                    result = {
                        type: 13,
                        file: comp.properties.file
                    };
                    if (comp.properties.spoiler) {
                        result.spoiler = true;
                    }
                    break;
                case 'button':
                    if (isInsideContainer) {
                        return null;
                    }
                    result = {
                        type: 1,
                        components: [convertButton(comp)]
                    };
                    break;
                default:
                    return null;
            }
            
            return result;
        };

        return {
            flags: 32768,
            components: components.map(c => convertComponent(c, false)).filter(Boolean)
        };
    };

    const validateComponents = (comps: V2Component[]): string | null => {
        for (const comp of comps) {
            if (comp.type === 'media_gallery' && comp.properties.items) {
                for (const item of comp.properties.items) {
                    if (item.media?.uploadId) continue;
                    const url = item.media?.url || '';
                    if (url.startsWith('data:')) {
                        return 'Media Gallery contains a base64 image. Please upload the image or use a hosted URL.';
                    }
                    if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
                        return 'Media Gallery contains an invalid URL. URLs must start with http:// or https://';
                    }
                }
            }
            if (comp.type === 'file') {
                const hasUpload = comp.properties.file?.uploadId;
                const hasUrl = comp.properties.file?.url?.trim();
                if (!hasUpload && !hasUrl) {
                    return 'File component requires either an uploaded file or a URL';
                }
            }
            if (comp.type === 'button') {
                const url = comp.properties.url;
                if (!url || !url.trim()) {
                    return 'Link Button requires a URL';
                }
                if (!url.startsWith('http://') && !url.startsWith('https://')) {
                    return 'Button URL must start with http:// or https://';
                }
            }
            if (comp.children) {
                const childError = validateComponents(comp.children);
                if (childError) return childError;
            }
        }
        return null;
    };

    const handleSend = async () => {
        if (!selectedChannel) {
            toast.error('Please select a channel');
            return;
        }

        if (components.length === 0) {
            toast.error('Please add at least one component');
            return;
        }

        const validationError = validateComponents(components);
        if (validationError) {
            toast.error(validationError, { duration: 6000 });
            return;
        }

        setIsSending(true);

        try {
            const payload = generateDiscordPayload();
            const csrfToken = document.cookie.match(/XSRF-TOKEN=([^;]+)/)?.[1];
            
            const response = await fetch(`/api/channels/${selectedChannel}/messages`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    ...(csrfToken && { 'X-XSRF-TOKEN': decodeURIComponent(csrfToken) }),
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error('Discord API error:', errorData);
                let errorMsg = errorData.error || errorData.message || 'Failed to send message';
                if (errorData.details) {
                    const detailStr = JSON.stringify(errorData.details);
                    if (detailStr.length < 200) {
                        errorMsg += `: ${detailStr}`;
                    }
                }
                throw new Error(errorMsg);
            }

            toast.success('Components V2 message sent! 🚀');
        } catch (error: any) {
            console.error('Error sending message:', error);
            toast.error(error.message || 'Failed to send message', { duration: 8000 });
        } finally {
            setIsSending(false);
        }
    };

    const copyJson = () => {
        const payload = generateDiscordPayload();
        navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
        toast.success('JSON copied to clipboard!');
    };

    const selectedData = getSelectedComponentData();

    return (
        <div className="space-y-6">
            <div className="glass-card rounded-2xl p-6">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h2 className="text-2xl font-semibold text-foreground">Components V2 Builder</h2>
                        <p className="text-sm text-muted-foreground mt-1">
                            Build advanced Discord messages with drag-and-drop components
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setIsTemplatesModalOpen(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-secondary text-foreground rounded-lg hover:bg-secondary/80 transition-colors"
                        >
                            <FontAwesomeIcon icon={faFolderOpen} className="w-4 h-4" />
                            <span>Templates</span>
                        </button>
                        <button
                            onClick={handleSaveTemplate}
                            className="flex items-center gap-2 px-4 py-2 bg-primary/20 text-primary rounded-lg hover:bg-primary/30 transition-colors"
                        >
                            <FontAwesomeIcon icon={faSave} className="w-4 h-4" />
                            <span>Save</span>
                        </button>
                        <button
                            onClick={handleImportJson}
                            className="flex items-center gap-2 px-4 py-2 bg-secondary text-foreground rounded-lg hover:bg-secondary/80 transition-colors"
                        >
                            <FontAwesomeIcon icon={faCode} className="w-4 h-4" />
                            <span>Import</span>
                        </button>
                        <button
                            onClick={() => setShowJson(!showJson)}
                            className="flex items-center gap-2 px-4 py-2 bg-secondary text-foreground rounded-lg hover:bg-secondary/80 transition-colors"
                        >
                            <FontAwesomeIcon icon={faCode} className="w-4 h-4" />
                            <span>{showJson ? 'Hide' : 'Show'} JSON</span>
                        </button>
                        <button
                            onClick={copyJson}
                            className="flex items-center gap-2 px-4 py-2 bg-secondary text-foreground rounded-lg hover:bg-secondary/80 transition-colors"
                        >
                            <FontAwesomeIcon icon={faCopy} className="w-4 h-4" />
                            <span>Copy</span>
                        </button>
                    </div>
                </div>

                <div className="relative mb-6">
                    <select
                        value={selectedChannel}
                        onChange={(e) => setSelectedChannel(e.target.value)}
                        className="w-full bg-secondary border border-border rounded-xl pl-10 pr-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all duration-200 appearance-none"
                    >
                        <option value="">Select a channel...</option>
                        {groupedChannels.map(group => (
                            <optgroup key={group.id} label={group.name}>
                                {group.channels.map(channel => (
                                    <option key={channel.id} value={channel.id}>
                                        {channel.type === 5 ? '📢' : '💬'} {channel.name}
                                    </option>
                                ))}
                            </optgroup>
                        ))}
                    </select>
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <FontAwesomeIcon icon={faHashtag} className="w-4 h-4 text-primary" />
                    </div>
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                        <FontAwesomeIcon icon={faChevronDown} className="w-4 h-4 text-primary" />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                <div className="xl:col-span-3">
                    <div className="glass-card rounded-2xl p-4 sticky top-4">
                        <h3 className="text-sm font-semibold text-foreground mb-4 uppercase tracking-wider">Components</h3>
                        <div className="space-y-2">
                            {componentDefinitions.map((def) => (
                                <motion.button
                                    key={def.type}
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => addComponent(def.type)}
                                    className="w-full flex items-center gap-3 p-3 rounded-xl bg-secondary/50 hover:bg-secondary border border-border hover:border-primary/30 transition-all text-left group"
                                >
                                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary/20 transition-colors">
                                        <FontAwesomeIcon icon={def.icon} className="w-4 h-4" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-foreground">{def.label}</p>
                                        <p className="text-xs text-muted-foreground truncate">{def.description}</p>
                                    </div>
                                    <FontAwesomeIcon icon={faPlus} className="w-3 h-3 text-muted-foreground group-hover:text-primary transition-colors" />
                                </motion.button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="xl:col-span-5">
                    <div className="glass-card rounded-2xl p-4">
                        <h3 className="text-sm font-semibold text-foreground mb-4 uppercase tracking-wider">Canvas</h3>
                        
                        {components.length === 0 ? (
                            <div className="border-2 border-dashed border-border rounded-xl p-12 text-center">
                                <div className="w-16 h-16 rounded-2xl bg-secondary/50 flex items-center justify-center mx-auto mb-4">
                                    <FontAwesomeIcon icon={faLayerGroup} className="w-6 h-6 text-muted-foreground" />
                                </div>
                                <p className="text-muted-foreground mb-2">No components added yet</p>
                                <p className="text-sm text-muted-foreground/60">Click a component from the left panel to add it</p>
                            </div>
                        ) : (
                            <Reorder.Group
                                axis="y"
                                values={components}
                                onReorder={setComponents}
                                className="space-y-2"
                            >
                                <AnimatePresence>
                                    {components.map((component) => {
                                        const def = componentDefinitions.find(d => d.type === component.type);
                                        const isSelected = selectedComponent === component.id && !selectedChildId;
                                        const isContainer = component.type === 'container';
                                        
                                        return (
                                            <div key={component.id}>
                                                <Reorder.Item
                                                    value={component}
                                                    className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                                                        isSelected 
                                                            ? 'bg-primary/10 border-primary/50' 
                                                            : 'bg-secondary/30 border-border hover:border-primary/30'
                                                    }`}
                                                    onClick={() => { setSelectedComponent(component.id); setSelectedChildId(null); }}
                                                >
                                                    <div className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground">
                                                        <FontAwesomeIcon icon={faGripVertical} className="w-4 h-4" />
                                                    </div>
                                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isSelected ? 'bg-primary/20 text-primary' : 'bg-secondary text-muted-foreground'}`}>
                                                        <FontAwesomeIcon icon={def?.icon || faBox} className="w-3.5 h-3.5" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <p className="text-sm font-medium text-foreground">{def?.label}</p>
                                                            {isSelected && (
                                                                <span className="text-[10px] px-1.5 py-0.5 bg-primary/20 text-primary rounded font-medium">EDITING</span>
                                                            )}
                                                        </div>
                                                        <p className="text-xs text-muted-foreground truncate">
                                                            {component.type === 'text_display' && component.properties.content
                                                                ? component.properties.content.substring(0, 40) + (component.properties.content.length > 40 ? '...' : '')
                                                                : component.type === 'button'
                                                                ? `Button: ${component.properties.label || 'Untitled'}`
                                                                : component.type === 'section' && component.properties.text?.content
                                                                ? component.properties.text.content.substring(0, 40) + (component.properties.text.content.length > 40 ? '...' : '')
                                                                : component.type === 'container'
                                                                ? `${component.children?.length || 0} child components`
                                                                : component.type === 'media_gallery'
                                                                ? `${component.properties.items?.length || 0} media items`
                                                                : component.type === 'separator'
                                                                ? `${component.properties.spacing || 'small'} spacing`
                                                                : component.type === 'file' && component.properties.file?.filename
                                                                ? component.properties.file.filename
                                                                : 'Click to edit →'}
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); duplicateComponent(component.id); }}
                                                            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                                                            title="Duplicate"
                                                        >
                                                            <FontAwesomeIcon icon={faCopy} className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); removeComponent(component.id); }}
                                                            className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                                            title="Remove"
                                                        >
                                                            <FontAwesomeIcon icon={faTrash} className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </Reorder.Item>
                                                
                                                {isContainer && component.children && component.children.length > 0 && (
                                                    <div className="ml-6 mt-1 space-y-1 border-l-2 border-primary/20 pl-3">
                                                        {component.children.map((child: V2Component, childIndex: number) => {
                                                            const childDef = componentDefinitions.find(d => d.type === child.type);
                                                            const isChildSelected = selectedComponent === component.id && selectedChildId === child.id;
                                                            
                                                            return (
                                                                <motion.div
                                                                    key={child.id}
                                                                    initial={{ opacity: 0, x: -10 }}
                                                                    animate={{ opacity: 1, x: 0 }}
                                                                    className={`flex items-center gap-2 p-2 rounded-lg border transition-all cursor-pointer ${
                                                                        isChildSelected
                                                                            ? 'bg-primary/10 border-primary/50'
                                                                            : 'bg-secondary/20 border-border/50 hover:border-primary/30'
                                                                    }`}
                                                                    onClick={(e) => { 
                                                                        e.stopPropagation();
                                                                        setSelectedComponent(component.id); 
                                                                        setSelectedChildId(child.id); 
                                                                    }}
                                                                >
                                                                    <div className={`w-6 h-6 rounded-md flex items-center justify-center ${isChildSelected ? 'bg-primary/20 text-primary' : 'bg-secondary/50 text-muted-foreground'}`}>
                                                                        <FontAwesomeIcon icon={childDef?.icon || faBox} className="w-3 h-3" />
                                                                    </div>
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className="flex items-center gap-2">
                                                                            <p className="text-xs font-medium text-foreground">{childDef?.label}</p>
                                                                            {isChildSelected && (
                                                                                <span className="text-[9px] px-1 py-0.5 bg-primary/20 text-primary rounded font-medium">EDITING</span>
                                                                            )}
                                                                        </div>
                                                                        <p className="text-[10px] text-muted-foreground truncate">
                                                                            {child.type === 'text_display' && child.properties.content
                                                                                ? child.properties.content.substring(0, 25) + '...'
                                                                                : child.type === 'button'
                                                                                ? child.properties.label || 'Link'
                                                                                : child.type === 'section' && child.properties.text?.content
                                                                                ? child.properties.text.content.substring(0, 25) + '...'
                                                                                : 'Click to edit'}
                                                                        </p>
                                                                    </div>
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            const newChildren = component.children?.filter((_: V2Component, i: number) => i !== childIndex) || [];
                                                                            setComponents(components.map(c => 
                                                                                c.id === component.id ? { ...c, children: newChildren } : c
                                                                            ));
                                                                            if (selectedChildId === child.id) {
                                                                                setSelectedChildId(null);
                                                                            }
                                                                        }}
                                                                        className="p-1 rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                                                        title="Remove"
                                                                    >
                                                                        <FontAwesomeIcon icon={faTrash} className="w-3 h-3" />
                                                                    </button>
                                                                </motion.div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </AnimatePresence>
                            </Reorder.Group>
                        )}
                    </div>

                    <button
                        onClick={handleSend}
                        disabled={!selectedChannel || isSending || components.length === 0}
                        className="w-full mt-4 flex items-center justify-center gap-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl px-6 py-3 font-medium hover:from-blue-600 hover:to-purple-700 transition-all duration-200 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSending ? (
                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                            <FontAwesomeIcon icon={faPaperPlane} className="w-4 h-4" />
                        )}
                        <span>{isSending ? 'Sending...' : 'Send Message'}</span>
                    </button>
                </div>

                <div className="xl:col-span-4">
                    <div className="glass-card rounded-2xl p-4 sticky top-4">
                        {(() => {
                            const parentComponent = selectedData;
                            const childComponent = parentComponent && selectedChildId 
                                ? parentComponent.children?.find((c: V2Component) => c.id === selectedChildId)
                                : null;
                            const isEditing = parentComponent && !selectedChildId || childComponent;
                            
                            return (
                                <>
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                                                {isEditing ? 'Edit Properties' : 'Live Preview'}
                                            </h3>
                                            {childComponent && (
                                                <span className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded">Child</span>
                                            )}
                                        </div>
                                        {isEditing && (
                                            <button
                                                onClick={() => { 
                                                    if (selectedChildId) {
                                                        setSelectedChildId(null);
                                                    } else {
                                                        setSelectedComponent(null);
                                                    }
                                                }}
                                                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                                            >
                                                {selectedChildId ? '← Back to Container' : 'Show Preview →'}
                                            </button>
                                        )}
                                    </div>

                                    {childComponent ? (
                                        <ChildPropertyEditor
                                            child={childComponent}
                                            parentId={parentComponent!.id}
                                            childIndex={parentComponent!.children?.findIndex((c: V2Component) => c.id === selectedChildId) || 0}
                                            onUpdate={(newChild) => {
                                                setComponents(components.map(c => {
                                                    if (c.id !== parentComponent!.id) return c;
                                                    const newChildren = c.children?.map((child: V2Component) =>
                                                        child.id === selectedChildId ? newChild : child
                                                    ) || [];
                                                    return { ...c, children: newChildren };
                                                }));
                                            }}
                                            onUpload={uploadFile}
                                            uploadingFiles={uploadingFiles}
                                        />
                                    ) : parentComponent ? (
                                        <ComponentPropertyEditor
                                            component={parentComponent}
                                            onUpdate={(path, value) => updateComponentProperty(parentComponent.id, path, value)}
                                            onUpload={uploadFile}
                                            uploadingFiles={uploadingFiles}
                                        />
                                    ) : components.length === 0 ? (
                                        <div className="text-center py-8">
                                            <p className="text-muted-foreground text-sm mb-2">No components yet</p>
                                            <p className="text-xs text-muted-foreground/60">Add components from the left panel, then click them to edit</p>
                                        </div>
                                    ) : (
                                        <ComponentsV2Preview components={components} />
                                    )}
                                </>
                            );
                        })()}

                        {showJson && (
                            <div className="mt-4 pt-4 border-t border-border">
                                <h4 className="text-xs font-semibold text-muted-foreground mb-2 uppercase">JSON Output</h4>
                                <pre className="bg-[#1a1a2e] rounded-lg p-3 text-xs text-green-400 overflow-auto max-h-64 font-mono">
                                    {JSON.stringify(generateDiscordPayload(), null, 2)}
                                </pre>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <AnimatePresence>
                {isTemplatesModalOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
                        onClick={() => setIsTemplatesModalOpen(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="glass-card rounded-2xl p-6 w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h2 className="text-xl font-semibold text-foreground">V2 Templates</h2>
                                    <p className="text-sm text-muted-foreground">Load or manage saved component layouts</p>
                                </div>
                                <button
                                    onClick={() => setIsTemplatesModalOpen(false)}
                                    className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors"
                                >
                                    <FontAwesomeIcon icon={faTimes} className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto">
                                {templates && templates.length > 0 ? (
                                    <div className="grid gap-3">
                                        {templates.map(template => {
                                            const comps = Array.isArray(template.components) ? template.components : [];
                                            return (
                                                <div
                                                    key={template._id}
                                                    className="bg-secondary/50 border border-border rounded-xl p-4 hover:border-primary/30 transition-colors"
                                                >
                                                    <div className="flex items-start justify-between">
                                                        <div className="flex-1">
                                                            <h3 className="font-medium text-foreground">{template.name}</h3>
                                                            <p className="text-xs text-muted-foreground mt-1">
                                                                {comps.length} component{comps.length !== 1 ? 's' : ''} • 
                                                                Updated {new Date(template.updatedAt).toLocaleDateString()}
                                                            </p>
                                                            <div className="flex flex-wrap gap-1 mt-2">
                                                                {comps.slice(0, 5).map((comp: V2Component, i: number) => {
                                                                    const def = componentDefinitions.find(d => d.type === comp.type);
                                                                    return (
                                                                        <span key={i} className="text-[10px] px-2 py-0.5 bg-secondary rounded text-muted-foreground">
                                                                            {def?.label || comp.type}
                                                                        </span>
                                                                    );
                                                                })}
                                                                {comps.length > 5 && (
                                                                    <span className="text-[10px] px-2 py-0.5 bg-secondary rounded text-muted-foreground">
                                                                        +{comps.length - 5} more
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-2 ml-4">
                                                            <button
                                                                onClick={() => handleLoadTemplate(template)}
                                                                className="px-3 py-1.5 bg-primary text-white rounded-lg text-sm hover:bg-primary/80 transition-colors"
                                                            >
                                                                Load
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteTemplate(template._id)}
                                                                className="p-1.5 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                                            >
                                                                <FontAwesomeIcon icon={faTrash} className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="text-center py-12">
                                        <FontAwesomeIcon icon={faFolderOpen} className="w-12 h-12 text-muted-foreground/30 mb-4" />
                                        <h3 className="text-lg font-medium text-foreground mb-2">No Templates Yet</h3>
                                        <p className="text-sm text-muted-foreground">
                                            Create a component layout and click Save to store it as a template
                                        </p>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

interface ComponentPropertyEditorProps {
    component: V2Component;
    onUpdate: (path: string, value: any) => void;
    onUpload?: (file: File, componentId: string) => Promise<{ uploadId: string; filename: string } | null>;
    uploadingFiles?: Set<string>;
}

const ComponentPropertyEditor: React.FC<ComponentPropertyEditorProps> = ({ component, onUpdate, onUpload, uploadingFiles }) => {
    const renderEditor = () => {
        switch (component.type) {
            case 'text_display':
                return (
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">Content</label>
                            <textarea
                                value={component.properties.content || ''}
                                onChange={(e) => onUpdate('content', e.target.value)}
                                placeholder="Enter your text content... (supports markdown)"
                                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 min-h-[120px] resize-y"
                            />
                        </div>
                    </div>
                );

            case 'section':
                return (
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">Text Content</label>
                            <textarea
                                value={component.properties.text?.content || ''}
                                onChange={(e) => onUpdate('text.content', e.target.value)}
                                placeholder="Section text content..."
                                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 min-h-[80px] resize-y"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">Accessory Type</label>
                            <select
                                value={component.properties.accessory?.type === 11 ? 'thumbnail' : component.properties.accessory?.type === 2 ? 'button' : 'none'}
                                onChange={(e) => {
                                    if (e.target.value === 'none') {
                                        onUpdate('accessory', null);
                                    } else if (e.target.value === 'thumbnail') {
                                        onUpdate('accessory', { type: 11, media: { url: '' } });
                                    } else if (e.target.value === 'button') {
                                        onUpdate('accessory', { type: 2, style: 5, label: 'Button', url: '' });
                                    }
                                }}
                                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                            >
                                <option value="none">No Accessory</option>
                                <option value="thumbnail">Thumbnail</option>
                                <option value="button">Link Button</option>
                            </select>
                        </div>
                        {component.properties.accessory?.type === 11 && (
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-2">Thumbnail URL</label>
                                <input
                                    type="text"
                                    value={component.properties.accessory?.media?.url || ''}
                                    onChange={(e) => onUpdate('accessory', { ...component.properties.accessory, media: { url: e.target.value } })}
                                    placeholder="https://i.imgur.com/example.png"
                                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                                />
                            </div>
                        )}
                        {component.properties.accessory?.type === 2 && (
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-2">Button Label</label>
                                    <input
                                        type="text"
                                        value={component.properties.accessory?.label || ''}
                                        onChange={(e) => onUpdate('accessory', { ...component.properties.accessory, label: e.target.value })}
                                        placeholder="Click Here"
                                        className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-2">Button URL</label>
                                    <input
                                        type="text"
                                        value={component.properties.accessory?.url || ''}
                                        onChange={(e) => onUpdate('accessory', { ...component.properties.accessory, url: e.target.value })}
                                        placeholder="https://example.com"
                                        className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                                    />
                                </div>
                            </>
                        )}
                    </div>
                );

            case 'container':
                const childTypes: V2ComponentType[] = ['text_display', 'section', 'media_gallery', 'separator', 'button'];
                return (
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">Accent Color</label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="color"
                                    value={component.properties.accent_color != null ? `#${component.properties.accent_color.toString(16).padStart(6, '0')}` : '#5865f2'}
                                    onChange={(e) => onUpdate('accent_color', parseInt(e.target.value.slice(1), 16))}
                                    disabled={component.properties.accent_color == null}
                                    className="w-10 h-10 rounded-lg border border-border cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                />
                                <input
                                    type="text"
                                    value={component.properties.accent_color != null ? `#${component.properties.accent_color.toString(16).padStart(6, '0')}` : ''}
                                    placeholder="None"
                                    onChange={(e) => {
                                        const hex = e.target.value.replace('#', '');
                                        if (hex === '') {
                                            onUpdate('accent_color', null);
                                        } else if (/^[0-9A-Fa-f]{6}$/.test(hex)) {
                                            onUpdate('accent_color', parseInt(hex, 16));
                                        }
                                    }}
                                    className="flex-1 bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                                />
                                {component.properties.accent_color != null && (
                                    <button
                                        onClick={() => onUpdate('accent_color', null)}
                                        className="text-muted-foreground hover:text-foreground text-lg leading-none"
                                        title="Clear accent color"
                                    >
                                        ×
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <input
                                type="checkbox"
                                id="spoiler"
                                checked={component.properties.spoiler || false}
                                onChange={(e) => onUpdate('spoiler', e.target.checked)}
                                className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                            />
                            <label htmlFor="spoiler" className="text-sm text-foreground">Spoiler (blur content)</label>
                        </div>
                        
                        <div className="pt-4 border-t border-border">
                            <label className="block text-sm font-medium text-foreground mb-3">Container Contents</label>
                            
                            {(component.children || []).length > 0 ? (
                                <div className="space-y-3 mb-3">
                                    {component.children?.map((child: V2Component, index: number) => {
                                        const childDef = componentDefinitions.find(d => d.type === child.type);
                                        return (
                                            <div key={child.id} className="border border-border rounded-lg overflow-hidden">
                                                <div className="flex items-center gap-2 p-2 bg-secondary/50">
                                                    <FontAwesomeIcon icon={childDef?.icon || faBox} className="w-3.5 h-3.5 text-primary" />
                                                    <span className="flex-1 text-sm font-medium text-foreground">{childDef?.label}</span>
                                                    <button
                                                        onClick={() => {
                                                            const newChildren = component.children?.filter((_: V2Component, i: number) => i !== index) || [];
                                                            onUpdate('_children', newChildren);
                                                        }}
                                                        className="p-1 text-red-400 hover:bg-red-500/10 rounded transition-colors"
                                                        title="Remove"
                                                    >
                                                        <FontAwesomeIcon icon={faTrash} className="w-3 h-3" />
                                                    </button>
                                                </div>
                                                <div className="p-3 bg-secondary/20">
                                                    <ChildComponentEditor
                                                        child={child}
                                                        onUpdate={(path: string, value: any) => {
                                                            const newChildren = [...(component.children || [])];
                                                            if (path.startsWith('properties.')) {
                                                                const propPath = path.replace('properties.', '');
                                                                const keys = propPath.split('.');
                                                                const newProps = { ...child.properties };
                                                                let current: any = newProps;
                                                                for (let i = 0; i < keys.length - 1; i++) {
                                                                    current[keys[i]] = { ...current[keys[i]] };
                                                                    current = current[keys[i]];
                                                                }
                                                                current[keys[keys.length - 1]] = value;
                                                                newChildren[index] = { ...child, properties: newProps };
                                                            }
                                                            onUpdate('_children', newChildren);
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground mb-3">No components inside container. Add one below:</p>
                            )}
                            
                            <div className="grid grid-cols-2 gap-2">
                                {childTypes.map(type => {
                                    const childDef = componentDefinitions.find(d => d.type === type);
                                    return (
                                        <button
                                            key={type}
                                            onClick={() => {
                                                const newChild: V2Component = {
                                                    id: `child_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                                                    type,
                                                    properties: { ...childDef?.defaultProperties }
                                                };
                                                const newChildren = [...(component.children || []), newChild];
                                                onUpdate('_children', newChildren);
                                            }}
                                            className="flex items-center gap-2 p-2 bg-secondary/30 hover:bg-secondary border border-border hover:border-primary/30 rounded-lg text-left transition-colors"
                                        >
                                            <FontAwesomeIcon icon={childDef?.icon || faBox} className="w-3 h-3 text-primary" />
                                            <span className="text-xs text-foreground">+ {childDef?.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                );

            case 'media_gallery':
                return (
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">Media Items</label>
                            <p className="text-xs text-muted-foreground mb-3">Upload images or use hosted URLs.</p>
                            {(component.properties.items || []).map((item: any, index: number) => {
                                const itemKey = `${component.id}_gallery_${index}`;
                                const isItemUploading = uploadingFiles?.has(itemKey);
                                const hasItemUpload = item.media?.uploadId;
                                return (
                                    <div key={index} className="flex items-center gap-2 mb-2">
                                        <label className={`p-2 border rounded-lg cursor-pointer transition-colors ${hasItemUpload ? 'border-green-500/50 bg-green-500/10' : 'border-border hover:border-primary/50'}`}>
                                            <input
                                                type="file"
                                                accept="image/*"
                                                className="hidden"
                                                disabled={isItemUploading}
                                                onChange={async (e) => {
                                                    const file = e.target.files?.[0];
                                                    if (file && onUpload) {
                                                        const result = await onUpload(file, itemKey);
                                                        if (result) {
                                                            const newItems = [...(component.properties.items || [])];
                                                            newItems[index] = { media: { uploadId: result.uploadId, url: '' } };
                                                            onUpdate('items', newItems);
                                                        }
                                                    }
                                                    e.target.value = '';
                                                }}
                                            />
                                            {isItemUploading ? (
                                                <FontAwesomeIcon icon={faSpinner} className="w-4 h-4 animate-spin text-primary" />
                                            ) : hasItemUpload ? (
                                                <FontAwesomeIcon icon={faImage} className="w-4 h-4 text-green-500" />
                                            ) : (
                                                <FontAwesomeIcon icon={faUpload} className="w-4 h-4 text-muted-foreground" />
                                            )}
                                        </label>
                                        <input
                                            type="text"
                                            value={item.media?.url || ''}
                                            onChange={(e) => {
                                                const newItems = [...(component.properties.items || [])];
                                                newItems[index] = { media: { url: e.target.value } };
                                                onUpdate('items', newItems);
                                            }}
                                            placeholder={hasItemUpload ? 'Image uploaded' : 'https://i.imgur.com/example.png'}
                                            disabled={hasItemUpload}
                                            className="flex-1 bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
                                        />
                                        <button
                                            onClick={() => {
                                                const newItems = component.properties.items.filter((_: any, i: number) => i !== index);
                                                onUpdate('items', newItems);
                                            }}
                                            className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                        >
                                            <FontAwesomeIcon icon={faTrash} className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                );
                            })}
                            <button
                                onClick={() => {
                                    const newItems = [...(component.properties.items || []), { media: { url: '' } }];
                                    onUpdate('items', newItems);
                                }}
                                className="w-full flex items-center justify-center gap-2 p-2 border border-dashed border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
                            >
                                <FontAwesomeIcon icon={faPlus} className="w-3 h-3" />
                                <span className="text-sm">Add Media</span>
                            </button>
                        </div>
                    </div>
                );

            case 'separator':
                return (
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <input
                                type="checkbox"
                                id="divider"
                                checked={component.properties.divider !== false}
                                onChange={(e) => onUpdate('divider', e.target.checked)}
                                className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                            />
                            <label htmlFor="divider" className="text-sm text-foreground">Show divider line</label>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">Spacing</label>
                            <select
                                value={component.properties.spacing || 'small'}
                                onChange={(e) => onUpdate('spacing', e.target.value)}
                                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                            >
                                <option value="small">Small</option>
                                <option value="large">Large</option>
                            </select>
                        </div>
                    </div>
                );

            case 'button':
                return (
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">Button Label</label>
                            <input
                                type="text"
                                value={component.properties.label || ''}
                                onChange={(e) => onUpdate('label', e.target.value)}
                                placeholder="Click Here"
                                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">Link URL</label>
                            <input
                                type="text"
                                value={component.properties.url || ''}
                                onChange={(e) => onUpdate('url', e.target.value)}
                                placeholder="https://example.com"
                                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                            />
                            <p className="text-xs text-muted-foreground mt-1">The URL that opens when clicked</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <input
                                type="checkbox"
                                id="disabled"
                                checked={component.properties.disabled || false}
                                onChange={(e) => onUpdate('disabled', e.target.checked)}
                                className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                            />
                            <label htmlFor="disabled" className="text-sm text-foreground">Disabled</label>
                        </div>
                    </div>
                );

            case 'file':
                const isUploading = uploadingFiles?.has(component.id);
                const hasUpload = component.properties.file?.uploadId;
                return (
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">Upload File</label>
                            <div className="flex gap-2">
                                <label className={`flex-1 flex items-center justify-center gap-2 p-3 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${hasUpload ? 'border-green-500/50 bg-green-500/10' : 'border-border hover:border-primary/50'}`}>
                                    <input
                                        type="file"
                                        className="hidden"
                                        disabled={isUploading}
                                        onChange={async (e) => {
                                            const file = e.target.files?.[0];
                                            if (file && onUpload) {
                                                const result = await onUpload(file, component.id);
                                                if (result) {
                                                    onUpdate('file', { uploadId: result.uploadId, filename: result.filename, url: '' });
                                                }
                                            }
                                            e.target.value = '';
                                        }}
                                    />
                                    {isUploading ? (
                                        <FontAwesomeIcon icon={faSpinner} className="w-4 h-4 animate-spin text-primary" />
                                    ) : hasUpload ? (
                                        <>
                                            <FontAwesomeIcon icon={faFile} className="w-4 h-4 text-green-500" />
                                            <span className="text-sm text-green-500">File uploaded</span>
                                        </>
                                    ) : (
                                        <>
                                            <FontAwesomeIcon icon={faUpload} className="w-4 h-4 text-muted-foreground" />
                                            <span className="text-sm text-muted-foreground">Click to upload</span>
                                        </>
                                    )}
                                </label>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">Max 25MB. Or use a URL below.</p>
                        </div>
                        <div className="relative">
                            <div className="absolute inset-x-0 top-1/2 border-t border-border" />
                            <div className="relative flex justify-center">
                                <span className="bg-card px-2 text-xs text-muted-foreground">OR</span>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">File URL</label>
                            <input
                                type="text"
                                value={component.properties.file?.url || ''}
                                onChange={(e) => {
                                    const currentFile = component.properties.file || {};
                                    onUpdate('file', { ...currentFile, url: e.target.value, uploadId: e.target.value ? '' : currentFile.uploadId });
                                }}
                                placeholder="https://example.com/file.pdf"
                                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">Filename</label>
                            <input
                                type="text"
                                value={component.properties.file?.filename || ''}
                                onChange={(e) => {
                                    const currentFile = component.properties.file || {};
                                    onUpdate('file', { ...currentFile, filename: e.target.value });
                                }}
                                placeholder="document.pdf"
                                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                            />
                        </div>
                        <div className="flex items-center gap-3">
                            <input
                                type="checkbox"
                                id="file-spoiler"
                                checked={component.properties.spoiler || false}
                                onChange={(e) => onUpdate('spoiler', e.target.checked)}
                                className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                            />
                            <label htmlFor="file-spoiler" className="text-sm text-foreground">Spoiler</label>
                        </div>
                    </div>
                );

            default:
                return (
                    <p className="text-sm text-muted-foreground">No properties available for this component type.</p>
                );
        }
    };

    const def = componentDefinitions.find(d => d.type === component.type);

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3 pb-4 border-b border-border">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                    <FontAwesomeIcon icon={def?.icon || faBox} className="w-4 h-4" />
                </div>
                <div>
                    <p className="font-medium text-foreground">{def?.label}</p>
                    <p className="text-xs text-muted-foreground">{def?.description}</p>
                </div>
            </div>
            {renderEditor()}
        </div>
    );
};

interface ChildPropertyEditorProps {
    child: V2Component;
    parentId: string;
    childIndex: number;
    onUpdate: (newChild: V2Component) => void;
    onUpload?: (file: File, componentId: string) => Promise<{ uploadId: string; filename: string } | null>;
    uploadingFiles?: Set<string>;
}

const ChildPropertyEditor: React.FC<ChildPropertyEditorProps> = ({ child, parentId, childIndex, onUpdate, onUpload, uploadingFiles }) => {
    const def = componentDefinitions.find(d => d.type === child.type);
    
    const updateProperty = (path: string, value: any) => {
        const keys = path.split('.');
        const newProperties = { ...child.properties };
        let current: any = newProperties;
        
        for (let i = 0; i < keys.length - 1; i++) {
            current[keys[i]] = { ...current[keys[i]] };
            current = current[keys[i]];
        }
        current[keys[keys.length - 1]] = value;
        
        onUpdate({ ...child, properties: newProperties });
    };

    const renderEditor = () => {
        switch (child.type) {
            case 'text_display':
                return (
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">Content</label>
                            <textarea
                                value={child.properties.content || ''}
                                onChange={(e) => updateProperty('content', e.target.value)}
                                placeholder="Enter your text content... (supports markdown)"
                                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 min-h-[120px] resize-y"
                            />
                        </div>
                    </div>
                );

            case 'section':
                return (
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">Text Content</label>
                            <textarea
                                value={child.properties.text?.content || ''}
                                onChange={(e) => updateProperty('text.content', e.target.value)}
                                placeholder="Section text content..."
                                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 min-h-[100px] resize-y"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">Accessory Type</label>
                            <select
                                value={child.properties.accessory?.type === 11 ? 'thumbnail' : child.properties.accessory?.type === 2 ? 'button' : 'none'}
                                onChange={(e) => {
                                    if (e.target.value === 'none') {
                                        updateProperty('accessory', null);
                                    } else if (e.target.value === 'thumbnail') {
                                        updateProperty('accessory', { type: 11, media: { url: '' } });
                                    } else if (e.target.value === 'button') {
                                        updateProperty('accessory', { type: 2, style: 5, label: 'Button', url: '' });
                                    }
                                }}
                                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                            >
                                <option value="none">No Accessory</option>
                                <option value="thumbnail">Thumbnail</option>
                                <option value="button">Link Button</option>
                            </select>
                        </div>
                        {child.properties.accessory?.type === 11 && (
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-2">Thumbnail URL</label>
                                <input
                                    type="text"
                                    value={child.properties.accessory?.media?.url || ''}
                                    onChange={(e) => updateProperty('accessory', { ...child.properties.accessory, media: { url: e.target.value } })}
                                    placeholder="https://i.imgur.com/example.png"
                                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                                />
                            </div>
                        )}
                        {child.properties.accessory?.type === 2 && (
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-2">Button Label</label>
                                    <input
                                        type="text"
                                        value={child.properties.accessory?.label || ''}
                                        onChange={(e) => updateProperty('accessory', { ...child.properties.accessory, label: e.target.value })}
                                        placeholder="Click Here"
                                        className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-2">Button URL</label>
                                    <input
                                        type="text"
                                        value={child.properties.accessory?.url || ''}
                                        onChange={(e) => updateProperty('accessory', { ...child.properties.accessory, url: e.target.value })}
                                        placeholder="https://example.com"
                                        className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                                    />
                                </div>
                            </>
                        )}
                    </div>
                );

            case 'media_gallery':
                return (
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">Media Items</label>
                            <p className="text-xs text-muted-foreground mb-3">Upload images or use hosted URLs.</p>
                            {(child.properties.items || []).map((item: any, i: number) => {
                                const itemKey = `${child.id}_gallery_${i}`;
                                const isItemUploading = uploadingFiles?.has(itemKey);
                                const hasItemUpload = item.media?.uploadId;
                                return (
                                    <div key={i} className="flex items-center gap-2 mb-2">
                                        <label className={`p-2 border rounded-lg cursor-pointer transition-colors ${hasItemUpload ? 'border-green-500/50 bg-green-500/10' : 'border-border hover:border-primary/50'}`}>
                                            <input
                                                type="file"
                                                accept="image/*"
                                                className="hidden"
                                                disabled={isItemUploading}
                                                onChange={async (e) => {
                                                    const file = e.target.files?.[0];
                                                    if (file && onUpload) {
                                                        const result = await onUpload(file, itemKey);
                                                        if (result) {
                                                            const newItems = [...(child.properties.items || [])];
                                                            newItems[i] = { media: { uploadId: result.uploadId, url: '' } };
                                                            updateProperty('items', newItems);
                                                        }
                                                    }
                                                    e.target.value = '';
                                                }}
                                            />
                                            {isItemUploading ? (
                                                <FontAwesomeIcon icon={faSpinner} className="w-4 h-4 animate-spin text-primary" />
                                            ) : hasItemUpload ? (
                                                <FontAwesomeIcon icon={faImage} className="w-4 h-4 text-green-500" />
                                            ) : (
                                                <FontAwesomeIcon icon={faUpload} className="w-4 h-4 text-muted-foreground" />
                                            )}
                                        </label>
                                        <input
                                            type="text"
                                            value={item.media?.url || ''}
                                            onChange={(e) => {
                                                const newItems = [...(child.properties.items || [])];
                                                newItems[i] = { media: { url: e.target.value } };
                                                updateProperty('items', newItems);
                                            }}
                                            placeholder={hasItemUpload ? 'Image uploaded' : 'https://i.imgur.com/example.png'}
                                            disabled={hasItemUpload}
                                            className="flex-1 bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
                                        />
                                        <button
                                            onClick={() => {
                                                const newItems = child.properties.items.filter((_: any, idx: number) => idx !== i);
                                                updateProperty('items', newItems);
                                            }}
                                            className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                        >
                                            <FontAwesomeIcon icon={faTrash} className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                );
                            })}
                            <button
                                onClick={() => {
                                    const newItems = [...(child.properties.items || []), { media: { url: '' } }];
                                    updateProperty('items', newItems);
                                }}
                                className="w-full flex items-center justify-center gap-2 p-2 border border-dashed border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
                            >
                                <FontAwesomeIcon icon={faPlus} className="w-3 h-3" />
                                <span className="text-sm">Add Media</span>
                            </button>
                        </div>
                    </div>
                );

            case 'separator':
                return (
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <input
                                type="checkbox"
                                id="child-divider"
                                checked={child.properties.divider !== false}
                                onChange={(e) => updateProperty('divider', e.target.checked)}
                                className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                            />
                            <label htmlFor="child-divider" className="text-sm text-foreground">Show divider line</label>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">Spacing</label>
                            <select
                                value={child.properties.spacing || 'small'}
                                onChange={(e) => updateProperty('spacing', e.target.value)}
                                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                            >
                                <option value="small">Small</option>
                                <option value="large">Large</option>
                            </select>
                        </div>
                    </div>
                );

            case 'button':
                return (
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">Button Label</label>
                            <input
                                type="text"
                                value={child.properties.label || ''}
                                onChange={(e) => updateProperty('label', e.target.value)}
                                placeholder="Click Here"
                                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">Link URL</label>
                            <input
                                type="text"
                                value={child.properties.url || ''}
                                onChange={(e) => updateProperty('url', e.target.value)}
                                placeholder="https://example.com"
                                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                            />
                            <p className="text-xs text-muted-foreground mt-1">The URL that opens when clicked</p>
                        </div>
                    </div>
                );

            default:
                return <p className="text-sm text-muted-foreground">No editor available for this component type.</p>;
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3 pb-4 border-b border-border">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                    <FontAwesomeIcon icon={def?.icon || faBox} className="w-4 h-4" />
                </div>
                <div>
                    <p className="font-medium text-foreground">{def?.label}</p>
                    <p className="text-xs text-muted-foreground">Child of Container</p>
                </div>
            </div>
            {renderEditor()}
        </div>
    );
};

interface ChildComponentEditorProps {
    child: V2Component;
    onUpdate: (path: string, value: any) => void;
}

const ChildComponentEditor: React.FC<ChildComponentEditorProps> = ({ child, onUpdate }) => {
    switch (child.type) {
        case 'text_display':
            return (
                <textarea
                    value={child.properties.content || ''}
                    onChange={(e) => onUpdate('properties.content', e.target.value)}
                    placeholder="Enter text content..."
                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 min-h-[60px] resize-y"
                />
            );

        case 'section':
            return (
                <textarea
                    value={child.properties.text?.content || ''}
                    onChange={(e) => onUpdate('properties.text.content', e.target.value)}
                    placeholder="Section text content..."
                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 min-h-[60px] resize-y"
                />
            );

        case 'media_gallery':
            return (
                <div className="space-y-2">
                    {(child.properties.items || []).map((item: any, i: number) => (
                        <div key={i} className="flex gap-2">
                            <input
                                type="text"
                                value={item.media?.url || ''}
                                onChange={(e) => {
                                    const newItems = [...(child.properties.items || [])];
                                    newItems[i] = { media: { url: e.target.value } };
                                    onUpdate('properties.items', newItems);
                                }}
                                placeholder="Image URL"
                                className="flex-1 bg-secondary border border-border rounded-lg px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                            />
                            <button
                                onClick={() => {
                                    const newItems = child.properties.items.filter((_: any, idx: number) => idx !== i);
                                    onUpdate('properties.items', newItems);
                                }}
                                className="p-1.5 text-red-400 hover:bg-red-500/10 rounded"
                            >
                                <FontAwesomeIcon icon={faTrash} className="w-3 h-3" />
                            </button>
                        </div>
                    ))}
                    <button
                        onClick={() => {
                            const newItems = [...(child.properties.items || []), { media: { url: '' } }];
                            onUpdate('properties.items', newItems);
                        }}
                        className="w-full p-1.5 text-xs text-muted-foreground hover:text-foreground border border-dashed border-border rounded-lg hover:border-primary/50 transition-colors"
                    >
                        + Add Image
                    </button>
                </div>
            );

        case 'separator':
            return (
                <div className="flex items-center gap-3">
                    <select
                        value={child.properties.spacing || 'small'}
                        onChange={(e) => onUpdate('properties.spacing', e.target.value)}
                        className="flex-1 bg-secondary border border-border rounded-lg px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                    >
                        <option value="small">Small spacing</option>
                        <option value="large">Large spacing</option>
                    </select>
                    <label className="flex items-center gap-2 text-xs text-foreground">
                        <input
                            type="checkbox"
                            checked={child.properties.divider !== false}
                            onChange={(e) => onUpdate('properties.divider', e.target.checked)}
                            className="w-3 h-3 rounded"
                        />
                        Line
                    </label>
                </div>
            );

        case 'button':
            return (
                <div className="space-y-2">
                    <input
                        type="text"
                        value={child.properties.label || ''}
                        onChange={(e) => onUpdate('properties.label', e.target.value)}
                        placeholder="Button label"
                        className="w-full bg-secondary border border-border rounded-lg px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                    />
                    <input
                        type="text"
                        value={child.properties.url || ''}
                        onChange={(e) => onUpdate('properties.url', e.target.value)}
                        placeholder="https://example.com"
                        className="w-full bg-secondary border border-border rounded-lg px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                    />
                </div>
            );

        default:
            return <p className="text-xs text-muted-foreground">No editor available</p>;
    }
};

interface ComponentsV2PreviewProps {
    components: V2Component[];
}

const ComponentsV2Preview: React.FC<ComponentsV2PreviewProps> = ({ components }) => {
    if (components.length === 0) {
        return (
            <div className="text-center py-8">
                <p className="text-muted-foreground text-sm">Add components to see preview</p>
            </div>
        );
    }

    const renderComponent = (comp: V2Component) => {
        switch (comp.type) {
            case 'text_display':
                return (
                    <div key={comp.id} className="text-[#dbdee1] text-sm whitespace-pre-wrap">
                        {comp.properties.content || 'Empty text'}
                    </div>
                );

            case 'section':
                return (
                    <div key={comp.id} className="flex items-start gap-3">
                        <div className="flex-1 text-[#dbdee1] text-sm">
                            {comp.properties.text?.content || 'Empty section'}
                        </div>
                        {comp.properties.accessory && (
                            <div className="flex-shrink-0">
                                {comp.properties.accessory.type === 11 ? (
                                    <div className="w-16 h-16 rounded bg-[#4e5058] flex items-center justify-center">
                                        <FontAwesomeIcon icon={faImage} className="w-6 h-6 text-[#80848e]" />
                                    </div>
                                ) : (
                                    <button className="px-3 py-1.5 bg-[#5865f2] text-white text-sm rounded">
                                        {comp.properties.accessory.label || 'Button'}
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                );

            case 'container':
                const accentColor = comp.properties.accent_color != null
                    ? `#${comp.properties.accent_color.toString(16).padStart(6, '0')}` 
                    : null;
                return (
                    <div 
                        key={comp.id} 
                        className="rounded-lg overflow-hidden"
                        style={accentColor ? { borderLeft: `4px solid ${accentColor}` } : undefined}
                    >
                        <div className={`bg-[#2b2d31] p-3 space-y-2 ${comp.properties.spoiler ? 'blur-sm hover:blur-none transition-all' : ''}`}>
                            {comp.children && comp.children.length > 0 ? (
                                comp.children.map((child: V2Component) => renderComponent(child))
                            ) : (
                                <p className="text-[#80848e] text-xs italic">Empty container</p>
                            )}
                        </div>
                    </div>
                );

            case 'media_gallery':
                return (
                    <div key={comp.id} className="grid grid-cols-2 gap-1">
                        {(comp.properties.items || []).length > 0 ? (
                            comp.properties.items.slice(0, 4).map((item: any, i: number) => (
                                <div key={i} className="aspect-video bg-[#4e5058] rounded flex items-center justify-center">
                                    {item.media?.url ? (
                                        <img src={item.media.url} alt="" className="w-full h-full object-cover rounded" />
                                    ) : (
                                        <FontAwesomeIcon icon={faImage} className="w-6 h-6 text-[#80848e]" />
                                    )}
                                </div>
                            ))
                        ) : (
                            <div className="col-span-2 aspect-video bg-[#4e5058] rounded flex items-center justify-center">
                                <FontAwesomeIcon icon={faImage} className="w-8 h-8 text-[#80848e]" />
                            </div>
                        )}
                    </div>
                );

            case 'separator':
                return (
                    <div key={comp.id} className={`${comp.properties.spacing === 'large' ? 'py-4' : 'py-2'}`}>
                        {comp.properties.divider !== false && (
                            <div className="border-t border-[#3f4147]" />
                        )}
                    </div>
                );

            case 'button':
                return (
                    <a 
                        key={comp.id}
                        href={comp.properties.url || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded bg-[#4e5058] text-[#00a8fc] hover:underline ${comp.properties.disabled ? 'opacity-50 pointer-events-none' : ''}`}
                    >
                        {comp.properties.label || 'Link'}
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                    </a>
                );

            case 'file':
                return (
                    <div key={comp.id} className="flex items-center gap-3 p-3 bg-[#2b2d31] rounded-lg">
                        <div className="w-10 h-10 bg-[#4e5058] rounded flex items-center justify-center">
                            <FontAwesomeIcon icon={faFile} className="w-5 h-5 text-[#80848e]" />
                        </div>
                        <div>
                            <p className="text-[#00a8fc] text-sm font-medium">{comp.properties.file?.filename || 'file.txt'}</p>
                            <p className="text-[#80848e] text-xs">File</p>
                        </div>
                    </div>
                );

            default:
                return null;
        }
    };

    return (
        <div className="bg-[#313338] rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2 mb-3">
                <div className="w-10 h-10 rounded-full bg-[#5865F2] flex items-center justify-center text-white font-medium">
                    B
                </div>
                <div>
                    <div className="text-white font-medium text-sm">Bot</div>
                    <div className="text-[#989AA2] text-xs">Today at {new Date().toLocaleTimeString()}</div>
                </div>
            </div>
            <div className="space-y-2">
                {components.map(renderComponent)}
            </div>
        </div>
    );
};

export default ComponentsV2Builder;

