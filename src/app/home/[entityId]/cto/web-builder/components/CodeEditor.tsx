import React, { useState, useEffect, useRef } from "react";
import { X, Copy, Check, Download, Maximize2, Minimize2, ChevronRight, FileCode, Search, AlertTriangle } from "lucide-react";
import Editor, { Monaco, loader } from "@monaco-editor/react";
import { FileTree } from "./FileTree";

// Initialize Monaco Theme globally to prevent light-theme flashes
loader.init().then((monaco) => {
    monaco.editor.defineTheme('obsidian-pro', {
        base: 'vs-dark',
        inherit: true,
        rules: [
            { token: 'keyword', foreground: '0ea5e9', fontStyle: 'bold' },
            { token: 'identifier', foreground: 'e2e8f0' },
            { token: 'type', foreground: 'c084fc' },
            { token: 'function', foreground: '38bdf8' },
            { token: 'string', foreground: '10b981' },
            { token: 'comment', foreground: '4b5563', fontStyle: 'italic' },
            { token: 'number', foreground: 'f59e0b' },
            { token: 'operator', foreground: '94a3b8' },
            { token: 'tag', foreground: '0ea5e9' },
            { token: 'attribute.name', foreground: 'c084fc' },
        ],
        colors: {
            'editor.background': '#050505',
            'editor.foreground': '#e2e8f0',
            'editorCursor.foreground': '#0ea5e9',
            'editor.lineHighlightBackground': '#111111',
            'editorLineNumber.foreground': '#444444',
            'editorLineNumber.activeForeground': '#0ea5e9',
            'editor.selectionBackground': '#0ea5e940',
            'editorWidget.background': '#0a0a0a',
            'editor.border': '#ffffff08',
        }
    });
});

