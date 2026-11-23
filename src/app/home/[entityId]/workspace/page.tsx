'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

export default function WorkspacePage() {
    const router = useRouter();
    const params = useParams();
    const entityId = params?.entityId as string;

    useEffect(() => {
        if (entityId) {
            router.replace(`/home/${entityId}`);
        }
    }, [router, entityId]);

    return (
        <div className="min-h-screen bg-black flex items-center justify-center text-white/40 text-xs tracking-wider">
            Cargando...
        </div>
    );
}
