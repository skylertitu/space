'use client';

import { useEffect } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';

/** Ruta legacy — el diagrama vive en /workspace */
export default function WorkspaceSuiteRedirect() {
    const router = useRouter();
    const params = useParams();
    const searchParams = useSearchParams();
    const role = searchParams.get('role') || 'coo';

    useEffect(() => {
        router.replace(`/home/${params.entityId}/workspace?role=${role}`);
    }, [router, params.entityId, role]);

    return null;
}
