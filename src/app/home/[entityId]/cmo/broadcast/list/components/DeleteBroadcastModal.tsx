import React from "react";
import { X } from "lucide-react";
import { Broadcast } from "../page";

interface DeleteBroadcastModalProps {
    deleteTarget: Broadcast;
    setDeleteTarget: React.Dispatch<React.SetStateAction<Broadcast | null>>;
    confirmDelete: () => void;
}

export default function DeleteBroadcastModal({
    deleteTarget,
    setDeleteTarget,
    confirmDelete
}: DeleteBroadcastModalProps) {
    return (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-[#121319] border border-white/10 rounded-2xl w-[440px] max-w-[90vw] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
                {/* Title Bar */}
                <div className="p-4 border-b border-white/5 flex items-center justify-between">
                    <h3 className="font-normal text-sm text-white/95 tracking-tight">
                        Delete Broadcast ({deleteTarget.name})
                    </h3>
                    <button 
                        onClick={() => setDeleteTarget(null)}
                        className="p-1 hover:bg-white/5 rounded text-neutral-500 hover:text-white transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
                {/* Body content */}
                <div className="p-5 space-y-4 text-xs text-neutral-300 leading-relaxed">
                    <p>
                        If you delete this broadcast, all the associated details and configurations will be lost forever.
                    </p>
                    <p className="font-medium text-white/90">
                        Are you sure you want to delete it?
                    </p>
                </div>
                {/* Actions */}
                <div className="p-4 bg-[#0a0a0d]/50 border-t border-white/5 flex items-center justify-end gap-2.5">
                    <button
                        onClick={() => setDeleteTarget(null)}
                        className="px-4 py-2 rounded-lg text-xs font-medium text-neutral-400 hover:text-white hover:bg-white/5 transition-all"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={confirmDelete}
                        className="bg-red-500 hover:bg-red-600 active:scale-95 text-white font-medium text-xs px-4 py-2 rounded-lg transition-all shadow-lg shadow-red-500/15"
                    >
                        Delete
                    </button>
                </div>
            </div>
        </div>
    );
}
