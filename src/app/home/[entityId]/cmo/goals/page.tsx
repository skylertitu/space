'use client';
import DepartmentPageShell from '@/components/DepartmentPageShell';

export default function GoalsPage() {
    return (
        <DepartmentPageShell
            title="Strategic Goals"
            subtitle="Performance Tracking"
            department="cmo"
            accentColor="amber"
            description="Define and track marketing KPIs, sales targets, and organizational milestones."
            features={[
                'OKR & KPI management',
                'Visual progress tracking',
                'Team performance alignment',
                'Quarterly forecasting'
            ]}
        />
    );
}
