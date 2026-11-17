'use client';
import DepartmentPageShell from '@/components/DepartmentPageShell';
export default function Page() {
    return (
        <DepartmentPageShell
            title="Dispute Resolution"
            subtitle="CLO Disputes"
            department="clo"
            accentColor="amber"
            description="Legal dispute management and resolution tracking."
            features={['Case tracking', 'Settlement log', 'Legal counsel']}
        />
    );
}
