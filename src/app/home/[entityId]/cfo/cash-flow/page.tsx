'use client';
import DepartmentPageShell from '@/components/DepartmentPageShell';
export default function Page() {
    return (
        <DepartmentPageShell
            title="Cash Flow"
            subtitle="CFO Liquidity"
            department="cfo"
            accentColor="teal"
            description="Cash flow monitoring and liquidity management."
            features={['Cash projections', 'Burn rate', 'Runway calculator']}
        />
    );
}
