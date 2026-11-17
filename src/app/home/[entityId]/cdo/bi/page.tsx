'use client';
import DepartmentPageShell from '@/components/DepartmentPageShell';
export default function Page() {
    return (
        <DepartmentPageShell
            title="Business Intelligence"
            subtitle="CDO BI"
            department="cdo"
            accentColor="teal"
            description="Business intelligence reporting and decision support."
            features={['Report builder', 'KPI dashboards', 'Scheduled reports']}
        />
    );
}
