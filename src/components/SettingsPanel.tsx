// src/components/SettingsPanel.tsx
'use client';
import React from 'react';
import { Edge, Node } from 'reactflow';
import { Button } from './ui/button';
import { Trash2, ChevronRight, ChevronLeft, Bot } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GeneralSettings } from './settings/nodes/GeneralSettings';
import { TextMessageSettings } from './settings/nodes/TextMessageSettings';
import { MediaMessageSettings } from './settings/nodes/MediaMessageSettings';
import { QuickReplySettings } from './settings/nodes/QuickReplySettings';
import { ListMessageSettings } from './settings/nodes/ListMessageSettings';
import { CaptureInputSettings } from './settings/nodes/CaptureInputSettings';
import { ConditionSettings } from './settings/nodes/ConditionSettings';
import { WebhookSettings } from './settings/nodes/WebhookSettings';
import { SetVariableSettings } from './settings/nodes/SetVariableSettings';
import { EndSettings } from './settings/nodes/EndSettings';
import { PollSettings } from './settings/nodes/PollSettings';
import { ContactSettings } from './settings/nodes/ContactSettings';
import { LocationSettings } from './settings/nodes/LocationSettings';
import { PlaceholderSettings } from './settings/nodes/PlaceholderSettings';
import { kambanFlowsSettings } from './settings/nodes/kambanFlowsSettings';
import { CheckoutSettings } from './settings/nodes/CheckoutSettings';
import { StartSettings } from './settings/nodes/StartSettings'; 
import { DelaySettings } from './settings/nodes/DelaySettings';

// Nuevos Nodos AI & Management
import { GenerativeAISettings } from './settings/nodes/GenerativeAISettings';
import { TranscriptionSettings } from './settings/nodes/TranscriptionSettings';
import { SentimentAnalysisSettings } from './settings/nodes/SentimentAnalysisSettings';
import { TemplateSettings } from './settings/nodes/TemplateSettings';
import { HumanHandoffSettings } from './settings/nodes/HumanHandoffSettings';

interface SettingsPanelProps {
  selectedNode: Node | null;
  allNodes: Node[];
  allEdges: Edge[];
  updateNodeConfig: (nodeId: string, data: object) => void;
  deleteNode: (nodeId: string) => void;
  isOpen: boolean;
  onToggle: () => void;
  linkedPhoneDigits?: string;
  linkedPhoneLabel?: string;
}

interface NodeSettingsProps {
  node: Node;
  allNodes: Node[];
  allEdges: Edge[];
  updateNodeConfig: (nodeId: string, data: object) => void;
  linkedPhoneDigits?: string;
  linkedPhoneLabel?: string;
}

const SettingsPanel = ({ selectedNode, allNodes, allEdges, updateNodeConfig, deleteNode, isOpen, onToggle, linkedPhoneDigits, linkedPhoneLabel }: SettingsPanelProps) => {
  if (!isOpen) {
    return (
      <div className="pointer-events-none absolute inset-y-0 right-0 z-20 flex items-center">
        <Button
          size="icon"
          onClick={onToggle}
          className="pointer-events-auto rounded-r-none shadow-lg"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  const nodeSettingsKey = selectedNode?.id ?? 'none';

  const nodeSettingsMap: { [key: string]: React.FC<NodeSettingsProps> } = {
    startNode: StartSettings, // Registrado
    textMessageNode: TextMessageSettings,
    mediaMessageNode: MediaMessageSettings,
    quickReplyNode: QuickReplySettings,
    listMessageNode: ListMessageSettings,
    captureInputNode: CaptureInputSettings,
    conditionNode: ConditionSettings,
    webhookNode: WebhookSettings,
    setVariableNode: SetVariableSettings,
    endNode: EndSettings,
    pollNode: PollSettings,
    contactNode: ContactSettings,
    locationNode: LocationSettings,
    firestoreReadWriteNode: PlaceholderSettings,
    delayNode: DelaySettings,
    catalogNode: PlaceholderSettings,
    productNode: PlaceholderSettings,
    kambanFlowsNode: kambanFlowsSettings,
    checkoutNode: CheckoutSettings,
    generativeAINode: GenerativeAISettings,
    transcriptionNode: TranscriptionSettings,
    sentimentAnalysisNode: SentimentAnalysisSettings,
    templateNode: TemplateSettings,
    humanHandoffNode: HumanHandoffSettings,
  };

  const NodeSpecificSettings = selectedNode && selectedNode.type && nodeSettingsMap[selectedNode.type] ? nodeSettingsMap[selectedNode.type] : null;

  return (
    <aside className={cn(
      "pointer-events-auto absolute inset-y-0 right-0 z-20 flex w-[min(520px,94vw)] flex-col border-l border-neutral-800/80 bg-neutral-950/95 p-6 text-white shadow-[-12px_0_40px_rgba(0,0,0,0.45)] backdrop-blur-md transition-transform duration-300 ease-in-out my-6 mr-4 rounded-l-2xl",
      isOpen ? "translate-x-0" : "translate-x-full"
    )}>
      <div className="flex items-center justify-between pb-2 flex-shrink-0 border-b border-neutral-800/50">
        <h3 className="text-[10px] font-black text-neutral-500 uppercase tracking-[0.2em]">CONFIGURACIÓN</h3>
        <Button variant="ghost" size="icon" onClick={onToggle} className="h-6 w-6 hover:bg-neutral-800 text-neutral-600 hover:text-white rounded-md">
          <ChevronRight className="h-3 w-3" />
        </Button>
      </div>

      {selectedNode ? (
        <div key={nodeSettingsKey} className="flex-grow flex flex-col mt-3 overflow-hidden min-h-0 relative">
          <div className="flex-grow overflow-y-auto space-y-4 pr-3 custom-scrollbar min-h-0 pb-4">
            <GeneralSettings node={selectedNode} allNodes={allNodes} updateNodeConfig={updateNodeConfig} />
            
            {NodeSpecificSettings && (
               <div className="w-full h-px bg-neutral-800/50 my-2" />
            )}
            
            {NodeSpecificSettings ? (
              selectedNode.type === 'startNode' ? (
                <StartSettings
                  node={selectedNode}
                  updateNodeConfig={updateNodeConfig}
                  linkedPhoneDigits={linkedPhoneDigits}
                  linkedPhoneLabel={linkedPhoneLabel}
                />
              ) : (
                <NodeSpecificSettings node={selectedNode} allNodes={allNodes} allEdges={allEdges} updateNodeConfig={updateNodeConfig} />
              )
            ) : (
              <p className="text-neutral-600 text-center py-6 text-[10px] font-bold uppercase tracking-wider">No additional settings.</p>
            )}
          </div>
          <div className="mt-auto pt-4 flex-shrink-0 border-t border-neutral-800/50">
            <Button variant="ghost" onClick={() => deleteNode(selectedNode.id)} className="w-full h-9 text-red-500/60 hover:text-red-400 hover:bg-red-500/10 text-[10px] font-black uppercase tracking-[0.2em] transition-all rounded-xl border border-transparent hover:border-red-500/20">
              <Trash2 className="mr-2 h-4 w-4" /> ELIMINAR NODO
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex-grow flex flex-col items-center justify-center p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-neutral-900 flex items-center justify-center border border-white/5">
            <Bot className="w-6 h-6 text-neutral-700" />
          </div>
          <p className="text-[10px] text-neutral-600 font-bold uppercase tracking-widest leading-relaxed">
            Select a node to <br /> consult configuration
          </p>
        </div>
      )}
    </aside>
  );
};

export default SettingsPanel;


