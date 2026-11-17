/** Rutas del molde multitenant — usar `{entity}` o `entityId` según contexto. */

export const MOLD_WORKSPACE_ROUTES = {
    diagram: (entityId: string, role = 'coo') => `/home/${entityId}/workspace?role=${role}`,
    hub: (entityId: string) => `/home/${entityId}/workspace/hub`,
    botKanban: (entityId: string, botId?: string) =>
        botId
            ? `/home/${entityId}/workspace/bot?botId=${botId}`
            : `/home/${entityId}/workspace/bot`,
    manualKanban: (entityId: string) => `/home/${entityId}/workspace/manual`,
    customBoard: (entityId: string, boardId: string) => `/home/${entityId}/workspace/board/${boardId}`,
    broadcastList: (entityId: string) => `/home/${entityId}/cmo/broadcast/list`,
    integrations: (entityId: string) => `/home/${entityId}/cto/integrations`,
    chatbotEditor: (entityId: string, botId: string) =>
        `/home/${entityId}/cto/automation/whatsappbots/${botId}`,
    /** Lámina COO en el diagrama (fullPath relativo a /home/{entityId}/) */
    kambanLayerFullPath: 'workspace/hub',
} as const;

export const MOLD_NAV_HREFS = {
    kambanLeads: '/home/{entity}/workspace/hub',
    cooWorkspace: '/home/{entity}/workspace?role=coo',
    broadcastList: '/home/{entity}/cmo/broadcast/list',
} as const;
