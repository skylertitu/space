'use client';
import DepartmentPageShell from '@/components/DepartmentPageShell';
export default function Page() {
    return (
        <DepartmentPageShell
            title="Market Expansion"
            subtitle="CSO Expansion"
            department="cso"
            accentColor="purple"
            description="New market entry strategy and geographic expansion."
            features={['Market analysis', 'Entry strategy', 'Localization plan']}
        />
    );
}
