import agentPromptV1 from '../agents/prompt_v1.md?raw';
import capturePrompt from '../docs/agent/CAPTURE_PROMPT.md?raw';
import intentRouter from '../docs/agent/INTENT_ROUTER.md?raw';
import dedupPolicy from '../docs/agent/DEDUP_POLICY.md?raw';
import paraRules from '../docs/agent/PARA_RULES.md?raw';
import fewShotsTh from '../docs/agent/FEW_SHOTS_TH.md?raw';
import aiRoutingRules from '../docs/AI_ROUTING_RULES.md?raw';
import heartbeatGuide from '../docs/HEARTBEAT.md?raw';
import handoffProtocol from '../docs/AGENT_HANDOFF_PROTOCOL.md?raw';
import executionRoadmap from '../docs/EXECUTION_ROADMAP.md?raw';
import implementationState from '../docs/IMPLEMENTATION_STATE.md?raw';
import nextSessionTuning from '../docs/NEXT_SESSION_TUNING.md?raw';
import thailandPulseWebMcp from '../docs/THAILAND_PULSE_WEB_MCP.md?raw';
import brainManual from '../JAYS_BRAIN_MANUAL.md?raw';

export interface BuiltinAiConfigDoc {
  id: string;
  title: string;
  section: 'Prompt' | 'Policy' | 'Workflow' | 'Guide';
  path: string;
  content: string;
}

export const BUILTIN_AI_CONFIG_DOCS: BuiltinAiConfigDoc[] = [
  {
    id: 'agent-prompt-v1',
    title: 'Agent Prompt v1',
    section: 'Prompt',
    path: 'agents/prompt_v1.md',
    content: agentPromptV1
  },
  {
    id: 'capture-prompt',
    title: 'Capture Prompt',
    section: 'Prompt',
    path: 'docs/agent/CAPTURE_PROMPT.md',
    content: capturePrompt
  },
  {
    id: 'intent-router',
    title: 'Intent Router',
    section: 'Policy',
    path: 'docs/agent/INTENT_ROUTER.md',
    content: intentRouter
  },
  {
    id: 'dedup-policy',
    title: 'Dedup Policy',
    section: 'Policy',
    path: 'docs/agent/DEDUP_POLICY.md',
    content: dedupPolicy
  },
  {
    id: 'para-rules',
    title: 'PARA Rules',
    section: 'Policy',
    path: 'docs/agent/PARA_RULES.md',
    content: paraRules
  },
  {
    id: 'few-shots-th',
    title: 'Few Shots TH',
    section: 'Prompt',
    path: 'docs/agent/FEW_SHOTS_TH.md',
    content: fewShotsTh
  },
  {
    id: 'ai-routing-rules',
    title: 'AI Routing Rules',
    section: 'Workflow',
    path: 'docs/AI_ROUTING_RULES.md',
    content: aiRoutingRules
  },
  {
    id: 'heartbeat-guide',
    title: 'Heartbeat Guide',
    section: 'Workflow',
    path: 'docs/HEARTBEAT.md',
    content: heartbeatGuide
  },
  {
    id: 'agent-handoff-protocol',
    title: 'Agent Handoff Protocol',
    section: 'Guide',
    path: 'docs/AGENT_HANDOFF_PROTOCOL.md',
    content: handoffProtocol
  },
  {
    id: 'execution-roadmap',
    title: 'Execution Roadmap',
    section: 'Workflow',
    path: 'docs/EXECUTION_ROADMAP.md',
    content: executionRoadmap
  },
  {
    id: 'implementation-state',
    title: 'Implementation State',
    section: 'Workflow',
    path: 'docs/IMPLEMENTATION_STATE.md',
    content: implementationState
  },
  {
    id: 'next-session-tuning',
    title: 'Next Session Tuning',
    section: 'Workflow',
    path: 'docs/NEXT_SESSION_TUNING.md',
    content: nextSessionTuning
  },
  {
    id: 'thailand-pulse-web-mcp',
    title: 'Web MCP Research',
    section: 'Guide',
    path: 'docs/THAILAND_PULSE_WEB_MCP.md',
    content: thailandPulseWebMcp
  },
  {
    id: 'brain-manual',
    title: 'PARA Brain Manual',
    section: 'Guide',
    path: 'JAYS_BRAIN_MANUAL.md',
    content: brainManual
  }
];
