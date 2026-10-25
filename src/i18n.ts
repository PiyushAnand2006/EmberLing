// i18n — Lingui-style catalogs condensed to the app chrome. The original
// ships 34 locales; these cover the visible surface strings.
export const LANGUAGES = [
  { id: "en", label: "English" },
  { id: "es", label: "Español" },
  { id: "fr", label: "Français" },
  { id: "de", label: "Deutsch" },
  { id: "pt", label: "Português" },
  { id: "hi", label: "हिन्दी" },
  { id: "zh-CN", label: "简体中文" },
  { id: "ja", label: "日本語" },
];

type Dict = Record<string, string>;

const en: Dict = {
  newChat: "New chat",
  searchChats: "Search chats",
  chats: "Chats",
  pinned: "Pinned",
  noConversations: "No conversations yet",
  bots: "Bots",
  memories: "Memories",
  automations: "Automations",
  integrations: "Integrations",
  settings: "Settings",
  askAnything: "Ask anything",
  send: "Send",
  stop: "Stop",
  working: "Working",
  general: "General",
  account: "Account",
  notifications: "Notifications",
  appearance: "Appearance",
  voice: "Voice",
  about: "About",
  usage: "Usage",
  mcpServers: "MCP servers",
  approve: "Approve",
  decline: "Decline",
  waitingForYou: "Waiting for you",
  quit: "Quit Emberling",
  language: "Language",
};

const catalogs: Record<string, Dict> = {
  en,
  es: {
    ...en, newChat: "Nuevo chat", searchChats: "Buscar chats", chats: "Chats", pinned: "Fijados",
    noConversations: "Aún no hay conversaciones", bots: "Bots", memories: "Memorias", automations: "Automatizaciones",
    integrations: "Integraciones", settings: "Ajustes", askAnything: "Pregunta lo que quieras", send: "Enviar",
    stop: "Detener", working: "Trabajando", general: "General", account: "Cuenta", notifications: "Notificaciones",
    appearance: "Apariencia", voice: "Voz", about: "Acerca de", usage: "Uso", mcpServers: "Servidores MCP",
    approve: "Aprobar", decline: "Rechazar", waitingForYou: "Esperándote", language: "Idioma",
  },
  fr: {
    ...en, newChat: "Nouvelle discussion", searchChats: "Rechercher", chats: "Discussions", pinned: "Épinglés",
    noConversations: "Aucune discussion", bots: "Bots", memories: "Souvenirs", automations: "Automatisations",
    integrations: "Intégrations", settings: "Paramètres", askAnything: "Posez votre question", send: "Envoyer",
    stop: "Arrêter", working: "En cours", general: "Général", account: "Compte", notifications: "Notifications",
    appearance: "Apparence", voice: "Voix", about: "À propos", usage: "Utilisation", mcpServers: "Serveurs MCP",
    approve: "Approuver", decline: "Refuser", waitingForYou: "On vous attend", language: "Langue",
  },
  de: {
    ...en, newChat: "Neuer Chat", searchChats: "Chats suchen", chats: "Chats", pinned: "Angepinnt",
    noConversations: "Noch keine Unterhaltungen", bots: "Bots", memories: "Erinnerungen", automations: "Automatisierungen",
    integrations: "Integrationen", settings: "Einstellungen", askAnything: "Frag mich alles", send: "Senden",
    stop: "Stopp", working: "Arbeite", general: "Allgemein", account: "Konto", notifications: "Hinweise",
    appearance: "Erscheinungsbild", voice: "Sprache", about: "Über", usage: "Nutzung", mcpServers: "MCP-Server",
    approve: "Genehmigen", decline: "Ablehnen", waitingForYou: "Warte auf dich", language: "Sprache",
  },
  pt: {
    ...en, newChat: "Nova conversa", searchChats: "Pesquisar conversas", chats: "Conversas", pinned: "Fixadas",
    noConversations: "Ainda sem conversas", bots: "Bots", memories: "Memórias", automations: "Automações",
    integrations: "Integrações", settings: "Ajustes", askAnything: "Pergunte qualquer coisa", send: "Enviar",
    stop: "Parar", working: "Trabalhando", general: "Geral", account: "Conta", notifications: "Notificações",
    appearance: "Aparência", voice: "Voz", about: "Sobre", usage: "Uso", mcpServers: "Servidores MCP",
    approve: "Aprovar", decline: "Recusar", waitingForYou: "Esperando você", language: "Idioma",
  },
  hi: {
    ...en, newChat: "नई चैट", searchChats: "चैट खोजें", chats: "चैट", pinned: "पिन किए",
    noConversations: "अभी कोई बातचीत नहीं", bots: "बॉट्स", memories: "यादें", automations: "ऑटोमेशन",
    integrations: "इंटीग्रेशन", settings: "सेटिंग्स", askAnything: "कुछ भी पूछें", send: "भेजें",
    stop: "रोकें", working: "काम कर रहा हूँ", general: "सामान्य", account: "खाता", notifications: "सूचनाएँ",
    appearance: "रूप", voice: "आवाज़", about: "परिचय", usage: "उपयोग", mcpServers: "MCP सर्वर",
    approve: "स्वीकृत", decline: "अस्वीकृत", waitingForYou: "आपका इंतज़ार", language: "भाषा",
  },
  "zh-CN": {
    ...en, newChat: "新聊天", searchChats: "搜索聊天", chats: "聊天", pinned: "已置顶",
    noConversations: "还没有对话", bots: "机器人", memories: "记忆", automations: "自动化",
    integrations: "集成", settings: "设置", askAnything: "随便问", send: "发送",
    stop: "停止", working: "正在处理", general: "通用", account: "账户", notifications: "通知",
    appearance: "外观", voice: "语音", about: "关于", usage: "用量", mcpServers: "MCP 服务器",
    approve: "批准", decline: "拒绝", waitingForYou: "等你输入", language: "语言",
  },
  ja: {
    ...en, newChat: "新しいチャット", searchChats: "チャットを検索", chats: "チャット", pinned: "ピン留め",
    noConversations: "会話はまだありません", bots: "ボット", memories: "メモリー", automations: "オートメーション",
    integrations: "連携", settings: "設定", askAnything: "何でも聞いて", send: "送信",
    stop: "停止", working: "処理中", general: "全般", account: "アカウント", notifications: "通知",
    appearance: "外観", voice: "音声", about: "情報", usage: "使用量", mcpServers: "MCP サーバー",
    approve: "承認", decline: "却下", waitingForYou: "入力待ち", language: "言語",
  },
};

export function t(lang: string, key: keyof typeof en): string {
  return (catalogs[lang] || en)[key] || en[key] || String(key);
}
