export type Role = "user" | "assistant";

export interface Reaction {
  emoji: string;
  mine: boolean;
}

export interface ToolRecord {
  id: string;
  name: string;
  args: unknown;
  result?: unknown;
  status: "running" | "ok" | "error";
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  ts: number;
  pending?: boolean;
  error?: string;
  reactions?: Reaction[];
  attachments?: Attachment[];
  voice?: { url: string; duration: number; transcript?: string };
  tools?: ToolRecord[];
  status?: string;
  automation?: boolean;
  approval?: { id: string; title?: string; detail?: string; kind?: string } | null;
  approvalResolved?: boolean;
  onApprovalResolved?: (approved: boolean) => void;
  form?: FormRequest | null;
  edited?: boolean;
  revisions?: string[];
}

export interface FormField {
  label: string;
  type: "text" | "select" | "checkbox";
  options?: string[];
  placeholder?: string;
}

export interface FormRequest {
  id: string;
  title: string;
  fields: FormField[];
  resolved?: boolean;
  values?: Record<string, string | boolean>;
}

export interface Attachment {
  id: string;
  name: string;
  size: number;
  kind: "file" | "image" | "voice";
  url?: string;
  text?: string;
  filePath?: string;
}

export interface QueuedSend {
  id: string;
  text: string;
  attachments: Attachment[];
  ts: number;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  unread?: number;
  muted?: boolean;
  pinned?: boolean;
  botId?: string;
  automationId?: string;
  draft?: string;
  queued?: QueuedSend[];
}

export type BotFace = "orby" | "scout" | "forge" | "echo" | "tempo" | "sentry";

export interface Bot {
  id: string;
  name: string;
  emoji: string;
  color: string;
  /** Ember-face avatar (Dotlings); falls back to emoji when unset. */
  face?: BotFace;
  instructions: string;
  description?: string;
  knowledge: { name: string; text: string }[];
  createdAt: number;
  team?: boolean;
}

export interface Memory {
  id: string;
  text: string;
  createdAt: number;
  source: "agent" | "user";
}

export interface Automation {
  id: string;
  name: string;
  prompt: string;
  enabled: boolean;
  schedule: { type: "minutes" | "daily"; minutes?: number; time?: string };
  lastRun?: number | null;
  runImmediately?: boolean;
  botId?: string;
}

export interface ProviderCreds {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

export interface Settings {
  activeProvider: string;
  providers: Record<string, ProviderCreds>;
  approvalMode: "ask" | "askRisky" | "auto";
  agentTools: string[];
  bubbleColor: string;
  notifications: boolean;
  sounds: boolean;
  showOrb: boolean;
  userName: string;
  onboardingDone: boolean;
  language: string;
  queueOffline: boolean;
  plus: boolean;
  orbPosition?: { x: number; y: number };
  voice: { input: string; rate: number };
}

export interface UsageRow {
  day: string;
  turns: number;
  tokensIn: number;
  tokensOut: number;
}

export interface McpConfig {
  name: string;
  command: string;
  args: string[];
  enabled: boolean;
}

export interface McpState {
  configs: McpConfig[];
  connected: { name: string; tools: number }[];
}

export interface IntegrationState {
  connected: Record<string, boolean>;
}

export interface ProviderModel {
  id: string;
  name: string;
  note: string;
}

export interface ProviderInfo {
  id: string;
  name: string;
  url: string;
  keyUrl: string;
  models: ProviderModel[];
}

export interface AgentEvent {
  conversationId: string;
  type: "status" | "delta" | "toolCall" | "toolResult" | "approval" | "done";
  payload: any;
}

export const BUBBLE_COLORS: { id: string; label: string; css: string }[] = [
  { id: "default", label: "Default", css: "var(--sand-fill-bubble-user)" },
  { id: "blue", label: "Blue", css: "var(--sand-fill-bubble-user-blue)" },
  { id: "green", label: "Green", css: "var(--sand-fill-bubble-user-green)" },
  { id: "purple", label: "Purple", css: "var(--sand-fill-bubble-user-purple)" },
  { id: "orange", label: "Orange", css: "var(--sand-fill-bubble-user-orange)" },
  { id: "red", label: "Red", css: "var(--sand-fill-bubble-user-red)" },
  { id: "cyan", label: "Cyan", css: "var(--sand-fill-bubble-user-cyan)" },
  { id: "magenta", label: "Magenta", css: "var(--sand-fill-bubble-user-magenta)" },
  { id: "brown", label: "Brown", css: "var(--sand-fill-bubble-user-brown)" },
  { id: "yellow", label: "Yellow", css: "var(--sand-fill-bubble-user-yellow)" },
];

export const GREETINGS = [
  "Hi, what are we working on today?",
  "Hey, ready when you are.",
  "Hi, how is it going?",
  "Hey there, good to meet you.",
];

export const SUGGESTIONS = [
  "Search the web for today's AI news",
  "Run a command to check my disk usage",
  "Generate a photo of a mountain sunrise",
  "Read a file and summarize it",
];
