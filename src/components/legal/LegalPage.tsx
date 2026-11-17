import React from 'react';
import Link from 'next/link';

export type LegalSection = { heading: string; body: (string | string[])[] };

/** Página legal pública (sin sesión, renderizada en servidor). */
export default function LegalPage({
    title,
    updated,
    intro,
    sections,
}: {
    title: string;
    updated: string;
    intro: string;
    sections: LegalSection[];
}) {
    return (
        <main className="min-h-screen bg-black text-white/80 px-6 pt-20 pb-24 font-[var(--font-outfit)]">
            <article className="max-w-3xl mx-auto">
                <Link href="/" className="text-sm text-white/40 hover:text-white transition-colors">← Roosevelt</Link>
                <h1 className="mt-8 text-white text-4xl md:text-5xl font-medium tracking-tight">{title}</h1>
                <p className="mt-3 text-sm text-white/40">Last updated: {updated}</p>
                <p className="mt-8 leading-relaxed">{intro}</p>

                {sections.map((s, i) => (
                    <section key={s.heading} className="mt-10">
                        <h2 className="text-white text-xl font-medium mb-3">
                            {i + 1}. {s.heading}
                        </h2>
                        <div className="space-y-3 leading-relaxed">
                            {s.body.map((block, j) =>
                                Array.isArray(block) ? (
                                    <ul key={j} className="list-disc pl-6 space-y-1.5">
                                        {block.map((item) => (
                                            <li key={item}>{item}</li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p key={j}>{block}</p>
                                )
                            )}
                        </div>
                    </section>
                ))}

                <nav className="mt-16 pt-8 border-t border-white/10 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/40">
                    <Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
                    <Link href="/terms" className="hover:text-white transition-colors">Terms of Service</Link>
                    <Link href="/data-deletion" className="hover:text-white transition-colors">Data Deletion</Link>
                </nav>
            </article>
        </main>
    );
}
