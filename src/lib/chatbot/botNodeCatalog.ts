/**
 * Catálogo de nodos y reglas del motor de chatbots.
 * Usado para exportar JSON de referencia al enriquecer flujos con SI externa.
 */

export type NodeRuntimeStatus = 'runtime' | 'editor_only' | 'disabled';

export type BotNodeFieldSpec = {
  name: string;
  type: string;
  required?: boolean;
  description: string;
  example?: unknown;
};

export type BotNodeSpec = {
  type: string;
  label: string;
  category: string;
  runtimeStatus: NodeRuntimeStatus;
  description: string;
  waitsForInput?: boolean;
  dataFields: BotNodeFieldSpec[];
  routing: {
    outputs: string;
    sourceHandleRules?: string;
  };
  example: Record<string, unknown>;
};

export type BotNodeCategory = {
  title: string;
  nodes: BotNodeSpec[];
};

export const BOT_FLOW_RULES = {
  language: 'es',
  graphFormat: 'react-flow',
  requiredNodes: ['startNode'],
  recommendedEndNode: 'endNode',
  variableSyntax: 'Usa {{nombre_variable}} en textos para interpolar customFields.',
  nodeStructure: {
    id: 'string único corto, ej. "1", "n2", "n_menu"',
    type: 'uno de nodeCatalog[].type',
    position: '{ x: number, y: number } — opcional al importar',
    data: 'campos según el tipo de nodo',
  },
  edgeStructure: {
    id: 'string único, ej. "e1-2"',
    source: 'id del nodo origen',
    target: 'id del nodo destino',
    type: 'siempre "custom"',
    sourceHandle:
      'opcional. Obligatorio en quickReplyNode (id del botón), conditionNode (id de ruta) y listMessageNode (id de fila)',
  },
  edgeRules: [
    'El flujo debe ser conexo desde startNode.',
    'Nodos de un solo camino (textMessage, media, delay, etc.): edge sin sourceHandle.',
    'quickReplyNode: máximo 3 botones; un edge por botón con sourceHandle = button.id.',
    'listMessageNode: un edge por fila/opción con sourceHandle = row.id.',
    'conditionNode: un edge por ruta con sourceHandle = route.id; edge "default" para else.',
    'captureInputNode: edge "success" al validar; edge "fail" o sin handle para reintentos/errores.',
    'Al reconectar en el editor, cada sourceHandle solo puede tener un destino.',
  ],
  limits: {
    whatsappQuickReplyButtonsMax: 3,
    whatsappButtonTitleMaxChars: 20,
    whatsappReplyIdMaxChars: 256,
    maxNodesPerEngineCycle: 15,
  },
  userCommands: {
    reiniciar: 'Reinicia el flujo desde el inicio',
    reset: 'Reinicia el flujo desde el inicio',
    menu: 'Reinicia o muestra menú',
    ayuda: 'Reinicia o muestra menú',
    stop: 'Detiene el bot',
    greetings: 'Saludos (hola, buenos días, etc.) reinician si el bot está idle o en timeout',
  },
  inactivity: {
    waitNodeTimeoutDays: 15,
    behavior: 'Auto-reset del flujo tras 15 días en nodo de espera',
  },
  importHints: [
    'Incluye siempre un startNode con id "1" en flujos nuevos.',
    'Usa tipos exactos del catálogo; no inventes tipos nuevos.',
    'Prefiere nodos con runtimeStatus "runtime".',
    'Evita nodos "disabled" o "editor_only" salvo que el usuario lo pida.',
    'Los mensajes deben estar en español natural.',
  ],
} as const;

