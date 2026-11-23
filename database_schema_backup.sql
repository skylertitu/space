-- ==============================================================================
-- RESPALDO Y ESQUEMA DE BASE DE DATOS RELACIONAL (POSTGRESQL / SUPABASE / MYSQL)
-- Diseñado para migrar la arquitectura de Firebase/Firestore hacia SQL Relacional.
-- ==============================================================================

-- 1. TABLA DE USUARIOS DEL SISTEMA
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(128) PRIMARY KEY,                 -- uid de autenticación
    email VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(255),
    photo_url TEXT,
    role VARCHAR(50) DEFAULT 'user',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. TABLA DE ENTORNOS / ENTIDADES (PERSONAL)
CREATE TABLE IF NOT EXISTS entities (
    id VARCHAR(64) PRIMARY KEY,                  -- ej: bs_sq1ozpf
    user_id VARCHAR(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,                  -- ej: jnlnl (acceso por URL)
    type VARCHAR(50) DEFAULT 'persona',          -- persona
    status VARCHAR(50) DEFAULT 'active',         -- active | archived
    logo_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, slug)
);

-- 3. TABLA DE INTEGRACIONES Y CREDENCIALES DE MENSAJERÍA
CREATE TABLE IF NOT EXISTS integrations (
    id SERIAL PRIMARY KEY,
    entity_id VARCHAR(64) NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,               -- whatsapp, telegram, messenger, instagram, gmail, stripe, gemini
    status VARCHAR(50) DEFAULT 'Disconnected',   -- Connected | Disconnected | Error
    access_token TEXT,
    phone_number_id VARCHAR(128),                -- Meta WhatsApp Phone ID
    waba_id VARCHAR(128),                        -- WhatsApp Business Account ID
    bot_token TEXT,                              -- Telegram Bot Token
    verify_token TEXT,
    webhook_secret TEXT,
    metadata JSONB DEFAULT '{}',                 -- credenciales adicionales
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(entity_id, provider)
);

-- 4. TABLA DE NÚMEROS TELEFÓNICOS CONECTADOS (SLOTS WHATSAPP)
CREATE TABLE IF NOT EXISTS whatsapp_numbers (
    id SERIAL PRIMARY KEY,
    entity_id VARCHAR(64) NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    slot VARCHAR(50) NOT NULL,                   -- general | support | broadcast
    phone_number_id VARCHAR(128) NOT NULL,
    display_phone_number VARCHAR(50),
    verified_name VARCHAR(255),
    status VARCHAR(50) DEFAULT 'Connected',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(entity_id, slot)
);

