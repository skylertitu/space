'use client';
import DepartmentPageShell from '@/components/DepartmentPageShell';
export default function Page() {
    return (
        <DepartmentPageShell
            title="MultiSig Treasury"
            subtitle="Board Finance"
            department="board"
            accentColor="emerald"
            description="Multi-signature treasury management and fund allocation."
            features={['MultiSig operations', 'Fund allocation', 'Spending proposals']}
        />
    );
}
