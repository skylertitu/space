'use client';
import DepartmentPageShell from '@/components/DepartmentPageShell';
export default function Page() {
    return (
        <DepartmentPageShell
            title="Facilities"
            subtitle="COO Facilities"
            department="coo"
            accentColor="amber"
            description="Physical and virtual workspace management."
            features={['Office management', 'Equipment tracking', 'Maintenance logs']}
        />
    );
}
