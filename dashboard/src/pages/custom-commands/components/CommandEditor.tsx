import React, { useState, useEffect, useRef } from 'react';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTimes, faPlus, faTrash, faExternalLinkAlt, faReply, faSmile, faArrowLeft, faCog, faFileAlt, faMousePointer, faSlidersH } from "@fortawesome/free-solid-svg-icons";
import CommandPreview from './CommandPreview';
import { config } from '../../../config';

interface ServerEmoji {
    id: string;
    name: string;
    animated?: boolean;
    url?: string;
    isStandard?: boolean;
}

interface EmbedField {
    name: string;
    value: string;
    inline: boolean;
}

interface EmbedData {
    title: string;
    description: string[];
    color: string;
    footer: { text: string; icon: string };
    author: { text: string; icon: string };
    thumbnail: string;
    image: string;
    fields: EmbedField[];
}

interface ButtonReply {
    text: string;
    embed: {
        title: string;
        description: string[];
        color: string;
        footer: { text: string; icon: string };
        author: { text: string; icon: string };
        thumbnail: string;
        image: string;
    };
    ephemeral: boolean;
}

interface CommandButton {
    type: 'LINK' | 'REPLY';
    name: string;
    emoji: string;
    style: 'Primary' | 'Secondary' | 'Success' | 'Danger';
    link?: string;
    reply?: ButtonReply;
}

interface CustomCommand {
    _id?: string;
    name: string;
    type: 'EMBED' | 'TEXT' | 'BOTH';
    text: string;
    embed: EmbedData;
    roles: { whitelist: string[] };
    options: { deleteTriggerMessage: boolean; replyToUser: boolean };
    buttons: CommandButton[];
    enabled: boolean;
}

interface Role {
    id: string;
    name: string;
    color: string;
}

interface CommandEditorProps {
    command: CustomCommand;
    roles: Role[];
    onSave: (command: CustomCommand) => void;
    onClose: () => void;
    commandPrefix: string;
}

interface EmojiPickerProps {
    emojis: ServerEmoji[];
    value: string;
    onChange: (emoji: string) => void;
}