interface CodeEditorProps {
    showCode: boolean;
    setShowCode: (show: boolean) => void;
    files: Record<string, string>;
    updateFiles: (files: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void;
    activeFile: string;
    setActiveFile: (path: string) => void;
    expandedFolders: Set<string>;
    setExpandedFolders: React.Dispatch<React.SetStateAction<Set<string>>>;
    runtimeErrors?: Record<string, string>;
    setRuntimeErrors?: (errs: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void;
}

export const CodeEditor = ({
    showCode,
    setShowCode,
    files,
    updateFiles,
    activeFile,
    setActiveFile,
    expandedFolders,
    setExpandedFolders,
    runtimeErrors = {},
    setRuntimeErrors
}: CodeEditorProps) => {
    const [openFiles, setOpenFiles] = useState<string[]>([]);
    const [isMaxEditor, setIsMaxEditor] = useState(false);
    const [showSidebar, setShowSidebar] = useState(true);
    const [dismissedErrors, setDismissedErrors] = useState<Record<string, string>>({});
    const [copied, setCopied] = useState(false);

    // Auto-hide sidebar on mobile
    useEffect(() => {
        const isMobile = window.innerWidth < 640;
        if (isMobile) {
            setShowSidebar(false);
        }
    }, []);

    // Reset dismissal if the error message changes
    useEffect(() => {
        if (activeFile && runtimeErrors[activeFile] && dismissedErrors[activeFile] !== runtimeErrors[activeFile]) {
            setDismissedErrors(prev => {
                const next = { ...prev };
                delete next[activeFile];
                return next;
            });
        }
    }, [runtimeErrors[activeFile], activeFile]);

    // Sync activeFile with openFiles
    useEffect(() => {
        if (activeFile) {
            setOpenFiles(prev => prev.includes(activeFile) ? prev : [...prev, activeFile]);
        }
    }, [activeFile]);

    // Handle Editor Search from Preview (Bidirectional Sync)
    const editorRef = useRef<any>(null);
    useEffect(() => {
        const onSearch = (e: any) => {
            const term = e.detail;
            if (editorRef.current && term) {
                const model = editorRef.current.getModel();
                if (model) {
                    const matches = model.findMatches(term, false, false, false, null, true);
                    if (matches && matches.length > 0) {
                        const match = matches[0];
                        editorRef.current.revealRangeInCenter(match.range);
                        editorRef.current.setSelection(match.range);
                    }
                }
            }
        };

        const onGotoLine = (e: any) => {
            const { line } = e.detail;
            if (editorRef.current && line) {
                setTimeout(() => {
                    editorRef.current.revealLineInCenter(line);
                    editorRef.current.setSelection({
                        startLineNumber: line,
                        startColumn: 1,
                        endLineNumber: line,
                        endColumn: 100
                    });
                    editorRef.current.focus();
                }, 100);
            }
        };

        window.addEventListener('editor-search', onSearch);
        window.addEventListener('editor-goto-line', onGotoLine);
        return () => {
            window.removeEventListener('editor-search', onSearch);
            window.removeEventListener('editor-goto-line', onGotoLine);
        };
    }, []);

    // Handle closing a tab
    const closeTab = (e: React.MouseEvent, path: string) => {
        e.stopPropagation();
        const nextFiles = openFiles.filter(f => f !== path);
        setOpenFiles(nextFiles);
        if (activeFile === path && nextFiles.length > 0) {
            setActiveFile(nextFiles[nextFiles.length - 1]);
        } else if (nextFiles.length === 0) {
            setActiveFile("");
        }
    };

    const handleCopy = () => {
        const content = files[activeFile] || "";
        navigator.clipboard.writeText(content).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    const handleDownload = () => {
        const content = files[activeFile] || "";
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = activeFile.split('/').pop() || 'file.txt';
        a.click();
        URL.revokeObjectURL(url);
    };

    if (!showCode) return null;

    const codeContent = files[activeFile] || "";
    const lines = codeContent.split('\n');

    return (
        <div className={`fixed z-[100] bg-[#050505] flex flex-col overflow-hidden transition-all duration-300 border border-white/5 shadow-[0_0_80px_rgba(0,0,0,0.8)] ${isMaxEditor ? 'inset-0 rounded-none' : 'inset-0 sm:inset-6 sm:rounded-2xl'
            }`}>
            {/* Main Header / Tab Bar */}
            <div className="flex items-center justify-between bg-[#0a0a0a] border-b border-white/5 h-11 shrink-0">
                <div className="flex items-center h-full">
                    <button
                        onClick={() => setShowSidebar(!showSidebar)}
                        className={`p-3 h-full border-r border-white/5 transition-colors ${showSidebar ? 'bg-white/5 text-cyan-400' : 'text-neutral-500 hover:text-white'}`}
                        title="Toggle Sidebar"
                    >
                        <Search className="w-4 h-4" />
                    </button>
                    <div className="flex-1 flex items-center overflow-x-auto no-scrollbar h-full">
                    {openFiles.map(path => (
                        <div
                            key={path}
                            onClick={() => setActiveFile(path)}
                            className={`group flex items-center gap-2 px-4 h-full cursor-pointer text-[13px] border-r border-white/5 transition-colors relative min-w-[120px] max-w-[200px] ${activeFile === path
                                ? 'bg-[#0f0f0f] text-white'
                                : 'bg-[#0a0a0a] text-neutral-500 hover:bg-[#111] hover:text-neutral-300'
                                }`}
                        >
                            {activeFile === path && <div className="absolute top-0 left-0 right-0 h-[2px] bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.5)]" />}
                            <span className="truncate flex-1">{path}</span>
                            {runtimeErrors[path] && (
                                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.5)]" title={runtimeErrors[path]} />
                            )}
                            <button
                                onClick={(e) => closeTab(e, path)}
                                className={`p-0.5 rounded hover:bg-[#333] transition-opacity ${activeFile === path ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    ))}
                </div>
            </div>

                <div className="flex items-center gap-1 px-3 border-l border-white/5 h-full bg-[#0a0a0a]">
                    <button onClick={handleCopy} className="p-2 text-neutral-500 hover:text-white rounded-lg transition-colors relative" title="Copiar código">
                        {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                    </button>
                    <button onClick={handleDownload} className="p-2 text-neutral-500 hover:text-white rounded-lg transition-colors" title="Descargar archivo">
                        <Download className="w-4 h-4" />
                    </button>
                    <button onClick={() => setIsMaxEditor(!isMaxEditor)} className="p-2 text-neutral-500 hover:text-white rounded-lg transition-colors">
                        {isMaxEditor ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                    </button>
                    <div className="w-[1px] h-4 bg-white/10 mx-1" />
                    <button onClick={() => setShowCode(false)} className="p-2 text-neutral-500 hover:text-red-400 rounded-lg transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden relative">
                {/* File Explorer Sidebar */}
                {showSidebar && (
                    <div className="absolute inset-y-0 left-0 w-[280px] sm:relative sm:w-[280px] bg-[#0a0a0a] border-r border-white/5 flex flex-col overflow-hidden z-[120] animate-in slide-in-from-left duration-300 shadow-[20px_0_50px_rgba(0,0,0,0.5)] sm:shadow-none sm:z-0 sm:animate-none sm:inset-auto sm:shrink-0">
                        <div className="flex items-center justify-between p-4 border-b border-white/5 sm:hidden">
                            <span className="text-xs font-bold uppercase tracking-widest text-gray-400">Archivos</span>
                            <button onClick={() => setShowSidebar(false)} className="p-1 hover:bg-white/5 rounded-lg text-gray-500">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <FileTree
                            files={files}
                            activeFile={activeFile}
                            setActiveFile={(path) => {
                                setActiveFile(path);
                                if (window.innerWidth < 640) setShowSidebar(false);
                            }}
                            expandedFolders={expandedFolders}
                            setExpandedFolders={setExpandedFolders}
                            runtimeErrors={runtimeErrors}
                        />
                    </div>
                )}

                {/* Editor Surface */}
                <div className="flex-1 flex flex-col bg-[#050505] relative overflow-hidden">
                    {/* Floating Error Banner */}
                    {runtimeErrors[activeFile] && dismissedErrors[activeFile] !== runtimeErrors[activeFile] && (
                        <div className="absolute top-4 left-4 right-4 z-[110] animate-in slide-in-from-top duration-500">
                            <div className="bg-red-500/10 backdrop-blur-md border border-red-500/20 rounded-xl p-4 flex items-start gap-4 shadow-2xl shadow-red-500/20 relative group/error">
                                <button 
                                    onClick={() => {
                                        setDismissedErrors(prev => ({ ...prev, [activeFile]: runtimeErrors[activeFile] }));
                                    }}
                                    className="absolute top-3 right-3 p-1 hover:bg-red-500/20 rounded-lg text-red-400 transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                                <div className="p-2 bg-red-500/20 rounded-lg">
                                    <AlertTriangle className="w-5 h-5 text-red-500" />
                                </div>
                                <div className="flex-1 pr-6">
                                    <h4 className="text-red-200 text-xs font-bold uppercase tracking-wider mb-1">Error de Ejecución</h4>
                                    <p className="text-red-100/80 text-sm leading-relaxed font-mono">
                                        {runtimeErrors[activeFile]}
                                    </p>
                                    <div className="mt-3 flex gap-3">
                                        <button
                                            onClick={() => window.parent.postMessage({ type: 'ask-ai-fix', error: runtimeErrors[activeFile], file: activeFile }, '*')}
                                            className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-200 text-[11px] font-bold rounded-lg transition-all border border-red-500/20"
                                        >
                                            Solicitar Corrección a SI
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {!activeFile ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-[#555] bg-[#0d0d0d]">
                            <FileCode className="w-16 h-16 mb-4 opacity-20" />
                            <p className="text-sm font-medium">Selecciona un archivo para editar</p>
                        </div>
                    ) : (
                        <div className="flex flex-1 overflow-hidden">
                            <div className="flex-1 relative overflow-hidden flex">
                                <Editor
                            loading={<div className="h-full w-full bg-[#050505] flex items-center justify-center text-neutral-700 text-xs uppercase tracking-widest animate-pulse font-mono">Initializing Obsidian Pro...</div>}
                                    height="100%"
                                    path={activeFile}
                                    language={activeFile.endsWith('.tsx') || activeFile.endsWith('.ts') ? 'typescript' : activeFile.endsWith('.css') ? 'css' : 'javascript'}
                                    theme="obsidian-pro"
                                    options={{
                                        fontSize: window.innerWidth < 640 ? 12 : 14,
                                        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                                        minimap: { enabled: window.innerWidth >= 640, side: 'right' },
                                        scrollBeyondLastLine: false,
                                        smoothScrolling: true,
                                        cursorBlinking: "expand",
                                        cursorSmoothCaretAnimation: "on",
                                        lineNumbers: "on",
                                        renderLineHighlight: "all",
                                        scrollbar: {
                                            vertical: 'visible',
                                            horizontal: 'visible',
                                            verticalScrollbarSize: 10,
                                            horizontalScrollbarSize: 10,
                                        },
                                        padding: { top: 16, bottom: 16 },
                                        fixedOverflowWidgets: true,
                                        automaticLayout: true,
                                    }}
                                    value={codeContent}
                                    beforeMount={(monaco: Monaco) => {
                                        const ts = (monaco as any).languages?.typescript;
                                        ts?.typescriptDefaults?.setCompilerOptions({
                                            target: 99 /* ESNext */,
                                            allowNonTsExtensions: true,
                                            moduleResolution: 2 /* NodeJs */,
                                            module: 1 /* CommonJS */,
                                            noEmit: true,
                                            typeRoots: ["node_modules/@types"],
                                            jsx: 2 /* React */,
                                            allowJs: true,
                                        });
                                        ts?.typescriptDefaults?.setDiagnosticsOptions({
                                            noSemanticValidation: true,
                                            noSyntaxValidation: false,
                                        });
                                    }}
                                    onMount={(editor, monaco) => {
                                        editorRef.current = editor;

                                        // Sync editor markers (errors/warnings) to the file tree
                                        let markerTimeout: any = null;
                                        monaco.editor.onDidChangeMarkers(() => {
                                            if (markerTimeout) clearTimeout(markerTimeout);
                                            markerTimeout = setTimeout(() => {
                                                const model = editor.getModel();
                                                if (!model) return;
                                                const markers = monaco.editor.getModelMarkers({ resource: model.uri });
                                                const highestSeverity = markers.reduce((max, m) => Math.max(max, m.severity), 0);

                                                if (highestSeverity >= monaco.MarkerSeverity.Error) {
                                                    const firstError = markers.find(m => m.severity === monaco.MarkerSeverity.Error);
                                                    if (firstError && activeFile && setRuntimeErrors) {
                                                        setRuntimeErrors(prev => {
                                                            if (prev[activeFile] === firstError.message) return prev;
                                                            return { ...prev, [activeFile]: firstError.message };
                                                        });
                                                    }
                                                } else if (activeFile && setRuntimeErrors) {
                                                    // Immediately clear if no markers
                                                    setRuntimeErrors(prev => {
                                                        if (!prev[activeFile]) return prev;
                                                        const next = { ...prev };
                                                        delete next[activeFile];
                                                        return next;
                                                    });
                                                }
                                            }, 500); // Faster 500ms debounce
                                        });
                                    }}
                                    onChange={(val) => {
                                        if (val !== codeContent) {
                                            updateFiles(prev => ({ ...prev, [activeFile]: val || "" }));
                                        }
                                    }}
                                />
                            </div>
                        </div>
                    )}

                    {/* Footer Info */}
                    <div className={`h-6 flex items-center px-4 justify-between text-[11px] font-medium transition-colors border-t border-white/5 ${(runtimeErrors[activeFile] || runtimeErrors['__runtime__']) ? 'bg-red-950/50 text-red-200' : 'bg-[#0a0a0a] text-neutral-400'}`}>
                        <div className="flex items-center gap-4">
                            {(runtimeErrors[activeFile] || runtimeErrors['__runtime__']) ? (
                                <span className="font-bold flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                                    Error: {runtimeErrors[activeFile] || runtimeErrors['__runtime__']}
                                </span>
                            ) : (
                                <>
                                    <span>{activeFile.endsWith('.tsx') ? 'TypeScript React' : activeFile.endsWith('.css') ? 'CSS' : 'Text'}</span>
                                    <span>UTF-8</span>
                                </>
                            )}
                        </div>
                        <div className="flex items-center gap-4">
                            <span>Spaces: 4</span>
                            <span>Line: {lines.length}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};


