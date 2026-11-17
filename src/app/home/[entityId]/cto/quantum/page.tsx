'use client';
import DepartmentPageShell from '@/components/DepartmentPageShell';
export default function Page() {
    return (
        <DepartmentPageShell
            title="Quantum Research"
            subtitle="CTO Research"
            department="cto"
            accentColor="indigo"
            description="Experimental quantum computing research and prototyping."
            features={['Qubit simulation', 'Algorithm testing', 'Research papers']}
        />
    );
}
