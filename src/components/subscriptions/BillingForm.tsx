import { useState } from 'react';
import { Mail, User, ChevronDown } from 'lucide-react';

export interface BillingData {
  email: string;
  phonePrefix: string;
  phone: string;
  fullName: string;
  country: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  zipCode: string;
}

interface BillingFormProps {
  initialEmail?: string;
  onDataChange: (data: BillingData) => void;
  isValid: boolean;
  onValidChange: (valid: boolean) => void;
}

const COUNTRIES = [
  'Estados Unidos', 'Argentina', 'Bolivia', 'Brasil', 'Chile', 'Colombia', 'Costa Rica',
  'Cuba', 'República Dominicana', 'Ecuador', 'El Salvador', 'Guatemala',
  'Honduras', 'México', 'Nicaragua', 'Panamá', 'Paraguay', 'Perú',
  'Puerto Rico', 'Uruguay', 'Venezuela', 'España', 'Otros'
];

const COUNTRY_ISO_MAP: Record<string, string> = {
  'Estados Unidos': 'us',
  'Argentina': 'ar',
  'Bolivia': 'bo',
  'Brasil': 'br',
  'Chile': 'cl',
  'Colombia': 'co',
  'Costa Rica': 'cr',
  'Cuba': 'cu',
  'República Dominicana': 'do',
  'Ecuador': 'ec',
  'El Salvador': 'sv',
  'Guatemala': 'gt',
  'Honduras': 'hn',
  'México': 'mx',
  'Nicaragua': 'ni',
  'Panamá': 'pa',
  'Paraguay': 'py',
  'Perú': 'pe',
  'Puerto Rico': 'pr',
  'Uruguay': 'uy',
  'Venezuela': 've',
  'España': 'es',
  'Otros': 'globe'
};

const PHONE_PREFIXES = [
  '+1', '+34', '+52', '+54', '+57', '+51', '+56', '+58', '+593', '+507'
];

const PHONE_ISO_MAP: Record<string, string> = {
  '+1': 'us',
  '+34': 'es',
  '+52': 'mx',
  '+54': 'ar',
  '+57': 'co',
  '+51': 'pe',
  '+56': 'cl',
  '+58': 've',
  '+593': 'ec',
  '+507': 'pa'
};