export const BOT_NODE_CATEGORIES: BotNodeCategory[] = [
  {
    title: 'Control de flujo',
    nodes: [
      {
        type: 'startNode',
        label: 'Inicio',
        category: 'Control de flujo',
        runtimeStatus: 'runtime',
        description: 'Punto de entrada del flujo. Se salta automáticamente al siguiente nodo.',
        dataFields: [{ name: 'label', type: 'string', description: 'Etiqueta visual', example: 'Inicio' }],
        routing: { outputs: 'Una salida (siguiente nodo)' },
        example: { id: '1', type: 'startNode', data: { label: 'Inicio' } },
      },
      {
        type: 'endNode',
        label: 'Fin de Flujo',
        category: 'Control de flujo',
        runtimeStatus: 'runtime',
        description: 'Marca la conversación como completada.',
        dataFields: [
          { name: 'label', type: 'string', description: 'Etiqueta visual', example: 'Fin' },
          { name: 'outcomeLabel', type: 'string', description: 'Resultado para Kanban', example: 'Conversación iniciada' },
        ],
        routing: { outputs: 'Sin salidas' },
        example: { id: 'n_end', type: 'endNode', data: { label: 'Fin', outcomeLabel: 'Conversación iniciada' } },
      },
    ],
  },
  {
    title: 'Mensajería y UI',
    nodes: [
      {
        type: 'textMessageNode',
        label: 'Mensaje de Texto',
        category: 'Mensajería y UI',
        runtimeStatus: 'runtime',
        description: 'Envía un mensaje de texto al usuario.',
        dataFields: [
          { name: 'content', type: 'string', required: true, description: 'Texto del mensaje. Soporta {{variables}}.' },
          { name: 'typingSimulation', type: 'boolean', description: 'Simular escritura humana', example: true },
        ],
        routing: { outputs: 'Una salida al siguiente nodo' },
        example: { id: 'n2', type: 'textMessageNode', data: { content: '¡Hola! ¿En qué te ayudo?' } },
      },
      {
        type: 'mediaMessageNode',
        label: 'Mensaje Multimedia',
        category: 'Mensajería y UI',
        runtimeStatus: 'runtime',
        description: 'Envía imagen, video, audio o documento por URL.',
        dataFields: [
          { name: 'url', type: 'string', required: true, description: 'URL pública https del archivo' },
          { name: 'caption', type: 'string', description: 'Texto adjunto' },
          { name: 'mediaType', type: 'string', description: 'image | video | audio | document' },
          { name: 'filename', type: 'string', description: 'Nombre del archivo' },
        ],
        routing: { outputs: 'Una salida al siguiente nodo' },
        example: {
          id: 'n_media',
          type: 'mediaMessageNode',
          data: { url: 'https://example.com/foto.jpg', caption: 'Mira esto', mediaType: 'image' },
        },
      },
      {
        type: 'quickReplyNode',
        label: 'Respuesta Rápida',
        category: 'Mensajería y UI',
        runtimeStatus: 'runtime',
        waitsForInput: true,
        description: 'Muestra hasta 3 botones. Espera que el usuario elija una opción.',
        dataFields: [
          { name: 'bodyText', type: 'string', required: true, description: 'Texto principal del mensaje' },
          {
            name: 'buttons',
            type: 'array',
            required: true,
            description: 'Máx. 3 botones: { id, title, payload }',
            example: [{ id: 'btn_ventas', title: 'Ventas', payload: 'VENTAS' }],
          },
        ],
        routing: {
          outputs: 'Una salida por botón',
          sourceHandleRules: 'sourceHandle debe ser igual a button.id de cada botón',
        },
        example: {
          id: 'n_qr',
          type: 'quickReplyNode',
          data: {
            bodyText: '¿Qué necesitas?',
            buttons: [
              { id: 'btn_ventas', title: 'Ventas', payload: 'VENTAS' },
              { id: 'btn_soporte', title: 'Soporte', payload: 'SOPORTE' },
            ],
          },
        },
      },
      {
        type: 'listMessageNode',
        label: 'Mensaje de Lista',
        category: 'Mensajería y UI',
        runtimeStatus: 'runtime',
        waitsForInput: true,
        description: 'Lista interactiva de WhatsApp con secciones y filas.',
        dataFields: [
          { name: 'body', type: 'string', required: true, description: 'Texto del mensaje' },
          { name: 'buttonText', type: 'string', description: 'Texto del botón que abre la lista', example: 'Ver opciones' },
          {
            name: 'sections',
            type: 'array',
            required: true,
            description: 'Secciones con rows: { id, title, description? }',
          },
        ],
        routing: {
          outputs: 'Una salida por fila seleccionable',
          sourceHandleRules: 'sourceHandle = row.id',
        },
        example: {
          id: 'n_list',
          type: 'listMessageNode',
          data: {
            body: 'Elige un servicio:',
            buttonText: 'Ver servicios',
            sections: [{ title: 'Servicios', rows: [{ id: 'srv_1', title: 'Consultoría' }] }],
          },
        },
      },
      {
        type: 'pollNode',
        label: 'Encuesta Nativa',
        category: 'Mensajería y UI',
        runtimeStatus: 'runtime',
        waitsForInput: true,
        description: 'Encuesta nativa de WhatsApp.',
        dataFields: [
          { name: 'question', type: 'string', required: true, description: 'Pregunta de la encuesta' },
          { name: 'options', type: 'array', required: true, description: 'Opciones de respuesta' },
        ],
        routing: { outputs: 'Salidas según opción elegida' },
        example: { id: 'n_poll', type: 'pollNode', data: { question: '¿Cómo calificas el servicio?', options: ['Excelente', 'Regular'] } },
      },
      {
        type: 'contactNode',
        label: 'Contacto (VCard)',
        category: 'Mensajería y UI',
        runtimeStatus: 'runtime',
        description: 'Envía una tarjeta de contacto.',
        dataFields: [
          { name: 'name', type: 'string', required: true, description: 'Nombre del contacto' },
          { name: 'phone', type: 'string', description: 'Teléfono' },
        ],
        routing: { outputs: 'Una salida al siguiente nodo' },
        example: { id: 'n_contact', type: 'contactNode', data: { name: 'Asesor', phone: '+521234567890' } },
      },
      {
        type: 'locationNode',
        label: 'Ubicación',
        category: 'Mensajería y UI',
        runtimeStatus: 'runtime',
        description: 'Envía una ubicación geográfica.',
        dataFields: [
          { name: 'latitude', type: 'number', required: true, description: 'Latitud' },
          { name: 'longitude', type: 'number', required: true, description: 'Longitud' },
          { name: 'name', type: 'string', description: 'Nombre del lugar' },
          { name: 'address', type: 'string', description: 'Dirección' },
        ],
        routing: { outputs: 'Una salida al siguiente nodo' },
        example: { id: 'n_loc', type: 'locationNode', data: { latitude: 19.43, longitude: -99.13, name: 'Oficina' } },
      },
    ],
  },
  {
    title: 'Lógica y Procesamiento',
    nodes: [
      {
        type: 'captureInputNode',
        label: 'Capturar Entrada',
        category: 'Lógica y Procesamiento',
        runtimeStatus: 'runtime',
        waitsForInput: true,
        description: 'Pide y valida una respuesta del usuario. Guarda el valor en customFields.',
        dataFields: [
          { name: 'content', type: 'string', description: 'Pregunta al usuario' },
          { name: 'variableName', type: 'string', required: true, description: 'Nombre de variable a guardar', example: 'nombre' },
          {
            name: 'inputType',
            type: 'string',
            description: 'text | email | phone | date | url | number | regex | image | document',
            example: 'text',
          },
          { name: 'validationRegex', type: 'string', description: 'Regex de validación personalizada' },
          { name: 'errorMessage', type: 'string', description: 'Mensaje si la validación falla' },
          { name: 'maxRetries', type: 'number', description: 'Reintentos máximos' },
        ],
        routing: {
          outputs: 'success → siguiente nodo; fail → reintento o rama de error',
          sourceHandleRules: 'Usa sourceHandle "success" o "fail" según el caso',
        },
        example: {
          id: 'n_cap',
          type: 'captureInputNode',
          data: { content: '¿Cuál es tu nombre?', variableName: 'nombre', inputType: 'text' },
        },
      },
      {
        type: 'conditionNode',
        label: 'Condición (If/Else)',
        category: 'Lógica y Procesamiento',
        runtimeStatus: 'runtime',
        description: 'Ramifica el flujo según variables y operadores lógicos.',
        dataFields: [
          {
            name: 'routes',
            type: 'array',
            required: true,
            description: 'Rutas: { id, label, matchType: AND|OR, conditions: [{ variable, operator, value }] }',
          },
          { name: 'defaultLabel', type: 'string', description: 'Etiqueta del camino else' },
          { name: 'fuzzyMatch', type: 'boolean', description: 'Ignorar mayúsculas y acentos', example: true },
        ],
        routing: {
          outputs: 'Una salida por ruta + salida default (else)',
          sourceHandleRules: 'sourceHandle = route.id; default para else',
        },
        example: {
          id: 'n_cond',
          type: 'conditionNode',
          data: {
            routes: [
              {
                id: 'route_ventas',
                label: 'Ventas',
                matchType: 'AND',
                conditions: [{ id: 'c1', variable: 'intencion', operator: 'equals', value: 'ventas' }],
              },
            ],
            defaultLabel: 'Otro',
          },
        },
      },
      {
        type: 'setVariableNode',
        label: 'Asignar Variable',
        category: 'Lógica y Procesamiento',
        runtimeStatus: 'runtime',
        description: 'Asigna o transforma variables del flujo.',
        dataFields: [
          { name: 'variableName', type: 'string', required: true, description: 'Variable destino' },
          { name: 'value', type: 'string', description: 'Valor fijo o expresión' },
          { name: 'operation', type: 'string', description: 'set | append | increment, etc.' },
        ],
        routing: { outputs: 'Una salida al siguiente nodo' },
        example: { id: 'n_var', type: 'setVariableNode', data: { variableName: 'etapa', value: 'calificado' } },
      },
      {
        type: 'webhookNode',
        label: 'Webhook',
        category: 'Lógica y Procesamiento',
        runtimeStatus: 'runtime',
        description: 'Llama un endpoint HTTP externo durante el flujo.',
        dataFields: [
          { name: 'url', type: 'string', required: true, description: 'URL del webhook' },
          { name: 'method', type: 'string', description: 'GET | POST | PUT | PATCH', example: 'POST' },
          { name: 'body', type: 'string', description: 'Cuerpo JSON con {{variables}}' },
          { name: 'responseVariable', type: 'string', description: 'Variable donde guardar la respuesta' },
        ],
        routing: { outputs: 'success / fail según respuesta HTTP' },
        example: { id: 'n_hook', type: 'webhookNode', data: { url: 'https://api.example.com/lead', method: 'POST' } },
      },
      {
        type: 'firestoreReadWriteNode',
        label: 'Consulta Firestore',
        category: 'Lógica y Procesamiento',
        runtimeStatus: 'disabled',
        description: 'Visible en editor pero no ejecutado por el motor actual.',
        dataFields: [],
        routing: { outputs: 'N/A' },
        example: { id: 'n_fs', type: 'firestoreReadWriteNode', data: {} },
      },
      {
        type: 'delayNode',
        label: 'Espera / Delay',
        category: 'Lógica y Procesamiento',
        runtimeStatus: 'runtime',
        description: 'Pausa el flujo antes de continuar.',
        dataFields: [
          { name: 'delaySeconds', type: 'number', required: true, description: 'Segundos de espera', example: 2 },
        ],
        routing: { outputs: 'Una salida al siguiente nodo' },
        example: { id: 'n_delay', type: 'delayNode', data: { delaySeconds: 2 } },
      },
    ],
  },
  {
    title: 'Comercio y Ventas',
    nodes: [
      {
        type: 'catalogNode',
        label: 'Catálogo de Productos',
        category: 'Comercio y Ventas',
        runtimeStatus: 'disabled',
        description: 'No ejecutado por el motor actual.',
        dataFields: [],
        routing: { outputs: 'N/A' },
        example: { id: 'n_cat', type: 'catalogNode', data: {} },
      },
      {
        type: 'productNode',
        label: 'Producto Único/Múltiple',
        category: 'Comercio y Ventas',
        runtimeStatus: 'disabled',
        description: 'No ejecutado por el motor actual.',
        dataFields: [],
        routing: { outputs: 'N/A' },
        example: { id: 'n_prod', type: 'productNode', data: {} },
      },
      {
        type: 'kambanFlowsNode',
        label: 'kamban Flows',
        category: 'Comercio y Ventas',
        runtimeStatus: 'disabled',
        description: 'No ejecutado por el motor actual.',
        dataFields: [],
        routing: { outputs: 'N/A' },
        example: { id: 'n_kanban', type: 'kambanFlowsNode', data: {} },
      },
      {
        type: 'checkoutNode',
        label: 'Nodo de Pago',
        category: 'Comercio y Ventas',
        runtimeStatus: 'disabled',
        description: 'No ejecutado por el motor actual.',
        dataFields: [],
        routing: { outputs: 'N/A' },
        example: { id: 'n_pay', type: 'checkoutNode', data: {} },
      },
    ],
  },
  {
    title: 'Super Inteligencia',
    nodes: [
      {
        type: 'generativeAINode',
        label: 'SI Generativa (LLM)',
        category: 'Super Inteligencia',
        runtimeStatus: 'runtime',
        description: 'Genera respuesta con LLM usando contexto y variables.',
        dataFields: [
          { name: 'prompt', type: 'string', required: true, description: 'Instrucción para el modelo' },
          { name: 'outputVariable', type: 'string', description: 'Variable donde guardar la respuesta' },
          { name: 'model', type: 'string', description: 'Modelo a usar' },
        ],
        routing: { outputs: 'Una salida al siguiente nodo' },
        example: { id: 'n_ai', type: 'generativeAINode', data: { prompt: 'Resume la necesidad del cliente: {{mensaje}}' } },
      },
      {
        type: 'transcriptionNode',
        label: 'Transcripción (Audio)',
        category: 'Super Inteligencia',
        runtimeStatus: 'runtime',
        description: 'Transcribe audio del usuario a texto.',
        dataFields: [
          { name: 'outputVariable', type: 'string', description: 'Variable de salida' },
          { name: 'language', type: 'string', description: 'auto | es | en', example: 'auto' },
        ],
        routing: { outputs: 'success / fail' },
        example: { id: 'n_trans', type: 'transcriptionNode', data: { outputVariable: 'transcripcion' } },
      },
      {
        type: 'sentimentAnalysisNode',
        label: 'Análisis de Sentimiento',
        category: 'Super Inteligencia',
        runtimeStatus: 'runtime',
        description: 'Clasifica sentimiento del mensaje y ramifica.',
        dataFields: [
          { name: 'inputVariable', type: 'string', required: true, description: 'Variable a analizar' },
          { name: 'threshold', type: 'number', description: 'Umbral de certeza 0-100', example: 70 },
        ],
        routing: { outputs: 'Ramas por sentimiento detectado' },
        example: { id: 'n_sent', type: 'sentimentAnalysisNode', data: { inputVariable: 'ultimo_mensaje', threshold: 70 } },
      },
    ],
  },
  {
    title: 'Gestión y Soporte',
    nodes: [
      {
        type: 'templateNode',
        label: 'Plantillas (Templates)',
        category: 'Gestión y Soporte',
        runtimeStatus: 'runtime',
        description: 'Envía plantilla aprobada de WhatsApp Business.',
        dataFields: [
          { name: 'templateName', type: 'string', required: true, description: 'Nombre de la plantilla en Meta' },
          { name: 'language', type: 'string', description: 'Código de idioma', example: 'es' },
          { name: 'components', type: 'array', description: 'Parámetros de la plantilla' },
        ],
        routing: { outputs: 'Una salida al siguiente nodo' },
        example: { id: 'n_tpl', type: 'templateNode', data: { templateName: 'bienvenida', language: 'es' } },
      },
      {
        type: 'humanHandoffNode',
        label: 'Transferencia a Humano',
        category: 'Gestión y Soporte',
        runtimeStatus: 'runtime',
        description: 'Activa takeover humano y detiene el bot.',
        dataFields: [
          { name: 'message', type: 'string', description: 'Mensaje al usuario antes del handoff' },
          { name: 'assignTo', type: 'string', description: 'Usuario o equipo destino' },
        ],
        routing: { outputs: 'Fin de automatización' },
        example: { id: 'n_handoff', type: 'humanHandoffNode', data: { message: 'Te conecto con un asesor.' } },
      },
    ],
  },
];

