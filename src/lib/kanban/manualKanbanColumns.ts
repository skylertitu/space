export interface ManualKanbanColumnDef {
    slug: string;
    name: string;
    order: number;
    color: string;
    cardColor: string;
    textColor: string;
    pill: string;
    sequenceContext?: string;
    actionLogic?: string;
}

/** 8 columnas fijas del embudo manual — orden exacto del CRM. */
export const MANUAL_KANBAN_COLUMNS: ManualKanbanColumnDef[] = [
    {
        slug: 'inbox',
        name: 'Inbox (Bandeja de Entrada)',
        order: 0,
        color: 'bg-[#0c2438]',
        cardColor: 'bg-[#081a29]',
        textColor: 'text-blue-400',
        pill: 'bg-[#1a4a75] text-blue-50',
        sequenceContext: 'Bandeja universal. Todo lead nuevo o sin asignar manual entra aquí.',
    },
    {
        slug: 'no_responde_emilia',
        name: 'NO RESPONDE A EMILIA',
        order: 1,
        color: 'bg-[#331c0e]',
        cardColor: 'bg-[#27150a]',
        textColor: 'text-orange-400',
        pill: 'bg-[#7a3b1f] text-orange-50',
        sequenceContext: `¡Hola! 😊

Hace unos días nos escribiste porque querías información para estudiar en Estados Unidos, pero no alcanzamos a terminar la conversación.

Con gusto retomamos el proceso desde donde quedó. Cuéntame, ¿en qué parte te quedaste o qué información estabas buscando? 🇺🇸

———
24 HORAS DESPUÉS

Muchas personas nos contactan porque quieren estudiar inglés en Estados Unidos pero no saben por dónde empezar.

Si todavía estás interesado, puedo ayudarte a revisar si calificas en menos de 1 minuto.

¿Continuamos?

———
48 HORAS DESPUÉS

Antes de cerrar tu solicitud quería consultarte:

¿Sigues interesado en estudiar en Estados Unidos?

1️⃣ Sí, quiero continuar
2️⃣ Tengo dudas
3️⃣ Ya no estoy interesado`,
    },
    {
        slug: 'no_responde_estoy_de_acuerdo',
        name: "NO RESPONDE AL 'ESTOY DE ACUERDO'",
        order: 2,
        color: 'bg-[#332b0e]',
        cardColor: 'bg-[#27210a]',
        textColor: 'text-yellow-400',
        pill: 'bg-[#7a651f] text-yellow-50',
        sequenceContext: `¡Hola, (nombre)! 😊

Noté que nuestra conversación quedó pendiente y me gustaría ayudarte a conocer toda la información que necesitas para estudiar en Estados Unidos con una visa de estudiante. 🇺🇸

Solo necesitamos hacerte 3 preguntas rápidas para verificar si cumples con los requisitos del programa. Si aún no calificas, no te preocupes; también te orientaremos sobre qué necesitas para prepararte.

¿Te parece si continuamos? 😊`,
    },
    {
        slug: 'no_responde_estado_usa',
        name: 'NO RESPONDE AL ESTADO EN USA',
        order: 3,
        color: 'bg-[#2f1c34]',
        cardColor: 'bg-[#241527]',
        textColor: 'text-purple-400',
        pill: 'bg-[#6b3576] text-purple-50',
        sequenceContext: `¡Hola, (nombre)! 😊

Espero que estés muy bien.

Vi que nuestra conversación quedó pendiente y me encantaría seguir ayudándote para encontrar la mejor opción de estudios en Estados Unidos. 🇺🇸

¿A qué estado de Estados Unidos te gustaría venir a estudiar?`,
    },
    {
        slug: 'no_responde_bank_statement',
        name: 'NO RESPONDE AL BANK STATEMENT',
        order: 4,
        color: 'bg-[#123122]',
        cardColor: 'bg-[#0e2419]',
        textColor: 'text-emerald-400',
        pill: 'bg-[#1a5b3d] text-emerald-50',
        sequenceContext: `¡Hola, (nombre)! 😊

Quería retomar nuestra conversación porque muchas personas tienen una duda en esta parte del proceso.

Los USD 5,000 NO SON UN PAGO ni un dinero que debas depositar. Es un monto que normalmente se demuestra ante la Embajada como respaldo económico para tus estudios y, en muchos casos, puede ser tuyo o de un patrocinador, como un padre, madre o familiar.

Cuéntanos;

¿Tú o un familiar podrían demostrar aproximadamente USD 5,000 o más?`,
    },
    {
        slug: 'elige_libro_digital',
        name: 'ELIGE LIBRO DIGITAL UDREAMMS',
        order: 5,
        color: 'bg-[#0c2438]',
        cardColor: 'bg-[#081a29]',
        textColor: 'text-cyan-400',
        pill: 'bg-[#1a5b75] text-cyan-50',
        sequenceContext: `¡Hola, (nombre)! 😊

Quería retomar contigo el acceso al Libro Digital de Udreamms. Esta es una herramienta que muchas personas usan para empezar su proceso de visa de estudiante por su cuenta sin la ayuda de una agencia.

📕 Te cuento rápido qué incluye éste libro (40 páginas en total):

✅ Paso a paso completo para solicitar la visa de estudiante en 30 días
✅ Cómo aplicar a una escuela de inglés acreditada en Estados Unidos
✅ Cómo obtener y pagar el número SEVIS
✅ Cómo llenar correctamente el formulario DS-160
✅ Estrategias que funcionan en la entrevista con el consulado
✅ Qué hacer si te niegan la visa
✅ Cómo renovar tu I-20 desde EE.UU.
✅ Costo de vida real en Estados Unidos
✅ Opciones legales de trabajo con visa F1
✅ Conclusión + guía de próximos pasos

🎥 Además incluye explicaciones visuales y recursos para que puedas entender todo el proceso sin necesidad de asesoría.

La idea es que tengas todo el camino claro antes de empezar.

Si deseas puedes agendar una cita con uno de nuestros agentes para que puedan revisar el libro ANTES de que lo compres.

🔗 ESCRIBENOS 'LIBRO' Y TE CONTACTAMOS CON UN AGENTE`,
    },
    {
        slug: 'cita_seguimiento',
        name: 'SOLICITÓ UNA CITA',
        order: 6,
        color: 'bg-[#38111e]',
        cardColor: 'bg-[#290c16]',
        textColor: 'text-pink-400',
        pill: 'bg-[#82193f] text-pink-50',
        sequenceContext: `¡Hola! 😊

Te escribo porque tenías agendada una evaluación con nuestro equipo de Udreamms para revisar tu proceso de visa de estudiante para Estados Unidos 🇺🇸

Quería asegurarme de que todo haya estado bien, ya que a veces pueden ocurrir imprevistos o problemas con el enlace.

¿Pudiste conectarte a tu cita?

1️⃣ Sí, me conecté
2️⃣ No pude conectarme
3️⃣ No vi el enlace / se me pasó
4️⃣ Quiero reagendar`,
        actionLogic: `Si responde 2, 3 o 4 (“No pude / se me pasó / no vi el link”)

No te preocupes 😊

Podemos reagendar tu evaluación para que revises tu caso con uno de nuestros especialistas y veas todas las opciones para venir a estudiar a Estados Unidos 🇺🇸

En el siguiente link podrás reagendar tu cita:

[LINK CITA]

———

Si responde “Sí me conecté”

¡Perfecto! 😊

Gracias por conectarte a tu evaluación.

Para ayudarte mejor, ¿cómo te fue en la reunión?
¿Te quedaron dudas o te gustaría avanzar con el proceso?`,
    },
    {
        slug: 'cita_acciones',
        name: 'NUEVA CAMPAÑA',
        order: 7,
        color: 'bg-[#3b1212]',
        cardColor: 'bg-[#2b0d0d]',
        textColor: 'text-rose-400',
        pill: 'bg-[#8c1818] text-rose-50',
    },
];

export const MANUAL_INBOX_SLUG = 'inbox';
