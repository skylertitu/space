/**
 * Bot de bienvenida sembrado en el molde de cada entidad nueva.
 *
 * Se crea con el id `00000003` para alinear con el auto-sync del bot-kanban
 * (KambanBoard usa ese id como bot por defecto). El contador de chatbots se deja
 * en 3 para que el primer bot creado por el usuario sea `00000004`.
 *
 * Datos puros (sin dependencias de Firestore) para poder reutilizarlo tanto en la
 * versión cliente como en la admin del molde.
 */

export const STARTER_CHATBOT_ID = '00000003';
export const STARTER_CHATBOT_COUNTER = 3;

/** Flujo básico: Inicio → bienvenida → captura de nombre → despedida → fin. */
export const STARTER_CHATBOT_FLOW = {
    nodes: [
        {
            id: '1',
            type: 'startNode',
            position: { x: 250, y: 5 },
            data: {
                label: 'Inicio',
                welcomeMessage: '¡Hola! ¿En qué puedo ayudarte?',
                triggerPhrase: 'Hola, quiero más información',
            },
        },
        {
            id: '2',
            type: 'textMessageNode',
            position: { x: 250, y: 130 },
            data: {
                content:
                    '¡Hola! 👋 Gracias por escribirnos. Soy el asistente virtual y con gusto te ayudo.',
            },
        },
        {
            id: '3',
            type: 'captureInputNode',
            position: { x: 250, y: 260 },
            data: {
                content: 'Para empezar, ¿cuál es tu nombre?',
                variableName: 'nombre',
                inputType: 'text',
            },
        },
        {
            id: '4',
            type: 'textMessageNode',
            position: { x: 250, y: 390 },
            data: {
                content:
                    'Un gusto, {{nombre}}. En breve un asesor continuará contigo. 🙌',
            },
        },
        {
            id: '5',
            type: 'endNode',
            position: { x: 250, y: 520 },
            data: { label: 'Fin', outcomeLabel: 'Conversación iniciada' },
        },
    ],
    edges: [
        { id: 'e1-2', source: '1', target: '2' },
        { id: 'e2-3', source: '2', target: '3' },
        { id: 'e3-4', source: '3', target: '4' },
        { id: 'e4-5', source: '4', target: '5' },
    ],
} as const;

/** Campos base del documento del chatbot de arranque (sin timestamps). */
export const STARTER_CHATBOT_FIELDS = {
    id: STARTER_CHATBOT_ID,
    name: 'Bot de Bienvenida',
    isActive: false,
    channel: 'whatsapp',
    botType: 'dm',
    targetPlatforms: ['whatsapp'],
    flow: STARTER_CHATBOT_FLOW,
} as const;
