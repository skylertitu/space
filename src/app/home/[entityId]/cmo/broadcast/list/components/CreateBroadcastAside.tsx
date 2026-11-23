import React, { useState, useMemo, useRef, useEffect } from "react";
import { 
    X, Megaphone, Sliders, ChevronDown, ChevronUp, ChevronRight, Clock, HelpCircle, 
    Bot, Send, Loader2, Search, Users, Sliders as SlidersIcon, Layers, Tag, Globe, Calendar, Lock, Hand, Copy
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import PhoneMockup from "./PhoneMockup";

// Firebase + Service imports
import { db } from "@/lib/firebase";
import { collection, onSnapshot, getDocs } from "firebase/firestore";
import type { Broadcast, SegmentConfig, BroadcastMessage, BroadcastRecipient } from "../lib/types";
import { createBroadcast, updateBroadcast } from "../lib/broadcastService";
import {
    subscribeAvailableTags,
    subscribeAvailableCountries,
    estimateRecipients,
} from "../lib/segments";
import {
    subscribeHubKanbanBoards,
    fetchHubKanbanColumns,
    type HubKanbanBoardOption,
    type HubKanbanColumnOption,
} from "@/lib/kanban/broadcastKanbanTargets";
import { normalizePhoneNumber } from "@/lib/phoneUtils";
import { getCountryFromPhone } from "@/lib/countryCodes";
import { subscribeSlotConnections, SLOTS, type SlotConnections, type NumberSlot } from "@/lib/whatsapp/numbers";

interface CreateBroadcastAsideProps {
    isOpen: boolean;
    onClose: () => void;
    sidebarMode: "create" | "view" | "edit";
    initialData: Broadcast | null;
    tenantPath: string;
    entityId: string;
    currentUser: any;
    onSuccess: (msg: string) => void;
    onRequestEdit?: () => void;
}

export default function CreateBroadcastAside({
    isOpen,
    onClose,
    sidebarMode,
    initialData,
    tenantPath,
    entityId,
    currentUser,
    onSuccess,
    onRequestEdit
}: CreateBroadcastAsideProps) {
    // Form fields
    const [formName, setFormName] = useState<string>("");
    const [formLabel, setFormLabel] = useState<string>("");
    const [formSegment, setFormSegment] = useState<string>("");
    const [formSegmentConfig, setFormSegmentConfig] = useState<SegmentConfig | null>(null);
    const [formChannel, setFormChannel] = useState<string>("");
    
    // Message payload
    const [messageKind, setMessageKind] = useState<"template" | "text" | "media">("template");
    const [textBody, setTextBody] = useState<string>("");
    const [mediaType, setMediaType] = useState<"image" | "audio" | "document" | "video">("image");
    const [mediaUrl, setMediaUrl] = useState<string>("");
    const [mediaCaption, setMediaCaption] = useState<string>("");

    // Bots and templates
    const [chatbots, setChatbots] = useState<any[]>([]);
    const [selectedBotId, setSelectedBotId] = useState<string>("");

    // WhatsApp numbers (slots) to send FROM
    const [slotConnections, setSlotConnections] = useState<SlotConnections | null>(null);
    const [selectedSlot, setSelectedSlot] = useState<string>("");
    const [metaTemplates, setMetaTemplates] = useState<any[]>([]);
    const [loadingTemplates, setLoadingTemplates] = useState<boolean>(false);
    const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
    const [templateVariables, setTemplateVariables] = useState<string[]>([]);
    const [templateParamValues, setTemplateParamValues] = useState<Record<string, string>>({});

    // Scheduling and Delivery
    const [sendImmediately, setSendImmediately] = useState<boolean>(true);
    const [scheduleDate, setScheduleDate] = useState<string>("");
    const [scheduleTime, setScheduleTime] = useState<string>("");
    const [deliverySpeed, setDeliverySpeed] = useState<string>("No limit");

    // Dynamic segment estimation
    const [estimatingCount, setEstimatingCount] = useState<boolean>(false);
    const [estimatedRecipients, setEstimatedRecipients] = useState<number | null>(null);

    // Segment options lists
    const [hubKanbanBoards, setHubKanbanBoards] = useState<HubKanbanBoardOption[]>([]);
    const [expandedHubBoardKey, setExpandedHubBoardKey] = useState<string | null>(null);
    const [hubBoardColumns, setHubBoardColumns] = useState<Record<string, HubKanbanColumnOption[]>>({});
    const [loadingHubColumnsKey, setLoadingHubColumnsKey] = useState<string | null>(null);
    const [availableTags, setAvailableTags] = useState<string[]>([]);
    const [savedAudiences, setSavedAudiences] = useState<
        { id: string; name: string; tags?: string[]; stages?: string[]; sources?: string[] }[]
    >([]);
    const [availableCountries, setAvailableCountries] = useState<
        { iso: string; country: string; flag: string; count: number }[]
    >([]);
    const [allContacts, setAllContacts] = useState<any[]>([]);

    // Manual segment selection states
    const [manualMode, setManualMode] = useState<"write" | "select">("write");
    const [rawManualInput, setRawManualInput] = useState<string>("");
    const [selectedManualContactIds, setSelectedManualContactIds] = useState<string[]>([]);
    const [contactSearchQuery, setContactSearchQuery] = useState<string>("");

    // Test send state
    const [testPhoneNumber, setTestPhoneNumber] = useState<string>("");
    const [sendingTest, setSendingTest] = useState<boolean>(false);

    // Dropdowns and UI Toggles
    const [isSegmentDropdownOpen, setIsSegmentDropdownOpen] = useState(false);
    const [isChannelDropdownOpen, setIsChannelDropdownOpen] = useState(false);
    const [isLabelDropdownOpen, setIsLabelDropdownOpen] = useState(false);
    const [isTemplateDropdownOpen, setIsTemplateDropdownOpen] = useState(false);
    const [isAutomationSectionOpen, setIsAutomationSectionOpen] = useState<boolean>(false);
    const [showErrors, setShowErrors] = useState(false);
    const [creating, setCreating] = useState(false);

    // Refs for click outside
    const segmentRef = useRef<HTMLDivElement>(null);
    const channelRef = useRef<HTMLDivElement>(null);
    const labelRef = useRef<HTMLDivElement>(null);
    const templateRef = useRef<HTMLDivElement>(null);

    const isWhatsAppSelected = formChannel.toLowerCase().includes("whatsapp");

    // Hydrate form on initialData / mode change
    useEffect(() => {
        if (!isOpen) return;

        if ((sidebarMode === "view" || sidebarMode === "edit") && initialData) {
            setFormName(initialData.name);
            setFormLabel(initialData.labels !== "-" ? initialData.labels : "");
            setFormSegment(initialData.segment !== "-" ? initialData.segment : "");
            setFormChannel(initialData.channel !== "-" ? initialData.channel : "");
            setFormSegmentConfig(initialData.segmentConfig || null);
            setSelectedBotId(initialData.botId || "");
            setSelectedSlot(initialData.senderSlot || "");

            // Hydrate manual recipients so the existing numbers are visible and
            // can be extended when editing the campaign.
            const cfg = initialData.segmentConfig;
            if (cfg?.type === "manual") {
                const manual = cfg.manualRecipients || [];
                setManualMode("write");
                setRawManualInput(manual.map((r) => r.phone).join("\n"));
                setSelectedManualContactIds(manual.map((r) => r.contactId));
            } else {
                setRawManualInput("");
                setSelectedManualContactIds([]);
            }

            const msg = initialData.message;
            if (msg?.kind === "text") {
                setMessageKind("text");
                setTextBody(msg.text || "");
            } else if (msg?.kind === "media") {
                setMessageKind("media");
                setMediaType(msg.mediaType || "image");
                setMediaUrl(msg.mediaUrl || "");
                setMediaCaption(msg.caption || "");
            } else if (msg?.kind === "template") {
                setMessageKind("template");
                setSelectedTemplate({
                    name: msg.templateName,
                    language: msg.templateLanguage || "es",
                    components: [{ type: "BODY", text: msg.templateBody || msg.messagePreview || "" }],
                });
                setTemplateVariables(msg.templateVariables || []);
                setTemplateParamValues(msg.templateParamValues || {});
            }
            
            setSendImmediately(initialData.status !== "Scheduled");
            setScheduleDate("");
            setScheduleTime("");
            setDeliverySpeed(initialData.deliverySpeed || "No limit");
            setShowErrors(false);
        } else {
            // Reset state for new campaign creation
            setFormName("");
            setFormLabel("");
            setFormSegment("");
            setFormSegmentConfig(null);
            setFormChannel("");
            setMessageKind("template");
            setTextBody("");
            setMediaType("image");
            setMediaUrl("");
            setMediaCaption("");
            setSelectedBotId("");
            setSelectedSlot("");
            setSelectedTemplate(null);
            setTemplateVariables([]);
            setTemplateParamValues({});
            setTestPhoneNumber("");
            setSendImmediately(true);
            setScheduleDate("");
            setScheduleTime("");
            setDeliverySpeed("No limit");
            setShowErrors(false);
            setRawManualInput("");
            setSelectedManualContactIds([]);
            setContactSearchQuery("");
        }
    }, [initialData, sidebarMode, isOpen]);

    // Click outside dropdowns
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (segmentRef.current && !segmentRef.current.contains(event.target as Node)) {
                setIsSegmentDropdownOpen(false);
            }
            if (channelRef.current && !channelRef.current.contains(event.target as Node)) {
                setIsChannelDropdownOpen(false);
            }
            if (labelRef.current && !labelRef.current.contains(event.target as Node)) {
                setIsLabelDropdownOpen(false);
            }
            if (templateRef.current && !templateRef.current.contains(event.target as Node)) {
                setIsTemplateDropdownOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Fetch lists (Kanban, tags, countries, bots, contacts)
    useEffect(() => {
        if (!tenantPath || !isOpen) return;

        const unsubHubBoards = subscribeHubKanbanBoards(tenantPath, setHubKanbanBoards);
        const unsubTags = subscribeAvailableTags(tenantPath, setAvailableTags);
        const unsubAudiences = onSnapshot(
            collection(db, `${tenantPath}/audiences`),
            (snap) =>
                setSavedAudiences(
                    snap.docs.map((d) => {
                        const data = d.data();
                        return {
                            id: d.id,
                            name: String(data.name || "Audiencia"),
                            tags: Array.isArray(data.tags) ? data.tags : [],
                            stages: Array.isArray(data.stages) ? data.stages : [],
                            sources: Array.isArray(data.sources) ? data.sources : [],
                        };
                    })
                ),
            () => setSavedAudiences([])
        );
        const unsubCountries = subscribeAvailableCountries(tenantPath, setAvailableCountries);

        const unsubContacts = onSnapshot(
            collection(db, `${tenantPath}/contacts`),
            (snap) => setAllContacts(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
            (err) => console.error("[Broadcast] subscribe contacts error:", err)
        );

        const unsubBots = onSnapshot(
            collection(db, `${tenantPath}/chatbots`),
            (snap) => setChatbots(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
            (err) => console.error("[Broadcast] subscribe bots error:", err)
        );

        const unsubSlots = subscribeSlotConnections(tenantPath, setSlotConnections);

        return () => {
            unsubHubBoards();
            unsubTags();
            unsubAudiences();
            unsubCountries();
            unsubContacts();
            unsubBots();
            unsubSlots();
        };
    }, [tenantPath, isOpen]);

    // Keep selected Hub kanban segment label in sync when board/column names change.
    useEffect(() => {
        if (!formSegmentConfig || formSegmentConfig.type !== "kanban_board_column") return;
        if (!formSegmentConfig.kanbanBoardId || !formSegmentConfig.kanbanColumnId) return;

        const board = hubKanbanBoards.find(
            (b) =>
                b.id === formSegmentConfig.kanbanBoardId &&
                b.source === formSegmentConfig.kanbanBoardSource
        );
        if (!board) return;

        const key = `${board.source}:${board.id}`;
        const col = hubBoardColumns[key]?.find((c) => c.id === formSegmentConfig.kanbanColumnId);
        if (!col) return;

        const newLabel = `${board.name} · ${col.name}`;
        if (formSegment === newLabel) return;

        setFormSegment(newLabel);
        setFormSegmentConfig((prev) =>
            prev
                ? {
                      ...prev,
                      kanbanBoardName: board.name,
                      kanbanColumnName: col.name,
                      label: newLabel,
                  }
                : prev
        );
    }, [hubKanbanBoards, hubBoardColumns, formSegmentConfig, formSegment]);

    // Legacy kanban_group label sync
    useEffect(() => {
        if (!formSegmentConfig?.kanbanGroupId || formSegmentConfig.type !== "kanban_group") return;
        const key = `principal:${formSegmentConfig.botId || ""}`;
        const col = hubBoardColumns[key]?.find((c) => c.id === formSegmentConfig.kanbanGroupId);
        if (!col) return;

        const board = hubKanbanBoards.find((b) => b.source === "principal" && b.id === formSegmentConfig.botId);
        const newLabel = board ? `${board.name} · ${col.name}` : `Kanban: ${col.name}`;
        if (formSegment === newLabel) return;

        setFormSegment(newLabel);
        setFormSegmentConfig((prev) =>
            prev ? { ...prev, kanbanGroupName: col.name, label: newLabel } : prev
        );
    }, [hubKanbanBoards, hubBoardColumns, formSegmentConfig, formSegment]);

    // Resolve templates when WhatsApp channel selected
    useEffect(() => {
        if (isWhatsAppSelected && currentUser?.uid && entityId && isOpen) {
            setLoadingTemplates(true);
            setMetaTemplates([]);
            setSelectedTemplate(null);
            setTemplateVariables([]);
            setTemplateParamValues({});
            fetch(`/api/whatsapp/templates?userId=${currentUser.uid}&entityId=${entityId}`)
                .then(res => res.json())
                .then(data => {
                    if (data.templates) setMetaTemplates(data.templates);
                })
                .catch(err => console.error(err))
                .finally(() => setLoadingTemplates(false));
        }
    }, [formChannel, currentUser?.uid, entityId, isOpen]);

    // Estimate recipients resolver
    useEffect(() => {
        if (formSegmentConfig && tenantPath) {
            setEstimatingCount(true);
            const timer = setTimeout(async () => {
                try {
                    const total = await estimateRecipients(tenantPath, formSegmentConfig);
                    setEstimatedRecipients(total);
                } catch (e) {
                    setEstimatedRecipients(0);
                } finally {
                    setEstimatingCount(false);
                }
            }, 500);
            return () => clearTimeout(timer);
        } else {
            setEstimatedRecipients(null);
        }
    }, [formSegmentConfig, tenantPath]);

    // Dynamic parameter templates live preview
    const livePreviewBody = useMemo(() => {
        if (!selectedTemplate) return "";
        const bodyComp = selectedTemplate.components?.find((c: any) => c.type === "BODY");
        let text = bodyComp?.text || "";

        templateVariables.forEach(v => {
            const val = templateParamValues[v] || v;
            text = text.replace(v, val);
        });

        return text;
    }, [selectedTemplate, templateVariables, templateParamValues]);

    // Manual segment selection filters
    const filteredContactsForManual = useMemo(() => {
        let list = allContacts;
        const isWA = formChannel.toLowerCase().includes("whatsapp");
        if (isWA) {
            list = list.filter(c => c.phone && c.phone.replace(/\D/g, "").length >= 8);
        }
        if (contactSearchQuery.trim() !== "") {
            const q = contactSearchQuery.toLowerCase();
            list = list.filter(c => {
                const name = (c.name || `${c.firstName || ""} ${c.lastName || ""}`).toLowerCase();
                const phone = (c.phone || "").toLowerCase();
                const email = (c.email || "").toLowerCase();
                return name.includes(q) || phone.includes(q) || email.includes(q);
            });
        }
        return list;
    }, [allContacts, formChannel, contactSearchQuery]);

    // Handlers
    const selectSegment = (label: string, config: SegmentConfig) => {
        setFormSegment(label);
        setFormSegmentConfig({ ...config, label });
        setIsSegmentDropdownOpen(false);
    };

    const handleSelectTemplate = (template: any) => {
        setSelectedTemplate(template);
        setIsTemplateDropdownOpen(false);

        const bodyComp = template.components?.find((c: any) => c.type === "BODY");
        const bodyText = bodyComp?.text || "";
        const matches = bodyText.match(/\{\{(\d+)\}\}/g) || [];
        const uniqueVars = Array.from(new Set(matches)) as string[];
        
        uniqueVars.sort((a, b) => {
            const numA = parseInt(a.replace(/\D/g, ""));
            const numB = parseInt(b.replace(/\D/g, ""));
            return numA - numB;
        });

        setTemplateVariables(uniqueVars);
        
        const initialParams: Record<string, string> = {};
        uniqueVars.forEach(v => {
            initialParams[v] = "";
        });
        setTemplateParamValues(initialParams);
    };

    const handleRawManualInputChange = (val: string) => {
        setRawManualInput(val);
        const parts = val.split(/[,\n]+/).map(p => p.trim()).filter(Boolean);
        const recipients = parts.map((part, index) => {
            const normalized = normalizePhoneNumber(part);
            const country = getCountryFromPhone(normalized);
            return {
                id: `manual_${Date.now()}_${index}`,
                contactId: `manual_${index}`,
                name: `Manual Recipient ${index + 1}`,
                phone: normalized,
                country: country?.country || "Desconocido",
                countryFlag: country?.flag || "🏳️",
                countryIso: country?.iso || "XX",
                status: "pending" as const,
                error: null,
                messageId: null
            };
        });

        setFormSegmentConfig({
            type: "manual",
            label: `Selección Manual (${recipients.length} núm.)`,
            manualRecipients: recipients
        });
        setFormSegment(`Selección Manual (${recipients.length} núm.)`);
    };

    const toggleManualContactSelect = (contact: any) => {
        setSelectedManualContactIds(prev => {
            const next = prev.includes(contact.id) 
                ? prev.filter(id => id !== contact.id) 
                : [...prev, contact.id];
                
            const recipients = allContacts
                .filter(c => next.includes(c.id))
                .map(c => {
                    const name = c.name || `${c.firstName || ""} ${c.lastName || ""}`.trim() || "Sin nombre";
                    const phone = c.phone || "";
                    const normalized = normalizePhoneNumber(phone);
                    const country = getCountryFromPhone(normalized);
                    return {
                        id: c.id,
                        contactId: c.id,
                        name,
                        phone: normalized,
                        country: country?.country || "Desconocido",
                        countryFlag: country?.flag || "🏳️",
                        countryIso: country?.iso || "XX",
                        status: "pending" as const,
                        error: null,
                        messageId: null
                    };
                });

            setFormSegmentConfig({
                type: "manual",
                label: `Selección Manual (${recipients.length} cont.)`,
                manualRecipients: recipients
            });
            setFormSegment(`Selección Manual (${recipients.length} cont.)`);

            return next;
        });
    };

    const buildMessagePayload = (): BroadcastMessage => {
        if (isWhatsAppSelected && messageKind === "template" && selectedTemplate) {
            const bodyComp = selectedTemplate.components?.find((c: any) => c.type === "BODY");
            const rawBody = bodyComp?.text || "";
            return {
                kind: "template",
                templateName: selectedTemplate.name,
                templateLanguage: selectedTemplate.language || "es",
                templateVariables: templateVariables,
                templateParamValues: templateParamValues,
                templateBody: rawBody || livePreviewBody || "",
                messagePreview: livePreviewBody || rawBody || "",
            };
        }
        if (messageKind === "media") {
            return {
                kind: "media",
                mediaType,
                mediaUrl,
                caption: mediaCaption,
            };
        }
        return { kind: "text", text: textBody };
    };

    const handleCreateBroadcastClick = async () => {
        if (!formName.trim() || !formSegmentConfig) {
            setShowErrors(true);
            alert("Completa el nombre y el segmento.");
            return;
        }
        if (!tenantPath) {
            alert("Sesión no lista. Intenta de nuevo.");
            return;
        }

        setCreating(true);
        try {
            const message = buildMessagePayload();
            if (
                isWhatsAppSelected &&
                message.kind === "template" &&
                !String(message.templateBody || "").trim()
            ) {
                alert("La plantilla no tiene texto. Vuelve a seleccionarla antes de guardar.");
                return;
            }

            const bot = chatbots.find((b) => b.id === selectedBotId);
            const slotConn = selectedSlot ? slotConnections?.[selectedSlot as NumberSlot] : null;
            const { recipientCount } = await createBroadcast(tenantPath, {
                name: formName,
                labels: formLabel || "-",
                channel: formChannel || "-",
                segment: formSegment,
                segmentConfig: formSegmentConfig,
                message,
                botId: selectedBotId || null,
                botName: bot?.name || null,
                senderSlot: selectedSlot || null,
                senderPhoneNumberId: slotConn?.phoneNumberId || null,
                deliverySpeed,
                sendImmediately,
                scheduleAt: sendImmediately ? null : `${scheduleDate} ${scheduleTime}`.trim(),
            });
            onSuccess(`Campaña creada con ${recipientCount} destinatarios.`);
        } catch (e: any) {
            console.error(e);
            alert(`Error al crear la campaña: ${e.message}`);
        } finally {
            setCreating(false);
        }
    };

    const handleUpdateBroadcastClick = async () => {
        if (!initialData) return;
        if (!formName.trim() || !formSegmentConfig) {
            setShowErrors(true);
            alert("Completa el nombre y el segmento.");
            return;
        }
        if (!tenantPath) {
            alert("Sesión no lista. Intenta de nuevo.");
            return;
        }

        setCreating(true);
        try {
            const message = buildMessagePayload();
            if (
                isWhatsAppSelected &&
                message.kind === "template" &&
                !String(message.templateBody || "").trim()
            ) {
                alert("La plantilla no tiene texto. Vuelve a seleccionarla antes de guardar.");
                return;
            }

            const bot = chatbots.find((b) => b.id === selectedBotId);
            const slotConn = selectedSlot ? slotConnections?.[selectedSlot as NumberSlot] : null;
            const { recipientCount } = await updateBroadcast(tenantPath, initialData.id, {
                name: formName,
                labels: formLabel || "-",
                channel: formChannel || "-",
                segment: formSegment,
                segmentConfig: formSegmentConfig,
                message,
                botId: selectedBotId || null,
                botName: bot?.name || null,
                senderSlot: selectedSlot || null,
                senderPhoneNumberId: slotConn?.phoneNumberId || null,
                deliverySpeed,
                sendImmediately,
                scheduleAt: sendImmediately ? null : `${scheduleDate} ${scheduleTime}`.trim(),
            });
            onSuccess(`Campaña actualizada con ${recipientCount} destinatarios.`);
        } catch (e: any) {
            console.error(e);
            alert(`Error al actualizar la campaña: ${e.message}`);
        } finally {
            setCreating(false);
        }
    };

    const handleTestSend = async () => {
        if (!testPhoneNumber || !selectedTemplate) {
            alert("Completa el número de prueba y la plantilla.");
            return;
        }

        setSendingTest(true);
        try {
            const parameters = templateVariables.map(v => ({
                type: "text" as const,
                text: templateParamValues[v] || ""
            }));

            const response = await fetch("/api/whatsapp/send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: `Test Template: ${selectedTemplate.name}`,
                    toNumber: testPhoneNumber,
                    platform: "WhatsApp",
                    userId: currentUser?.uid,
                    entityId,
                    type: "template",
                    template: {
                        name: selectedTemplate.name,
                        language: { code: selectedTemplate.language || "es" },
                        components: [{ type: "body", parameters }]
                    }
                })
            });

            if (response.ok) {
                alert("Mensaje de prueba enviado exitosamente.");
            } else {
                alert("Error al enviar el mensaje de prueba.");
            }
        } catch (err: any) {
            console.error(err);
            alert(`Error: ${err.message}`);
        } finally {
            setSendingTest(false);
        }
    };

    const injectVariableValue = (varKey: string, attribute: string) => {
        if (sidebarMode === "view") return;
        setTemplateParamValues(prev => ({
            ...prev,
            [varKey]: (prev[varKey] || "") + `{{${attribute}}}`
        }));
    };

    // Constants
    const channelOptions = ["WhatsApp Business", "Messenger Fanpage", "Instagram Direct"];
    const labelOptions = ["Marketing", "Support", "Promotional", "Updates"];
    const segmentSectionLabel = "px-3 pt-2 pb-1 text-[9px] uppercase tracking-wider text-neutral-600 font-bold";
    const segmentOptionClass = "w-full text-left px-3 py-2 text-xs hover:bg-white/5 text-neutral-300 hover:text-white";

    const hubBoardKey = (board: HubKanbanBoardOption) => `${board.source}:${board.id}`;

    const hubBoardIcon = (board: HubKanbanBoardOption) => {
        if (board.source === "principal") return <Lock className="w-3 h-3 text-emerald-400 shrink-0" />;
        if (board.source === "manual_crm") return <Hand className="w-3 h-3 text-blue-400 shrink-0" />;
        return board.kindLabel === "Manual" ? (
            <Hand className="w-3 h-3 text-blue-400 shrink-0" />
        ) : (
            <Copy className="w-3 h-3 text-violet-400 shrink-0" />
        );
    };

    const toggleHubBoard = async (board: HubKanbanBoardOption) => {
        const key = hubBoardKey(board);
        if (expandedHubBoardKey === key) {
            setExpandedHubBoardKey(null);
            return;
        }
        setExpandedHubBoardKey(key);
        if (!hubBoardColumns[key]) {
            setLoadingHubColumnsKey(key);
            try {
                const cols = await fetchHubKanbanColumns(tenantPath, board);
                setHubBoardColumns((prev) => ({ ...prev, [key]: cols }));
            } catch (e) {
                console.error("[Broadcast] fetch hub columns error:", e);
            } finally {
                setLoadingHubColumnsKey(null);
            }
        }
    };

    const selectKanbanBoardColumn = (board: HubKanbanBoardOption, col: HubKanbanColumnOption) => {
        const label = `${board.name} · ${col.name}`;
        selectSegment(label, {
            type: "kanban_board_column",
            kanbanBoardSource: board.source,
            kanbanBoardId: board.id,
            kanbanBoardName: board.name,
            kanbanColumnId: col.id,
            kanbanColumnName: col.name,
            ...(board.botId ? { botId: board.botId } : {}),
        });
        setExpandedHubBoardKey(null);
    };

    const renderHubKanbanSegmentOptions = () => (
        <>
            {hubKanbanBoards.length > 0 && (
                <div className={segmentSectionLabel}>Tableros Kanban (Hub)</div>
            )}
            {hubKanbanBoards.map((board) => {
                const key = hubBoardKey(board);
                const isExpanded = expandedHubBoardKey === key;
                const columns = hubBoardColumns[key] || [];
                const loadingCols = loadingHubColumnsKey === key;

                return (
                    <div key={key} className="border-b border-white/[0.03] last:border-0">
                        <button
                            type="button"
                            onClick={() => toggleHubBoard(board)}
                            className={cn(segmentOptionClass, "flex items-center justify-between gap-2")}
                        >
                            <span className="flex items-center gap-2 min-w-0">
                                {hubBoardIcon(board)}
                                <span className="truncate">
                                    <span className="text-[9px] text-neutral-600 mr-1">{board.kindLabel}</span>
                                    {board.name}
                                </span>
                            </span>
                            <ChevronRight
                                className={cn("w-3 h-3 text-neutral-600 shrink-0 transition-transform", isExpanded && "rotate-90")}
                            />
                        </button>
                        {isExpanded && (
                            <div className="pb-1">
                                {loadingCols ? (
                                    <div className="px-4 py-2 text-[10px] text-neutral-600 flex items-center gap-2">
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                        Cargando columnas...
                                    </div>
                                ) : columns.length === 0 ? (
                                    <div className="px-4 py-2 text-[10px] text-neutral-600">Sin columnas</div>
                                ) : (
                                    columns.map((col) => (
                                        <button
                                            key={col.id}
                                            type="button"
                                            onClick={() => selectKanbanBoardColumn(board, col)}
                                            className="w-full text-left pl-8 pr-3 py-1.5 text-[11px] hover:bg-white/5 text-neutral-400 hover:text-white truncate"
                                            title={col.name}
                                        >
                                            {col.name}
                                        </button>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </>
    );

    const renderSegmentOptions = () => (
        <>
            {savedAudiences.length > 0 && (
                <>
                    <div className={segmentSectionLabel}>Audiencias guardadas</div>
                    {savedAudiences.map((audience) => (
                        <button
                            key={audience.id}
                            type="button"
                            onClick={() =>
                                selectSegment(audience.name, {
                                    type: "saved_audience",
                                    audienceId: audience.id,
                                    label: audience.name,
                                    tags: audience.tags || [],
                                    stages: audience.stages || [],
                                    sources: audience.sources || [],
                                })
                            }
                            className={segmentOptionClass}
                        >
                            {audience.name}
                        </button>
                    ))}
                </>
            )}
            <div className={segmentSectionLabel}>General</div>
            <button type="button" onClick={() => selectSegment("Selección Manual", { type: "manual", label: "Selección Manual", manualRecipients: [] })} className={segmentOptionClass}>
                ✍️ Selección Manual (Escribir o elegir)
            </button>
            <button type="button" onClick={() => selectSegment("Todos los contactos", { type: "all" })} className={segmentOptionClass}>
                Todos los contactos con WhatsApp
            </button>
            <button type="button" onClick={() => selectSegment("Creados en los últimos 7 días", { type: "created_recent", days: 7 })} className={segmentOptionClass}>
                Creados en los últimos 7 días
            </button>
            <button type="button" onClick={() => selectSegment("Inactivos hace +30 días", { type: "inactive", days: 30 })} className={segmentOptionClass}>
                Inactivos hace +30 días
            </button>

            {renderHubKanbanSegmentOptions()}

            {availableTags.length > 0 && <div className={segmentSectionLabel}>Etiquetas</div>}
            {availableTags.map((t) => (
                <button key={t} type="button" onClick={() => selectSegment(`Etiqueta: ${t}`, { type: "tag", tag: t })} className={segmentOptionClass}>
                    {t}
                </button>
            ))}

            {availableCountries.length > 0 && <div className={segmentSectionLabel}>País</div>}
            {availableCountries.map((c) => (
                <button key={c.iso} type="button" onClick={() => selectSegment(`País: ${c.country}`, { type: "country", countryIso: c.iso })} className={segmentOptionClass}>
                    {c.flag} {c.country} <span className="text-neutral-600">({c.count})</span>
                </button>
            ))}
        </>
    );

    if (!isOpen) return null;

    return (
        <aside className="absolute z-50 left-3 right-3 top-3 bottom-3 bg-[#0c0d12]/98 backdrop-blur-2xl border border-white/10 rounded-2xl flex flex-col transition-all duration-300 shadow-[-10px_20px_50px_rgba(0,0,0,0.8)] overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-white/5 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                    <Megaphone className="w-4 h-4 text-blue-400" />
                    <span className="font-semibold text-sm text-white/95">
                        {sidebarMode === "view"
                            ? "Campaign Details"
                            : sidebarMode === "edit"
                            ? "Editar campaña"
                            : "New Broadcast Campaign"}
                    </span>
                </div>
                <button 
                    onClick={onClose}
                    className="p-1.5 hover:bg-white/5 rounded-lg text-white/40 hover:text-white transition-colors"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>

            {/* Form Content Grid Layout */}
            <div className="flex-1 overflow-hidden p-4">
                {isWhatsAppSelected ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full max-w-6xl mx-auto">
                        {/* Left Scrollable Form Settings Column */}
                        <div className="overflow-y-auto pr-2 space-y-5 custom-scrollbar h-[calc(100vh-160px)]">
                            {/* Channel Select */}
                            <div className="space-y-1.5 relative" ref={channelRef}>
                                <label className="block text-[11px] font-medium text-neutral-400">Channel</label>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (sidebarMode !== "view") setIsChannelDropdownOpen(!isChannelDropdownOpen);
                                    }}
                                    disabled={sidebarMode === "view"}
                                    className={cn(
                                        "w-full bg-[#13151a]/80 border border-white/5 text-left text-xs text-neutral-300 rounded-lg px-3 py-2 flex items-center justify-between hover:bg-white/[0.02]",
                                        sidebarMode === "view" && "opacity-80 cursor-default"
                                    )}
                                >
                                    <span>{formChannel || "Select a channel"}</span>
                                    {sidebarMode !== "view" && <ChevronDown className="w-3.5 h-3.5 text-neutral-500" />}
                                </button>
                                {isChannelDropdownOpen && sidebarMode !== "view" && (
                                    <div className="absolute top-[100%] left-0 right-0 z-50 mt-1 bg-[#13151a] border border-white/10 rounded-lg shadow-xl py-1">
                                        {channelOptions.map(ch => (
                                            <button
                                                key={ch}
                                                type="button"
                                                onClick={() => { setFormChannel(ch); setIsChannelDropdownOpen(false); }}
                                                className="w-full text-left px-3 py-2 text-xs hover:bg-white/5 text-neutral-300 hover:text-white"
                                            >
                                                {ch}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Broadcast Name */}
                            <div className="space-y-1.5">
                                <label className="block text-[11px] font-medium text-neutral-400">Broadcast Name</label>
                                <Input
                                    type="text"
                                    placeholder="Name your broadcast (only visible internally)"
                                    value={formName}
                                    disabled={sidebarMode === "view"}
                                    onChange={(e) => setFormName(e.target.value)}
                                    className={cn(
                                        "w-full bg-[#13151a]/80 border-white/5 text-xs placeholder-neutral-500 rounded-lg py-2 focus:ring-1 focus:ring-blue-500",
                                        showErrors && !formName.trim() && "border-red-500/70 focus:ring-red-500",
                                        sidebarMode === "view" && "opacity-80"
                                    )}
                                />
                                {showErrors && !formName.trim() && (
                                    <p className="text-[10px] text-red-400 font-medium">This field is required</p>
                                )}
                            </div>

                            {/* Labels Input */}
                            <div className="space-y-1.5 relative" ref={labelRef}>
                                <label className="block text-[11px] font-medium text-neutral-400 flex items-center gap-1">
                                    Labels (optional) <HelpCircle className="w-3 h-3 text-neutral-500" />
                                </label>
                                <div className="flex gap-1.5">
                                    <Input
                                        type="text"
                                        placeholder="Write or select a label"
                                        value={formLabel}
                                        disabled={sidebarMode === "view"}
                                        onChange={(e) => setFormLabel(e.target.value)}
                                        className={cn(
                                            "w-full bg-[#13151a]/80 border-white/5 text-xs placeholder-neutral-500 rounded-lg py-2 focus:ring-1 focus:ring-blue-500",
                                            sidebarMode === "view" && "opacity-80"
                                        )}
                                    />
                                    {sidebarMode !== "view" && (
                                        <button
                                            type="button"
                                            onClick={() => setIsLabelDropdownOpen(!isLabelDropdownOpen)}
                                            className="px-2 bg-[#13151a] border border-white/5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5 transition-colors"
                                        >
                                            <ChevronDown className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>
                                {isLabelDropdownOpen && sidebarMode !== "view" && (
                                    <div className="absolute top-[100%] left-0 right-0 z-50 mt-1 bg-[#13151a] border border-white/10 rounded-lg shadow-xl py-1">
                                        {labelOptions.map(lbl => (
                                            <button
                                                key={lbl}
                                                type="button"
                                                onClick={() => { setFormLabel(lbl); setIsLabelDropdownOpen(false); }}
                                                className="w-full text-left px-3 py-2 text-xs hover:bg-white/5 text-neutral-300 hover:text-white"
                                            >
                                                {lbl}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="h-px bg-white/5 my-2" />
                            <h3 className="text-xs font-normal text-white/90 uppercase tracking-wider flex items-center gap-1">
                                <Sliders className="w-3.5 h-3.5 text-neutral-500" />
                                <span>Configuration</span>
                            </h3>

                            {/* Segment Select */}
                            <div className="space-y-1.5 relative animate-fade-in" ref={segmentRef}>
                                <label className="block text-[11px] font-medium text-neutral-400 flex items-center justify-between">
                                    <span>Segment</span>
                                    {estimatingCount && <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />}
                                </label>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (sidebarMode !== "view") setIsSegmentDropdownOpen(!isSegmentDropdownOpen);
                                    }}
                                    disabled={sidebarMode === "view"}
                                    className={cn(
                                        "w-full bg-[#13151a]/80 border border-white/5 text-left text-xs text-neutral-300 rounded-lg px-3 py-2 flex items-center justify-between hover:bg-white/[0.02]",
                                        showErrors && !formSegment && "border-red-500/70",
                                        sidebarMode === "view" && "opacity-80 cursor-default"
                                    )}
                                >
                                    <span>{formSegment || "Select a segment"}</span>
                                    {sidebarMode !== "view" && <ChevronDown className="w-3.5 h-3.5 text-neutral-500" />}
                                </button>
                                {showErrors && !formSegment && (
                                    <p className="text-[10px] text-red-400 font-medium">This field is required</p>
                                )}

                                {estimatedRecipients !== null && !estimatingCount && (
                                    <div className="mt-1.5 p-2 rounded-lg bg-blue-500/5 border border-blue-500/10 flex items-center gap-2 text-[10px] text-neutral-300">
                                        <Users className="w-3.5 h-3.5 text-blue-400" />
                                        <span>
                                            Estimación: <b>{estimatedRecipients}</b> contactos
                                        </span>
                                    </div>
                                )}

                                {isSegmentDropdownOpen && sidebarMode !== "view" && (
                                    <div className="absolute top-[100%] left-0 right-0 z-50 mt-1 bg-[#13151a] border border-white/10 rounded-lg shadow-xl py-1 max-h-60 overflow-y-auto custom-scrollbar">
                                        {renderSegmentOptions()}
                                    </div>
                                )}
                            </div>

                            {/* Manual Selection Panel */}
                            {formSegmentConfig?.type === "manual" && (
                                <div className="p-3 bg-[#13151a]/60 border border-white/5 rounded-xl space-y-3.5 my-2">
                                    <div className="flex bg-[#090a0f] p-1 rounded-lg border border-white/5">
                                        <button
                                            type="button"
                                            onClick={() => setManualMode("write")}
                                            className={cn(
                                                "flex-1 py-1.5 text-center rounded text-[10px] font-medium transition-all",
                                                manualMode === "write" ? "bg-blue-600 text-white" : "text-neutral-400 hover:text-white"
                                            )}
                                        >
                                            Escribir Números
                                        </button>
                                        <button
                                            type="button"
                                            disabled={!formChannel}
                                            onClick={() => setManualMode("select")}
                                            className={cn(
                                                "flex-1 py-1.5 text-center rounded text-[10px] font-medium transition-all disabled:opacity-40",
                                                manualMode === "select" ? "bg-blue-600 text-white" : "text-neutral-400 hover:text-white"
                                            )}
                                        >
                                            Elegir de Contactos
                                        </button>
                                    </div>

                                    {manualMode === "write" ? (
                                        <div className="space-y-1.5">
                                            <span className="block text-[10px] text-neutral-400 font-medium">
                                                Ingresa números (comas o saltos de línea)
                                            </span>
                                            <textarea
                                                rows={3}
                                                value={rawManualInput}
                                                onChange={(e) => handleRawManualInputChange(e.target.value)}
                                                placeholder="Ej: +52 1 55 1234 5678, +15559876543"
                                                className="w-full bg-[#090a0f] border border-white/5 text-xs rounded-lg p-2.5 focus:ring-1 focus:ring-blue-500 outline-none resize-none text-neutral-200 placeholder-neutral-600 font-mono"
                                            />
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            <span className="block text-[10px] text-neutral-400 font-medium">
                                                Elige de los contactos compatibles con el canal:
                                            </span>
                                            <div className="relative">
                                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-500" />
                                                <Input
                                                    type="text"
                                                    placeholder="Buscar contacto..."
                                                    value={contactSearchQuery}
                                                    onChange={(e) => setContactSearchQuery(e.target.value)}
                                                    className="bg-[#090a0f] border-white/5 pl-8 text-xs py-1 h-8 focus:ring-1 focus:ring-blue-500"
                                                />
                                            </div>

                                            <div className="max-h-40 overflow-y-auto border border-white/5 rounded-lg p-1 bg-[#090a0f] custom-scrollbar space-y-1">
                                                {filteredContactsForManual.length > 0 ? (
                                                    filteredContactsForManual.map((c) => {
                                                        const isSelected = selectedManualContactIds.includes(c.id);
                                                        return (
                                                            <label
                                                                key={c.id}
                                                                className="flex items-center justify-between p-1.5 hover:bg-white/5 rounded cursor-pointer text-[11px] text-neutral-300"
                                                            >
                                                                <div className="flex items-center gap-2">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={isSelected}
                                                                        onChange={() => toggleManualContactSelect(c)}
                                                                        className="accent-blue-500 rounded border-white/10"
                                                                    />
                                                                    <div className="flex flex-col">
                                                                        <span className="font-medium text-white">{c.name || `${c.firstName || ""} ${c.lastName || ""}`.trim() || "Sin nombre"}</span>
                                                                        <span className="text-[9px] text-neutral-500 font-mono">{c.phone || "Sin teléfono"}</span>
                                                                    </div>
                                                                </div>
                                                            </label>
                                                        );
                                                    })
                                                ) : (
                                                    <div className="text-[10px] text-neutral-500 text-center py-4">
                                                        {!formChannel ? "Selecciona un canal primero" : "No se encontraron contactos compatibles"}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Scheduling & Delivery speed */}
                            <div className="space-y-3">
                                <h4 className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
                                    <Clock className="w-3.5 h-3.5 text-neutral-500" /> Scheduling & Delivery Speed
                                </h4>

                                <div className="space-y-2">
                                    <label className="flex items-center gap-2 cursor-pointer text-xs text-neutral-300">
                                        <input
                                            type="checkbox"
                                            checked={sendImmediately}
                                            disabled={sidebarMode === "view"}
                                            onChange={(e) => setSendImmediately(e.target.checked)}
                                            className="accent-blue-500"
                                        />
                                        <span>Send immediately upon launch</span>
                                    </label>
                                </div>

                                {!sendImmediately && (
                                    <div className="grid grid-cols-2 gap-2.5 animate-in slide-in-from-top-1 duration-200">
                                        <div>
                                            <span className="text-[9px] text-neutral-500 block mb-1">Date</span>
                                            <Input 
                                                type="date"
                                                disabled={sidebarMode === "view"}
                                                value={scheduleDate}
                                                onChange={(e) => setScheduleDate(e.target.value)}
                                                className="bg-[#090a0f] border-white/5 text-xs"
                                            />
                                        </div>
                                        <div>
                                            <span className="text-[9px] text-neutral-500 block mb-1">Time</span>
                                            <Input 
                                                type="time"
                                                disabled={sidebarMode === "view"}
                                                value={scheduleTime}
                                                onChange={(e) => setScheduleTime(e.target.value)}
                                                className="bg-[#090a0f] border-white/5 text-xs"
                                            />
                                        </div>
                                    </div>
                                )}

                                <div>
                                    <span className="text-[9px] text-neutral-500 block mb-1">Delivery Speed (Throttling)</span>
                                    <select
                                        value={deliverySpeed}
                                        disabled={sidebarMode === "view"}
                                        onChange={(e) => setDeliverySpeed(e.target.value)}
                                        className="w-full bg-[#090a0f] border border-white/5 text-xs text-neutral-300 rounded-lg p-2 focus:ring-1 focus:ring-blue-500 outline-none"
                                    >
                                        <option value="No limit">No limit (Send as fast as possible)</option>
                                        <option value="10">10 messages per minute (Ultra-Safe)</option>
                                        <option value="50">50 messages per minute (Safe)</option>
                                        <option value="100">100 messages per minute (Moderate)</option>
                                    </select>
                                </div>
                            </div>

                            <div className="h-px bg-white/5 my-2" />

                            {/* Message Type Toggle */}
                            <div className="space-y-2">
                                <label className="block text-[11px] font-medium text-neutral-400">Tipo de mensaje</label>
                                <div className="grid grid-cols-3 gap-1.5 bg-[#13151a]/60 p-1 rounded-lg border border-white/5">
                                    {(["template", "text", "media"] as const).map((k) => (
                                        <button
                                            key={k}
                                            disabled={sidebarMode === "view"}
                                            onClick={() => setMessageKind(k)}
                                            className={cn(
                                                "py-1.5 rounded-md text-[10px] font-medium transition-all capitalize",
                                                messageKind === k ? "bg-blue-600 text-white" : "text-neutral-400 hover:text-white"
                                            )}
                                        >
                                            {k === "template" ? "Plantilla" : k === "text" ? "Texto" : "Multimedia"}
                                        </button>
                                    ))}
                                </div>
                                <p className="text-[9px] text-neutral-600">
                                    Plantilla: aprobada por Meta (envíos en frío). Texto/Multimedia: solo dentro de la ventana de 24h.
                                </p>
                            </div>

                            {/* Text Composer */}
                            {messageKind === "text" && (
                                <div className="space-y-1.5">
                                    <label className="block text-[11px] font-medium text-neutral-400">Mensaje de texto</label>
                                    <textarea
                                        value={textBody}
                                        disabled={sidebarMode === "view"}
                                        onChange={(e) => setTextBody(e.target.value)}
                                        rows={4}
                                        placeholder="Escribe tu mensaje. Usa {{Nombre}} para personalizar."
                                        className="w-full bg-[#13151a]/80 border border-white/5 text-xs rounded-lg p-2.5 focus:ring-1 focus:ring-blue-500 outline-none resize-none text-neutral-200 placeholder-neutral-600"
                                    />
                                    {sidebarMode !== "view" && (
                                        <div className="flex gap-1">
                                            <button type="button" onClick={() => setTextBody((t) => t + "{{Nombre}}")} className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[9px] border border-blue-500/10 hover:bg-blue-500/20">+ Nombre</button>
                                            <button type="button" onClick={() => setTextBody((t) => t + "{{País}}")} className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[9px] border border-blue-500/10 hover:bg-blue-500/20">+ País</button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Media Composer */}
                            {messageKind === "media" && (
                                <div className="space-y-2">
                                    <div>
                                        <label className="block text-[11px] font-medium text-neutral-400 mb-1">Tipo de archivo</label>
                                        <select
                                            value={mediaType}
                                            disabled={sidebarMode === "view"}
                                            onChange={(e) => setMediaType(e.target.value as any)}
                                            className="w-full bg-[#13151a] border border-white/5 text-xs text-neutral-300 rounded-lg p-2 outline-none"
                                        >
                                            <option value="image">Imagen</option>
                                            <option value="video">Video</option>
                                            <option value="audio">Audio</option>
                                            <option value="document">Documento</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-medium text-neutral-400 mb-1">URL del archivo (pública)</label>
                                        <Input value={mediaUrl} disabled={sidebarMode === "view"} onChange={(e) => setMediaUrl(e.target.value)} placeholder="https://..." className="bg-[#13151a]/80 border-white/5 text-xs rounded-lg" />
                                    </div>
                                    {mediaType !== "audio" && (
                                        <div>
                                            <label className="block text-[11px] font-medium text-neutral-400 mb-1">Descripción (opcional)</label>
                                            <Input value={mediaCaption} disabled={sidebarMode === "view"} onChange={(e) => setMediaCaption(e.target.value)} placeholder="Texto que acompaña al archivo" className="bg-[#13151a]/80 border-white/5 text-xs rounded-lg" />
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Sending Number (slot) */}
                            <div className="space-y-2 bg-sky-500/5 border border-sky-500/10 p-3.5 rounded-xl">
                                <h4 className="text-[11px] font-bold text-sky-400 uppercase tracking-wider flex items-center gap-1.5">
                                    <Send className="w-3.5 h-3.5" /> Número de envío
                                </h4>
                                <select
                                    value={selectedSlot}
                                    disabled={sidebarMode === "view"}
                                    onChange={(e) => setSelectedSlot(e.target.value)}
                                    className="w-full bg-[#13151a] border border-white/5 text-xs text-neutral-300 rounded-lg p-2 outline-none"
                                >
                                    <option value="">Número de empresa conectado</option>
                                    {SLOTS.map((s) => {
                                        const conn = slotConnections?.[s.id];
                                        const connected = !!conn?.connected;
                                        const label = conn?.displayPhoneNumber || conn?.phoneNumberId;
                                        return (
                                            <option key={s.id} value={s.id} disabled={!connected}>
                                                {s.label}
                                                {connected ? ` • ${label}` : " • sin conectar"}
                                            </option>
                                        );
                                    })}
                                </select>
                                <p className="text-[10px] text-neutral-500 leading-relaxed">
                                    La campaña sale desde el número de WhatsApp Business que conectaste en Integraciones.
                                </p>
                            </div>

                            {/* Bot Attachment */}
                            <div className="space-y-2 bg-emerald-500/5 border border-emerald-500/10 p-3.5 rounded-xl">
                                <h4 className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                                    <Bot className="w-3.5 h-3.5" /> Bot de respuesta automática
                                </h4>
                                <select
                                    value={selectedBotId}
                                    disabled={sidebarMode === "view"}
                                    onChange={(e) => setSelectedBotId(e.target.value)}
                                    className="w-full bg-[#13151a] border border-white/5 text-xs text-neutral-300 rounded-lg p-2 outline-none"
                                >
                                    <option value="">Sin bot (no responder automáticamente)</option>
                                    {chatbots.map((b) => (
                                        <option key={b.id} value={b.id}>
                                            {(b.name || b.id) + (b.isActive ? " • activo" : "")}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Meta Templates */}
                            {messageKind === "template" && (
                                <div className="space-y-4 bg-blue-500/5 border border-blue-500/10 p-3.5 rounded-xl">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-[11px] font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                                            <Megaphone className="w-3.5 h-3.5" /> WhatsApp Meta Templates
                                        </h4>
                                        {loadingTemplates && <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />}
                                    </div>

                                    <div className="space-y-1.5 relative" ref={templateRef}>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (sidebarMode !== "view") setIsTemplateDropdownOpen(!isTemplateDropdownOpen);
                                            }}
                                            disabled={loadingTemplates || metaTemplates.length === 0 || sidebarMode === "view"}
                                            className={cn(
                                                "w-full bg-[#13151a] border border-white/5 text-left text-xs text-neutral-300 rounded-lg px-3 py-2 flex items-center justify-between hover:bg-white/[0.02]",
                                                sidebarMode === "view" && "opacity-80 cursor-default"
                                            )}
                                        >
                                            <span>{selectedTemplate?.name || (loadingTemplates ? "Loading templates..." : "Choose template")}</span>
                                            {sidebarMode !== "view" && <ChevronDown className="w-3.5 h-3.5 text-neutral-500" />}
                                        </button>
                                        {isTemplateDropdownOpen && sidebarMode !== "view" && (
                                            <div className="absolute top-[100%] left-0 right-0 z-50 mt-1 bg-[#13151a] border border-white/10 rounded-lg shadow-xl py-1 max-h-40 overflow-y-auto custom-scrollbar">
                                                {metaTemplates.map(tpl => (
                                                    <button
                                                        key={tpl.name}
                                                        type="button"
                                                        onClick={() => handleSelectTemplate(tpl)}
                                                        className="w-full text-left px-3 py-2 text-xs hover:bg-white/5 text-neutral-300 hover:text-white flex justify-between items-center"
                                                    >
                                                        <span>{tpl.name}</span>
                                                        <span className="text-[9px] text-neutral-500 font-mono uppercase">{tpl.language}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {selectedTemplate && templateVariables.map(v => (
                                        <div key={v} className="flex flex-col gap-1.5 p-2.5 bg-[#090a0f] border border-white/5 rounded-xl">
                                            <div className="flex justify-between items-center">
                                                <span className="text-[9px] text-neutral-500 font-mono">Value for {v}</span>
                                                {sidebarMode !== "view" && (
                                                    <div className="flex gap-1">
                                                        <button type="button" onClick={() => injectVariableValue(v, "Nombre")} className="px-1.5 py-0.5 rounded bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-[8px] font-medium border border-blue-500/10 transition-all">+ Nombre</button>
                                                        <button type="button" onClick={() => injectVariableValue(v, "Teléfono")} className="px-1.5 py-0.5 rounded bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-[8px] font-medium border border-blue-500/10 transition-all">+ Teléfono</button>
                                                    </div>
                                                )}
                                            </div>
                                            <Input
                                                type="text"
                                                placeholder={`Enter parameter text`}
                                                value={templateParamValues[v] || ""}
                                                disabled={sidebarMode === "view"}
                                                onChange={(e) => {
                                                    setTemplateParamValues(prev => ({ ...prev, [v]: e.target.value }));
                                                }}
                                                className="bg-[#13151a] border-white/5 text-xs rounded-lg py-1.5"
                                            />
                                        </div>
                                    ))}

                                    {/* Test send */}
                                    {sidebarMode !== "view" && (
                                        <div className="mt-3 space-y-2">
                                            <h5 className="text-[10px] font-bold text-neutral-400 flex items-center gap-1.5">
                                                <Send className="w-3 h-3 text-emerald-400" /> Send WhatsApp Test Message
                                            </h5>
                                            <div className="flex gap-2">
                                                <Input
                                                    type="text"
                                                    placeholder="Recipient Phone (e.g. 521XXXXXXXXXX)"
                                                    value={testPhoneNumber}
                                                    onChange={(e) => setTestPhoneNumber(e.target.value)}
                                                    className="bg-[#13151a] border-white/5 text-[11px] rounded-lg flex-1 h-8"
                                                />
                                                <Button
                                                    onClick={handleTestSend}
                                                    disabled={sendingTest}
                                                    className="bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] px-3 h-8 rounded-lg flex items-center gap-1 active:scale-95 transition-all"
                                                >
                                                    {sendingTest ? <Loader2 className="w-3 h-3 animate-spin" /> : "Test Send"}
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Right Column: Phone Mockup */}
                        <PhoneMockup 
                            selectedTemplate={selectedTemplate}
                            livePreviewBody={livePreviewBody}
                            automationPrompts={["", "", "", ""]}
                            automationCommands={[]}
                        />
                    </div>
                ) : (
                    // Standard view for other channels
                    <div className="flex-1 overflow-y-auto p-2 custom-scrollbar h-[calc(100vh-160px)]">
                        <div className="max-w-2xl mx-auto space-y-5 py-4">
                            {/* Channel Select */}
                            <div className="space-y-1.5 relative" ref={channelRef}>
                                <label className="block text-[11px] font-medium text-neutral-400">Channel</label>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (sidebarMode !== "view") setIsChannelDropdownOpen(!isChannelDropdownOpen);
                                    }}
                                    disabled={sidebarMode === "view"}
                                    className={cn(
                                        "w-full bg-[#13151a]/80 border border-white/5 text-left text-xs text-neutral-300 rounded-lg px-3 py-2 flex items-center justify-between hover:bg-white/[0.02]",
                                        sidebarMode === "view" && "opacity-80 cursor-default"
                                    )}
                                >
                                    <span>{formChannel || "Select a channel"}</span>
                                    {sidebarMode !== "view" && <ChevronDown className="w-3.5 h-3.5 text-neutral-500" />}
                                </button>
                                {isChannelDropdownOpen && sidebarMode !== "view" && (
                                    <div className="absolute top-[100%] left-0 right-0 z-50 mt-1 bg-[#13151a] border border-white/10 rounded-lg shadow-xl py-1">
                                        {channelOptions.map(ch => (
                                            <button
                                                key={ch}
                                                type="button"
                                                onClick={() => { setFormChannel(ch); setIsChannelDropdownOpen(false); }}
                                                className="w-full text-left px-3 py-2 text-xs hover:bg-white/5 text-neutral-300 hover:text-white"
                                            >
                                                {ch}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Broadcast Name */}
                            <div className="space-y-1.5">
                                <label className="block text-[11px] font-medium text-neutral-400">Broadcast Name</label>
                                <Input
                                    type="text"
                                    placeholder="Name your broadcast"
                                    value={formName}
                                    disabled={sidebarMode === "view"}
                                    onChange={(e) => setFormName(e.target.value)}
                                    className={cn(
                                        "w-full bg-[#13151a]/80 border-white/5 text-xs placeholder-neutral-500 rounded-lg py-2 focus:ring-1 focus:ring-blue-500",
                                        showErrors && !formName.trim() && "border-red-500/70 focus:ring-red-500",
                                        sidebarMode === "view" && "opacity-80"
                                    )}
                                />
                            </div>

                            {/* Labels Input */}
                            <div className="space-y-1.5 relative" ref={labelRef}>
                                <label className="block text-[11px] font-medium text-neutral-400 flex items-center gap-1">
                                    Labels (optional)
                                </label>
                                <div className="flex gap-1.5">
                                    <Input
                                        type="text"
                                        placeholder="Write or select a label"
                                        value={formLabel}
                                        disabled={sidebarMode === "view"}
                                        onChange={(e) => setFormLabel(e.target.value)}
                                        className={cn(
                                            "w-full bg-[#13151a]/80 border-white/5 text-xs placeholder-neutral-500 rounded-lg py-2 focus:ring-1 focus:ring-blue-500",
                                            sidebarMode === "view" && "opacity-80"
                                        )}
                                    />
                                    {sidebarMode !== "view" && (
                                        <button
                                            type="button"
                                            onClick={() => setIsLabelDropdownOpen(!isLabelDropdownOpen)}
                                            className="px-2 bg-[#13151a] border border-white/5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5 transition-colors"
                                        >
                                            <ChevronDown className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>
                                {isLabelDropdownOpen && sidebarMode !== "view" && (
                                    <div className="absolute top-[100%] left-0 right-0 z-50 mt-1 bg-[#13151a] border border-white/10 rounded-lg shadow-xl py-1">
                                        {labelOptions.map(lbl => (
                                            <button
                                                key={lbl}
                                                type="button"
                                                onClick={() => { setFormLabel(lbl); setIsLabelDropdownOpen(false); }}
                                                className="w-full text-left px-3 py-2 text-xs hover:bg-white/5 text-neutral-300 hover:text-white"
                                            >
                                                {lbl}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="h-px bg-white/5 my-2" />
                            <h3 className="text-xs font-normal text-white/90 uppercase tracking-wider flex items-center gap-1">
                                <Sliders className="w-3.5 h-3.5 text-neutral-500" />
                                <span>Configuration</span>
                            </h3>

                            {/* Segment Select */}
                            <div className="space-y-1.5 relative animate-fade-in" ref={segmentRef}>
                                <label className="block text-[11px] font-medium text-neutral-400 flex items-center justify-between">
                                    <span>Segment</span>
                                    {estimatingCount && <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />}
                                </label>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (sidebarMode !== "view") setIsSegmentDropdownOpen(!isSegmentDropdownOpen);
                                    }}
                                    disabled={sidebarMode === "view"}
                                    className={cn(
                                        "w-full bg-[#13151a]/80 border border-white/5 text-left text-xs text-neutral-300 rounded-lg px-3 py-2 flex items-center justify-between hover:bg-white/[0.02]",
                                        showErrors && !formSegment && "border-red-500/70",
                                        sidebarMode === "view" && "opacity-80 cursor-default"
                                    )}
                                >
                                    <span>{formSegment || "Select a segment"}</span>
                                    {sidebarMode !== "view" && <ChevronDown className="w-3.5 h-3.5 text-neutral-500" />}
                                </button>
                                {showErrors && !formSegment && (
                                    <p className="text-[10px] text-red-400 font-medium">This field is required</p>
                                )}

                                {estimatedRecipients !== null && !estimatingCount && (
                                    <div className="mt-1.5 p-2 rounded-lg bg-blue-500/5 border border-blue-500/10 flex items-center gap-2 text-[10px] text-neutral-300">
                                        <Users className="w-3.5 h-3.5 text-blue-400" />
                                        <span>
                                            Estimación: <b>{estimatedRecipients}</b> contactos
                                        </span>
                                    </div>
                                )}

                                {isSegmentDropdownOpen && sidebarMode !== "view" && (
                                    <div className="absolute top-[100%] left-0 right-0 z-50 mt-1 bg-[#13151a] border border-white/10 rounded-lg shadow-xl py-1 max-h-60 overflow-y-auto custom-scrollbar">
                                        {renderSegmentOptions()}
                                    </div>
                                )}
                            </div>

                            {/* Manual Selection Panel */}
                            {formSegmentConfig?.type === "manual" && (
                                <div className="p-3 bg-[#13151a]/60 border border-white/5 rounded-xl space-y-3.5 my-2">
                                    <div className="flex bg-[#090a0f] p-1 rounded-lg border border-white/5">
                                        <button
                                            type="button"
                                            onClick={() => setManualMode("write")}
                                            className={cn(
                                                "flex-1 py-1.5 text-center rounded text-[10px] font-medium transition-all",
                                                manualMode === "write" ? "bg-blue-600 text-white" : "text-neutral-400 hover:text-white"
                                            )}
                                        >
                                            Escribir Números
                                        </button>
                                        <button
                                            type="button"
                                            disabled={!formChannel}
                                            onClick={() => setManualMode("select")}
                                            className={cn(
                                                "flex-1 py-1.5 text-center rounded text-[10px] font-medium transition-all disabled:opacity-40",
                                                manualMode === "select" ? "bg-blue-600 text-white" : "text-neutral-400 hover:text-white"
                                            )}
                                        >
                                            Elegir de Contactos
                                        </button>
                                    </div>

                                    {manualMode === "write" ? (
                                        <div className="space-y-1.5">
                                            <span className="block text-[10px] text-neutral-400 font-medium">
                                                Ingresa números (comas o saltos de línea)
                                            </span>
                                            <textarea
                                                rows={3}
                                                value={rawManualInput}
                                                onChange={(e) => handleRawManualInputChange(e.target.value)}
                                                placeholder="Ej: +52 1 55 1234 5678, +15559876543"
                                                className="w-full bg-[#090a0f] border border-white/5 text-xs rounded-lg p-2.5 focus:ring-1 focus:ring-blue-500 outline-none resize-none text-neutral-200 placeholder-neutral-600 font-mono"
                                            />
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            <span className="block text-[10px] text-neutral-400 font-medium">
                                                Elige de los contactos compatibles con el canal:
                                            </span>
                                            <div className="relative">
                                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-500" />
                                                <Input
                                                    type="text"
                                                    placeholder="Buscar contacto..."
                                                    value={contactSearchQuery}
                                                    onChange={(e) => setContactSearchQuery(e.target.value)}
                                                    className="bg-[#090a0f] border-white/5 pl-8 text-xs py-1 h-8 focus:ring-1 focus:ring-blue-500"
                                                />
                                            </div>

                                            <div className="max-h-40 overflow-y-auto border border-white/5 rounded-lg p-1 bg-[#090a0f] custom-scrollbar space-y-1">
                                                {filteredContactsForManual.length > 0 ? (
                                                    filteredContactsForManual.map((c) => {
                                                        const isSelected = selectedManualContactIds.includes(c.id);
                                                        return (
                                                            <label
                                                                key={c.id}
                                                                className="flex items-center justify-between p-1.5 hover:bg-white/5 rounded cursor-pointer text-[11px] text-neutral-300"
                                                            >
                                                                <div className="flex items-center gap-2">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={isSelected}
                                                                        onChange={() => toggleManualContactSelect(c)}
                                                                        className="accent-blue-500 rounded border-white/10"
                                                                    />
                                                                    <div className="flex flex-col">
                                                                        <span className="font-medium text-white">{c.name || `${c.firstName || ""} ${c.lastName || ""}`.trim() || "Sin nombre"}</span>
                                                                        <span className="text-[9px] text-neutral-500 font-mono">{c.phone || "Sin teléfono"}</span>
                                                                    </div>
                                                                </div>
                                                            </label>
                                                        );
                                                    })
                                                ) : (
                                                    <div className="text-[10px] text-neutral-500 text-center py-4">
                                                        {!formChannel ? "Selecciona un canal primero" : "No se encontraron contactos compatibles"}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Footer Action Buttons */}
            <div className="p-4 border-t border-white/5 bg-[#0b0c10]/95 backdrop-blur-md flex items-center justify-between shrink-0">
                <span className="text-[10px] text-blue-400 hover:underline cursor-pointer">Learn more</span>
                <div className="flex gap-2">
                    {sidebarMode === "view" ? (
                        <>
                            {onRequestEdit && (
                                <Button
                                    onClick={onRequestEdit}
                                    className="bg-white/5 hover:bg-white/10 text-white font-medium text-xs px-4 py-1.5 rounded-lg border border-white/10"
                                >
                                    Editar campaña
                                </Button>
                            )}
                            <Button
                                onClick={onClose}
                                className="bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs px-5 py-1.5 rounded-lg"
                            >
                                Close Details
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button
                                variant="ghost"
                                onClick={onClose}
                                className="bg-transparent hover:bg-white/5 text-neutral-400 hover:text-white text-xs px-4 py-1.5 rounded-lg"
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={sidebarMode === "edit" ? handleUpdateBroadcastClick : handleCreateBroadcastClick}
                                disabled={creating}
                                className="bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs px-4 py-1.5 rounded-lg shadow-lg active:scale-95 transition-all disabled:opacity-60 flex items-center gap-1.5"
                            >
                                {creating ? (
                                    <>
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        {sidebarMode === "edit" ? "Guardando..." : "Creando..."}
                                    </>
                                ) : sidebarMode === "edit" ? (
                                    "Guardar cambios"
                                ) : (
                                    "Crear campaña"
                                )}
                            </Button>
                        </>
                    )}
                </div>
            </div>
        </aside>
    );
}
