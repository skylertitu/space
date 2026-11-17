// src/components/settings/SharedComponents.tsx
'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { Edge, Node } from 'reactflow';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Progress } from "@/components/ui/progress";
import { cn } from '@/lib/utils';
import { UploadCloud, Variable, XCircle } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase';
import { toast } from 'sonner';
import { detectWhatsAppMediaType, validateMediaSize } from '@/lib/whatsapp/mediaUtils';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const SettingsSection = ({ title, children }: { title: string, children: React.ReactNode }) => (
    <div className="flex flex-col space-y-4 py-3 border-b border-neutral-800/50 last:border-0 px-1">
        <h4 className="text-[10px] font-black text-neutral-500 uppercase tracking-[0.15em] mb-1">{title}</h4>
        <div className="flex flex-col gap-3">{children}</div>
    </div>
);

export const Field = ({ label, htmlFor, children, description = null }: { label: string, htmlFor: string, children: React.ReactNode, description?: string | null }) => (
    <div className="flex flex-col space-y-1.5 px-1 py-1">
        <div className="flex flex-col">
            <Label htmlFor={htmlFor} className="text-[9px] font-black text-neutral-500 uppercase tracking-[0.15em] leading-tight mb-1">{label}</Label>
            {description && <p className="text-[9px] text-neutral-600 font-bold uppercase tracking-wider leading-tight mb-2">{description}</p>}
        </div>
        <div className="w-full">
            {children}
        </div>
    </div>
);

export const FileUploader = ({
    onUploadSuccess,
    initialUrl = null,
    initialFilename = null,
    accept,
}: {
    onUploadSuccess: (url: string, filename: string, fileType: string) => void;
    initialUrl: string | null;
    initialFilename: string | null;
    accept?: Record<string, string[]>;
}) => {
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [fileUrl, setFileUrl] = useState<string | null>(initialUrl);
    const [filename, setFilename] = useState<string | null>(initialFilename);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setFileUrl(initialUrl);
        setFilename(initialFilename);
    }, [initialUrl, initialFilename]);

    const onDrop = useCallback((acceptedFiles: File[]) => {
        const file = acceptedFiles[0];
        if (!file) return;

        const kind = detectWhatsAppMediaType({ filename: file.name, mimeType: file.type });
        const sizeErr = validateMediaSize(kind, file.size);
        if (sizeErr) {
            toast.error(sizeErr);
            return;
        }

        setUploading(true);
        setError(null);
        setProgress(0);
        
        const storageRef = ref(storage, `chatbot_media/${Date.now()}_${file.name}`);
        const uploadTask = uploadBytesResumable(storageRef, file);

        uploadTask.on('state_changed',
            (snapshot) => {
                const prog = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
                setProgress(prog);
            },
            (err) => {
                console.error("Error al subir archivo:", err);
                let errorMsg = 'Error al subir el archivo.';
                if (err.code === 'storage/retry-limit-exceeded') {
                    errorMsg = 'Error de conexión: El Bucket es incorrecto o falta configurar el CORS.';
                } else if (err.code === 'storage/unauthorized') {
                    errorMsg = 'Error: No tienes permisos para subir archivos aquí.';
                }
                setError(errorMsg);
                toast.error(errorMsg);
                setUploading(false);
            },
            () => {
                getDownloadURL(uploadTask.snapshot.ref).then((downloadURL) => {
                    setFileUrl(downloadURL);
                    setFilename(file.name);
                    onUploadSuccess(downloadURL, file.name, file.type);
                    setUploading(false);
                    setProgress(100);
                });
            }
        );
    }, [onUploadSuccess]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        multiple: false,
        accept: accept || {
            'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.gif'],
            'video/*': ['.mp4', '.3gp', '.mov'],
            'audio/*': ['.mp3', '.ogg', '.wav', '.m4a', '.aac', '.opus'],
            'application/pdf': ['.pdf'],
            'application/*': ['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.csv'],
        },
    });

    const handleRemoveFile = () => {
        setFileUrl(null);
        setFilename(null);
        onUploadSuccess('', '', '');
    };

    if (fileUrl) {
        return (
            <div className="p-3 bg-neutral-800 rounded-lg flex items-center justify-between border border-neutral-700">
                <p className="text-sm text-white truncate pr-4">{filename}</p>
                <Button variant="ghost" size="icon" onClick={handleRemoveFile} className="h-7 w-7">
                    <XCircle className="text-red-500 hover:text-red-400" size={18} />
                </Button>
            </div>
        );
    }

    return (
        <div {...getRootProps()} className={cn("p-6 border-2 border-dashed rounded-lg cursor-pointer text-center transition-colors", isDragActive ? "border-purple-500 bg-purple-900/20" : "border-neutral-700 hover:border-neutral-600 hover:bg-neutral-800/50")}>
            <input {...getInputProps()} />
            {uploading ? (
                <div className="space-y-2">
                    <Progress value={progress} className="w-full bg-neutral-700" />
                    <p className="text-sm text-neutral-400">Subiendo... {Math.round(progress)}%</p>
                </div>
            ) : (
                <div className="flex flex-col items-center gap-2 text-neutral-500">
                    <UploadCloud size={32} />
                    <p className="text-sm">
                        {isDragActive ? "Suelta el archivo aquí" : "Arrastra un archivo o haz clic"}
                    </p>
                    <p className="text-[9px] text-neutral-600">Imagen 5MB · Video/Audio 16MB · Documento 100MB</p>
                    {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
                </div>
            )}
        </div>
    );
};

