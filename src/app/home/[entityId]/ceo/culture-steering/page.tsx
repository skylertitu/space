'use client';
import DepartmentPageShell from '@/components/DepartmentPageShell';
export default function Page() {
    return (
        <DepartmentPageShell
            title="Culture Steering"
            subtitle="CEO Culture"
            department="ceo"
            accentColor="pink"
            description="Corporate culture development and organizational health."
            features={['Pulse surveys', 'Culture initiatives', 'Team sentiment']}
        />
    );
}
