'use client';
import DepartmentPageShell from '@/components/DepartmentPageShell';
export default function Page() {
    return (
        <DepartmentPageShell
            title="Neural Pipeline"
            subtitle="CDO Processing"
            department="cdo"
            accentColor="red"
            description="Automated neural network training and deployment."
            features={['Pipeline builder', 'Training logs', 'Model versioning']}
        />
    );
}
