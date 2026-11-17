'use client';
import DepartmentPageShell from '@/components/DepartmentPageShell';
export default function Page() {
    return (
        <DepartmentPageShell
            title="Cyber Threat Map"
            subtitle="CISO Threats"
            department="ciso"
            accentColor="red"
            description="Real-time global threat monitoring and attack surface mapping."
            features={['Live threat feed', 'Attack surface', 'Geo-mapping']}
        />
    );
}
