
import React, { useState, useEffect } from 'react';
import { Node } from 'reactflow';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Copy, Check, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

interface StartSettingsProps {
  node: Node;
  updateNodeConfig: (nodeId: string, data: object) => void;
  linkedPhoneDigits?: string;
  linkedPhoneLabel?: string;
}

export const StartSettings: React.FC<StartSettingsProps> = ({
  node,
  updateNodeConfig,
  linkedPhoneDigits,
  linkedPhoneLabel,
}) => {
  const [triggerPhrase, setTriggerPhrase] = useState(node.data.triggerPhrase || 'Hola, quiero más información');
  const [welcomeMessage, setWelcomeMessage] = useState(
    node.data.welcomeMessage || node.data.greeting || '¡Hola! ¿En qué puedo ayudarte?'
  );
  const [phoneNumber, setPhoneNumber] = useState(node.data.phoneNumber || linkedPhoneDigits || '');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!linkedPhoneDigits) return;
    const current = String(node.data.phoneNumber || '').replace(/\D/g, '');
    if (current === linkedPhoneDigits) return;
    setPhoneNumber(linkedPhoneDigits);
    updateNodeConfig(node.id, { ...node.data, phoneNumber: linkedPhoneDigits });
  }, [linkedPhoneDigits, node.id, node.data, updateNodeConfig]);

  const generateWaLink = () => {
    if (!phoneNumber) return '';
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    const encodedText = encodeURIComponent(triggerPhrase);
    return `https://wa.me/${cleanPhone}?text=${encodedText}`;
  };

  const waLink = generateWaLink();

  const handlePhraseChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPhrase = e.target.value;
    setTriggerPhrase(newPhrase);
    updateNodeConfig(node.id, { ...node.data, triggerPhrase: newPhrase });
  };

  const handleWelcomeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newWelcome = e.target.value;
    setWelcomeMessage(newWelcome);
    updateNodeConfig(node.id, { ...node.data, welcomeMessage: newWelcome });
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPhone = e.target.value.replace(/\D/g, '');
    setPhoneNumber(newPhone);
    updateNodeConfig(node.id, { ...node.data, phoneNumber: newPhone });
  };

  const copyToClipboard = async () => {
    if (!waLink) return;
    try {
      await navigator.clipboard.writeText(waLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('Enlace copiado al portapapeles');
    } catch {
      toast.error('No se pudo copiar el enlace.');
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Saludo inicial del bot</Label>
        <p className="text-xs text-neutral-400">
          Mensaje que envía el bot al iniciar. Cualquier mensaje del usuario (incluso &quot;.&quot;) activa el flujo.
        </p>
        <Input
          value={welcomeMessage}
          onChange={handleWelcomeChange}
          placeholder="Ej: ¡Hola! Bienvenido a UDreamms"
          className="bg-neutral-900 border-neutral-700"
        />
      </div>

      <div className="space-y-2">
        <Label>Texto del enlace wa.me (opcional)</Label>
        <p className="text-xs text-neutral-400">
          Solo prellena el link de WhatsApp. El usuario no necesita escribir esta frase exacta.
        </p>
        <Input
          value={triggerPhrase}
          onChange={handlePhraseChange}
          placeholder="Ej: Deseo mayor información"
          className="bg-neutral-900 border-neutral-700"
        />
      </div>

      <div className="space-y-2">
        <Label>Número de WhatsApp del bot</Label>
        <p className="text-xs text-neutral-400">
          {linkedPhoneLabel
            ? `Vinculado a ${linkedPhoneLabel}. Se actualiza al cambiar el número en la lista de bots.`
            : 'Número E.164 sin símbolos (solo dígitos).'}
        </p>
        <Input
          value={phoneNumber}
          onChange={handlePhoneChange}
          placeholder="Ej: 13858882799"
          type="tel"
          className="bg-neutral-900 border-neutral-700 font-mono"
        />
      </div>

      {phoneNumber && (
        <Card className="bg-neutral-900 border-neutral-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-white">Enlace Directo</CardTitle>
            <CardDescription className="text-xs text-neutral-400">
              Comparte este link. Al hacer clic, el usuario tendrá el mensaje listo para enviar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="p-2 bg-neutral-950 rounded border border-neutral-800 text-xs text-neutral-300 break-all select-all cursor-text">
              {waLink}
            </div>
            <div className="flex gap-2 mt-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 bg-neutral-800 border-neutral-700 hover:bg-neutral-700 text-white"
                onClick={copyToClipboard}
              >
                {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                {copied ? 'Copiado' : 'Copiar'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-neutral-400 hover:text-white"
                onClick={() => window.open(waLink, '_blank')}
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