const COMMON_VARIABLES = [
    { label: 'Nombre Contacto', value: '{{name}}' },
    { label: 'Teléfono', value: '{{phone}}' },
];

export const getSequentialVariableNodes = (node: Node, allNodes: Node[], allEdges: Edge[]) => {
    const incomingMap = new Map<string, string[]>();

    allEdges.forEach((edge) => {
        if (!incomingMap.has(edge.target)) incomingMap.set(edge.target, []);
        incomingMap.get(edge.target)!.push(edge.source);
    });

    const visited = new Set<string>();
    const orderedIds: string[] = [];

    const visit = (nodeId: string) => {
        const parentIds = incomingMap.get(nodeId) || [];
        parentIds.forEach((parentId) => {
            if (visited.has(parentId)) return;
            visited.add(parentId);
            visit(parentId);
            orderedIds.push(parentId);
        });
    };

    visit(node.id);

    const seenVariables = new Set<string>();

    return orderedIds
        .map((nodeId) => allNodes.find((candidate) => candidate.id === nodeId))
        .filter((candidate): candidate is Node => !!candidate)
        .filter((candidate) => (candidate.type === 'captureInputNode' || candidate.type === 'setVariableNode') && candidate.data?.variableName)
        .filter((candidate) => {
            const variableName = String(candidate.data?.variableName || '');
            if (!variableName || seenVariables.has(variableName)) return false;
            seenVariables.add(variableName);
            return true;
        });
};

interface VariablePickerProps {
    node: Node;
    allNodes: Node[];
    allEdges: Edge[];
    onInsert: (value: string) => void;
    className?: string;
}

export const VariablePicker = ({ node, allNodes, allEdges, onInsert, className }: VariablePickerProps) => {
    const capturedVariables = getSequentialVariableNodes(node, allNodes, allEdges);

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className={cn("h-7 w-7 text-purple-500 hover:text-purple-400 hover:bg-purple-500/10", className)}
                    title="Insertar variables"
                >
                    <Variable size={14} />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="bg-neutral-900 border-neutral-800 text-white max-h-[300px] overflow-y-auto custom-scrollbar w-72">
                <div className="px-3 py-2 border-b border-neutral-800">
                    <span className="text-[9px] font-black text-neutral-500 uppercase tracking-widest">Globales</span>
                </div>
                {COMMON_VARIABLES.map((variable) => (
                    <DropdownMenuItem
                        key={variable.value}
                        onClick={() => onInsert(variable.value)}
                        className="hover:bg-neutral-800 cursor-pointer flex justify-between gap-4 py-2"
                    >
                        <span className="text-[10px] font-bold uppercase">{variable.label}</span>
                        <span className="font-mono text-neutral-500 text-[9px]">{variable.value}</span>
                    </DropdownMenuItem>
                ))}

                {capturedVariables.length > 0 && (
                    <>
                        <div className="px-3 py-2 border-y border-neutral-800 mt-1">
                            <span className="text-[9px] font-black text-neutral-500 uppercase tracking-widest">Capturadas en secuencia</span>
                        </div>
                        {capturedVariables.map((capturedNode) => {
                            const variableName = capturedNode.data?.variableName;
                            const label = capturedNode.data?.label || (capturedNode.type === 'captureInputNode' ? 'Entrada' : 'Variable');
                            return (
                                <DropdownMenuItem
                                    key={capturedNode.id}
                                    onClick={() => onInsert(`{{${variableName}}}`)}
                                    className="hover:bg-neutral-800 cursor-pointer flex justify-between gap-4 py-2"
                                >
                                    <span className="text-[10px] font-bold uppercase">{label}</span>
                                    <span className="font-mono text-purple-500 text-[9px]">{`{{${variableName}}}`}</span>
                                </DropdownMenuItem>
                            );
                        })}
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
};

