'use client';
import DepartmentPageShell from '@/components/DepartmentPageShell';
export default function Page() {
    return (
        <DepartmentPageShell
            title="Content Studio"
            subtitle="CMO Content"
            department="cmo"
            accentColor="purple"
            description="Content creation, scheduling, and performance tracking."
            features={['Content calendar', 'Asset library', 'Performance metrics']}
        />
    );
}
