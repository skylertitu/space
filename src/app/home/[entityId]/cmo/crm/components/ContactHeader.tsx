import React from 'react';
import { motion } from 'framer-motion';
import { RefreshCw, UserPlus, Trash2, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogDescription,
    DialogFooter
} from '@/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ImportDialog } from './ImportDialog';
import { EnhancedContactForm } from './EnhancedContactForm';
import { cn } from "@/lib/utils";

interface ContactHeaderProps {
    isChatOpen: boolean;
    handleSynckambanContacts: () => void;
    isSyncing: boolean;
    isImportModalOpen: boolean;
    setIsImportModalOpen: (open: boolean) => void;
    onImportDrop: (acceptedFiles: File[]) => void;
    isAddModalOpen: boolean;
    setIsAddModalOpen: (open: boolean) => void;
    newContact: any;
    setNewContact: (contact: any) => void;
    handleAddContact: () => void;
    setIsDuplicateManagerOpen: (open: boolean) => void;
    handleExport: (scope: 'all' | 'filtered' | 'selected') => void;
    selectedCount: number;
    filteredCount: number;
}

export const ContactHeader: React.FC<ContactHeaderProps> = ({
    isChatOpen,
    handleSynckambanContacts,
    isSyncing,
    isImportModalOpen,
    setIsImportModalOpen,
    onImportDrop,
    isAddModalOpen,
    setIsAddModalOpen,
    newContact,
    setNewContact,
    handleAddContact,
    setIsDuplicateManagerOpen,
    handleExport,
    selectedCount,
    filteredCount
}) => {
    return (
        <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative z-10"
        >
            <div>
                <h1 className={cn("font-medium tracking-tight transition-all uppercase whitespace-nowrap", isChatOpen ? "text-base" : "text-base sm:text-2xl")}>
                    Control Center <span className="text-blue-500">/ Contacts</span>
                </h1>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
                <Button
                    onClick={() => setIsDuplicateManagerOpen(true)}
                    variant="outline"
                    className="h-10 w-10 sm:w-auto sm:px-4 bg-white/5 border-white/10 hover:bg-white/10 text-white rounded-xl transition-all uppercase tracking-wider flex items-center justify-center gap-2"
                >
                    <RefreshCw className="w-4 h-4" />
                    <span className="hidden sm:inline text-[10px]">Duplicates</span>
                </Button>

                <Button
                    onClick={handleSynckambanContacts}
                    disabled={isSyncing}
                    variant="outline"
                    className="h-10 w-10 sm:w-auto sm:px-4 bg-white/5 border-white/10 hover:bg-white/10 text-white rounded-xl transition-all disabled:opacity-50 uppercase tracking-wider flex items-center justify-center gap-2"
                >
                    <RefreshCw className={cn("w-4 h-4", isSyncing && "animate-spin")} />
                    <span className="hidden sm:inline text-[10px]">{isSyncing ? 'Syncing' : 'Sync'}</span>
                </Button>

                <ImportDialog
                    isOpen={isImportModalOpen}
                    onOpenChange={setIsImportModalOpen}
                    onDrop={onImportDrop}
                />

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="outline"
                            className="h-10 w-10 sm:w-auto sm:px-4 bg-white/5 border-white/10 hover:bg-white/10 text-white rounded-xl transition-all uppercase tracking-wider flex items-center justify-center gap-2"
                        >
                            <Download className="w-4 h-4" />
                            <span className="hidden sm:inline text-[10px]">Export</span>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-neutral-900 border-neutral-800 text-white rounded-xl py-1 shadow-2xl">
                        {selectedCount > 0 && (
                            <DropdownMenuItem onClick={() => handleExport('selected')} className="hover:bg-blue-600 rounded-lg cursor-pointer mx-1 text-xs font-medium uppercase tracking-wider py-2">
                                <Download className="w-3.5 h-3.5 mr-2" /> Seleccionados ({selectedCount})
                            </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => handleExport('filtered')} className="hover:bg-blue-600 rounded-lg cursor-pointer mx-1 text-xs font-medium uppercase tracking-wider py-2">
                            <Download className="w-3.5 h-3.5 mr-2" /> Vista actual ({filteredCount})
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleExport('all')} className="hover:bg-blue-600 rounded-lg cursor-pointer mx-1 text-xs font-medium uppercase tracking-wider py-2">
                            <Download className="w-3.5 h-3.5 mr-2" /> Toda la base
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>

                <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
                    <DialogTrigger asChild>
                        <Button className="h-10 flex-1 sm:flex-none bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl px-4 sm:px-6 text-[10px] sm:text-xs transition-all uppercase tracking-widest shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2">
                            <UserPlus className="w-4 h-4" />
                            <span className="hidden sm:inline">Create Profile</span>
                            <span className="sm:hidden">Profile</span>
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-[#0a0a0a] border-white/5 text-white w-[95vw] sm:max-w-6xl rounded-[2rem] p-4 sm:p-8 backdrop-blur-3xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle className="text-xl sm:text-2xl font-bold tracking-tight uppercase text-white">Create Profile</DialogTitle>
                            <DialogDescription className="text-neutral-500 font-medium text-sm">Add a comprehensive contact profile to your ecosystem.</DialogDescription>
                        </DialogHeader>
                        <div className="py-4 sm:py-6">
                            <EnhancedContactForm contact={newContact} onChange={setNewContact} isEditing={true} />
                        </div>
                        <DialogFooter className="flex flex-col sm:flex-row gap-2">
                            <Button variant="ghost" onClick={() => setIsAddModalOpen(false)} className="text-neutral-400 font-medium hover:text-white rounded-xl px-6 w-full sm:w-auto">Cancel</Button>
                            <Button onClick={handleAddContact} className="bg-blue-600 hover:bg-blue-500 px-10 rounded-xl font-bold shadow-lg shadow-blue-600/20 active:scale-95 transition-all w-full sm:w-auto uppercase tracking-widest text-[10px]">Establish Profile</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </motion.div>
    );
};


