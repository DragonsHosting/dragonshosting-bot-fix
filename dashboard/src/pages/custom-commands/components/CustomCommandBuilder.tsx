import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faTrash, faPen, faToggleOn, faToggleOff, faTerminal } from "@fortawesome/free-solid-svg-icons";
import axios from 'axios';
import { toast } from '../../../components/ui/Toast';
import CommandEditor from './CommandEditor';

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

interface CommandButton {
    type: 'LINK' | 'REPLY';
    name: string;
    emoji: string;
    style: 'Primary' | 'Secondary' | 'Success' | 'Danger';
    link?: string;
    reply?: {
        embed: EmbedData;
        text: string;
        ephemeral: boolean;
    };
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

const defaultEmbed: EmbedData = {
    title: '',
    description: [],
    color: '#5865F2',
    footer: { text: '', icon: '' },
    author: { text: '', icon: '' },
    thumbnail: '',
    image: '',
    fields: []
};

const defaultCommand: CustomCommand = {
    name: '',
    type: 'EMBED',
    text: '',
    embed: defaultEmbed,
    roles: { whitelist: [] },
    options: { deleteTriggerMessage: false, replyToUser: false },
    buttons: [],
    enabled: true
};

const CustomCommandBuilder: React.FC = () => {
    const [commands, setCommands] = useState<CustomCommand[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [roles, setRoles] = useState<Role[]>([]);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [editingCommand, setEditingCommand] = useState<CustomCommand | null>(null);
    const commandPrefix = '!';

    useEffect(() => {
        fetchCommands();
        fetchServerData();
    }, []);

    const fetchCommands = async () => {
        try {
            setIsLoading(true);
            const response = await axios.get('/api/custom-commands');
            setCommands(Array.isArray(response.data) ? response.data : []);
        } catch (error) {
            console.error('Failed to fetch commands:', error);
            toast.error('Failed to load custom commands');
            setCommands([]);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchServerData = async () => {
        try {
            const response = await axios.get('/api/settings/server-data');
            setRoles(response.data.roles || []);
        } catch (error) {
            console.error('Failed to fetch server data:', error);
        }
    };

    const handleCreateCommand = () => {
        setEditingCommand({ ...defaultCommand });
        setIsEditorOpen(true);
    };

    const handleEditCommand = (command: CustomCommand) => {
        setEditingCommand({ ...command });
        setIsEditorOpen(true);
    };

    const handleSaveCommand = async (command: CustomCommand) => {
        try {
            if (command._id) {
                await axios.put(`/api/custom-commands/${command._id}`, command);
                toast.success('Command updated successfully');
            } else {
                await axios.post('/api/custom-commands', command);
                toast.success('Command created successfully');
            }
            setIsEditorOpen(false);
            setEditingCommand(null);
            fetchCommands();
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Failed to save command');
        }
    };

    const handleDeleteCommand = async (id: string) => {
        if (!confirm('Are you sure you want to delete this command?')) return;
        
        try {
            await axios.delete(`/api/custom-commands/${id}`);
            toast.success('Command deleted successfully');
            fetchCommands();
        } catch (error) {
            toast.error('Failed to delete command');
        }
    };

    const handleToggleCommand = async (id: string) => {
        try {
            await axios.patch(`/api/custom-commands/${id}/toggle`);
            fetchCommands();
        } catch (error) {
            toast.error('Failed to toggle command');
        }
    };

    const handleCloseEditor = () => {
        setIsEditorOpen(false);
        setEditingCommand(null);
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="p-4 max-w-[1600px] mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-xl font-semibold text-foreground">Custom Commands</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Create and manage custom prefix commands for your server
                    </p>
                </div>
                <button
                    onClick={handleCreateCommand}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium"
                >
                    <FontAwesomeIcon icon={faPlus} className="w-4 h-4" />
                    New Command
                </button>
            </div>

            {/* Commands List */}
            {commands.length === 0 ? (
                <div className="bg-card rounded-xl border border-border p-12 text-center">
                    <div className="w-16 h-16 rounded-full bg-secondary/50 flex items-center justify-center mx-auto mb-4">
                        <FontAwesomeIcon icon={faTerminal} className="w-7 h-7 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-medium text-foreground mb-2">No Custom Commands</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                        Create your first custom command to get started
                    </p>
                    <button
                        onClick={handleCreateCommand}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium"
                    >
                        <FontAwesomeIcon icon={faPlus} className="w-4 h-4" />
                        Create Command
                    </button>
                </div>
            ) : (
                <div className="grid gap-3">
                    {commands.map((command) => (
                        <div
                            key={command._id}
                            className={`bg-card rounded-xl border border-border p-4 transition-all ${
                                !command.enabled ? 'opacity-60' : ''
                            }`}
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4 min-w-0">
                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                                        command.enabled ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground'
                                    }`}>
                                        <FontAwesomeIcon icon={faTerminal} className="w-5 h-5" />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <code className="text-sm font-mono font-medium text-foreground bg-secondary px-2 py-0.5 rounded">
                                                {commandPrefix}{command.name}
                                            </code>
                                            <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                                                command.type === 'EMBED' ? 'bg-blue-500/10 text-blue-400' :
                                                command.type === 'TEXT' ? 'bg-green-500/10 text-green-400' :
                                                'bg-purple-500/10 text-purple-400'
                                            }`}>
                                                {command.type}
                                            </span>
                                            {(command.buttons?.length || 0) > 0 && (
                                                <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/10 text-amber-400">
                                                    {command.buttons.length} button{command.buttons.length > 1 ? 's' : ''}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-1 truncate max-w-md">
                                            {command.embed?.title || command.text || 'No content'}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => handleToggleCommand(command._id!)}
                                        className={`p-2 rounded-lg transition-colors ${
                                            command.enabled 
                                                ? 'text-green-400 hover:bg-green-500/10' 
                                                : 'text-muted-foreground hover:bg-secondary'
                                        }`}
                                        title={command.enabled ? 'Disable command' : 'Enable command'}
                                    >
                                        <FontAwesomeIcon 
                                            icon={command.enabled ? faToggleOn : faToggleOff} 
                                            className="w-5 h-5"
                                        />
                                    </button>
                                    <button
                                        onClick={() => handleEditCommand(command)}
                                        className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                                        title="Edit command"
                                    >
                                        <FontAwesomeIcon icon={faPen} className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => handleDeleteCommand(command._id!)}
                                        className="p-2 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                        title="Delete command"
                                    >
                                        <FontAwesomeIcon icon={faTrash} className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Command Editor Modal */}
            {isEditorOpen && editingCommand && (
                <CommandEditor
                    command={editingCommand}
                    roles={roles}
                    onSave={handleSaveCommand}
                    onClose={handleCloseEditor}
                    commandPrefix={commandPrefix}
                />
            )}
        </div>
    );
};

export default CustomCommandBuilder;