const EmojiPicker: React.FC<EmojiPickerProps> = ({ emojis, value, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filtered = emojis.filter(e => e.name.toLowerCase().includes(search.toLowerCase()));
    const standardEmojis = filtered.filter(e => e.isStandard);
    const serverEmojis = filtered.filter(e => !e.isStandard);

    const getEmojiDisplay = (emoji: ServerEmoji) => {
        if (emoji.isStandard) return emoji.name;
        return emoji.url ? (
            <img src={emoji.url} alt={emoji.name} className="w-5 h-5" />
        ) : (
            <img src={`https://cdn.discordapp.com/emojis/${emoji.id}.${emoji.animated ? 'gif' : 'png'}`} alt={emoji.name} className="w-5 h-5" />
        );
    };

    const handleSelect = (emoji: ServerEmoji) => {
        if (emoji.isStandard) {
            onChange(emoji.name);
        } else {
            onChange(`<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>`);
        }
        setIsOpen(false);
        setSearch('');
    };

    const getCurrentDisplay = () => {
        if (!value) return null;
        if (!value.startsWith('<')) return <span className="text-base">{value}</span>;
        const match = value.match(/<a?:(\w+):(\d+)>/);
        if (match) {
            const isAnimated = value.startsWith('<a:');
            return <img src={`https://cdn.discordapp.com/emojis/${match[2]}.${isAnimated ? 'gif' : 'png'}`} alt={match[1]} className="w-5 h-5" />;
        }
        return <span className="text-xs text-muted-foreground truncate">{value}</span>;
    };

    return (
        <div ref={ref} className="relative">
            <div className="flex gap-1">
                <button
                    type="button"
                    onClick={() => setIsOpen(!isOpen)}
                    className="flex items-center justify-center gap-2 px-3 py-2 bg-secondary/50 border border-border rounded-lg text-sm hover:bg-secondary/70 transition-colors min-w-[80px]"
                >
                    {value ? getCurrentDisplay() : <FontAwesomeIcon icon={faSmile} className="w-4 h-4 text-muted-foreground" />}
                </button>
                {value && (
                    <button
                        type="button"
                        onClick={() => onChange('')}
                        className="px-2 py-2 bg-secondary/50 border border-border rounded-lg text-muted-foreground hover:text-red-400 hover:bg-secondary/70 transition-colors"
                    >
                        <FontAwesomeIcon icon={faTimes} className="w-3 h-3" />
                    </button>
                )}
            </div>

            {isOpen && (
                <div className="absolute top-full left-0 mt-1 w-72 max-h-80 bg-card border border-border rounded-xl shadow-lg z-50 overflow-hidden">
                    <div className="p-2 border-b border-border">
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search emojis..."
                            className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50"
                            autoFocus
                        />
                    </div>
                    <div className="overflow-y-auto max-h-60 p-2">
                        {standardEmojis.length > 0 && (
                            <div className="mb-3">
                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 px-1">Standard</p>
                                <div className="flex flex-wrap gap-1">
                                    {standardEmojis.map(emoji => (
                                        <button
                                            key={emoji.id}
                                            onClick={() => handleSelect(emoji)}
                                            className="w-8 h-8 flex items-center justify-center text-lg hover:bg-secondary/70 rounded-lg transition-colors"
                                            title={emoji.name}
                                        >
                                            {emoji.name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                        {serverEmojis.length > 0 && (
                            <div>
                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 px-1">Server</p>
                                <div className="flex flex-wrap gap-1">
                                    {serverEmojis.map(emoji => (
                                        <button
                                            key={emoji.id}
                                            onClick={() => handleSelect(emoji)}
                                            className="w-8 h-8 flex items-center justify-center hover:bg-secondary/70 rounded-lg transition-colors"
                                            title={`:${emoji.name}:`}
                                        >
                                            {getEmojiDisplay(emoji)}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                        {filtered.length === 0 && (
                            <p className="text-center text-xs text-muted-foreground py-4">No emojis found</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

const CommandEditor: React.FC<CommandEditorProps> = ({
    command: initialCommand,
    roles,
    onSave,
    onClose,
    commandPrefix
}) => {
    const normalizedCommand: CustomCommand = {
        ...initialCommand,
        text: initialCommand.text || '',
        embed: {
            title: initialCommand.embed?.title || '',
            description: Array.isArray(initialCommand.embed?.description) ? initialCommand.embed.description : [],
            color: initialCommand.embed?.color || '#5865F2',
            footer: { text: initialCommand.embed?.footer?.text || '', icon: initialCommand.embed?.footer?.icon || '' },
            author: { text: initialCommand.embed?.author?.text || '', icon: initialCommand.embed?.author?.icon || '' },
            thumbnail: initialCommand.embed?.thumbnail || '',
            image: initialCommand.embed?.image || '',
            fields: Array.isArray(initialCommand.embed?.fields) ? initialCommand.embed.fields : []
        },
        roles: { whitelist: Array.isArray(initialCommand.roles?.whitelist) ? initialCommand.roles.whitelist : [] },
        options: { 
            deleteTriggerMessage: initialCommand.options?.deleteTriggerMessage || false, 
            replyToUser: initialCommand.options?.replyToUser || false 
        },
        buttons: Array.isArray(initialCommand.buttons) ? initialCommand.buttons : []
    };
    
    const [command, setCommand] = useState<CustomCommand>(normalizedCommand);
    const [activeSection, setActiveSection] = useState<string>('general');
    const [isSaving, setIsSaving] = useState(false);
    const [emojis, setEmojis] = useState<ServerEmoji[]>([]);

    useEffect(() => {
        const fetchEmojis = async () => {
            try {
                const res = await fetch(`${config.API_URL}/settings/server-data`, { credentials: 'include' });
                if (res.ok) {
                    const data = await res.json();
                    setEmojis(data.emojis || []);
                }
            } catch (err) {
                console.error('Failed to fetch emojis:', err);
            }
        };
        fetchEmojis();
    }, []);

    const handleChange = (path: string, value: any) => {
        setCommand(prev => {
            const newCommand = { ...prev };
            const keys = path.split('.');
            let current: any = newCommand;
            for (let i = 0; i < keys.length - 1; i++) {
                if (current[keys[i]] === undefined) current[keys[i]] = {};
                current = current[keys[i]];
            }
            current[keys[keys.length - 1]] = value;
            return newCommand;
        });
    };

    const handleDescriptionChange = (value: string) => {
        handleChange('embed.description', value.split('\n'));
    };

    const addField = () => {
        setCommand(prev => ({
            ...prev,
            embed: { ...prev.embed, fields: [...(prev.embed?.fields || []), { name: '', value: '', inline: false }] }
        }));
    };

    const removeField = (index: number) => {
        setCommand(prev => ({
            ...prev,
            embed: { ...prev.embed, fields: (prev.embed?.fields || []).filter((_, i) => i !== index) }
        }));
    };

    const updateField = (index: number, key: string, value: any) => {
        setCommand(prev => ({
            ...prev,
            embed: {
                ...prev.embed,
                fields: (prev.embed?.fields || []).map((field, i) => i === index ? { ...field, [key]: value } : field)
            }
        }));
    };

    const defaultReply: ButtonReply = {
        text: '',
        embed: {
            title: '',
            description: [],
            color: '#5865F2',
            footer: { text: '', icon: '' },
            author: { text: '', icon: '' },
            thumbnail: '',
            image: ''
        },
        ephemeral: false
    };

    const addButton = () => {
        setCommand(prev => ({
            ...prev,
            buttons: [...(prev.buttons || []), { type: 'LINK', name: '', emoji: '', style: 'Primary', link: '', reply: { ...defaultReply } }]
        }));
    };

    const removeButton = (index: number) => {
        setCommand(prev => ({ ...prev, buttons: (prev.buttons || []).filter((_, i) => i !== index) }));
    };

    const updateButton = (index: number, key: string, value: any) => {
        setCommand(prev => ({
            ...prev,
            buttons: (prev.buttons || []).map((btn, i) => {
                if (i !== index) return btn;
                if (key.startsWith('reply.')) {
                    const replyKey = key.replace('reply.', '');
                    const keys = replyKey.split('.');
                    const newReply = { ...(btn.reply || defaultReply) };
                    let current: any = newReply;
                    for (let j = 0; j < keys.length - 1; j++) {
                        current[keys[j]] = { ...current[keys[j]] };
                        current = current[keys[j]];
                    }
                    current[keys[keys.length - 1]] = value;
                    return { ...btn, reply: newReply };
                }
                return { ...btn, [key]: value };
            })
        }));
    };

    const handleSave = async () => {
        setIsSaving(true);
        try { await onSave(command); } finally { setIsSaving(false); }
    };

    const sections = [
        { id: 'general', label: 'General', icon: faCog },
        { id: 'content', label: 'Content', icon: faFileAlt },
        { id: 'buttons', label: 'Buttons', icon: faMousePointer },
        { id: 'options', label: 'Options', icon: faSlidersH }
    ];

    const inputClass = "w-full px-3 py-2.5 sm:px-4 sm:py-3 bg-secondary/50 border border-border rounded-xl text-foreground focus:outline-none focus:border-primary/50 transition-colors text-sm sm:text-base";

    return (
        <div className="fixed inset-0 z-50 bg-background flex flex-col lg:left-64">
            {/* Top Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
                <div className="flex items-center gap-3 sm:gap-4">
                    <button 
                        onClick={onClose} 
                        className="flex items-center gap-2 px-3 py-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
                    >
                        <FontAwesomeIcon icon={faArrowLeft} className="w-4 h-4" />
                        <span className="text-sm font-medium hidden sm:inline">Back</span>
                    </button>
                    <div className="h-6 w-px bg-border hidden sm:block" />
                    <div>
                        <h1 className="text-base sm:text-lg font-semibold text-foreground">
                            {command._id ? 'Edit Command' : 'Create Command'}
                        </h1>
                        {command.name && (
                            <p className="text-xs sm:text-sm text-muted-foreground">{commandPrefix}{command.name}</p>
                        )}
                    </div>
                </div>
                <button
                    onClick={handleSave}
                    disabled={isSaving || !command.name.trim()}
                    className="px-4 py-2 sm:px-5 sm:py-2.5 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-colors font-medium disabled:opacity-50 text-sm sm:text-base w-full sm:w-auto"
                >
                    {isSaving ? 'Saving...' : 'Save Command'}
                </button>
            </div>

            {/* Mobile Tab Navigation */}
            <div className="flex lg:hidden overflow-x-auto gap-1 p-2 border-b border-border bg-card/30 scrollbar-hide">
                {sections.map(section => (
                    <button
                        key={section.id}
                        onClick={() => setActiveSection(section.id)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg whitespace-nowrap text-sm transition-colors ${
                            activeSection === section.id
                                ? 'bg-primary text-primary-foreground'
                                : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                        }`}
                    >
                        <FontAwesomeIcon icon={section.icon} className="w-3.5 h-3.5" />
                        <span className="font-medium">{section.label}</span>
                    </button>
                ))}
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* Desktop Sidebar Navigation */}
                <div className="hidden lg:flex w-48 xl:w-56 border-r border-border bg-card/30 p-3 xl:p-4 flex-col gap-1.5 xl:gap-2 shrink-0">
                    {sections.map(section => (
                        <button
                            key={section.id}
                            onClick={() => setActiveSection(section.id)}
                            className={`flex items-center gap-3 px-3 xl:px-4 py-2.5 xl:py-3 rounded-xl text-left transition-colors ${
                                activeSection === section.id
                                    ? 'bg-primary text-primary-foreground'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                            }`}
                        >
                            <FontAwesomeIcon icon={section.icon} className="w-4 h-4" />
                            <span className="font-medium text-sm xl:text-base">{section.label}</span>
                        </button>
                    ))}
                </div>

                {/* Main Editor */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
                    <div className="max-w-3xl mx-auto lg:mx-0">

                        {/* General */}
                        {activeSection === 'general' && (
                            <div className="space-y-6 sm:space-y-8">
                                <div>
                                    <h2 className="text-base sm:text-lg font-semibold text-foreground mb-1">General Settings</h2>
                                    <p className="text-xs sm:text-sm text-muted-foreground mb-4 sm:mb-6">Configure your command's basic settings</p>
                                    
                                    <div className="space-y-4 sm:space-y-6">
                                        <div>
                                            <label className="block text-sm font-medium text-foreground mb-2">Command Name</label>
                                            <div className="flex">
                                                <span className="px-3 sm:px-4 py-2.5 sm:py-3 bg-secondary/70 border border-r-0 border-border rounded-l-xl text-muted-foreground text-sm">{commandPrefix}</span>
                                                <input
                                                    type="text"
                                                    value={command.name}
                                                    onChange={(e) => handleChange('name', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                                                    placeholder="command-name"
                                                    className="flex-1 px-3 sm:px-4 py-2.5 sm:py-3 bg-secondary/50 border border-border rounded-r-xl text-foreground focus:outline-none focus:border-primary/50 text-sm sm:text-base"
                                                />
                                            </div>
                                            <p className="text-xs text-muted-foreground mt-2">Only lowercase letters, numbers, and hyphens allowed</p>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-foreground mb-2">Response Type</label>
                                            <div className="flex flex-wrap gap-2">
                                                {['EMBED', 'TEXT', 'BOTH'].map(type => (
                                                    <button
                                                        key={type}
                                                        onClick={() => handleChange('type', type)}
                                                        className={`px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl font-medium transition-colors text-sm ${
                                                            command.type === type 
                                                                ? 'bg-primary text-primary-foreground' 
                                                                : 'bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary'
                                                        }`}
                                                    >
                                                        {type}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-foreground mb-2">Allowed Roles</label>
                                            <select
                                                multiple
                                                value={command.roles.whitelist}
                                                onChange={(e) => handleChange('roles.whitelist', Array.from(e.target.selectedOptions, o => o.value))}
                                                className={`${inputClass} min-h-[100px] sm:min-h-[120px]`}
                                            >
                                                {roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}
                                            </select>
                                            <p className="text-xs text-muted-foreground mt-2">Leave empty to allow everyone. Hold Ctrl/Cmd to select multiple.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Content */}
                        {activeSection === 'content' && (
                            <div className="space-y-6 sm:space-y-8">
                                <div>
                                    <h2 className="text-base sm:text-lg font-semibold text-foreground mb-1">Content</h2>
                                    <p className="text-xs sm:text-sm text-muted-foreground mb-4 sm:mb-6">Configure what your command will send</p>
                                </div>

                                {(command.type === 'TEXT' || command.type === 'BOTH') && (
                                    <div className="p-4 sm:p-6 bg-secondary/20 rounded-xl sm:rounded-2xl border border-border">
                                        <h3 className="text-sm font-semibold text-foreground mb-3 sm:mb-4">Text Message</h3>
                                        <textarea
                                            value={command.text}
                                            onChange={(e) => handleChange('text', e.target.value)}
                                            placeholder="Enter your message text here..."
                                            rows={4}
                                            className={`${inputClass} resize-none`}
                                        />
                                    </div>
                                )}

                                {(command.type === 'EMBED' || command.type === 'BOTH') && (
                                    <div className="p-4 sm:p-6 bg-secondary/20 rounded-xl sm:rounded-2xl border border-border space-y-4 sm:space-y-6">
                                        <h3 className="text-sm font-semibold text-foreground">Embed</h3>
                                        
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-foreground mb-2">Title</label>
                                                <input type="text" value={command.embed.title} onChange={(e) => handleChange('embed.title', e.target.value)} placeholder="Embed title" className={inputClass} />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-foreground mb-2">Color</label>
                                                <div className="flex gap-2">
                                                    <input type="color" value={command.embed.color} onChange={(e) => handleChange('embed.color', e.target.value)} className="w-10 h-10 sm:w-12 sm:h-12 bg-secondary/50 border border-border rounded-xl cursor-pointer shrink-0" />
                                                    <input type="text" value={command.embed.color} onChange={(e) => handleChange('embed.color', e.target.value)} className={`flex-1 min-w-0 ${inputClass}`} />
                                                </div>
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-foreground mb-2">Description</label>
                                            <textarea value={command.embed.description.join('\n')} onChange={(e) => handleDescriptionChange(e.target.value)} placeholder="Enter embed description..." rows={4} className={`${inputClass} resize-none`} />
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-foreground mb-2">Author</label>
                                                <input type="text" value={command.embed.author.text} onChange={(e) => handleChange('embed.author.text', e.target.value)} placeholder="Author name" className={inputClass} />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-foreground mb-2">Author Icon URL</label>
                                                <input type="text" value={command.embed.author.icon} onChange={(e) => handleChange('embed.author.icon', e.target.value)} placeholder="https://..." className={inputClass} />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-foreground mb-2">Footer</label>
                                                <input type="text" value={command.embed.footer.text} onChange={(e) => handleChange('embed.footer.text', e.target.value)} placeholder="Footer text" className={inputClass} />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-foreground mb-2">Footer Icon URL</label>
                                                <input type="text" value={command.embed.footer.icon} onChange={(e) => handleChange('embed.footer.icon', e.target.value)} placeholder="https://..." className={inputClass} />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-foreground mb-2">Thumbnail URL</label>
                                                <input type="text" value={command.embed.thumbnail} onChange={(e) => handleChange('embed.thumbnail', e.target.value)} placeholder="https://..." className={inputClass} />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-foreground mb-2">Image URL</label>
                                                <input type="text" value={command.embed.image} onChange={(e) => handleChange('embed.image', e.target.value)} placeholder="https://..." className={inputClass} />
                                            </div>
                                        </div>

                                        {/* Fields */}
                                        <div className="pt-4 border-t border-border">
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                                                <div>
                                                    <h4 className="text-sm font-semibold text-foreground">Fields</h4>
                                                    <p className="text-xs text-muted-foreground">Add custom fields to your embed</p>
                                                </div>
                                                <button onClick={addField} className="px-4 py-2 bg-primary/10 text-primary rounded-xl hover:bg-primary/20 transition-colors text-sm font-medium w-full sm:w-auto">
                                                    <FontAwesomeIcon icon={faPlus} className="w-3 h-3 mr-2" />Add Field
                                                </button>
                                            </div>
                                            <div className="space-y-3">
                                                {command.embed.fields.map((field, i) => (
                                                    <div key={i} className="p-3 sm:p-4 bg-secondary/30 rounded-xl space-y-3">
                                                        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 sm:items-center">
                                                            <input type="text" value={field.name} onChange={(e) => updateField(i, 'name', e.target.value)} placeholder="Field name" className={`flex-1 ${inputClass}`} />
                                                            <div className="flex items-center justify-between sm:justify-start gap-2">
                                                                <label className="flex items-center gap-2 text-sm text-muted-foreground whitespace-nowrap">
                                                                    <input type="checkbox" checked={field.inline} onChange={(e) => updateField(i, 'inline', e.target.checked)} className="rounded" />
                                                                    Inline
                                                                </label>
                                                                <button onClick={() => removeField(i)} className="p-2 sm:p-2.5 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                                                                    <FontAwesomeIcon icon={faTrash} className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                        <textarea value={field.value} onChange={(e) => updateField(i, 'value', e.target.value)} placeholder="Field value" rows={2} className={`${inputClass} resize-none`} />
                                                    </div>
                                                ))}
                                                {command.embed.fields.length === 0 && (
                                                    <p className="text-center text-muted-foreground text-sm py-6">No fields added yet</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Buttons */}
                        {activeSection === 'buttons' && (
                            <div className="space-y-4 sm:space-y-6">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div>
                                        <h2 className="text-base sm:text-lg font-semibold text-foreground mb-1">Buttons</h2>
                                        <p className="text-xs sm:text-sm text-muted-foreground">Add interactive buttons to your response</p>
                                    </div>
                                    <button onClick={addButton} className="px-4 py-2 sm:py-2.5 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-colors font-medium text-sm w-full sm:w-auto">
                                        <FontAwesomeIcon icon={faPlus} className="w-3 h-3 mr-2" />Add Button
                                    </button>
                                </div>

                                {command.buttons.length === 0 ? (
                                    <div className="text-center py-12 sm:py-16 text-muted-foreground bg-secondary/20 rounded-xl sm:rounded-2xl border border-border">
                                        <FontAwesomeIcon icon={faMousePointer} className="w-6 h-6 sm:w-8 sm:h-8 mb-3 opacity-50" />
                                        <p className="text-sm">No buttons added yet</p>
                                        <p className="text-xs mt-1">Click "Add Button" to get started</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {command.buttons.map((button, i) => (
                                            <div key={i} className="p-4 sm:p-5 bg-secondary/20 rounded-xl sm:rounded-2xl border border-border space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex gap-1 sm:gap-2">
                                                        <button onClick={() => updateButton(i, 'type', 'LINK')} className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl transition-colors text-sm ${button.type === 'LINK' ? 'bg-primary text-primary-foreground' : 'bg-secondary/50 text-muted-foreground hover:text-foreground'}`}>
                                                            <FontAwesomeIcon icon={faExternalLinkAlt} className="w-3 h-3" />Link
                                                        </button>
                                                        <button onClick={() => updateButton(i, 'type', 'REPLY')} className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl transition-colors text-sm ${button.type === 'REPLY' ? 'bg-primary text-primary-foreground' : 'bg-secondary/50 text-muted-foreground hover:text-foreground'}`}>
                                                            <FontAwesomeIcon icon={faReply} className="w-3 h-3" />Reply
                                                        </button>
                                                    </div>
                                                    <button onClick={() => removeButton(i)} className="p-2 sm:p-2.5 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                                                        <FontAwesomeIcon icon={faTrash} className="w-4 h-4" />
                                                    </button>
                                                </div>
                                                
                                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 items-end">
                                                    <div>
                                                        <label className="block text-sm font-medium text-foreground mb-2">Label</label>
                                                        <input type="text" value={button.name} onChange={(e) => updateButton(i, 'name', e.target.value)} placeholder="Button label" className={inputClass} />
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-medium text-foreground mb-2">Emoji</label>
                                                        <EmojiPicker emojis={emojis} value={button.emoji} onChange={(emoji) => updateButton(i, 'emoji', emoji)} />
                                                    </div>
                                                    {button.type === 'LINK' ? (
                                                        <div className="sm:col-span-2 lg:col-span-1">
                                                            <label className="block text-sm font-medium text-foreground mb-2">URL</label>
                                                            <input type="text" value={button.link || ''} onChange={(e) => updateButton(i, 'link', e.target.value)} placeholder="https://..." className={inputClass} />
                                                        </div>
                                                    ) : (
                                                        <div className="sm:col-span-2 lg:col-span-1">
                                                            <label className="block text-sm font-medium text-foreground mb-2">Style</label>
                                                            <select value={button.style} onChange={(e) => updateButton(i, 'style', e.target.value)} className={inputClass}>
                                                                <option value="Primary">Primary (Blue)</option>
                                                                <option value="Secondary">Secondary (Gray)</option>
                                                                <option value="Success">Success (Green)</option>
                                                                <option value="Danger">Danger (Red)</option>
                                                            </select>
                                                        </div>
                                                    )}
                                                </div>
                                                
                                                {button.type === 'REPLY' && (
                                                    <div className="mt-4 pt-4 border-t border-border space-y-4">
                                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                                            <h4 className="text-sm font-semibold text-foreground">Reply Content</h4>
                                                            <label className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground cursor-pointer">
                                                                <input 
                                                                    type="checkbox" 
                                                                    checked={button.reply?.ephemeral || false} 
                                                                    onChange={(e) => updateButton(i, 'reply.ephemeral', e.target.checked)} 
                                                                    className="rounded"
                                                                />
                                                                Ephemeral (only visible to user)
                                                            </label>
                                                        </div>

                                                        <div>
                                                            <label className="block text-sm font-medium text-foreground mb-2">Text Message</label>
                                                            <textarea
                                                                value={button.reply?.text || ''}
                                                                onChange={(e) => updateButton(i, 'reply.text', e.target.value)}
                                                                placeholder="Reply text message..."
                                                                rows={3}
                                                                className={`${inputClass} resize-none`}
                                                            />
                                                        </div>

                                                        <div className="p-3 sm:p-4 bg-secondary/30 rounded-xl space-y-3 sm:space-y-4">
                                                            <p className="text-sm font-medium text-foreground">Embed (optional)</p>
                                                            
                                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                                                                <div>
                                                                    <label className="block text-sm text-muted-foreground mb-2">Title</label>
                                                                    <input 
                                                                        type="text" 
                                                                        value={button.reply?.embed?.title || ''} 
                                                                        onChange={(e) => updateButton(i, 'reply.embed.title', e.target.value)} 
                                                                        placeholder="Embed title" 
                                                                        className={inputClass} 
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label className="block text-sm text-muted-foreground mb-2">Color</label>
                                                                    <div className="flex gap-2">
                                                                        <input 
                                                                            type="color" 
                                                                            value={button.reply?.embed?.color || '#5865F2'} 
                                                                            onChange={(e) => updateButton(i, 'reply.embed.color', e.target.value)} 
                                                                            className="w-10 h-10 sm:w-12 sm:h-12 bg-secondary/50 border border-border rounded-xl cursor-pointer shrink-0"
                                                                        />
                                                                        <input 
                                                                            type="text" 
                                                                            value={button.reply?.embed?.color || '#5865F2'} 
                                                                            onChange={(e) => updateButton(i, 'reply.embed.color', e.target.value)} 
                                                                            className={`flex-1 min-w-0 ${inputClass}`} 
                                                                        />
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            <div>
                                                                <label className="block text-sm text-muted-foreground mb-2">Description</label>
                                                                <textarea
                                                                    value={(button.reply?.embed?.description || []).join('\n')}
                                                                    onChange={(e) => updateButton(i, 'reply.embed.description', e.target.value.split('\n'))}
                                                                    placeholder="Embed description..."
                                                                    rows={3}
                                                                    className={`${inputClass} resize-none`}
                                                                />
                                                            </div>

                                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                                                                <div>
                                                                    <label className="block text-sm text-muted-foreground mb-2">Author</label>
                                                                    <input 
                                                                        type="text" 
                                                                        value={button.reply?.embed?.author?.text || ''} 
                                                                        onChange={(e) => updateButton(i, 'reply.embed.author.text', e.target.value)} 
                                                                        placeholder="Author name" 
                                                                        className={inputClass} 
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label className="block text-sm text-muted-foreground mb-2">Footer</label>
                                                                    <input 
                                                                        type="text" 
                                                                        value={button.reply?.embed?.footer?.text || ''} 
                                                                        onChange={(e) => updateButton(i, 'reply.embed.footer.text', e.target.value)} 
                                                                        placeholder="Footer text" 
                                                                        className={inputClass} 
                                                                    />
                                                                </div>
                                                            </div>

                                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                                                                <div>
                                                                    <label className="block text-sm text-muted-foreground mb-2">Thumbnail URL</label>
                                                                    <input 
                                                                        type="text" 
                                                                        value={button.reply?.embed?.thumbnail || ''} 
                                                                        onChange={(e) => updateButton(i, 'reply.embed.thumbnail', e.target.value)} 
                                                                        placeholder="https://..." 
                                                                        className={inputClass} 
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label className="block text-sm text-muted-foreground mb-2">Image URL</label>
                                                                    <input 
                                                                        type="text" 
                                                                        value={button.reply?.embed?.image || ''} 
                                                                        onChange={(e) => updateButton(i, 'reply.embed.image', e.target.value)} 
                                                                        placeholder="https://..." 
                                                                        className={inputClass} 
                                                                    />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Options */}
                        {activeSection === 'options' && (
                            <div className="space-y-4 sm:space-y-6">
                                <div>
                                    <h2 className="text-base sm:text-lg font-semibold text-foreground mb-1">Options</h2>
                                    <p className="text-xs sm:text-sm text-muted-foreground mb-4 sm:mb-6">Additional settings for your command</p>
                                </div>
                                
                                <div className="space-y-3 sm:space-y-4">
                                    <label className="flex items-start sm:items-center gap-3 sm:gap-4 p-4 sm:p-5 bg-secondary/20 rounded-xl sm:rounded-2xl border border-border cursor-pointer hover:bg-secondary/30 transition-colors">
                                        <input type="checkbox" checked={command.options.replyToUser} onChange={(e) => handleChange('options.replyToUser', e.target.checked)} className="w-5 h-5 rounded mt-0.5 sm:mt-0 shrink-0" />
                                        <div>
                                            <p className="font-medium text-foreground text-sm sm:text-base">Reply to User</p>
                                            <p className="text-xs sm:text-sm text-muted-foreground">Reply directly to the user's message instead of sending a new one</p>
                                        </div>
                                    </label>
                                    <label className="flex items-start sm:items-center gap-3 sm:gap-4 p-4 sm:p-5 bg-secondary/20 rounded-xl sm:rounded-2xl border border-border cursor-pointer hover:bg-secondary/30 transition-colors">
                                        <input type="checkbox" checked={command.options.deleteTriggerMessage} onChange={(e) => handleChange('options.deleteTriggerMessage', e.target.checked)} className="w-5 h-5 rounded mt-0.5 sm:mt-0 shrink-0" />
                                        <div>
                                            <p className="font-medium text-foreground text-sm sm:text-base">Delete Trigger Message</p>
                                            <p className="text-xs sm:text-sm text-muted-foreground">Automatically delete the user's command message after responding</p>
                                        </div>
                                    </label>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Preview Panel - Desktop only */}
                <div className="hidden 2xl:flex w-80 xl:w-96 border-l border-border bg-card/30 p-4 xl:p-6 overflow-y-auto flex-col shrink-0">
                    <div className="sticky top-0">
                        <h3 className="text-sm font-semibold text-foreground mb-4">Live Preview</h3>
                        <div className="bg-[#313338] rounded-xl p-3 xl:p-4">
                            <CommandPreview command={command} commandPrefix={commandPrefix} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CommandEditor;
