import { Timestamp } from 'firebase/firestore';

export interface HumanTakeoverState {
    active: boolean;
    activatedAt?: Timestamp | Date | null;
    activatedBy?: string | null;
    activatedByName?: string | null;
    releasedAt?: Timestamp | Date | null;
    releasedBy?: string | null;
}

export function isHumanTakeoverActive(card: { humanTakeover?: HumanTakeoverState | null; isHandledByHuman?: boolean } | null | undefined): boolean {
    return card?.humanTakeover?.active === true || card?.isHandledByHuman === true;
}

type Assignable = { assignedTo?: string | null; assignedToUid?: string | null };

/** El chat es de quien está conectado. «Mío» sin uid sigue contando para cuentas de una sola persona. */
export function isAssignedToMe(card: Assignable | null | undefined, uid?: string | null): boolean {
    if (!card) return false;
    if (uid && card.assignedToUid) return card.assignedToUid === uid;
    return !card.assignedToUid && card.assignedTo === 'Mío';
}

export function isUnassignedChat(card: Assignable | null | undefined): boolean {
    if (!card?.assignedToUid && (!card?.assignedTo || card.assignedTo === 'Unassigned')) return true;
    return false;
}

export function takeoverFields(uid: string, name: string, at: unknown) {
    return {
        humanTakeover: {
            active: true,
            activatedAt: at,
            activatedBy: uid,
            activatedByName: name || 'Agente',
        },
        assignedTo: 'Mío',
        assignedToUid: uid,
        isHandledByHuman: true,
        botActive: false,
    };
}

export function releaseFields(uid: string, at: unknown) {
    return {
        'humanTakeover.active': false,
        'humanTakeover.releasedAt': at,
        'humanTakeover.releasedBy': uid,
        assignedTo: null,
        assignedToUid: null,
        isHandledByHuman: false,
        botActive: true,
    };
}