-- 5. TABLA DE CONTACTOS (CRM & AUDIENCIAS)
CREATE TABLE IF NOT EXISTS contacts (
    id VARCHAR(64) PRIMARY KEY,
    entity_id VARCHAR(64) NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    email VARCHAR(255),
    tags TEXT[] DEFAULT '{}',
    custom_fields JSONB DEFAULT '{}',            -- variables capturadas por el bot
    telegram_chat_id VARCHAR(128),
    messenger_id VARCHAR(128),
    instagram_id VARCHAR(128),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. TABLA DE COLUMNAS DEL EMBUDO KANBAN
CREATE TABLE IF NOT EXISTS kanban_groups (
    id VARCHAR(64) PRIMARY KEY,
    entity_id VARCHAR(64) NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    position INT DEFAULT 0,
    color VARCHAR(50) DEFAULT '#3b82f6',
    is_inbox BOOLEAN DEFAULT FALSE,              -- buzón de entrada por defecto
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. TABLA DE CONVERSACIONES (OMNICANAL)
CREATE TABLE IF NOT EXISTS conversations (
    id VARCHAR(128) PRIMARY KEY,
    entity_id VARCHAR(64) NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    contact_id VARCHAR(64) REFERENCES contacts(id) ON DELETE SET NULL,
    contact_name VARCHAR(255),
    contact_number VARCHAR(50),
    platform VARCHAR(50) NOT NULL,               -- whatsapp, telegram, messenger, instagram
    kanban_group_id VARCHAR(64) REFERENCES kanban_groups(id) ON DELETE SET NULL,
    status VARCHAR(50) DEFAULT 'active',         -- active, archived, closed
    unread_count INT DEFAULT 0,
    last_message TEXT,
    last_message_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    human_takeover BOOLEAN DEFAULT FALSE,        -- True si un agente humano desactivó el bot
    human_takeover_agent_id VARCHAR(128),
    bot_state JSONB DEFAULT '{
        "status": "idle",
        "currentNodeId": null,
        "waitingForInput": false,
        "variables": {}
    }',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. TABLA DE MENSAJES (HISTORIAL COMPLETO DE MENSAJERÍA)
CREATE TABLE IF NOT EXISTS messages (
    id VARCHAR(128) PRIMARY KEY,
    conversation_id VARCHAR(128) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender VARCHAR(50) NOT NULL,                 -- user (cliente) | agent (humano) | bot (automático)
    platform VARCHAR(50) NOT NULL,
    message_type VARCHAR(50) DEFAULT 'text',     -- text, image, audio, video, document, list, quick_reply
    text TEXT,
    media_url TEXT,
    media_type VARCHAR(50),
    metadata JSONB DEFAULT '{}',                 -- botones, opciones interactivas, delivery status
    status VARCHAR(50) DEFAULT 'sent',           -- sent, delivered, read, failed
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 9. TABLA DE CHATBOTS Y AUTOMATIZACIONES (MOTOR DE NODOS)
CREATE TABLE IF NOT EXISTS chatbots (
    id VARCHAR(64) PRIMARY KEY,                  -- ej: 00000001
    entity_id VARCHAR(64) NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    channel VARCHAR(50) NOT NULL,                -- whatsapp, messenger, instagram, telegram
    is_active BOOLEAN DEFAULT FALSE,
    phone_number_id VARCHAR(128),                -- número vinculado en WhatsApp
    humanize_tone BOOLEAN DEFAULT FALSE,         -- IA para suavizar el tono
    humanize_style VARCHAR(50) DEFAULT 'warm',
    flow_nodes JSONB NOT NULL DEFAULT '[]',      -- Grafo de nodos visuales (ReactFlow)
    flow_edges JSONB NOT NULL DEFAULT '[]',      -- Conexiones y flechas entre nodos
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 10. TABLA DE CAMPAÑAS DE DIFUSIÓN MASIVA (BROADCASTS)
CREATE TABLE IF NOT EXISTS broadcasts (
    id VARCHAR(64) PRIMARY KEY,
    entity_id VARCHAR(64) NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    channel VARCHAR(50) DEFAULT 'whatsapp',
    template_name VARCHAR(255),
    template_language VARCHAR(10) DEFAULT 'es',
    total_recipients INT DEFAULT 0,
    sent_count INT DEFAULT 0,
    delivered_count INT DEFAULT 0,
    replied_count INT DEFAULT 0,
    failed_count INT DEFAULT 0,
    status VARCHAR(50) DEFAULT 'draft',          -- draft | scheduled | sending | completed
    scheduled_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 11. TABLA DE DESTINATARIOS DE DIFUSIÓN
CREATE TABLE IF NOT EXISTS broadcast_recipients (
    id SERIAL PRIMARY KEY,
    broadcast_id VARCHAR(64) NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
    phone VARCHAR(50) NOT NULL,
    name VARCHAR(255),
    status VARCHAR(50) DEFAULT 'pending',        -- pending | sent | delivered | replied | failed
    error_message TEXT,
    sent_at TIMESTAMP WITH TIME ZONE,
    replied_at TIMESTAMP WITH TIME ZONE,
    reply_text TEXT
);

-- ==============================================================================
-- ÍNDICES DE RENDIMIENTO PARA ALTA CONCURRENCIA
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_conversations_entity ON conversations(entity_id);
CREATE INDEX IF NOT EXISTS idx_conversations_contact_number ON conversations(contact_number);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_chatbots_entity_channel ON chatbots(entity_id, channel);
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_broadcast ON broadcast_recipients(broadcast_id);
