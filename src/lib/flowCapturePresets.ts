/** Presets for captureInputNode — variable name + validation bundled together. */

export interface CaptureVariablePreset {
    id: string;
    label: string;
    description: string;
    variableName: string;
    inputType: string;
    validationRegex?: string;
    errorMessage?: string;
}

export const CAPTURE_VARIABLE_PRESETS: CaptureVariablePreset[] = [
    {
        id: 'nombre',
        label: 'Nombre completo',
        description: 'Nombre del contacto (ej. Juan Pérez)',
        variableName: 'nombre',
        inputType: 'text',
        errorMessage: 'Por favor escribe tu nombre.',
    },
    {
        id: 'first_name',
        label: 'Primer nombre',
        description: 'Solo el nombre de pila',
        variableName: 'first_name',
        inputType: 'text',
        errorMessage: 'Indica tu primer nombre.',
    },
    {
        id: 'email',
        label: 'Correo electrónico',
        description: 'Email válido del contacto',
        variableName: 'email',
        inputType: 'email',
        validationRegex: '^[\\w-\\.]+@([\\w-]+\\.)+[\\w-]{2,4}$',
        errorMessage: 'Correo inválido. Ejemplo: nombre@correo.com',
    },
    {
        id: 'telefono',
        label: 'Teléfono / WhatsApp',
        description: 'Número con código de país',
        variableName: 'telefono',
        inputType: 'phone',
        validationRegex: '^\\+?[1-9]\\d{7,14}$',
        errorMessage: 'Teléfono inválido. Incluye código de país.',
    },
    {
        id: 'phone',
        label: 'Teléfono (phone)',
        description: 'Alias usado en plantillas {{phone}}',
        variableName: 'phone',
        inputType: 'phone',
        validationRegex: '^\\+?[1-9]\\d{7,14}$',
        errorMessage: 'Teléfono inválido.',
    },
    {
        id: 'empresa',
        label: 'Empresa / negocio',
        description: 'Nombre de la empresa',
        variableName: 'empresa',
        inputType: 'text',
        errorMessage: 'Escribe el nombre de tu empresa.',
    },
    {
        id: 'ciudad',
        label: 'Ciudad',
        description: 'Ciudad o ubicación',
        variableName: 'ciudad',
        inputType: 'text',
        errorMessage: 'Indica tu ciudad.',
    },
    {
        id: 'fecha',
        label: 'Fecha (DD/MM/AAAA)',
        description: 'Fecha en formato día/mes/año',
        variableName: 'fecha',
        inputType: 'date',
        validationRegex: '^\\d{2}/\\d{2}/\\d{4}$',
        errorMessage: 'Formato inválido. Usa DD/MM/AAAA.',
    },
    {
        id: 'documento',
        label: 'Documento / DNI / CPF',
        description: 'Identificación del contacto',
        variableName: 'documento',
        inputType: 'cpf',
        validationRegex: '^\\d{3}\\.\\d{3}\\.\\d{3}-\\d{2}$',
        errorMessage: 'Documento inválido.',
    },
    {
        id: 'mensaje',
        label: 'Mensaje libre',
        description: 'Texto largo o consulta del usuario',
        variableName: 'mensaje',
        inputType: 'text',
        errorMessage: 'Por favor escribe tu mensaje.',
    },
    {
        id: 'imagen',
        label: 'Imagen / foto',
        description: 'Archivo de imagen adjunto',
        variableName: 'imagen_adjunta',
        inputType: 'image',
        errorMessage: 'Envía una imagen, por favor.',
    },
    {
        id: 'documento_archivo',
        label: 'Archivo PDF / documento',
        description: 'Documento adjunto',
        variableName: 'documento_adjunto',
        inputType: 'document',
        errorMessage: 'Envía el documento solicitado.',
    },
];

export function findCapturePresetByVariable(variableName: string): CaptureVariablePreset | undefined {
    const key = variableName?.trim().toLowerCase();
    return CAPTURE_VARIABLE_PRESETS.find((p) => p.variableName === key);
}

export function findCapturePresetById(id: string): CaptureVariablePreset | undefined {
    return CAPTURE_VARIABLE_PRESETS.find((p) => p.id === id);
}