export const BOT_CONDITION_OPERATORS = [
  'equals',
  'not_equals',
  'contains',
  'starts_with',
  'ends_with',
  'gt',
  'lt',
  'gte',
  'lte',
  'is_set',
  'is_empty',
  'regex',
] as const;

export function buildBotRulesExport() {
  const allNodes = BOT_NODE_CATEGORIES.flatMap((category) => category.nodes);

  return {
    exportedAt: new Date().toISOString(),
    schemaVersion: 1,
    purpose: 'Catálogo de nodos (herramientas) y reglas del motor para crear o enriquecer flujos con SI',
    platform: 'elizmey-chatbot',
    flowRules: BOT_FLOW_RULES,
    conditionOperators: BOT_CONDITION_OPERATORS,
    runtimeSupportedTypes: allNodes.filter((n) => n.runtimeStatus === 'runtime').map((n) => n.type),
    editorOnlyTypes: allNodes.filter((n) => n.runtimeStatus === 'editor_only').map((n) => n.type),
    disabledTypes: allNodes.filter((n) => n.runtimeStatus === 'disabled').map((n) => n.type),
    nodeCategories: BOT_NODE_CATEGORIES,
    minimalFlowExample: {
      nodes: [
        { id: '1', type: 'startNode', data: { label: 'Inicio' } },
        { id: 'n2', type: 'textMessageNode', data: { content: '¡Hola! ¿En qué te ayudo?' } },
        {
          id: 'n3',
          type: 'quickReplyNode',
          data: {
            bodyText: 'Elige una opción:',
            buttons: [
              { id: 'btn_info', title: 'Información', payload: 'INFO' },
              { id: 'btn_asesor', title: 'Asesor', payload: 'ASESOR' },
            ],
          },
        },
        { id: 'n_end', type: 'endNode', data: { label: 'Fin', outcomeLabel: 'Atendido' } },
      ],
      edges: [
        { id: 'e1-2', source: '1', target: 'n2', type: 'custom' },
        { id: 'e2-3', source: 'n2', target: 'n3', type: 'custom' },
        { id: 'e3-end-info', source: 'n3', target: 'n_end', type: 'custom', sourceHandle: 'btn_info' },
        { id: 'e3-end-asesor', source: 'n3', target: 'n_end', type: 'custom', sourceHandle: 'btn_asesor' },
      ],
    },
  };
}

export function downloadJsonFile(payload: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
