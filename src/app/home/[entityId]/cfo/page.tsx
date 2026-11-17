'use client';
import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

export default function CFORedirect() {
    const router = useRouter();
    const params = useParams();
    useEffect(() => {
        router.replace(`/home/${params.entityId}/workspace?role=cfo`);
    }, [router, params.entityId]);
    return null;
}
