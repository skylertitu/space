'use client';
import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

export default function CDORedirect() {
    const router = useRouter();
    const params = useParams();
    useEffect(() => {
        router.replace(`/home/${params.entityId}/workspace?role=cdo`);
    }, [router, params.entityId]);
    return null;
}
