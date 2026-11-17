'use client';

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useEntitlements } from '@/hooks/useEntitlements';
import { ALL_SUITES, PLAN_LABELS, minimumPlanForSuite } from '@/lib/subscriptions/plans';

/**
 * Lleva a "mejorar plan" cuando se entra a una suite o al organigrama que el plan de la entidad no incluye.
 * Es solo la parte visual: el bloqueo real lo hace el servidor (requireSuite / requireOrgChart) cuando
 * SUBSCRIPTION_ENFORCEMENT=enforce.
 */
export function SuiteGate({ entitySegment, children }: { entitySegment: string; children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const { activeEntity } = useAuth();
    const { entitlements } = useEntitlements(activeEntity);

    // /home/<entidad>/<suite>/...  o  /home/<entidad>/workspace?role=<suite>  o  /home/<entidad>/organigrama
    const afterEntity = pathname?.startsWith(`/home/${entitySegment}/`) ? pathname.slice(`/home/${entitySegment}/`.length).split('/')[0] : '';
    const wanted = afterEntity === 'workspace' ? searchParams.get('role') || '' : afterEntity;
    const isOrg = wanted === 'organigrama';
    const isSuite = (ALL_SUITES as readonly string[]).includes(wanted);

    const blocked =
        !!entitlements &&
        entitlements.enforced &&
        !entitlements.free &&
        ((isOrg && !entitlements.orgChart) || (isSuite && !(entitlements.suites as string[]).includes(wanted)));

    useEffect(() => {
        if (!blocked || !activeEntity) return;
        const need = isOrg ? 'enterprise' : minimumPlanForSuite(wanted);
        toast.info(`${isOrg ? 'Org Chart' : wanted.toUpperCase()} no está incluido en tu plan`, {
            description: need ? `Requiere el plan ${PLAN_LABELS[need as keyof typeof PLAN_LABELS]} o superior.` : undefined,
        });
        router.replace(`/subscriptions/upgrade?entityId=${encodeURIComponent(activeEntity)}`);
    }, [blocked, activeEntity, isOrg, wanted, router]);

    if (blocked) return null;
    return <>{children}</>;
}
