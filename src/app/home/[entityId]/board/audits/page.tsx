'use client';
import DepartmentPageShell from '@/components/DepartmentPageShell';
export default function Page() {
    return (
        <DepartmentPageShell
            title="Audits & Risk"
            subtitle="Board Oversight"
            department="board"
            accentColor="amber"
            description="Independent auditing and risk assessment framework."
            features={['Risk scoring', 'Compliance tracking', 'Audit scheduling']}
        />
    );
}
