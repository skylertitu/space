'use client';
import DepartmentPageShell from '@/components/DepartmentPageShell';
export default function Page() {
    return (
        <DepartmentPageShell
            title="Audit Readiness"
            subtitle="CFO Audit"
            department="cfo"
            accentColor="amber"
            description="Audit preparation and compliance documentation."
            features={['Audit checklists', 'Document staging', 'Compliance gaps']}
        />
    );
}