export default function BillingForm({
  initialEmail = '',
  onDataChange,
  onValidChange,
}: BillingFormProps) {
  const [data, setData] = useState<BillingData>({
    email: initialEmail,
    phonePrefix: '+1',
    phone: '',
    fullName: '',
    country: 'Estados Unidos',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    zipCode: '',
  });

  const [isPhoneOpen, setIsPhoneOpen] = useState(false);
  const [isCountryOpen, setIsCountryOpen] = useState(false);

  // Only email, fullName, and phone are required for validation
  const requiredFields: (keyof BillingData)[] = ['email', 'fullName', 'phone'];

  const handleChange = (field: keyof BillingData, value: string) => {
    const newData = { ...data, [field]: value };
    setData(newData);

    const isValid = requiredFields.every(f => {
      const val = f === field ? value : data[f];
      return val.trim() !== '';
    });
    
    const isEmailValid = newData.email.includes('@');

    onValidChange(isValid && isEmailValid);
    onDataChange(newData);
  };

  const currentPhoneIso = PHONE_ISO_MAP[data.phonePrefix] || 'us';
  const currentCountryIso = COUNTRY_ISO_MAP[data.country] || 'us';

  return (
    <div className="space-y-5">
      
      {/* Background click interceptors for closing select dropdowns */}
      {isPhoneOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setIsPhoneOpen(false)} />
      )}
      {isCountryOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setIsCountryOpen(false)} />
      )}

      {/* Datos de contacto */}
      <div className={`relative ${isPhoneOpen ? 'z-50' : 'z-30'}`}>
        <LabelHeader text="Datos de contacto" />
        <div className="flex flex-col border border-white/10 rounded-xl bg-white/[0.02]">
          
          {/* Email Input */}
          <div className="relative flex items-center border-b border-white/5 h-10 px-3 rounded-t-xl">
            <Mail className="w-3.5 h-3.5 text-white/35 mr-2.5 shrink-0" />
            <input
              type="email"
              placeholder="correoelectrónico@ejemplo.com"
              value={data.email}
              onChange={(e) => handleChange('email', e.target.value)}
              className="w-full bg-transparent text-xs font-normal text-white placeholder:text-white/30 focus:outline-none"
            />
          </div>

          {/* Full Name Input */}
          <div className="relative flex items-center border-b border-white/5 h-10 px-3">
            <User className="w-3.5 h-3.5 text-white/35 mr-2.5 shrink-0" />
            <input
              type="text"
              placeholder="Nombre completo"
              value={data.fullName}
              onChange={(e) => handleChange('fullName', e.target.value)}
              className="w-full bg-transparent text-xs font-normal text-white placeholder:text-white/30 focus:outline-none"
            />
          </div>

          {/* Phone Prefix & Input */}
          <div className="relative flex items-center h-10 px-3 rounded-b-xl">
            <div className="flex items-center border-r border-white/5 pr-2.5 mr-2.5 shrink-0 relative z-50">
              <button
                type="button"
                onClick={() => setIsPhoneOpen(!isPhoneOpen)}
                className="flex items-center gap-1.5 focus:outline-none"
              >
                <img 
                  src={`https://flagcdn.com/w40/${currentPhoneIso}.png`}
                  alt={currentPhoneIso}
                  className="w-4 h-3 object-cover rounded-sm shrink-0 border border-white/10" 
                />
                <span className="text-xs font-normal text-white/80">{data.phonePrefix}</span>
                <ChevronDown className="w-3 h-3 text-white/30 pointer-events-none" />
              </button>

              {/* Custom phone prefix select list */}
              {isPhoneOpen && (
                <div className="absolute left-0 top-full mt-2 w-32 bg-[#121214] border border-white/10 rounded-xl shadow-2xl overflow-y-auto max-h-52 z-[99] py-1 no-scrollbar animate-in fade-in slide-in-from-top-1 duration-200">
                  {PHONE_PREFIXES.map((prefix) => {
                    const iso = PHONE_ISO_MAP[prefix] || 'us';
                    return (
                      <button
                        key={prefix}
                        type="button"
                        onClick={() => {
                          handleChange('phonePrefix', prefix);
                          setIsPhoneOpen(false);
                        }}
                        className="w-full px-3 py-2 text-left text-xs font-normal text-white hover:bg-white/5 flex items-center gap-2 border-b border-white/[0.02] last:border-0 transition-colors"
                      >
                        <img 
                          src={`https://flagcdn.com/w40/${iso}.png`}
                          alt={iso}
                          className="w-4 h-3 object-cover rounded-sm border border-white/15" 
                        />
                        <span>{prefix}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <input
              type="tel"
              placeholder="Número de teléfono"
              value={data.phone}
              onChange={(e) => handleChange('phone', e.target.value)}
              className="w-full bg-transparent text-xs font-normal text-white placeholder:text-white/30 focus:outline-none"
            />
          </div>

        </div>
      </div>

      {/* Dirección de facturación */}
      <div className={`relative ${isCountryOpen ? 'z-50' : 'z-20'}`}>
        <LabelHeader text="Dirección de facturación" />
        <div className="flex flex-col border border-white/10 rounded-xl bg-white/[0.02]">
          
          {/* Country Selection */}
          <div className="relative flex items-center border-b border-white/5 h-10 px-3 z-50 rounded-t-xl">
            <button
              type="button"
              onClick={() => setIsCountryOpen(!isCountryOpen)}
              className="w-full flex items-center justify-between text-left focus:outline-none"
            >
              <div className="flex items-center gap-2">
                {currentCountryIso === 'globe' ? (
                  <span className="text-xs shrink-0">🌐</span>
                ) : (
                  <img 
                    src={`https://flagcdn.com/w40/${currentCountryIso}.png`}
                    alt={currentCountryIso}
                    className="w-4 h-3 object-cover rounded-sm shrink-0 border border-white/10" 
                  />
                )}
                <span className="text-xs font-normal text-white">{data.country}</span>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-white/35 shrink-0" />
            </button>

            {/* Custom country select list */}
            {isCountryOpen && (
              <div className="absolute left-0 right-0 top-full mt-2 bg-[#121214] border border-white/10 rounded-xl shadow-2xl overflow-y-auto max-h-60 z-[99] py-1 no-scrollbar animate-in fade-in slide-in-from-top-1 duration-200">
                {COUNTRIES.map((country) => {
                  const iso = COUNTRY_ISO_MAP[country] || 'us';
                  return (
                    <button
                      key={country}
                      type="button"
                      onClick={() => {
                        handleChange('country', country);
                        setIsCountryOpen(false);
                      }}
                      className="w-full px-3 py-2 text-left text-xs font-normal text-white hover:bg-white/5 flex items-center gap-2.5 border-b border-white/[0.02] last:border-0 transition-colors"
                    >
                      {iso === 'globe' ? (
                        <span className="text-xs shrink-0">🌐</span>
                      ) : (
                        <img 
                          src={`https://flagcdn.com/w40/${iso}.png`}
                          alt={iso}
                          className="w-4 h-3 object-cover rounded-sm border border-white/15" 
                        />
                      )}
                      <span>{country}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Address Line (Input styled like dropdown) */}
          <div className="relative flex items-center h-10 px-3 rounded-b-xl">
            <input
              type="text"
              placeholder="Ingresar dirección"
              value={data.addressLine1}
              onChange={(e) => handleChange('addressLine1', e.target.value)}
              className="w-full bg-transparent text-xs font-normal text-white placeholder:text-white/30 focus:outline-none pr-7"
            />
            <ChevronDown className="w-3.5 h-3.5 text-white/35 absolute right-3 top-3 pointer-events-none" />
          </div>

        </div>
      </div>

    </div>
  );
}

function LabelHeader({ text }: { text: string }) {
  return (
    <p className="text-[11px] font-normal text-white/50 mb-1.5 tracking-wide">
      {text}
    </p>
  );
}
