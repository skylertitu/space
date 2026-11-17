/** Client-only helpers for voice recording (uses MediaRecorder). */

export function getPreferredVoiceRecorderMime(): string | undefined {
    const candidates = [
        'audio/ogg;codecs=opus',
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
    ];
    if (typeof MediaRecorder === 'undefined') return undefined;
    return candidates.find((m) => MediaRecorder.isTypeSupported(m));
}
