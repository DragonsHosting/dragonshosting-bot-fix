import React from 'react';

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

interface CommandPreviewProps {
    command: CustomCommand;
    commandPrefix: string;
}

const buttonStyles: Record<string, string> = {
    Primary: 'bg-[#5865F2] hover:bg-[#4752C4]',
    Secondary: 'bg-[#4E505D] hover:bg-[#6D6F7B]',
    Success: 'bg-[#248046] hover:bg-[#1A6334]',
    Danger: 'bg-[#DA373C] hover:bg-[#A12D31]',
    Link: 'bg-[#4E505D] hover:bg-[#6D6F7B]'
};

const CommandPreview: React.FC<CommandPreviewProps> = ({ command, commandPrefix }) => {
    const description = Array.isArray(command.embed?.description) ? command.embed.description : [];
    const fields = Array.isArray(command.embed?.fields) ? command.embed.fields : [];
    const buttons = Array.isArray(command.buttons) ? command.buttons : [];
    
    const hasContent = command.text || command.embed?.title || description.length > 0;

    if (!hasContent && buttons.length === 0) {
        return (
            <div className="text-center py-8 text-muted-foreground text-sm">
                Start adding content to see a preview
            </div>
        );
    }

    return (
        <div className="bg-[#313338] rounded-lg p-4">
            {/* User Message (if reply is disabled, show it separately) */}
            {!command.options.deleteTriggerMessage && (
                <div className="flex items-start gap-3 mb-4 pb-4 border-b border-[#3f4147]">
                    <div className="w-10 h-10 rounded-full bg-[#5865F2] flex items-center justify-center text-white text-sm font-medium shrink-0">
                        U
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-white font-medium text-sm">User</span>
                            <span className="text-[#989AA2] text-xs">Today at {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <p className="text-[#dbdee1] text-sm mt-0.5">
                            {commandPrefix}{command.name || 'command'}
                        </p>
                    </div>
                </div>
            )}

            {/* Bot Response */}
            <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-[#5865F2] flex items-center justify-center text-white text-sm font-medium shrink-0">
                    B
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-white font-medium text-sm">Bot</span>
                        <span className="bg-[#5865F2] text-white text-[10px] px-1 py-0.5 rounded font-medium">BOT</span>
                        <span className="text-[#989AA2] text-xs">Today at {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>

                    {/* Reply indicator */}
                    {command.options.replyToUser && (
                        <div className="flex items-center gap-1 text-xs text-[#989AA2] mb-1">
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M10 8.26667L7.33333 11.1333V8.66667H4.66667V5H10V8.26667ZM11.3333 4V9.66667H8.33333V12.8L5.66667 9.66667H3.33333V4H11.3333ZM22 13.3333L22 20H14.6667V17.3333L17.3333 17.3333V19L21 19V14.3333L14.6667 14.3333V13.3333L22 13.3333Z" />
                            </svg>
                            <span>replying to</span>
                            <span className="text-[#00a8fc]">@User</span>
                        </div>
                    )}

                    {/* Text content */}
                    {(command.type === 'TEXT' || command.type === 'BOTH') && command.text && (
                        <p className="text-[#dbdee1] text-sm mb-2 whitespace-pre-wrap">
                            {command.text}
                        </p>
                    )}

                    {/* Embed */}
                    {(command.type === 'EMBED' || command.type === 'BOTH') && (command.embed?.title || description.length > 0) && (
                        <div className="flex mt-1">
                            <div 
                                className="w-1 rounded-l shrink-0" 
                                style={{ backgroundColor: command.embed?.color || '#5865F2' }}
                            />
                            <div className="flex-1 bg-[#2B2D31] rounded-r p-3 overflow-hidden">
                                <div className="flex">
                                    <div className="flex-1 min-w-0 pr-3">
                                        {/* Author */}
                                        {command.embed?.author?.text && (
                                            <div className="flex items-center gap-2 mb-1">
                                                {command.embed?.author?.icon && (
                                                    <img 
                                                        src={command.embed.author.icon} 
                                                        alt="" 
                                                        className="w-5 h-5 rounded-full"
                                                        onError={(e) => (e.target as HTMLImageElement).style.display = 'none'}
                                                    />
                                                )}
                                                <span className="text-white text-xs font-medium">
                                                    {command.embed.author.text}
                                                </span>
                                            </div>
                                        )}

                                        {/* Title */}
                                        {command.embed?.title && (
                                            <h4 className="text-[#00a8fc] font-semibold text-sm mb-1">
                                                {command.embed.title}
                                            </h4>
                                        )}

                                        {/* Description */}
                                        {description.length > 0 && (
                                            <div className="text-[#dbdee1] text-sm whitespace-pre-wrap">
                                                {description.join('\n')}
                                            </div>
                                        )}

                                        {/* Fields */}
                                        {fields.length > 0 && (
                                            <div className="grid grid-cols-1 gap-2 mt-2">
                                                {fields.map((field, index) => (
                                                    <div 
                                                        key={index} 
                                                        className={field.inline ? 'inline-block mr-4' : 'block'}
                                                    >
                                                        {field.name && (
                                                            <h5 className="text-white font-semibold text-xs mb-0.5">
                                                                {field.name}
                                                            </h5>
                                                        )}
                                                        {field.value && (
                                                            <p className="text-[#dbdee1] text-xs">
                                                                {field.value}
                                                            </p>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Image */}
                                        {command.embed?.image && (
                                            <div className="mt-3">
                                                <img 
                                                    src={command.embed.image} 
                                                    alt="" 
                                                    className="max-w-full rounded max-h-[200px] object-contain"
                                                    onError={(e) => (e.target as HTMLImageElement).style.display = 'none'}
                                                />
                                            </div>
                                        )}

                                        {/* Footer */}
                                        {command.embed?.footer?.text && (
                                            <div className="flex items-center gap-2 mt-2 pt-2">
                                                {command.embed?.footer?.icon && (
                                                    <img 
                                                        src={command.embed.footer.icon} 
                                                        alt="" 
                                                        className="w-4 h-4 rounded-full"
                                                        onError={(e) => (e.target as HTMLImageElement).style.display = 'none'}
                                                    />
                                                )}
                                                <span className="text-[#989AA2] text-xs">
                                                    {command.embed.footer.text}
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Thumbnail */}
                                    {command.embed?.thumbnail && (
                                        <div className="shrink-0">
                                            <img 
                                                src={command.embed.thumbnail} 
                                                alt="" 
                                                className="w-16 h-16 rounded object-cover"
                                                onError={(e) => (e.target as HTMLImageElement).style.display = 'none'}
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Buttons */}
                    {buttons.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                            {buttons.map((button, index) => (
                                <button
                                    key={index}
                                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-white text-sm font-medium transition-colors ${
                                        button.type === 'LINK' ? buttonStyles.Link : buttonStyles[button.style]
                                    }`}
                                >
                                    {button.emoji && <span>{button.emoji}</span>}
                                    <span>{button.name || 'Button'}</span>
                                    {button.type === 'LINK' && (
                                        <svg className="w-3 h-3 ml-1" viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M10 6V8H5V19H16V14H18V20C18 20.5523 17.5523 21 17 21H4C3.44772 21 3 20.5523 3 20V7C3 6.44772 3.44772 6 4 6H10ZM21 3V11H19V6.413L11.2071 14.2071L9.79289 12.7929L17.585 5H13V3H21Z" />
                                        </svg>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CommandPreview;
