'use client';
import DepartmentPageShell from '@/components/DepartmentPageShell';
export default function Page() {
    return (
        <DepartmentPageShell
            title="Board Liaison"
            subtitle="CEO Governance"
            department="ceo"
            accentColor="slate"
            description="Interface between executive management and the board of directors."
            features={['Meeting prep', 'Resolution tracking', 'Board minutes']}
        />
    );
}
