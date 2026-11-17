"use client";

import React, { useCallback, useRef } from "react";
import { cn } from "@/lib/utils";

interface ResizeHandleProps {
    onResize: (deltaX: number) => void;
    className?: string;
}

export default function ResizeHandle({ onResize, className }: ResizeHandleProps) {
    const lastX = useRef(0);

    const onMouseDown = useCallback(
        (e: React.MouseEvent) => {
            e.preventDefault();
            lastX.current = e.clientX;

            const onMove = (ev: MouseEvent) => {
                const delta = ev.clientX - lastX.current;
                lastX.current = ev.clientX;
                if (delta !== 0) onResize(delta);
            };

            const onUp = () => {
                document.removeEventListener("mousemove", onMove);
                document.removeEventListener("mouseup", onUp);
                document.body.style.cursor = "";
                document.body.style.userSelect = "";
            };

            document.body.style.cursor = "col-resize";
            document.body.style.userSelect = "none";
            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup", onUp);
        },
        [onResize]
    );

    return (
        <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Redimensionar panel"
            onMouseDown={onMouseDown}
            className={cn(
                "w-1.5 shrink-0 cursor-col-resize group flex items-center justify-center",
                "hover:bg-violet-500/15 active:bg-violet-500/25 transition-colors",
                className
            )}
        >
            <div className="w-px h-10 rounded-full bg-white/[0.08] group-hover:bg-violet-400/40 transition-colors" />
        </div>
    );
}
