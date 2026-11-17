'use client';
import { motion } from 'framer-motion';

export function CTASection() {
    return (
        <section className="py-32 md:py-48 px-4 md:px-8 relative overflow-hidden bg-black border-t border-white/5">
            <motion.div 
                initial={{ opacity: 0, scale: 0.85, y: 40 }}
                whileInView={{ opacity: 1, scale: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.8, type: "spring", bounce: 0.4 }}
                className="w-full max-w-[1800px] mx-auto text-center relative z-10"
            >
                <h2 className="text-4xl lg:text-6xl font-light font-sans text-white mb-12 md:mb-16 tracking-tight relative z-20">
                    Join the Luxor Movement!
                </h2>
                <p className="text-zinc-300 text-xl font-light leading-relaxed mb-16 md:mb-24 max-w-3xl mx-auto relative z-20">
                    Are you someone who stays to watch the future happen, or someone who writes it? Luxor is the bridge. We are the catalyst for Latin talent and American innovation capital to converge. We invite you to be part of this new era.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
                    <button 
                        suppressHydrationWarning
                        onClick={() => window.open("https://phantom.app/tokens/solana/7Qm6qUCXGZfGBYYFzq2kTbwTDah5r3d9DcPJHRT8Wdth", "_blank")}
                        className="px-8 py-4 bg-white text-black font-medium rounded-full hover:bg-zinc-200 transition-colors w-full sm:w-auto text-center cursor-pointer"
                    >
                        Join Today
                    </button>
                    <a 
                        href="https://phantom.app/tokens/solana/7Qm6qUCXGZfGBYYFzq2kTbwTDah5r3d9DcPJHRT8Wdth"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-8 py-4 bg-transparent border border-white/30 text-white font-medium rounded-full hover:bg-white/5 transition-colors w-full sm:w-auto inline-block text-center cursor-pointer"
                    >
                        View Opportunity
                    </a>
                </div>

                <div className="mt-32 md:mt-48 flex justify-center">
                    <div className="w-64 h-64 md:w-80 md:h-80 relative rounded-3xl overflow-hidden shadow-[0_0_60px_rgba(59,130,246,0.15)] group bg-black">
                        <img
                            src="/assets/rai-logo-circular.png"
                            alt="elizmey Logo"
                            className="w-full h-full object-contain rounded-full group-hover:scale-105 transition-transform duration-500 bg-black"
                        />
                    </div>

                </div>
            </motion.div>
        </section>
    );
}

