'use client';
import DepartmentPageShell from '@/components/DepartmentPageShell';
export default function Page() {
    return (
        <DepartmentPageShell
            title="Vision & Strategy"
            subtitle="CEO Strategy"
            department="ceo"
            accentColor="blue"
            description="Long-term vision planning and strategic objective alignment."
            features={['OKR management', 'Milestone tracking', 'Strategic pivots']}
        />
    );
}
