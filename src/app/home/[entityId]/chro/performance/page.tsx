'use client';
import DepartmentPageShell from '@/components/DepartmentPageShell';
export default function Page() {
    return (
        <DepartmentPageShell
            title="Performance Reviews"
            subtitle="CHRO Performance"
            department="chro"
            accentColor="indigo"
            description="Employee performance evaluation and goal tracking."
            features={['360 reviews', 'Goal setting', 'Feedback cycles']}
        />
    );
}
