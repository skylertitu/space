'use client';
import DepartmentPageShell from '@/components/DepartmentPageShell';
export default function Page() {
    return (
        <DepartmentPageShell
            title="Global KPIs"
            subtitle="CEO Analytics"
            department="ceo"
            accentColor="indigo"
            description="Real-time executive performance metrics across all departments."
            features={['Revenue tracking', 'Growth metrics', 'Department scorecards']}
        />
    );
}
