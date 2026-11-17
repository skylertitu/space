'use client';
import DepartmentPageShell from '@/components/DepartmentPageShell';
export default function Page() {
    return (
        <DepartmentPageShell
            title="Cloud Architecture"
            subtitle="CTO Cloud"
            department="cto"
            accentColor="cyan"
            description="Cloud infrastructure design and resource optimization."
            features={['Resource usage', 'Cost optimization', 'Auto-scaling']}
        />
    );
}
