'use client';
import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

/** Legacy route → nuevo tablero automático en workspace hub */
export default function CooKambanRedirect() {
    const router = useRouter();
    const params = useParams();
    useEffect(() => {
        router.replace(`/home/${params.entityId}/workspace/hub`);
    }, [router, params.entityId]);
    return null;
}
