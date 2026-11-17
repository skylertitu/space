'use client';
import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

export default function CMORedirect() {
    const router = useRouter();
    const params = useParams();
    useEffect(() => {
        router.replace(`/home/${params.entityId}/workspace?role=cmo`);
    }, [router, params.entityId]);
    return null;
}
