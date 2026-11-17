'use client';
import DepartmentPageShell from '@/components/DepartmentPageShell';
export default function Page() {
    return (
        <DepartmentPageShell
            title="Recruitment"
            subtitle="CHRO Talent"
            department="chro"
            accentColor="blue"
            description="Talent acquisition pipeline and candidate management."
            features={['Job postings', 'Applicant tracking', 'Interview scheduling']}
        />
    );
}
