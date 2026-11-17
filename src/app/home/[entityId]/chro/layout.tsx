'use client';

export default function CHROLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="bg-black min-h-screen font-sans relative">
            <main className="w-full min-h-screen">
                {children}
            </main>
        </div>
    );
}
