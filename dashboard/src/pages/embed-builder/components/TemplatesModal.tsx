import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFolderOpen, faTrash, faTimes } from '@fortawesome/free-solid-svg-icons';

interface Template {
    _id: string;
    name: string;
    embedData: any;
    linkButtons: any[];
    claimed: boolean;
    claimedBy: string | null;
}

interface TemplatesModalProps {
    isOpen: boolean;
    onClose: () => void;
    templates: Template[];
    onLoadTemplate: (templateId: string) => void;
    onDeleteTemplate: (templateId: string) => void;
}

const TemplatesModal: React.FC<TemplatesModalProps> = ({
    isOpen,
    onClose,
    templates,
    onLoadTemplate,
    onDeleteTemplate
}) => {
    if (!isOpen) return null;

    const handleLoadTemplate = (templateId: string) => {
        onLoadTemplate(templateId);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div 
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={onClose}
            />
            
            {/* Modal */}
            <div className="relative bg-card/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-border w-full max-w-2xl mx-4 max-h-[80vh] overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-border">
                    <div>
                        <h2 className="text-xl font-semibold text-foreground">Template Library</h2>
                        <p className="text-sm text-muted-foreground mt-1">
                            Load or manage your saved embed templates
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors"
                    >
                        <FontAwesomeIcon icon={faTimes} className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto max-h-[60vh]">
                    {templates.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {templates.map((template) => (
                                <div
                                    key={template._id}
                                    className="group bg-secondary/50 rounded-xl p-4 border border-border hover:border-primary/50 transition-all duration-200"
                                >
                                    {/* Template Preview */}
                                    <div className="mb-3">
                                        <h3 className="font-medium text-foreground mb-2">{template.name}</h3>
                                        <div className="bg-[#313338] rounded-lg p-3 text-xs">
                                            <div className="flex">
                                                <div className="w-1 bg-blue-500 rounded-l"></div>
                                                <div className="bg-[#2B2D31] rounded-r flex-1 p-2">
                                                    {template.embedData.title && (
                                                        <div className="text-[#00a8fc] font-semibold text-sm mb-1 truncate">
                                                            {template.embedData.title}
                                                        </div>
                                                    )}
                                                    {template.embedData.description && (
                                                        <div className="text-[#dbdee1] text-xs line-clamp-2">
                                                            {template.embedData.description}
                                                        </div>
                                                    )}
                                                    {template.embedData.fields && template.embedData.fields.length > 0 && (
                                                        <div className="text-[#989AA2] text-xs mt-1">
                                                            {template.embedData.fields.length} field{template.embedData.fields.length !== 1 ? 's' : ''}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center justify-between">
                                        <button
                                            onClick={() => handleLoadTemplate(template._id)}
                                            className="flex items-center space-x-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium"
                                        >
                                            <FontAwesomeIcon icon={faFolderOpen} className="w-4 h-4" />
                                            <span>Load</span>
                                        </button>
                                        <button
                                            onClick={() => onDeleteTemplate(template._id)}
                                            className="p-2 text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                                            title="Delete Template"
                                        >
                                            <FontAwesomeIcon icon={faTrash} className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-12">
                            <div className="text-muted-foreground mb-4">
                                <FontAwesomeIcon icon={faFolderOpen} className="w-12 h-12 mx-auto mb-4 opacity-50" />
                                <h3 className="text-lg font-medium mb-2">No Templates Yet</h3>
                                <p className="text-sm">
                                    Create your first embed and save it as a template to get started
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TemplatesModal; 