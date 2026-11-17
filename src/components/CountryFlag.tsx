interface CountryFlagProps {
    iso?: string;
    country?: string;
    size?: 'sm' | 'md';
    className?: string;
}

const SIZES = {
    sm: { w: 18, h: 13, src: 20 },
    md: { w: 22, h: 16, src: 24 },
} as const;

export function CountryFlag({ iso, country, size = 'sm', className = '' }: CountryFlagProps) {
    const dims = SIZES[size];

    if (!iso) {
        return (
            <span
                className={`inline-flex items-center justify-center text-[13px] leading-none flex-shrink-0 ${className}`}
                aria-hidden="true"
            >
                🌍
            </span>
        );
    }

    const code = iso.toLowerCase();

    return (
        <img
            src={`https://flagcdn.com/${dims.src}x${Math.round(dims.src * 0.75)}/${code}.png`}
            srcSet={`https://flagcdn.com/${dims.src * 2}x${Math.round(dims.src * 1.5)}/${code}.png 2x`}
            width={dims.w}
            height={dims.h}
            alt={country ? `Bandera de ${country}` : ''}
            className={`inline-block rounded-[2px] object-cover shadow-sm flex-shrink-0 ${className}`}
            loading="lazy"
            decoding="async"
        />
    );
}
