'use client';
import DepartmentPageShell from '@/components/DepartmentPageShell';
import { BarChart3, TrendingUp, Target, PieChart, ArrowUpRight } from 'lucide-react';

export default function AnalyticsPage() {
    return (
        <DepartmentPageShell
            title="Sales Analytics"
            subtitle="Marketing Intelligence"
            department="cmo"
            accentColor="rose"
            description="Deep dive into revenue streams, conversion rates, and customer acquisition costs."
            features={[
                'Real-time conversion tracking',
                'Multi-channel attribution',
                'Customer Lifetime Value (CLV)',
                'ROAS & ROI monitoring'
            ]}
        />
    );
}
