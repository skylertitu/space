'use client';
import DepartmentPageShell from '@/components/DepartmentPageShell';
export default function Page() {
    return (
        <DepartmentPageShell
            title="Executive Dashboard"
            subtitle="CEO Overview"
            department="ceo"
            accentColor="indigo"
            description="High-level overview of all corporate operations."
            features={['Live metrics', 'Alert center', 'Decision log']}
        />
    );
}
