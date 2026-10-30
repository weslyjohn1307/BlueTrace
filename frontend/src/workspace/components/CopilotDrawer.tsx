import React from 'react';
import { AskTheDrawingDrawer, type AskTheDrawingDrawerProps } from './AskTheDrawingDrawer';

export type CopilotDrawerProps = AskTheDrawingDrawerProps;

/**
 * BlueTraceAI Conversational Copilot Drawer.
 * Powered by muse-wonder-1.0 reasoning and deterministic TakeoffStore grounding.
 */
export const CopilotDrawer: React.FC<CopilotDrawerProps> = (props) => {
  return <AskTheDrawingDrawer {...props} />;
};

export default CopilotDrawer;
