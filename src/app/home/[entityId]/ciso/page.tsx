'use client';
import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

export default function CISORedirect() {
    const router = useRouter();
    const params = useParams();
    useEffect(() => {
        router.replace(`/home/${params.entityId}/workspace?role=ciso`);
    }, [router, params.entityId]);
    return null;
}
