import React, { useState, useEffect } from 'react';
import api from '../../../lib/api/axios';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faTimes, faGripLines, faStar, faExternalLinkAlt, faPencil } from '@fortawesome/free-solid-svg-icons';
import { toast } from '../../../components/ui/Toast';

function NavigationSettings() {
    const [customItems, setCustomItems] = useState([]);
    const [newItem, setNewItem] = useState({ name: '', href: '', emoji: '', isExternal: false });
    const [error, setError] = useState('');
    const [draggedItem, setDraggedItem] = useState(null);
    const [categories, setCategories] = useState({
        navigation: 'Navigation',
        custom: 'Custom Links',
        addons: 'Addons'
    });
    const [editingCategory, setEditingCategory] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            setLoading(true);
            const response = await api.get('/settings/dashboard/navigation');
            const { customNavItems, navCategories } = response.data;
            
            if (customNavItems) {
                setCustomItems(customNavItems);
            }
            
            if (navCategories) {
                setCategories(navCategories);
            }
        } catch (e) {
            console.error('Failed to load navigation settings:', e);
            setError('Failed to load settings');
        } finally {
            setLoading(false);
        }
    };

    const saveItems = async (items) => {
        try {
            await api.post('/settings/dashboard/navigation/items', { items });
            setCustomItems(items);
        } catch (e) {
            console.error('Failed to save navigation items:', e);
            setError('Failed to save items');
        }
    };

    const saveCategories = async (newCategories) => {
        try {
            await api.post('/settings/dashboard/navigation/categories', { categories: newCategories });
            setCategories(newCategories);
        } catch (e) {
            console.error('Failed to save categories:', e);
            setError('Failed to save categories');
        }
    };

    const isValidUrl = (string) => {
        try {
            new URL(string);
            return true;
        } catch (_) {
            return false;
        }
    };

    const formatInternalPath = (path) => {
        if (path.startsWith('*/')) {
            path = path.substring(2);
        }
        if (!path.startsWith('/')) {
            path = '/' + path;
        }
        if (path.length > 1 && path.endsWith('/')) {
            path = path.slice(0, -1);
        }
        return path;
    };

    const handleAddItem = async () => {
        if (!newItem.name || !newItem.href) {
            setError('Both name and URL are required');
            return;
        }

        let finalHref = newItem.href.trim();
        let isExternal = false;

        if (finalHref.startsWith('http://') || finalHref.startsWith('https://')) {
            if (!isValidUrl(finalHref)) {
                setError('Please enter a valid URL');
                return;
            }
            isExternal = true;
        } else {
            if (!finalHref.startsWith('/') && !finalHref.startsWith('*/')) {
                setError('Internal links must start with / or */ (e.g., /dashboard or */settings)');
                return;
            }
            finalHref = formatInternalPath(finalHref);
        }

        const newItemWithId = { 
            ...newItem, 
            href: finalHref, 
            isExternal,
            emoji: newItem.emoji || (isExternal ? '🔗' : '⭐'),
            icon: isExternal ? faExternalLinkAlt : faStar,
            id: Date.now().toString()
        };

        try {
            const items = [...customItems, newItemWithId];
            await saveItems(items);
            setNewItem({ name: '', href: '', emoji: '', isExternal: false });
            setError('');
            toast.success('Navigation item added');
        } catch (e) {
            setError('Failed to add item');
        }
    };

    const handleRemoveItem = async (index) => {
        try {
            const items = customItems.filter((_, i) => i !== index);
            await saveItems(items);
            toast.success('Item removed');
        } catch (e) {
            setError('Failed to remove item');
        }
    };

    const handleDragStart = (e, index) => {
        setDraggedItem(index);
        e.currentTarget.classList.add('opacity-50');
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragEnd = (e) => {
        e.currentTarget.classList.remove('opacity-50');
        setDraggedItem(null);
    };

    const handleDragOver = (e, index) => {
        e.preventDefault();
        if (draggedItem === null || draggedItem === index) return;

        const items = [...customItems];
        const draggedItemContent = items[draggedItem];
        items.splice(draggedItem, 1);
        items.splice(index, 0, draggedItemContent);

        saveItems(items);
        setDraggedItem(index);
    };

    const handleEditCategory = (category) => {
        setEditingCategory(category);
    };

    const handleSaveCategory = async (category, value) => {
        if (!value.trim()) return;
        try {
            const newCategories = { ...categories, [category]: value.trim() };
            await saveCategories(newCategories);
            setEditingCategory(null);
            toast.success('Category updated');
        } catch (e) {
            setError('Failed to save category');
        }
    };

    const clearAllItems = async () => {
        try {
            await api.delete('/settings/dashboard/navigation/items');
            setCustomItems([]);
            toast.success('All items cleared');
        } catch (e) {
            console.error('Failed to clear navigation items:', e);
            setError('Failed to clear items');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-8">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {error && (
                <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg text-sm">
                    {error}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-5">
                    <div>
                        <h3 className="text-sm font-medium text-foreground mb-2">Category Names</h3>
                        <div className="space-y-2">
                            {Object.entries(categories).map(([key, value]) => (
                                <div
                                    key={key}
                                    className="flex items-center justify-between p-3 bg-secondary border border-border rounded-lg"
                                >
                                    {editingCategory === key ? (
                                        <input
                                            type="text"
                                            value={value}
                                            onChange={(e) => setCategories({ ...categories, [key]: e.target.value })}
                                            onBlur={() => handleSaveCategory(key, value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    handleSaveCategory(key, value);
                                                }
                                            }}
                                            className="flex-1 bg-background border border-border rounded px-2 py-1 text-sm text-foreground"
                                            autoFocus
                                        />
                                    ) : (
                                        <>
                                            <span className="flex-1 text-sm text-foreground">{value}</span>
                                            <button
                                                onClick={() => handleEditCategory(key)}
                                                className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                                            >
                                                <FontAwesomeIcon icon={faPencil} className="w-3 h-3" />
                                            </button>
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    <form onSubmit={(e) => { e.preventDefault(); handleAddItem(); }} className="space-y-3">
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-1.5">Name</label>
                            <input
                                type="text"
                                value={newItem.name}
                                onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
                                placeholder="Enter item name"
                            />
                            <p className="mt-1 text-xs text-muted-foreground">This will appear in the navigation menu</p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-foreground mb-1.5">URL</label>
                            <input
                                type="text"
                                value={newItem.href}
                                onChange={(e) => setNewItem({ ...newItem, href: e.target.value })}
                                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
                                placeholder="e.g., */settings or https://..."
                            />
                            <p className="mt-1 text-xs text-muted-foreground">Use */ for internal pages or full URLs for external links</p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-foreground mb-1.5">Icon</label>
                            <div className="flex items-center gap-2">
                                <div className="w-10 h-10 rounded-lg bg-secondary border border-border flex items-center justify-center text-lg shrink-0">
                                    {newItem.emoji || '🔗'}
                                </div>
                                <input
                                    type="text"
                                    value={newItem.emoji}
                                    onChange={(e) => setNewItem({ ...newItem, emoji: e.target.value })}
                                    className="flex-1 bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
                                    placeholder="Paste an emoji (e.g. 📊, 🎮, 💬)"
                                />
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">Choose an emoji icon for this navigation item</p>
                        </div>

                        <div className="flex justify-between items-center pt-2">
                            <button
                                type="button"
                                onClick={clearAllItems}
                                className="text-sm text-destructive hover:text-destructive/80 transition-colors"
                            >
                                Clear All Items
                            </button>
                            <button
                                type="submit"
                                className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors flex items-center gap-2"
                            >
                                <FontAwesomeIcon icon={faPlus} className="w-3 h-3" />
                                <span>Add Item</span>
                            </button>
                        </div>
                    </form>
                </div>

                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-medium text-foreground">Current Items</h3>
                        <span className="text-xs text-muted-foreground bg-secondary px-2 py-1 rounded">
                            Drag to reorder
                        </span>
                    </div>
                    {customItems.length === 0 ? (
                        <div className="bg-secondary rounded-lg p-4">
                            <p className="text-sm text-muted-foreground text-center">No custom navigation items added yet.</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {customItems.map((item, index) => (
                                <div
                                    key={item.id || index}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, index)}
                                    onDragEnd={handleDragEnd}
                                    onDragOver={(e) => handleDragOver(e, index)}
                                    className="group bg-secondary rounded-lg p-3 flex items-center gap-3 hover:bg-muted transition-colors"
                                >
                                    <FontAwesomeIcon 
                                        icon={faGripLines} 
                                        className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity cursor-move" 
                                    />
                                    {item.emoji ? (
                                        <span className="text-lg w-4 h-4 flex items-center justify-center">{item.emoji}</span>
                                    ) : (
                                        <FontAwesomeIcon 
                                            icon={item.isExternal ? faExternalLinkAlt : faStar} 
                                            className="w-4 h-4 text-muted-foreground" 
                                        />
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-sm text-foreground truncate">{item.name}</p>
                                        <p className="text-xs text-muted-foreground truncate">{item.href}</p>
                                    </div>
                                    <button
                                        onClick={() => handleRemoveItem(index)}
                                        className="p-1.5 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                                        title="Remove Item"
                                    >
                                        <FontAwesomeIcon icon={faTimes} className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default NavigationSettings;
