'use client';
import DepartmentPageShell from '@/components/DepartmentPageShell';
export default function Page() {
    return (
        <DepartmentPageShell
            title="Market Share"
            subtitle="CMO Intelligence"
            department="cmo"
            accentColor="indigo"
            description="Market share analysis and competitive positioning."
            features={['Market sizing', 'Share tracking', 'Trend analysis']}
        />
    );
}
