import * as nodeComponents from './CustomNodes';
import CustomEdge from './CustomEdge';

export const nodeTypes = {
    startNode: nodeComponents.StartNode,
    endNode: nodeComponents.EndNode,
    textMessageNode: nodeComponents.TextMessageNode,
    mediaMessageNode: nodeComponents.MediaMessageNode,
    quickReplyNode: nodeComponents.QuickReplyNode,
    listMessageNode: nodeComponents.ListMessageNode,
    pollNode: nodeComponents.PollNode,
    contactNode: nodeComponents.ContactNode,
    locationNode: nodeComponents.LocationNode,
    captureInputNode: nodeComponents.CaptureInputNode,
    conditionNode: nodeComponents.ConditionNode,
    setVariableNode: nodeComponents.SetVariableNode,
    webhookNode: nodeComponents.WebhookNode,
    firestoreReadWriteNode: nodeComponents.FirestoreReadWriteNode,
    delayNode: nodeComponents.DelayNode,
    catalogNode: nodeComponents.CatalogNode,
    productNode: nodeComponents.ProductNode,
    kambanFlowsNode: nodeComponents.kambanFlowsNode,
    checkoutNode: nodeComponents.CheckoutNode,
    generativeAINode: nodeComponents.GenerativeAINode,
    transcriptionNode: nodeComponents.TranscriptionNode,
    sentimentAnalysisNode: nodeComponents.SentimentAnalysisNode,
    templateNode: nodeComponents.TemplateNode,
    humanHandoffNode: nodeComponents.HumanHandoffNode,
};

export const edgeTypes = {
    custom: CustomEdge,
};
