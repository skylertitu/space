'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Mic, Square, Play, Pause, Trash2, UploadCloud } from 'lucide-react';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase';
import { toast } from 'sonner';
import { getPreferredVoiceRecorderMime } from '@/lib/whatsapp/voiceRecorderClient';

interface VoiceRecorderProps {
    onUploadSuccess: (url: string, filename: string, mimeType: string) => void;
    onClear?: () => void;
    initialUrl?: string | null;
}

export function VoiceRecorder({ onUploadSuccess, onClear, initialUrl = null }: VoiceRecorderProps) {
    const [recording, setRecording] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [audioUrl, setAudioUrl] = useState<string | null>(initialUrl);
    const [durationSec, setDurationSec] = useState(0);
    const [playing, setPlaying] = useState(false);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const streamRef = useRef<MediaStream | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const mimeRef = useRef<string>('audio/webm');

    useEffect(() => {
        setAudioUrl(initialUrl);
    }, [initialUrl]);

    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
            streamRef.current?.getTracks().forEach((t) => t.stop());
        };
    }, []);

    const startRecording = async () => {
        try {
            const mime = getPreferredVoiceRecorderMime();
            if (!mime) {
                toast.error('Tu navegador no soporta grabación de audio.');
                return;
            }
            mimeRef.current = mime;

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            chunksRef.current = [];

            const recorder = new MediaRecorder(stream, { mimeType: mime });
            mediaRecorderRef.current = recorder;

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };

            recorder.onstop = async () => {
                stream.getTracks().forEach((t) => t.stop());
                const blob = new Blob(chunksRef.current, { type: mime });
                const ext = mime.includes('ogg') ? 'ogg' : mime.includes('mp4') ? 'm4a' : 'webm';
                const filename = `nota_voz_${Date.now()}.${ext}`;
                const localUrl = URL.createObjectURL(blob);
                setAudioUrl(localUrl);
                await uploadBlob(blob, filename, mime);
            };

            recorder.start(200);
            setRecording(true);
            setDurationSec(0);
            timerRef.current = setInterval(() => setDurationSec((s) => s + 1), 1000);
            toast.message('Grabando nota de voz…');
        } catch (err: any) {
            console.error(err);
            toast.error(err?.message || 'No se pudo acceder al micrófono.');
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current?.state === 'recording') {
            mediaRecorderRef.current.stop();
        }
        setRecording(false);
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
    };

    const uploadBlob = async (blob: Blob, filename: string, mimeType: string) => {
        setUploading(true);
        setProgress(0);
        try {
            const storageRef = ref(storage, `chatbot_media/${Date.now()}_${filename}`);
            const uploadTask = uploadBytesResumable(storageRef, blob, { contentType: mimeType });

            await new Promise<void>((resolve, reject) => {
                uploadTask.on(
                    'state_changed',
                    (snap) => setProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
                    reject,
                    () => resolve()
                );
            });

            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            setAudioUrl(downloadURL);
            onUploadSuccess(downloadURL, filename, mimeType);
            toast.success('Nota de voz guardada.');
        } catch (err: any) {
            console.error(err);
            toast.error('No se pudo subir la nota de voz.');
        } finally {
            setUploading(false);
        }
    };

    const togglePlay = useCallback(() => {
        if (!audioUrl) return;
        if (!audioRef.current) {
            audioRef.current = new Audio(audioUrl);
            audioRef.current.onended = () => setPlaying(false);
        } else if (audioRef.current.src !== audioUrl) {
            audioRef.current.src = audioUrl;
        }
        if (playing) {
            audioRef.current.pause();
            setPlaying(false);
        } else {
            audioRef.current.play();
            setPlaying(true);
        }
    }, [audioUrl, playing]);

    const handleClear = () => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }
        setAudioUrl(null);
        setDurationSec(0);
        setPlaying(false);
        onClear?.();
        onUploadSuccess('', '', '');
    };

    const formatTime = (s: number) => {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m}:${sec.toString().padStart(2, '0')}`;
    };

    return (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/80 p-4 space-y-4">
            <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold">
                    Nota de voz · WhatsApp
                </p>
                {recording && (
                    <span className="flex items-center gap-1.5 text-red-400 text-[10px] font-mono">
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        {formatTime(durationSec)}
                    </span>
                )}
            </div>

            {!audioUrl && !recording && (
                <Button
                    type="button"
                    onClick={startRecording}
                    className="w-full h-12 bg-[#25D366]/10 hover:bg-[#25D366]/20 text-[#25D366] border border-[#25D366]/30"
                    variant="outline"
                >
                    <Mic className="w-4 h-4 mr-2" />
                    Mantén pulsado para grabar
                </Button>
            )}

            {recording && (
                <Button
                    type="button"
                    onClick={stopRecording}
                    className="w-full h-12 bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/40"
                    variant="outline"
                >
                    <Square className="w-4 h-4 mr-2 fill-current" />
                    Detener y guardar
                </Button>
            )}

            {uploading && (
                <div className="space-y-2">
                    <Progress value={progress} className="bg-neutral-800" />
                    <p className="text-[10px] text-neutral-500 flex items-center gap-1">
                        <UploadCloud className="w-3 h-3" /> Subiendo… {progress}%
                    </p>
                </div>
            )}

            {audioUrl && !uploading && (
                <div className="flex items-center gap-2">
                    <Button type="button" size="icon" variant="outline" onClick={togglePlay} className="border-neutral-700 shrink-0">
                        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </Button>
                    <div className="flex-1 min-w-0">
                        <p className="text-xs text-white truncate">Nota de voz lista</p>
                        <p className="text-[9px] text-neutral-500">Se enviará como audio en WhatsApp</p>
                    </div>
                    <Button type="button" size="icon" variant="ghost" onClick={handleClear} className="text-red-400 shrink-0">
                        <Trash2 className="w-4 h-4" />
                    </Button>
                </div>
            )}

            <p className="text-[9px] text-neutral-600 leading-relaxed">
                El audio se guarda en Roosevelt y se registra en Meta al enviar el flujo. Formatos compatibles: OGG, MP3, AAC.
            </p>
        </div>
    );
}
