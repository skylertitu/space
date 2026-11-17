'use client';
import DepartmentPageShell from '@/components/DepartmentPageShell';
export default function Page() {
    return (
        <DepartmentPageShell
            title="Growth Initiatives"
            subtitle="CSO Growth"
            department="cso"
            accentColor="yellow"
            description="Strategic growth planning and initiative execution."
            features={['Growth experiments', 'Impact metrics', 'Resource allocation']}
        />
    );
}
