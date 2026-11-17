import React, { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle } from 'lucide-react';

interface DeleteConfirmationDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    description: string;
    itemCount?: number;
}

export function DeleteConfirmationDialog({
    isOpen,
    onClose,
    onConfirm,
    title,
    description,
    itemCount = 1
}: DeleteConfirmationDialogProps) {
    const [confirmText, setConfirmText] = useState('');
    const CONFIRM_WORD = 'DELETE';

    const handleClose = () => {
        setConfirmText('');
        onClose();
    };

    const handleConfirm = () => {
        if (confirmText.toUpperCase() === CONFIRM_WORD) {
            onConfirm();
            setConfirmText('');
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
            <DialogContent className="sm:max-w-[425px] bg-neutral-900 border-red-900/50 text-white rounded-2xl p-0 overflow-hidden shadow-2xl border-white/5">
                <DialogTitle className="sr-only">{title}</DialogTitle>
                <DialogDescription className="sr-only">{description}</DialogDescription>
                <div className="p-6 space-y-6">
                    <div className="flex flex-col items-center text-center space-y-4">
                        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20">
                            <AlertTriangle className="w-8 h-8 text-red-500" />
                        </div>
                        
                        <div className="space-y-2">
                            <h2 className="text-xl font-semibold text-white tracking-tight">
                                {title === 'Eliminar Múltiples Contactos' ? 'Delete Multiple Contacts' : title === 'Eliminar Contacto' ? 'Delete Contact' : title}
                            </h2>
                            <p className="text-sm text-neutral-400 leading-relaxed px-4">
                                {description.includes('permanente') ? 'This action is permanent and cannot be undone. All data associated with these contacts will be deleted.' : description}
                            </p>
                        </div>

                        {itemCount > 1 && (
                            <Badge variant="destructive" className="bg-red-500/20 text-red-400 border-red-500/30 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
                                {itemCount} CONTACTS SELECTED
                            </Badge>
                        )}
                    </div>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold ml-1">
                                Type <span className="text-red-500">{CONFIRM_WORD}</span> to confirm
                            </Label>
                            <Input
                                value={confirmText}
                                onChange={(e) => setConfirmText(e.target.value)}
                                placeholder={`Type ${CONFIRM_WORD} here...`}
                                className="bg-white/5 border-white/10 text-white h-12 rounded-xl focus:ring-red-500/50 focus:border-red-500 transition-all text-center font-medium"
                                onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
                                autoFocus
                            />
                        </div>

                        <div className="flex flex-col gap-2 pt-2">
                            <Button
                                onClick={handleConfirm}
                                disabled={confirmText.toUpperCase() !== CONFIRM_WORD}
                                className={`py-6 rounded-xl font-semibold transition-all shadow-lg ${
                                    confirmText.toUpperCase() === CONFIRM_WORD 
                                    ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-900/20 active:scale-95' 
                                    : 'bg-neutral-800 text-neutral-600 cursor-not-allowed'
                                }`}
                            >
                                Permanently Delete
                            </Button>
                            <Button
                                variant="ghost"
                                onClick={handleClose}
                                className="text-neutral-500 hover:text-white hover:bg-white/5 py-6 rounded-xl transition-all"
                            >
                                Cancel
                            </Button>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

