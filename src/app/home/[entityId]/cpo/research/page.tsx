'use client';
import DepartmentPageShell from '@/components/DepartmentPageShell';
export default function Page() {
    return (
        <DepartmentPageShell
            title="User Research"
            subtitle="CPO Research"
            department="cpo"
            accentColor="emerald"
            description="User interviews, surveys, and behavioral analysis."
            features={['Interview scheduling', 'Survey builder', 'Insight reports']}
        />
    );
}
