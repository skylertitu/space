'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Node, Edge } from 'reactflow';
import { motion, AnimatePresence } from 'framer-motion';
import { X, RotateCcw, Send, Bot, User, Sparkles, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface SimulatedMessage {
  id: string;
  sender: 'bot' | 'user' | 'system';
  text: string;
  buttons?: Array<{ id: string; title: string }>;
  timestamp: string;
}

interface BotSimulatorDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  nodes: Node[];
  edges: Edge[];
  botName: string;
}

export default function BotSimulatorDrawer({
  isOpen,
  onClose,
  nodes,
  edges,
  botName,
}: BotSimulatorDrawerProps) {
  const [messages, setMessages] = useState<SimulatedMessage[]>([]);
  const [inputVal, setInputVal] = useState('');
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null);
  const [isWaitingForInput, setIsWaitingForInput] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [variables, setVariables] = useState<Record<string, string>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll inside phone simulator
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Interpolate variables like {{name}}
  const interpolate = (text: string): string => {
    if (!text) return '';
    return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => variables[key] || `[${key}]`);
  };

  const getStartNode = (): Node | undefined => {
    return (
      nodes.find((n) => n.type === 'startNode') ||
      nodes.find((n) => n.id === '1' || n.id === 'start') ||
      nodes[0]
    );
  };

  // Find next node given an optional sourceHandle
  const findNextNodeId = (sourceId: string, handle?: string | null): string | null => {
    if (handle) {
      const match = edges.find(
        (e) => String(e.source) === String(sourceId) && String(e.sourceHandle) === String(handle)
      );
      if (match) return String(match.target);
    }
    const defaultEdge = edges.find((e) => String(e.source) === String(sourceId));
    return defaultEdge ? String(defaultEdge.target) : null;
  };

  const executeNode = async (nodeId: string, handle?: string | null) => {
    const node = nodes.find((n) => String(n.id) === String(nodeId));
    if (!node) {
      setMessages((prev) => [
        ...prev,
        {
          id: `sys_${Date.now()}`,
          sender: 'system',
          text: 'Fin del flujo alcanzado.',
          timestamp: formatTime(),
        },
      ]);
      setIsWaitingForInput(false);
      return;
    }

    setCurrentNodeId(node.id);

    // 1. Start Node
    if (node.type === 'startNode') {
      const nextId = findNextNodeId(node.id);
      if (nextId) executeNode(nextId);
      return;
    }

    // 2. Delay Node
    if (node.type === 'delayNode') {
      setIsTyping(true);
      const delay = Math.min((node.data?.delaySeconds || 1) * 1000, 3000);
      await new Promise((r) => setTimeout(r, delay));
      setIsTyping(false);
      const nextId = findNextNodeId(node.id);
      if (nextId) executeNode(nextId);
      return;
    }

    // 3. Text Message Node
    if (node.type === 'textMessageNode' || node.type === 'messageNode') {
      setIsTyping(true);
      await new Promise((r) => setTimeout(r, 600));
      setIsTyping(false);

      const rawText = node.data?.text || node.data?.message || node.data?.content || '(Mensaje vacío)';
      setMessages((prev) => [
        ...prev,
        {
          id: `bot_${Date.now()}_${Math.random()}`,
          sender: 'bot',
          text: interpolate(rawText),
          timestamp: formatTime(),
        },
      ]);

      const nextId = findNextNodeId(node.id);
      if (nextId) executeNode(nextId);
      return;
    }

    // 4. Quick Reply Node (with buttons)
    if (node.type === 'quickReplyNode') {
      setIsTyping(true);
      await new Promise((r) => setTimeout(r, 600));
      setIsTyping(false);

      const rawText = node.data?.text || node.data?.message || 'Selecciona una opción:';
      const rawButtons = node.data?.buttons || [];
      const buttons = rawButtons.map((b: any, idx: number) => ({
        id: b.id || `btn_${idx}`,
        title: b.title || b.text || `Opción ${idx + 1}`,
      }));

      setMessages((prev) => [
        ...prev,
        {
          id: `bot_${Date.now()}_${Math.random()}`,
          sender: 'bot',
          text: interpolate(rawText),
          buttons: buttons.length > 0 ? buttons : undefined,
          timestamp: formatTime(),
        },
      ]);

      // If no buttons, continue immediately, else wait for user click
      if (buttons.length === 0) {
        const nextId = findNextNodeId(node.id);
        if (nextId) executeNode(nextId);
      }
      return;
    }

    // 5. Capture Input Node
    if (node.type === 'captureInputNode' || node.type === 'captureNode') {
      const prompt = node.data?.question || node.data?.prompt || node.data?.label;
      if (prompt && prompt !== 'Capturar Entrada') {
        setIsTyping(true);
        await new Promise((r) => setTimeout(r, 500));
        setIsTyping(false);
        setMessages((prev) => [
          ...prev,
          {
            id: `bot_${Date.now()}_${Math.random()}`,
            sender: 'bot',
            text: interpolate(prompt),
            timestamp: formatTime(),
          },
        ]);
      }
      setIsWaitingForInput(true);
      return;
    }

    // 6. Generative AI Node
    if (node.type === 'generativeAINode') {
      setIsTyping(true);
      await new Promise((r) => setTimeout(r, 1000));
      setIsTyping(false);

      const systemPrompt = node.data?.prompt || 'Respuesta asistida por IA';
      setMessages((prev) => [
        ...prev,
        {
          id: `bot_${Date.now()}_${Math.random()}`,
          sender: 'bot',
          text: `[SI Generativa]: He procesado tu consulta conforme a las instrucciones (${systemPrompt.slice(0, 40)}...). ¿En qué más puedo orientarte?`,
          timestamp: formatTime(),
        },
      ]);
      const nextId = findNextNodeId(node.id);
      if (nextId) executeNode(nextId);
      return;
    }

    // 7. Human Handoff Node
    if (node.type === 'humanHandoffNode') {
      setMessages((prev) => [
        ...prev,
        {
          id: `sys_${Date.now()}`,
          sender: 'system',
          text: '🔄 [Derivación Humana]: Se ha transferido la atención a un asesor de tu equipo.',
          timestamp: formatTime(),
        },
      ]);
      setIsWaitingForInput(false);
      return;
    }

    // 8. End Node
    if (node.type === 'endNode') {
      setMessages((prev) => [
        ...prev,
        {
          id: `sys_${Date.now()}`,
          sender: 'system',
          text: '🏁 Conversación finalizada por el bot.',
          timestamp: formatTime(),
        },
      ]);
      setIsWaitingForInput(false);
      return;
    }

    // Fallback: Continue
    const nextId = findNextNodeId(node.id, handle);
    if (nextId) executeNode(nextId);
  };

  const handleStartSimulation = () => {
    setMessages([]);
    setVariables({});
    setIsWaitingForInput(false);
    setIsTyping(false);

    const start = getStartNode();
    if (!start) {
      setMessages([
        {
          id: 'err',
          sender: 'system',
          text: 'No se encontró un nodo de Inicio (startNode). Añade uno al canvas para probar.',
          timestamp: formatTime(),
        },
      ]);
      return;
    }

    executeNode(start.id);
  };

  // Start simulation on open
  useEffect(() => {
    if (isOpen) {
      handleStartSimulation();
    }
  }, [isOpen]);

  const handleSendUserInput = (textToSend?: string, buttonId?: string) => {
    const text = (textToSend || inputVal).trim();
    if (!text) return;

    setInputVal('');
    setMessages((prev) => [
      ...prev,
      {
        id: `user_${Date.now()}`,
        sender: 'user',
        text,
        timestamp: formatTime(),
      },
    ]);

    if (!currentNodeId) return;

    const currentNode = nodes.find((n) => String(n.id) === String(currentNodeId));

    // Handle Quick Reply Click
    if (buttonId) {
      const nextId = findNextNodeId(currentNodeId, buttonId);
      if (nextId) executeNode(nextId);
      return;
    }

    // Handle Capture Input
    if (currentNode?.type === 'captureInputNode' || currentNode?.type === 'captureNode') {
      const varName = currentNode.data?.variableName || currentNode.data?.saveAs || 'input';
      setVariables((prev) => ({ ...prev, [varName]: text }));
      setIsWaitingForInput(false);
      const nextId = findNextNodeId(currentNodeId, 'success') || findNextNodeId(currentNodeId);
      if (nextId) executeNode(nextId);
      return;
    }

    // Default: find next
    const nextId = findNextNodeId(currentNodeId);
    if (nextId) executeNode(nextId);
  };

  function formatTime() {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ duration: 0.2 }}
        className="fixed bottom-4 right-4 z-50 w-[360px] h-[580px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-5rem)] rounded-2xl bg-[#0b0f14] border border-white/10 shadow-2xl flex flex-col overflow-hidden backdrop-blur-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3.5 py-3 border-b border-white/[0.08] bg-[#101720]/80 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative w-8 h-8 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center shrink-0 text-blue-400">
              <Bot className="w-4 h-4" />
              <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-[#0b0f14]" />
            </div>
            <div className="min-w-0">
              <h4 className="text-xs font-semibold text-white truncate leading-tight">
                {botName || 'Simulador de Chatbot'}
              </h4>
              <p className="text-[10px] text-emerald-400 flex items-center gap-1 font-medium">
                <Sparkles className="w-2.5 h-2.5" /> En línea (Modo prueba)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleStartSimulation}
              className="w-7 h-7 rounded-lg text-neutral-400 hover:text-white hover:bg-white/10"
              title="Reiniciar diálogo"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="w-7 h-7 rounded-lg text-neutral-400 hover:text-white hover:bg-white/10"
              title="Cerrar simulador"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-[#070a0e]/60 text-xs">
          {messages.length === 0 && !isTyping && (
            <div className="h-full flex flex-col items-center justify-center text-center text-neutral-500 text-[11px] px-4 space-y-2">
              <Bot className="w-8 h-8 opacity-40 text-blue-400" />
              <p>Iniciando prueba del flujo desde el nodo de inicio...</p>
            </div>
          )}

          {messages.map((msg) => {
            if (msg.sender === 'system') {
              return (
                <div key={msg.id} className="text-center my-2">
                  <span className="inline-block px-2.5 py-1 rounded-full bg-white/[0.05] border border-white/[0.08] text-[10px] text-neutral-400 font-medium">
                    {msg.text}
                  </span>
                </div>
              );
            }

            const isBot = msg.sender === 'bot';
            return (
              <div key={msg.id} className={`flex flex-col ${isBot ? 'items-start' : 'items-end'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 leading-relaxed shadow-sm ${
                    isBot
                      ? 'bg-[#182230] text-neutral-100 rounded-tl-sm border border-white/[0.06]'
                      : 'bg-blue-600 text-white rounded-tr-sm'
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                  <div
                    className={`flex items-center justify-end gap-1 text-[9px] mt-1 ${
                      isBot ? 'text-neutral-400' : 'text-blue-200'
                    }`}
                  >
                    <span>{msg.timestamp}</span>
                    {!isBot && <CheckCheck className="w-3 h-3 text-sky-300" />}
                  </div>
                </div>

                {/* Quick Reply Buttons */}
                {msg.buttons && msg.buttons.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2 max-w-[85%]">
                    {msg.buttons.map((btn) => (
                      <button
                        key={btn.id}
                        type="button"
                        onClick={() => handleSendUserInput(btn.title, btn.id)}
                        className="text-[11px] font-medium bg-blue-500/15 hover:bg-blue-500/25 text-blue-300 hover:text-white border border-blue-500/30 rounded-xl px-3 py-1.5 transition-all text-left"
                      >
                        {btn.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Typing Indicator */}
          {isTyping && (
            <div className="flex items-center gap-1.5 p-2 rounded-2xl rounded-tl-sm bg-[#182230] border border-white/[0.06] w-14">
              <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-pulse" />
              <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-pulse delay-150" />
              <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-pulse delay-300" />
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-2.5 border-t border-white/[0.08] bg-[#101720]/90 shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendUserInput();
            }}
            className="flex items-center gap-1.5"
          >
            <Input
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              placeholder={isWaitingForInput ? 'Escribe tu respuesta...' : 'Envía un mensaje o comando...'}
              className="h-8 text-xs bg-black/50 border-white/10 rounded-xl text-white placeholder:text-neutral-500 focus:border-blue-500/50"
            />
            <Button
              type="submit"
              size="icon"
              disabled={!inputVal.trim()}
              className="h-8 w-8 rounded-xl bg-blue-600 hover:bg-blue-500 text-white shrink-0 disabled:opacity-30"
            >
              <Send className="w-3.5 h-3.5" />
            </Button>
          </form>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
