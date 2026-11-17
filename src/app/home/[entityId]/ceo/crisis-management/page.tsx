'use client';
import DepartmentPageShell from '@/components/DepartmentPageShell';
export default function Page() {
    return (
        <DepartmentPageShell
            title="Crisis Response"
            subtitle="CEO Emergency"
            department="ceo"
            accentColor="red"
            description="Rapid response protocols and crisis management framework."
            features={['Incident playbooks', 'Escalation matrix', 'Recovery tracking']}
        />
    );
}
