import { Timestamp } from 'firebase/firestore';

export interface HumanTakeoverState {
    active: boolean;
    activatedAt?: Timestamp | Date | null;
    activatedBy?: string | null;
    activatedByName?: string | null;
    releasedAt?: Timestamp | Date | null;
    releasedBy?: string | null;
}

export function isHumanTakeoverActive(card: { humanTakeover?: HumanTakeoverState | null } | null | undefined): boolean {
    return card?.humanTakeover?.active === true;
}
