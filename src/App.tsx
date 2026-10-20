import React, { useState, useEffect } from 'react';
import {
  Smartphone,
  Database,
  Radio,
  Send,
  Users,
  Settings,
  Terminal,
  ShieldCheck,
  RefreshCw,
  Copy,
  Check,
  AlertCircle,
  ChevronRight,
  Zap,
  Clock,
  LogOut,
  Server,
  Sparkles,
  Info,
  ListOrdered,
  UserPlus,
  Trash2,
  RotateCcw,
  Shield,
  HelpCircle,
  MessageSquare,
  Globe,
  Link2,
  X,
  Menu,
  Activity,
  Layers,
} from 'lucide-react';
import { PWAInstallButton } from './components/PWAInstallButton';
import { OfflineIndicator } from './components/OfflineIndicator';

interface BotStatus {
  status: 'disconnected' | 'connecting' | 'awaiting_code' | 'connected' | 'logged_out';
  isConnecting: boolean;
  pairingCode: string | null;
  pairingPhone: string | null;
  pairingCodeAgeSeconds: number | null;
  userJid: string | null;
  userName: string | null;
  isDatabaseConnected: boolean;
  storedKeysCount?: number;
  reconnectAttempts: number;
  uptimeSeconds: number;
  stats: {
    totalMessagesTagged: number;
    totalBroadcastsSent: number;
    totalStatusesViewed?: number;
    totalStatusesReacted?: number;
  };
  config: {
    sessionId: string;
    botName?: string;
    autoTagEnabled: boolean;
    autoTagTrigger: 'all' | 'keyword';
    autoTagKeyword: string;
    cooldownSeconds: number;
    mentionFormat: 'standard' | 'compact' | 'announcement' | 'silent';
    silentTagEnabled?: boolean;
    statusAutoView?: boolean;
    statusAutoReact?: boolean;
    statusReactEmoji?: string;
  };
}

interface ActivityLog {
  id: string;
  timestamp: string;
  type: 'info' | 'tag' | 'broadcast' | 'connection' | 'error';
  message: string;
  details?: Record<string, any>;
}

interface GroupSummary {
  id: string;
  subject: string;
  participantCount: number;
  creation?: number;
  desc?: string;
}

interface AdminItem {
  jid: string;
  name: string;
  role: 'superadmin' | 'admin' | 'moderator';
  added_by: string;
  can_broadcast: boolean;
  can_tagall: boolean;
  can_manage_admins: boolean;
  created_at: string;
}

interface QueueJobItem {
  id: string;
  data: {
    groupJid: string;
    message: string;
    senderJid?: string;
    requestedAt: string;
  };
  status: 'waiting' | 'active' | 'completed' | 'failed';
  attemptsMade: number;
  maxAttempts: number;
  result?: {
    recipientCount: number;
    groupSubject: string;
    durationMs: number;
  };
  failedReason?: string;
  createdAt: string;
  finishedAt?: string;
}

interface QueueStats {
  mode: string;
  isRedisConnected: boolean;
  queueLength: number;
  counts: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    total: number;
  };
}

const COUNTRY_OPTIONS = [
  { code: '+234', flag: '🇳🇬', name: 'Nigeria', sample: '8012345678' },
  { code: '+1', flag: '🇺🇸', name: 'USA / Canada', sample: '4155552671' },
  { code: '+44', flag: '🇬🇧', name: 'United Kingdom', sample: '7911123456' },
  { code: '+233', flag: '🇬🇭', name: 'Ghana', sample: '241234567' },
  { code: '+254', flag: '🇰🇪', name: 'Kenya', sample: '712345678' },
  { code: '+27', flag: '🇿🇦', name: 'South Africa', sample: '821234567' },
  { code: '+91', flag: '🇮🇳', name: 'India', sample: '9876543210' },
  { code: '+971', flag: '🇦🇪', name: 'UAE', sample: '501234567' },
  { code: '+49', flag: '🇩🇪', name: 'Germany', sample: '15112345678' },
  { code: '+33', flag: '🇫🇷', name: 'France', sample: '612345678' },
  { code: '+55', flag: '🇧🇷', name: 'Brazil', sample: '11987654321' },
  { code: '+61', flag: '🇦🇺', name: 'Australia', sample: '412345678' },
  { code: '+966', flag: '🇸🇦', name: 'Saudi Arabia', sample: '501234567' },
  { code: '+20', flag: '🇪🇬', name: 'Egypt', sample: '1001234567' },
  { code: '+92', flag: '🇵🇰', name: 'Pakistan', sample: '3001234567' },
  { code: '+62', flag: '🇮🇩', name: 'Indonesia', sample: '8123456789' },
  { code: '+60', flag: '🇲🇾', name: 'Malaysia', sample: '123456789' },
  { code: '+63', flag: '🇵🇭', name: 'Philippines', sample: '9171234567' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<
    'pairing' | 'autotag' | 'queue' | 'admins' | 'commands' | 'broadcast' | 'groups' | 'database' | 'deployment' | 'logs'
  >('pairing');
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [admins, setAdmins] = useState<AdminItem[]>([]);
  const [queueStats, setQueueStats] = useState<QueueStats | null>(null);
  const [queueJobs, setQueueJobs] = useState<QueueJobItem[]>([]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleTabSelect = (
    tabId: 'pairing' | 'autotag' | 'queue' | 'admins' | 'commands' | 'broadcast' | 'groups' | 'database' | 'deployment' | 'logs'
  ) => {
    setActiveTab(tabId);
    setMobileMenuOpen(false);
    if (tabId === 'groups') fetchGroups();
    if (tabId === 'admins') fetchAdmins();
    if (tabId === 'queue') fetchQueue();
  };
  const [countryCode, setCountryCode] = useState('+234');
  const [phoneInput, setPhoneInput] = useState('');
  const [pairingLoading, setPairingLoading] = useState(false);
  const [pairingError, setPairingError] = useState<string | null>(null);

  // Broadcast state
  const [broadcastJid, setBroadcastJid] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('Important announcement to all group members!');
  const [broadcastSender, setBroadcastSender] = useState('');
  const [broadcastLoading, setBroadcastLoading] = useState(false);
  const [broadcastResponse, setBroadcastResponse] = useState<any>(null);
  const [broadcastError, setBroadcastError] = useState<string | null>(null);

  // Admin management state
  const [newAdminPhone, setNewAdminPhone] = useState('');
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminRole, setNewAdminRole] = useState<'admin' | 'superadmin' | 'moderator'>('admin');
  const [adminActionLoading, setAdminActionLoading] = useState(false);

  // Bot Identity & Branding state
  const [botName, setBotName] = useState('GGD META AI');
  const [showBotNameModal, setShowBotNameModal] = useState(false);
  const [botNameInput, setBotNameInput] = useState('GGD META AI');
  const [botNameLoading, setBotNameLoading] = useState(false);
  const [botNameSuccess, setBotNameSuccess] = useState(false);

  // Broadcast state additions
  const [broadcastSilent, setBroadcastSilent] = useState(false);

  // Auto-Tag & Automation Settings state
  const [autoTagEnabled, setAutoTagEnabled] = useState(true);
  const [autoTagTrigger, setAutoTagTrigger] = useState<'all' | 'keyword'>('all');
  const [autoTagKeyword, setAutoTagKeyword] = useState('.everyone');
  const [cooldownSeconds, setCooldownSeconds] = useState(3);
  const [mentionFormat, setMentionFormat] = useState<'announcement' | 'standard' | 'compact' | 'silent'>('announcement');
  const [silentTagEnabled, setSilentTagEnabled] = useState(false);
  const [statusAutoView, setStatusAutoView] = useState(true);
  const [statusAutoReact, setStatusAutoReact] = useState(true);
  const [statusReactEmoji, setStatusReactEmoji] = useState('❤️');
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Schema state
  const [schemaText, setSchemaText] = useState<string>('');

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  // Backend URL configuration (useful when frontend is hosted on Vercel and backend runs on Cloud Run / Render)
  const [backendUrl, setBackendUrl] = useState<string>(() => {
    return localStorage.getItem('baileys_backend_url') || import.meta.env.VITE_BACKEND_URL || '';
  });
  const [showBackendModal, setShowBackendModal] = useState(false);
  const [customUrlInput, setCustomUrlInput] = useState(backendUrl);
  const [pingTestStatus, setPingTestStatus] = useState<{ testing: boolean; message: string | null; success?: boolean }>({ testing: false, message: null });

  /**
   * Universal, safe API Fetch wrapper that NEVER throws SyntaxError: Unexpected token
   * Safely reads text, parses JSON with try/catch, and provides diagnostic context.
   */
  const safeApiFetch = async (path: string, options?: RequestInit): Promise<any> => {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const targetUrl = backendUrl ? `${backendUrl.replace(/\/+$/, '')}${cleanPath}` : cleanPath;

    try {
      const res = await fetch(targetUrl, options);
      const rawText = await res.text();
      let json: any = null;
      try {
        json = rawText ? JSON.parse(rawText) : null;
      } catch {
        // Response was not JSON
      }

      if (json && typeof json === 'object') {
        if (!res.ok && res.status !== 202) {
          throw new Error(json.error || json.message || `Server responded with status ${res.status}`);
        }
        return json;
      }

      // Handle non-JSON HTML error pages from Vercel / serverless
      if (rawText.includes('The page could not be found') || res.status === 404) {
        throw new Error(
          'Endpoint not found (404). If deployed on Vercel, please connect your persistent Cloud Run or Render backend in the header.'
        );
      }
      if (rawText.includes('A server error') || res.status === 500) {
        throw new Error(
          'Vercel Serverless Function error (500). Baileys WhatsApp requires a persistent WebSocket backend. Connect your live Cloud Run URL in the header.'
        );
      }
      if (!res.ok && res.status !== 202) {
        const cleanMsg = rawText.replace(/<[^>]*>/g, '').trim().slice(0, 140);
        throw new Error(cleanMsg || `Server responded with status ${res.status}`);
      }

      return { success: true, text: rawText };
    } catch (err: any) {
      throw new Error(err.message || 'Network communication error');
    }
  };

  const testBackendConnection = async (urlToTest: string) => {
    setPingTestStatus({ testing: true, message: 'Testing backend connection...' });
    try {
      const cleanUrl = urlToTest.trim().replace(/\/+$/, '');
      const testPath = cleanUrl ? `${cleanUrl}/api/status` : '/api/status';
      const startTime = Date.now();
      const res = await fetch(testPath);
      const latency = Date.now() - startTime;
      const rawText = await res.text();
      let d: any = null;
      try {
        d = rawText ? JSON.parse(rawText) : null;
      } catch {
        // Not JSON
      }

      if (d && d.status) {
        setPingTestStatus({
          testing: false,
          success: true,
          message: `Connected successfully (${latency}ms)! Status: ${d.status.toUpperCase()} | Cloud SQL: ${d.isDatabaseConnected ? 'Active' : 'In-Memory Fallback'}`,
        });
      } else {
        const cleanMsg = rawText.replace(/<[^>]*>/g, '').trim().slice(0, 100);
        setPingTestStatus({
          testing: false,
          success: false,
          message: `Server returned non-JSON (${res.status}): ${cleanMsg || 'Unknown response'}`,
        });
      }
    } catch (e: any) {
      setPingTestStatus({
        testing: false,
        success: false,
        message: `Connection failed: ${e.message}`,
      });
    }
  };

  const saveBackendUrl = (newUrl: string) => {
    const trimmed = newUrl.trim().replace(/\/+$/, '');
    setBackendUrl(trimmed);
    localStorage.setItem('baileys_backend_url', trimmed);
    setShowBackendModal(false);
    fetchStatus();
    fetchLogs();
    fetchQueue();
    fetchAdmins();
  };

  const fetchStatus = async () => {
    try {
      const data = await safeApiFetch('/api/status');
      if (data && data.status) {
        setStatus(data);
        if (data.config) {
          if (data.config.botName) {
            setBotName(data.config.botName);
          }
          if (typeof data.config.autoTagEnabled === 'boolean') {
            setAutoTagEnabled(data.config.autoTagEnabled);
          }
          if (data.config.autoTagTrigger) {
            setAutoTagTrigger(data.config.autoTagTrigger);
          }
          if (data.config.autoTagKeyword) {
            setAutoTagKeyword(data.config.autoTagKeyword);
          }
          if (typeof data.config.cooldownSeconds === 'number') {
            setCooldownSeconds(data.config.cooldownSeconds);
          }
          if (data.config.mentionFormat) {
            setMentionFormat(data.config.mentionFormat);
          }
          if (typeof data.config.silentTagEnabled === 'boolean') {
            setSilentTagEnabled(data.config.silentTagEnabled);
          }
          if (typeof data.config.statusAutoView === 'boolean') {
            setStatusAutoView(data.config.statusAutoView);
          }
          if (typeof data.config.statusAutoReact === 'boolean') {
            setStatusAutoReact(data.config.statusAutoReact);
          }
          if (data.config.statusReactEmoji) {
            setStatusReactEmoji(data.config.statusReactEmoji);
          }
        }
      }
    } catch (e) {
      console.warn('Status poll:', e);
    }
  };

  const fetchQueue = async () => {
    try {
      const [dStats, dJobs] = await Promise.all([
        safeApiFetch('/api/queue/stats'),
        safeApiFetch('/api/queue/jobs'),
      ]);
      if (dStats?.stats) setQueueStats(dStats.stats);
      if (dJobs?.jobs) setQueueJobs(dJobs.jobs);
    } catch (e) {
      console.warn('Queue poll:', e);
    }
  };

  const fetchAdmins = async () => {
    try {
      const data = await safeApiFetch('/api/admins');
      if (data?.admins) setAdmins(data.admins);
    } catch (e) {
      console.warn('Admins poll:', e);
    }
  };

  const fetchLogs = async () => {
    try {
      const data = await safeApiFetch('/api/logs');
      if (data?.logs) setLogs(data.logs);
    } catch (e) {
      console.warn('Logs poll:', e);
    }
  };

  const fetchGroups = async () => {
    try {
      const data = await safeApiFetch('/api/groups');
      if (data?.groups) setGroups(data.groups);
    } catch (e) {
      console.warn('Groups poll:', e);
    }
  };

  const fetchSchema = async () => {
    try {
      const data = await safeApiFetch('/api/schema');
      if (typeof data === 'string') setSchemaText(data);
      else if (data?.text) setSchemaText(data.text);
    } catch (e) {
      console.warn('Schema fetch:', e);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchLogs();
    fetchSchema();
    fetchQueue();
    fetchAdmins();
    const interval = setInterval(() => {
      fetchStatus();
      fetchLogs();
      fetchQueue();
    }, 3000);
    return () => clearInterval(interval);
  }, [backendUrl]);

  const handleRequestPairingCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneInput) {
      setPairingError('Please enter your phone number');
      return;
    }
    setPairingLoading(true);
    setPairingError(null);
    try {
      const cleanLocal = phoneInput.replace(/[^0-9]/g, '').replace(/^0+/, '');
      const fullPhone = `${countryCode.replace(/[^0-9]/g, '')}${cleanLocal}`;

      const data = await safeApiFetch('/api/pairing-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: fullPhone }),
      });
      if (!data?.success) {
        throw new Error(data?.error || 'Failed to request pairing code');
      }
      fetchStatus();
      fetchLogs();
    } catch (err: any) {
      setPairingError(err.message);
    } finally {
      setPairingLoading(false);
    }
  };

  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastJid || !broadcastMessage) {
      setBroadcastError('Please provide both a group JID and message text.');
      return;
    }
    setBroadcastLoading(true);
    setBroadcastError(null);
    setBroadcastResponse(null);
    try {
      const data = await safeApiFetch('/send-broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupJid: broadcastJid.trim(),
          message: broadcastMessage.trim(),
          senderJid: broadcastSender.trim() || undefined,
        }),
      });
      setBroadcastResponse(data);
      fetchQueue();
      fetchLogs();
    } catch (err: any) {
      setBroadcastError(err.message);
    } finally {
      setBroadcastLoading(false);
    }
  };

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdminPhone) return;
    setAdminActionLoading(true);
    try {
      await safeApiFetch('/api/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jid: newAdminPhone,
          name: newAdminName || `Admin (${newAdminPhone})`,
          role: newAdminRole,
        }),
      });
      setNewAdminPhone('');
      setNewAdminName('');
      fetchAdmins();
      fetchLogs();
    } catch (err: any) {
      console.error(err);
    } finally {
      setAdminActionLoading(false);
    }
  };

  const handleDeleteAdmin = async (jid: string) => {
    if (!confirm(`Revoke admin privileges for ${jid}?`)) return;
    try {
      await safeApiFetch(`/api/admins/${encodeURIComponent(jid)}`, { method: 'DELETE' });
      fetchAdmins();
      fetchLogs();
    } catch (err) {
      console.error(err);
    }
  };

  const handleRetryJob = async (jobId: string) => {
    try {
      await safeApiFetch(`/api/queue/retry/${jobId}`, { method: 'POST' });
      fetchQueue();
      fetchLogs();
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateBotName = async (newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setBotNameLoading(true);
    try {
      await safeApiFetch('/api/bot-name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      setBotName(trimmed);
      setBotNameSuccess(true);
      setTimeout(() => {
        setBotNameSuccess(false);
        setShowBotNameModal(false);
      }, 1500);
      fetchStatus();
      fetchLogs();
    } catch (err: any) {
      console.error('Failed to update bot name:', err);
    } finally {
      setBotNameLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    try {
      await safeApiFetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botName,
          autoTagEnabled,
          autoTagTrigger,
          autoTagKeyword,
          cooldownSeconds,
          mentionFormat,
          silentTagEnabled,
          statusAutoView,
          statusAutoReact,
          statusReactEmoji,
        }),
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      fetchStatus();
    } catch (err) {
      console.error(err);
    }
  };

  const handleLogout = async () => {
    if (!confirm('Are you sure you want to disconnect and clear your session from PostgreSQL?')) {
      return;
    }
    try {
      await safeApiFetch('/api/session/clear', { method: 'POST' });
      fetchStatus();
      fetchLogs();
    } catch (e) {
      console.error(e);
    }
  };

  const formatUptime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  const menuCategories = [
    {
      title: 'CORE ENGINE',
      items: [
        {
          id: 'pairing',
          label: 'Pairing & Connection',
          icon: Smartphone,
          badge:
            status?.status === 'connected'
              ? 'Connected'
              : status?.status === 'awaiting_code'
              ? 'Code Ready'
              : status?.status === 'connecting'
              ? 'Connecting'
              : 'Disconnected',
          badgeColor:
            status?.status === 'connected'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              : status?.status === 'awaiting_code'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse'
              : 'bg-slate-800 text-slate-400 border border-slate-700',
        },
        {
          id: 'commands',
          label: 'WhatsApp Commands',
          icon: MessageSquare,
          badge: '8 cmds',
          badgeColor: 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30',
        },
        {
          id: 'groups',
          label: 'Group Explorer',
          icon: Users,
          badge: groups.length > 0 ? `${groups.length}` : null,
          badgeColor: 'bg-teal-500/20 text-teal-300 border border-teal-500/30',
        },
      ],
    },
    {
      title: 'AUTOMATION & QUEUE',
      items: [
        {
          id: 'queue',
          label: 'Message Queue (BullMQ)',
          icon: ListOrdered,
          badge: queueStats ? `${queueStats.queueLength}` : null,
          badgeColor: 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30',
        },
        {
          id: 'autotag',
          label: 'Auto-Tag Settings',
          icon: Zap,
          badge: autoTagEnabled ? 'Active' : 'Off',
          badgeColor: autoTagEnabled
            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
            : 'bg-rose-500/20 text-rose-300 border border-rose-500/30',
        },
        {
          id: 'broadcast',
          label: 'Broadcast API (POST)',
          icon: Send,
          badge: 'REST',
          badgeColor: 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30',
        },
      ],
    },
    {
      title: 'SYSTEM & CLOUD',
      items: [
        {
          id: 'admins',
          label: 'Admins & RBAC',
          icon: Shield,
          badge: admins.length > 0 ? `${admins.length}` : null,
          badgeColor: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
        },
        {
          id: 'database',
          label: 'Google Cloud SQL',
          icon: Database,
          badge: status?.isDatabaseConnected ? 'PostgreSQL' : 'In-Memory',
          badgeColor: status?.isDatabaseConnected
            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
            : 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
        },
        {
          id: 'deployment',
          label: 'Cloud Run Deploy',
          icon: Server,
          badge: 'Docker',
          badgeColor: 'bg-slate-700 text-slate-300 border border-slate-600',
        },
        {
          id: 'logs',
          label: 'Activity Logs',
          icon: Terminal,
          badge: logs.length > 0 ? `${logs.length}` : null,
          badgeColor: 'bg-slate-800 text-slate-400 border border-slate-700',
        },
      ],
    },
  ];

  const currentTabLabel =
    menuCategories.flatMap((c) => c.items).find((item) => item.id === activeTab)?.label || 'Overview';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex font-sans selection:bg-emerald-500/30 selection:text-emerald-300 antialiased">
      {/* ====================================================================== */}
      {/* DESKTOP SIDEBAR NAVIGATION                                             */}
      {/* ====================================================================== */}
      <aside className="hidden lg:flex flex-col w-72 xl:w-80 shrink-0 bg-slate-900/95 border-r border-slate-800/80 sticky top-0 h-screen z-30 shadow-2xl">
        {/* Brand Header */}
        <div className="p-4 border-b border-slate-800/80 bg-slate-900/50 backdrop-blur">
          <div className="flex items-center space-x-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-600 via-teal-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/25 ring-1 ring-white/20 shrink-0">
              <Radio className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center space-x-1.5">
                <h1 className="font-bold text-base text-white tracking-tight truncate">
                  {status?.config.botName || botName || 'GGD META AI'}
                </h1>
                <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                  Cloud SQL
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setBotNameInput(botName);
                  setShowBotNameModal(true);
                }}
                className="text-[11px] text-emerald-400 hover:text-emerald-300 font-medium flex items-center space-x-1 cursor-pointer transition-colors mt-0.5"
                title="Manage Bot Name"
              >
                <span>Manage Bot Name</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        {/* Navigation Categories */}
        <div className="flex-1 px-3 py-4 space-y-6 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
          {menuCategories.map((cat) => (
            <div key={cat.title}>
              <div className="px-3 mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                <span>{cat.title}</span>
              </div>
              <nav className="space-y-1">
                {cat.items.map((tab) => {
                  const Icon = tab.icon;
                  const active = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => handleTabSelect(tab.id as any)}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-medium rounded-xl transition-all cursor-pointer text-left group ${
                        active
                          ? 'bg-gradient-to-r from-emerald-500/20 via-teal-500/10 to-transparent text-emerald-300 border-l-3 border-emerald-400 font-semibold shadow-inner'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                      }`}
                    >
                      <div className="flex items-center space-x-3 min-w-0">
                        <Icon
                          className={`w-4 h-4 shrink-0 transition-colors ${
                            active ? 'text-emerald-400' : 'text-slate-400 group-hover:text-slate-300'
                          }`}
                        />
                        <span className="truncate">{tab.label}</span>
                      </div>
                      {tab.badge && (
                        <span
                          className={`px-2 py-0.5 text-[10px] font-semibold rounded-full shrink-0 ${tab.badgeColor}`}
                        >
                          {tab.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>
          ))}
        </div>

        {/* Sidebar Footer with PWA Install Card & Bot Session info */}
        <div className="p-3.5 border-t border-slate-800/80 space-y-3 bg-slate-900/40">
          {/* PWA In-App Install Card */}
          <PWAInstallButton variant="sidebar" />

          {/* Connected User / Session Card */}
          <div className="p-2.5 rounded-xl bg-slate-800/70 border border-slate-700/60 flex items-center justify-between">
            <div className="flex items-center space-x-2.5 min-w-0">
              <span
                className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                  status?.status === 'connected'
                    ? 'bg-emerald-400 animate-pulse shadow-sm shadow-emerald-400'
                    : status?.status === 'awaiting_code'
                    ? 'bg-amber-400 animate-ping'
                    : status?.status === 'connecting'
                    ? 'bg-blue-400 animate-pulse'
                    : 'bg-rose-400'
                }`}
              />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-200 truncate">
                  {status?.userName || (status?.userJid ? status.userJid.split('@')[0] : 'WhatsApp Bot')}
                </p>
                <p className="text-[10px] text-slate-400 truncate font-mono">
                  {status?.userJid || status?.config.sessionId}
                </p>
              </div>
            </div>
            {status?.status === 'connected' && (
              <button
                onClick={handleLogout}
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-700/60 transition cursor-pointer"
                title="Disconnect & Clear Session"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* ====================================================================== */}
      {/* MOBILE SLIDE-OVER DRAWER NAVIGATION                                     */}
      {/* ====================================================================== */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden animate-in fade-in duration-200">
          <div
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-80 max-w-[85vw] bg-slate-900 border-r border-slate-800 flex flex-col h-full z-10 shadow-2xl">
            {/* Mobile Drawer Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white">
                  <Radio className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="font-bold text-sm text-white truncate max-w-[170px]">
                    {status?.config.botName || botName || 'GGD META AI'}
                  </h2>
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setBotNameInput(botName);
                      setShowBotNameModal(true);
                    }}
                    className="text-[11px] text-emerald-400 hover:text-emerald-300 font-medium flex items-center space-x-0.5 cursor-pointer mt-0.5"
                  >
                    <span>Manage Name</span>
                    <ChevronRight className="w-2.5 h-2.5" />
                  </button>
                </div>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mobile Drawer Navigation list */}
            <div className="flex-1 px-3 py-4 space-y-6 overflow-y-auto">
              {menuCategories.map((cat) => (
                <div key={cat.title}>
                  <div className="px-3 mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {cat.title}
                  </div>
                  <nav className="space-y-1">
                    {cat.items.map((tab) => {
                      const Icon = tab.icon;
                      const active = activeTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          onClick={() => handleTabSelect(tab.id as any)}
                          className={`w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-medium rounded-xl transition-all cursor-pointer text-left ${
                            active
                              ? 'bg-gradient-to-r from-emerald-500/20 via-teal-500/10 to-transparent text-emerald-300 border-l-3 border-emerald-400 font-semibold'
                              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                          }`}
                        >
                          <div className="flex items-center space-x-3 min-w-0">
                            <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-emerald-400' : 'text-slate-400'}`} />
                            <span className="truncate">{tab.label}</span>
                          </div>
                          {tab.badge && (
                            <span
                              className={`px-2 py-0.5 text-[10px] font-semibold rounded-full shrink-0 ${tab.badgeColor}`}
                            >
                              {tab.badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </nav>
                </div>
              ))}
            </div>

            {/* Mobile Drawer Footer with PWA Install */}
            <div className="p-3 border-t border-slate-800 space-y-2">
              <PWAInstallButton variant="sidebar" />
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================== */}
      {/* MAIN CONTENT CONTAINER                                                 */}
      {/* ====================================================================== */}
      <div className="flex-1 flex flex-col min-w-0 pb-16 lg:pb-0">
        {/* Top Header Bar */}
        <header className="border-b border-slate-800/80 bg-slate-900/80 backdrop-blur sticky top-0 z-40">
          <div className="px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              {/* Mobile Menu Hamburger */}
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="lg:hidden p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition border border-slate-700/80 cursor-pointer"
                aria-label="Open Navigation Menu"
              >
                <Menu className="w-5 h-5" />
              </button>

              {/* Active Tab Breadcrumb / Title */}
              <div>
                <div className="flex items-center space-x-2">
                  <span className="hidden sm:inline text-xs text-slate-400">Dashboard /</span>
                  <h2 className="font-bold text-sm sm:text-base text-white tracking-tight flex items-center space-x-1.5">
                    <span>{currentTabLabel}</span>
                  </h2>
                </div>
              </div>
            </div>

            {/* Header Right Actions */}
            <div className="flex items-center space-x-2 sm:space-x-3">
              {/* Status Badge */}
              <div className="flex items-center space-x-2 px-2.5 sm:px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/80 text-xs">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    status?.status === 'connected'
                      ? 'bg-emerald-400 animate-pulse shadow-sm shadow-emerald-400'
                      : status?.status === 'awaiting_code'
                      ? 'bg-amber-400 animate-ping'
                      : status?.status === 'connecting'
                      ? 'bg-blue-400 animate-pulse'
                      : 'bg-rose-400'
                  }`}
                />
                <span className="font-medium capitalize text-slate-200 hidden xs:inline">
                  {status?.status === 'connected'
                    ? 'Connected'
                    : status?.status === 'awaiting_code'
                    ? 'Pairing Active'
                    : status?.status === 'connecting'
                    ? 'Connecting...'
                    : status?.status === 'logged_out'
                    ? 'Logged Out'
                    : 'Disconnected'}
                </span>
              </div>

              {/* Header PWA Install Button */}
              <PWAInstallButton variant="header" />

              {/* Backend URL & Credentials Hub Button */}
              <button
                onClick={() => {
                  setCustomUrlInput(backendUrl);
                  setShowBackendModal(true);
                }}
                className="flex items-center space-x-1.5 sm:space-x-2 px-2.5 sm:px-3 py-1.5 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 text-indigo-300 text-xs font-medium transition-colors cursor-pointer"
                title="Configure Backend Connection URL & Credentials"
              >
                <Globe className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span className="hidden md:inline text-slate-300">Backend:</span>
                <span className="font-mono text-white text-[11px] max-w-[110px] sm:max-w-[140px] truncate">
                  {backendUrl ? backendUrl.replace(/^https?:\/\//, '') : 'Same Origin (/api)'}
                </span>
              </button>

              {/* Refresh */}
              <button
                onClick={() => {
                  fetchStatus();
                  fetchLogs();
                  fetchQueue();
                  fetchAdmins();
                }}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors border border-slate-700 cursor-pointer"
                title="Refresh All"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex-1 w-full">
        {/* Quick Stats Grid */}
        {/* Quick Stats Grid (Mobile Responsive, No Out-of-Frame Overflow) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3.5 shadow-sm min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-400 truncate">Queue Backlog</span>
              <span className="p-1 rounded-lg bg-indigo-500/10 text-indigo-400">
                <ListOrdered className="w-3.5 h-3.5" />
              </span>
            </div>
            <div className="text-xl font-bold text-white mt-1.5 truncate">
              {queueStats?.queueLength || 0}
            </div>
            <span className="text-[10px] text-slate-500 mt-0.5 block truncate">{queueStats?.counts.completed || 0} completed</span>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3.5 shadow-sm min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-400 truncate">Cloud SQL Keys</span>
              <span className="p-1 rounded-lg bg-cyan-500/10 text-cyan-400">
                <Database className="w-3.5 h-3.5" />
              </span>
            </div>
            <div className="text-xl font-bold text-cyan-400 mt-1.5 truncate">
              {status?.storedKeysCount ?? 0}
            </div>
            <span className="text-[10px] text-slate-500 mt-0.5 block truncate">
              {status?.isDatabaseConnected ? 'PostgreSQL Persistent' : 'In-Memory Fallback'}
            </span>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3.5 shadow-sm min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-400 truncate">Status Stories</span>
              <span className="p-1 rounded-lg bg-rose-500/10 text-rose-400">
                <Sparkles className="w-3.5 h-3.5" />
              </span>
            </div>
            <div className="text-base sm:text-lg font-bold text-rose-300 mt-1.5 truncate flex items-center space-x-1">
              <span>👁️ {status?.stats.totalStatusesViewed || 0}</span>
              <span className="text-slate-500">|</span>
              <span>💖 {status?.stats.totalStatusesReacted || 0}</span>
            </div>
            <span className="text-[10px] text-slate-500 mt-0.5 block truncate">
              Auto-viewed &amp; reacted
            </span>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3.5 shadow-sm min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-400 truncate">Admins</span>
              <span className="p-1 rounded-lg bg-emerald-500/10 text-emerald-400">
                <Shield className="w-3.5 h-3.5" />
              </span>
            </div>
            <div className="text-xl font-bold text-white mt-1.5 truncate">
              {admins.length}
            </div>
            <span className="text-[10px] text-slate-500 mt-0.5 block truncate">bot_admins RBAC</span>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3.5 shadow-sm min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-400 truncate">Total Tagged</span>
              <span className="p-1 rounded-lg bg-emerald-500/10 text-emerald-400">
                <Zap className="w-3.5 h-3.5" />
              </span>
            </div>
            <div className="text-xl font-bold text-white mt-1.5 truncate">
              {status?.stats.totalMessagesTagged || 0}
            </div>
            <span className="text-[10px] text-slate-500 mt-0.5 block truncate">Auto-tag &amp; .tagall</span>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3.5 shadow-sm min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-400 truncate">Bot Uptime</span>
              <span className="p-1 rounded-lg bg-cyan-500/10 text-cyan-400">
                <Clock className="w-3.5 h-3.5" />
              </span>
            </div>
            <div className="text-xl font-bold text-white mt-1.5 truncate">
              {formatUptime(status?.uptimeSeconds || 0)}
            </div>
            <span className="text-[10px] text-slate-500 mt-0.5 block truncate">{status?.config.botName || 'GGD META AI'}</span>
          </div>
        </div>

        {/* TAB: COMMANDS DIRECTORY */}
        {activeTab === 'commands' && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <div className="flex items-center space-x-3 mb-4">
                <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">Interactive WhatsApp Commands</h2>
                  <p className="text-xs text-slate-400">
                    Optional commands for group moderation and admin tasks.
                  </p>
                </div>
              </div>

              {/* Automatic Mode Callout */}
              <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-xs text-emerald-200 mb-6 flex items-start space-x-3">
                <div className="p-1 rounded-lg bg-emerald-500/20 text-emerald-400 shrink-0 mt-0.5">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm">Automated Tagging Engine Active ({status?.config.botName || botName})</h3>
                  <p className="mt-1 text-slate-300">
                    <strong>You do NOT need to type <code>.tagall</code>!</strong> Every single message you (the owner) send in any group will automatically tag all group members immediately.
                  </p>
                  <p className="mt-1 text-slate-400 text-[11px]">
                    All interactive commands now use the <strong><code>.</code> (dot)</strong> prefix instead of <code>!</code>. The commands below provide manual control, silent tagging, RBAC admin tools, and bot name management.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                {[
                  {
                    cmd: '.tagall [announcement]',
                    desc: 'Instantly tags all group members with an announcement header. Verified against PostgreSQL bot_admins.',
                    badge: 'Admin Only',
                    badgeColor: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
                    example: '.tagall Team briefing in 5 minutes!',
                  },
                  {
                    cmd: '.silenttag [notice]',
                    desc: 'Silent Tagging System: Notifies all members silently on lock screens without printing an annoying wall of phone numbers.',
                    badge: 'Silent Mode',
                    badgeColor: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
                    example: '.silenttag Important update posted in files',
                  },
                  {
                    cmd: '.setbotname <newName>',
                    desc: 'Dynamically renames the bot and saves the new identity directly into PostgreSQL Cloud SQL.',
                    badge: 'Superadmin Only',
                    badgeColor: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
                    example: '.setbotname GGD META AI Pro',
                  },
                  {
                    cmd: '.help',
                    desc: 'Displays the complete interactive command center, user permission tier, and bot health.',
                    badge: 'All Members',
                    badgeColor: 'bg-slate-700/50 text-slate-300 border-slate-600',
                    example: '.help',
                  },
                  {
                    cmd: '.broadcast <groupJid> <msg>',
                    desc: 'Enqueues a mass announcement in the BullMQ queue for guaranteed background delivery.',
                    badge: 'Admin Only',
                    badgeColor: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
                    example: '.broadcast 120363024890123456@g.us Emergency notice',
                  },
                  {
                    cmd: '.admins',
                    desc: 'Lists authorized administrators retrieved live from the PostgreSQL bot_admins table.',
                    badge: 'All Members',
                    badgeColor: 'bg-slate-700/50 text-slate-300 border-slate-600',
                    example: '.admins',
                  },
                  {
                    cmd: '.addadmin <number> [name]',
                    desc: 'Grants administrator privileges to a phone number. Persisted in PostgreSQL.',
                    badge: 'Superadmin Only',
                    badgeColor: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
                    example: '.addadmin 14155552671 Alex Support',
                  },
                  {
                    cmd: '.deladmin <number or JID>',
                    desc: 'Revokes administrator privileges from a user in PostgreSQL.',
                    badge: 'Superadmin Only',
                    badgeColor: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
                    example: '.deladmin 14155552671',
                  },
                  {
                    cmd: '.status',
                    desc: 'Returns live bot status, active queue length, completed job counts, and uptime.',
                    badge: 'All Members',
                    badgeColor: 'bg-slate-700/50 text-slate-300 border-slate-600',
                    example: '.status',
                  },
                  {
                    cmd: '.ping',
                    desc: 'Tests bot socket connection responsiveness and roundtrip latency.',
                    badge: 'All Members',
                    badgeColor: 'bg-slate-700/50 text-slate-300 border-slate-600',
                    example: '.ping',
                  },
                ].map((item, idx) => (
                  <div key={idx} className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <code className="text-sm font-mono font-bold text-emerald-400">{item.cmd}</code>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${item.badgeColor}`}>
                          {item.badge}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mb-3">{item.desc}</p>
                    </div>
                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
                      <span className="text-slate-500">Example:</span>
                      <code className="text-[11px] text-slate-300 bg-slate-900 px-2 py-0.5 rounded font-mono">
                        {item.example}
                      </code>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB: MESSAGE QUEUE (BULLMQ) */}
        {activeTab === 'queue' && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                    <ListOrdered className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-white">Broadcast Message Queue &amp; Worker</h2>
                    <p className="text-xs text-slate-400">
                      Asynchronous job processor powered by BullMQ &amp; Redis (with in-memory worker fallback) to prevent WhatsApp rate limits.
                    </p>
                  </div>
                </div>
                <button
                  onClick={fetchQueue}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs border border-slate-700 flex items-center space-x-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Refresh Queue</span>
                </button>
              </div>

              {/* Queue Status Pills */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase">Waiting Jobs</span>
                  <div className="text-xl font-bold text-amber-400 mt-1">{queueStats?.counts.waiting || 0}</div>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase">Active Worker</span>
                  <div className="text-xl font-bold text-cyan-400 mt-1">{queueStats?.counts.active || 0}</div>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase">Completed</span>
                  <div className="text-xl font-bold text-emerald-400 mt-1">{queueStats?.counts.completed || 0}</div>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase">Failed (With Retries)</span>
                  <div className="text-xl font-bold text-rose-400 mt-1">{queueStats?.counts.failed || 0}</div>
                </div>
              </div>
            </div>

            {/* Jobs Stream */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300 mb-4">
                Recent Broadcast Jobs ({queueJobs.length})
              </h3>

              {queueJobs.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 bg-slate-950/60 rounded-xl border border-slate-800">
                  No jobs queued yet. Use the <strong>Broadcast API</strong> tab or send <strong>!broadcast</strong> in WhatsApp to queue jobs!
                </div>
              ) : (
                <div className="space-y-3 max-h-[500px] overflow-y-auto scrollbar-thin pr-1">
                  {queueJobs.map((job) => (
                    <div
                      key={job.id}
                      className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              job.status === 'completed'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                : job.status === 'failed'
                                ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                                : job.status === 'active'
                                ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 animate-pulse'
                                : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                            }`}
                          >
                            {job.status}
                          </span>
                          <span className="font-mono text-slate-400 font-bold">{job.id}</span>
                          <span className="text-slate-500">•</span>
                          <span className="font-mono text-cyan-300 truncate max-w-[200px]">{job.data.groupJid}</span>
                        </div>
                        <p className="text-slate-300 line-clamp-1 italic">&quot;{job.data.message}&quot;</p>
                        {job.failedReason && (
                          <p className="text-rose-400 text-[11px]">Error: {job.failedReason}</p>
                        )}
                        {job.result && (
                          <p className="text-emerald-400 text-[11px]">
                            Delivered to {job.result.recipientCount} members in &quot;{job.result.groupSubject}&quot; ({job.result.durationMs}ms)
                          </p>
                        )}
                      </div>

                      <div className="flex items-center space-x-3 shrink-0">
                        <span className="text-slate-500 text-[11px]">
                          Attempt {job.attemptsMade} / {job.maxAttempts}
                        </span>
                        {job.status === 'failed' && (
                          <button
                            onClick={() => handleRetryJob(job.id)}
                            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 flex items-center space-x-1"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Retry</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB: ADMINS & RBAC */}
        {activeTab === 'admins' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <UserPlus className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-white">Add New Administrator</h2>
                    <p className="text-xs text-slate-400">
                      Grant privileged access to trigger <code className="text-emerald-400">!tagall</code> and send broadcasts.
                    </p>
                  </div>
                </div>

                <form onSubmit={handleAddAdmin} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                      Phone Number or WhatsApp JID
                    </label>
                    <input
                      type="text"
                      value={newAdminPhone}
                      onChange={(e) => setNewAdminPhone(e.target.value)}
                      placeholder="e.g. 14155552671 or 2348012345678"
                      className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-4 py-3 text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
                    />

                    {/* Admin Contact Structured Preview */}
                    {newAdminPhone && (
                      <div className="mt-2.5 p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] font-mono space-y-1">
                        <div className="flex justify-between text-slate-400">
                          <span>ROUTED JID:</span>
                          <span className="text-emerald-400 font-semibold truncate max-w-[200px]">
                            {newAdminPhone.includes('@')
                              ? newAdminPhone.trim()
                              : `${newAdminPhone.replace(/[^0-9]/g, '')}@s.whatsapp.net`}
                          </span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>TARGET TABLE:</span>
                          <span className="text-cyan-400">PostgreSQL bot_admins</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase text-slate-300 mb-1.5">
                      Display Name / Label
                    </label>
                    <input
                      type="text"
                      value={newAdminName}
                      onChange={(e) => setNewAdminName(e.target.value)}
                      placeholder="e.g. Alex Support Lead"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase text-slate-300 mb-1.5">
                      Admin Role
                    </label>
                    <select
                      value={newAdminRole}
                      onChange={(e) => setNewAdminRole(e.target.value as any)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="admin">Administrator (Broadcast + !tagall)</option>
                      <option value="superadmin">Superadmin (Full RBAC + Manage Admins)</option>
                      <option value="moderator">Moderator (!tagall only)</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={adminActionLoading || !newAdminPhone}
                    className="w-full py-2.5 px-4 rounded-xl font-medium text-xs text-white bg-emerald-600 hover:bg-emerald-500 transition-colors shadow-lg shadow-emerald-600/20 disabled:opacity-50 flex items-center justify-center space-x-2 cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Save Administrator to PostgreSQL</span>
                  </button>
                </form>
              </div>
            </div>

            <div className="lg:col-span-7 space-y-6">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center space-x-2">
                    <Shield className="w-4 h-4 text-emerald-400" />
                    <span>PostgreSQL Table: bot_admins ({admins.length})</span>
                  </h3>
                  <button
                    onClick={fetchAdmins}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs border border-slate-700"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-3">
                  {admins.map((adm) => (
                    <div
                      key={adm.jid}
                      className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-center space-x-2">
                          <h4 className="font-bold text-white text-sm">{adm.name}</h4>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            adm.role === 'superadmin'
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                              : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                          }`}>
                            {adm.role}
                          </span>
                        </div>
                        <p className="font-mono text-xs text-slate-400 mt-1">{adm.jid}</p>
                        <div className="flex items-center space-x-3 text-[11px] text-slate-500 mt-2">
                          <span>Permissions:</span>
                          {adm.can_broadcast && <span className="text-cyan-400 font-medium">Broadcast</span>}
                          {adm.can_tagall && <span className="text-emerald-400 font-medium">!tagall</span>}
                          {adm.can_manage_admins && <span className="text-amber-400 font-medium">Manage Admins</span>}
                        </div>
                      </div>

                      {adm.role !== 'superadmin' && (
                        <button
                          onClick={() => handleDeleteAdmin(adm.jid)}
                          className="p-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition-colors"
                          title="Revoke Admin Privileges"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 1: PAIRING & CONNECTION */}
        {activeTab === 'pairing' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 space-y-6">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-white">WhatsApp Phone Pairing Code</h2>
                    <p className="text-xs text-slate-400">
                      Link your WhatsApp account securely without scanning QR codes using phone authentication.
                    </p>
                  </div>
                </div>

                {status?.status === 'connected' ? (
                  <div className="p-6 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-emerald-200">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                        <Check className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-white text-base">WhatsApp is Connected &amp; Synced</h3>
                        <p className="text-xs text-emerald-300/80 mt-0.5">
                          Account: <span className="font-mono text-emerald-200">{status.userName} ({status.userJid})</span>
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 pt-4 border-t border-emerald-500/20 flex flex-wrap items-center justify-between gap-3 text-xs">
                      <span className="text-emerald-300">
                        Keys persisted in PostgreSQL table <code className="bg-emerald-900/50 px-1.5 py-0.5 rounded font-mono text-emerald-200">baileys_sessions</code>
                      </span>
                      <button
                        onClick={handleLogout}
                        className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 transition-colors flex items-center space-x-1.5"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Disconnect &amp; Reset</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleRequestPairingCode} className="space-y-5">
                    {/* Country Quick Presets */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                          Quick Country Presets
                        </label>
                        <span className="text-[11px] text-slate-400">Click to autofill dial code</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {COUNTRY_OPTIONS.slice(0, 8).map((c) => (
                          <button
                            key={c.code}
                            type="button"
                            onClick={() => {
                              setCountryCode(c.code);
                              if (!phoneInput) setPhoneInput(c.sample);
                            }}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer border flex items-center space-x-1.5 ${
                              countryCode === c.code
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm'
                                : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:text-white hover:bg-slate-800/60'
                            }`}
                          >
                            <span>{c.flag}</span>
                            <span>{c.name}</span>
                            <span className="font-mono text-[10px] text-slate-400">({c.code})</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Main Spacious Contact Entry Box */}
                    <div className="p-4 rounded-2xl bg-slate-950/90 border border-slate-800/90 space-y-3 shadow-inner">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center space-x-1.5">
                          <Smartphone className="w-4 h-4" />
                          <span>WhatsApp Contact Entry</span>
                        </label>
                        <span className="text-[11px] font-mono text-slate-400">
                          E.164 International Format
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                        {/* Country Selector Dropdown */}
                        <div className="sm:col-span-5">
                          <label className="block text-[11px] text-slate-400 mb-1 font-medium">
                            Country / Dial Code
                          </label>
                          <select
                            value={countryCode}
                            onChange={(e) => setCountryCode(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3.5 py-3.5 text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer shadow-sm"
                          >
                            {COUNTRY_OPTIONS.map((c) => (
                              <option key={c.code} value={c.code}>
                                {c.flag} {c.name} ({c.code})
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* National Number Input */}
                        <div className="sm:col-span-7">
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-[11px] text-slate-400 font-medium">
                              National Phone Number
                            </label>
                            {phoneInput.startsWith('0') && (
                              <span className="text-[10px] text-amber-400 font-medium">
                                Leading 0 auto-stripped
                              </span>
                            )}
                          </div>
                          <div className="relative">
                            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-sm pointer-events-none">
                              {countryCode}
                            </span>
                            <input
                              type="text"
                              value={phoneInput}
                              onChange={(e) => {
                                // Auto clean input: numbers only, trim whitespace
                                const raw = e.target.value;
                                setPhoneInput(raw);
                              }}
                              placeholder="801 234 5678"
                              className="w-full bg-slate-900 border border-slate-700/80 rounded-xl pl-16 pr-4 py-3.5 text-base sm:text-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono tracking-wider shadow-sm"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Live Structured Criteria Breakdown Card */}
                    {(() => {
                      const cleanLocal = phoneInput.replace(/[^0-9]/g, '').replace(/^0+/, '');
                      const prefix = countryCode.replace(/[^0-9]/g, '');
                      const fullPhone = `${prefix}${cleanLocal}`;
                      const currentCountry = COUNTRY_OPTIONS.find((c) => c.code === countryCode);
                      const isValidLength = cleanLocal.length >= 8 && cleanLocal.length <= 15;

                      return (
                        <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 text-xs space-y-3">
                          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                            <div className="flex items-center space-x-2">
                              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                              <span className="font-semibold text-slate-200">
                                Structured Contact Criteria
                              </span>
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                                isValidLength
                                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                  : cleanLocal.length === 0
                                  ? 'bg-slate-800 text-slate-400 border-slate-700'
                                  : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                              }`}
                            >
                              {isValidLength
                                ? `Valid Criteria (${cleanLocal.length} digits)`
                                : cleanLocal.length === 0
                                ? 'Awaiting Number'
                                : `Incomplete: ${cleanLocal.length}/8+ digits`}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 font-mono text-[11px]">
                            <div className="p-2.5 bg-slate-900/90 rounded-lg border border-slate-800/80">
                              <span className="text-slate-400 block text-[10px] font-sans">
                                SELECTED COUNTRY
                              </span>
                              <span className="text-white font-semibold flex items-center space-x-1.5 mt-0.5">
                                <span>{currentCountry?.flag || '🌐'}</span>
                                <span className="font-sans">{currentCountry?.name || 'Selected'}</span>
                                <span className="text-emerald-400">({countryCode})</span>
                              </span>
                            </div>

                            <div className="p-2.5 bg-slate-900/90 rounded-lg border border-slate-800/80">
                              <span className="text-slate-400 block text-[10px] font-sans">
                                NATIONAL DIGITS
                              </span>
                              <span className="text-cyan-300 font-semibold mt-0.5 block truncate">
                                {cleanLocal || '—'}
                              </span>
                            </div>

                            <div className="p-2.5 bg-slate-900/90 rounded-lg border border-slate-800/80">
                              <span className="text-slate-400 block text-[10px] font-sans">
                                INTERNATIONAL E.164 ROUTING
                              </span>
                              <span className="text-emerald-300 font-semibold mt-0.5 block truncate">
                                {cleanLocal ? `+${fullPhone}` : '—'}
                              </span>
                            </div>

                            <div className="p-2.5 bg-slate-900/90 rounded-lg border border-slate-800/80">
                              <span className="text-slate-400 block text-[10px] font-sans">
                                TARGET WHATSAPP JID
                              </span>
                              <span className="text-indigo-300 font-semibold mt-0.5 block truncate">
                                {cleanLocal ? `${fullPhone}@s.whatsapp.net` : '—'}
                              </span>
                            </div>
                          </div>

                          <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between text-[11px] text-slate-400 gap-2">
                            <span className="flex items-center space-x-1.5">
                              <Database className="w-3.5 h-3.5 text-cyan-400" />
                              <span>Session Persistence: <strong>Google Cloud SQL (baileys_sessions)</strong></span>
                            </span>
                            <span className="text-emerald-400 text-[10px] font-medium">
                              Continuous Keepalive Active
                            </span>
                          </div>
                        </div>
                      );
                    })()}

                    {pairingError && (
                      <div className="p-4 rounded-xl bg-rose-950/50 border border-rose-500/40 text-rose-300 text-xs space-y-2.5">
                        <div className="flex items-start space-x-2.5">
                          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                          <div>
                            <span className="font-semibold text-rose-200 block">Connection / Pairing Notice:</span>
                            <span className="text-rose-300/90 leading-relaxed block mt-0.5">{pairingError}</span>
                          </div>
                        </div>
                        <div className="pt-2 border-t border-rose-900/40 flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[11px] text-rose-400/80">
                            Deploying on Vercel? WhatsApp sockets need a persistent backend.
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setCustomUrlInput(backendUrl);
                              setShowBackendModal(true);
                            }}
                            className="px-3 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/40 font-medium text-xs transition-colors cursor-pointer flex items-center space-x-1.5"
                          >
                            <Globe className="w-3.5 h-3.5" />
                            <span>Connect Backend Server</span>
                          </button>
                        </div>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={pairingLoading || !phoneInput}
                      className="w-full py-3.5 px-4 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 transition-all shadow-lg shadow-emerald-600/25 disabled:opacity-50 flex items-center justify-center space-x-2 cursor-pointer active:scale-[0.99]"
                    >
                      {pairingLoading ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Generating Pairing Code via Baileys &amp; Cloud SQL...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          <span>Request 8-Digit Pairing Code</span>
                        </>
                      )}
                    </button>
                  </form>
                )}

                {status?.pairingCode && status?.status !== 'connected' && (
                  <div className="mt-6 p-6 rounded-2xl bg-gradient-to-br from-slate-950 to-slate-900 border-2 border-emerald-500/40 shadow-2xl relative text-center">
                    <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold mb-3">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Pairing Code Ready</span>
                    </div>

                    <div className="flex items-center justify-center space-x-4 my-2">
                      <div className="font-mono text-3xl sm:text-4xl font-extrabold tracking-widest text-emerald-400 bg-slate-900/80 px-6 py-3 rounded-xl border border-slate-700/80 shadow-inner">
                        {status.pairingCode}
                      </div>
                      <button
                        onClick={() => copyToClipboard(status.pairingCode!, 'pairing')}
                        className="p-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 transition-colors"
                        title="Copy Pairing Code"
                      >
                        {copiedKey === 'pairing' ? <Check className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5" />}
                      </button>
                    </div>

                    <p className="text-xs text-slate-400 max-w-md mx-auto mt-2">
                      Enter this in WhatsApp &gt; Settings &gt; Linked Devices &gt; Link with phone number instead.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="lg:col-span-5 space-y-6">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300 mb-4 flex items-center space-x-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Connection Diagnostics</span>
                </h3>

                <dl className="divide-y divide-slate-800/80 text-xs">
                  <div className="py-2.5 flex justify-between">
                    <dt className="text-slate-400">Connection State</dt>
                    <dd className="font-mono font-medium text-slate-200 capitalize">{status?.status}</dd>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <dt className="text-slate-400">Owner User JID</dt>
                    <dd className="font-mono text-slate-200 truncate max-w-[200px]">{status?.userJid || 'Not Connected'}</dd>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <dt className="text-slate-400">PostgreSQL Session Table</dt>
                    <dd className="font-mono text-cyan-400">baileys_sessions</dd>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <dt className="text-slate-400">Cloud SQL Stored Keys</dt>
                    <dd className="font-mono text-emerald-400 font-bold">
                      {status?.storedKeysCount ?? 0} keys synced
                    </dd>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <dt className="text-slate-400">Restart Continuity</dt>
                    <dd className="font-mono text-emerald-300">
                      Persistent (Restores on boot)
                    </dd>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <dt className="text-slate-400">Admins Table</dt>
                    <dd className="font-mono text-cyan-400">bot_admins</dd>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <dt className="text-slate-400">Queue Backend</dt>
                    <dd className="font-mono text-emerald-400">{queueStats?.mode || 'BullMQ/Worker'}</dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: AUTO-TAG & AUTOMATION ENGINE (BOT NAME, SILENT TAGGING, STATUS AUTO-VIEW/REACT) */}
        {activeTab === 'autotag' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 space-y-6">
              {/* 1. Bot Identity & Name Management Card */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="p-2.5 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-md shadow-emerald-500/20">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-white">Bot Identity &amp; Branding</h2>
                      <p className="text-xs text-slate-400">
                        Custom bot name used across auto-tags, announcements, and command menus.
                      </p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    PostgreSQL Persisted
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800/90 space-y-3">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                    Active Bot Name
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <input
                      type="text"
                      value={botNameInput}
                      onChange={(e) => setBotNameInput(e.target.value)}
                      placeholder="e.g. GGD META AI"
                      maxLength={50}
                      className="flex-1 bg-slate-900 border border-slate-700/80 rounded-xl px-4 py-3 text-sm text-white font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
                    />
                    <button
                      type="button"
                      disabled={botNameLoading || !botNameInput.trim()}
                      onClick={() => handleUpdateBotName(botNameInput)}
                      className="px-5 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                    >
                      {botNameLoading ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Saving...</span>
                        </>
                      ) : botNameSuccess ? (
                        <>
                          <Check className="w-4 h-4 text-white" />
                          <span>Name Saved!</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4" />
                          <span>Update Bot Name</span>
                        </>
                      )}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    You can also update this anytime inside WhatsApp by sending: <code className="text-emerald-400 font-mono">.setbotname &lt;New Name&gt;</code>
                  </p>
                </div>
              </div>

              {/* 2. Silent Tagging System */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="p-2.5 rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20">
                    <Radio className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-white">Silent Tagging System</h2>
                    <p className="text-xs text-slate-400">
                      Notifies all group members silently on lock screens without displaying a wall of phone numbers.
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800/90 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-semibold text-white">Enable Silent Tagging Mode</h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Group members receive a mention push notification, but the chat text stays clean with 0 phone tag clutter.
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={silentTagEnabled}
                        onChange={(e) => {
                          setSilentTagEnabled(e.target.checked);
                          if (e.target.checked) setMentionFormat('silent');
                          else setMentionFormat('announcement');
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-500"></div>
                    </label>
                  </div>

                  {/* Mention Format Selector */}
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                      Tag Display Format
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { id: 'silent', label: 'Silent Mode', desc: 'No phone wall' },
                        { id: 'announcement', label: 'Announcement', desc: 'Bold Header' },
                        { id: 'standard', label: 'Standard', desc: 'Clean Quote' },
                        { id: 'compact', label: 'Compact', desc: 'Minimalist' },
                      ].map((fmt) => (
                        <button
                          key={fmt.id}
                          type="button"
                          onClick={() => {
                            setMentionFormat(fmt.id as any);
                            setSilentTagEnabled(fmt.id === 'silent');
                          }}
                          className={`p-2.5 rounded-xl text-left border transition cursor-pointer ${
                            mentionFormat === fmt.id
                              ? 'bg-teal-500/20 text-teal-300 border-teal-500/50 shadow-sm'
                              : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                          }`}
                        >
                          <span className="block text-xs font-bold">{fmt.label}</span>
                          <span className="block text-[10px] text-slate-400">{fmt.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. WhatsApp Stories / Status Automation */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-white">Status Stories Auto-View &amp; React</h2>
                    <p className="text-xs text-slate-400">
                      Automatically view contact WhatsApp statuses and react with your favorite emoji.
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  {/* Auto-View Status Toggle */}
                  <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-semibold text-white">Auto-View Contacts Statuses</h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Marks contact status updates as read automatically as soon as they are uploaded.
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={statusAutoView}
                        onChange={(e) => setStatusAutoView(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                    </label>
                  </div>

                  {/* Auto-React to Status Toggle */}
                  <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-semibold text-white">Auto-React to Statuses with Emoji</h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Sends an instantaneous emoji reaction to every contact status update.
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={statusAutoReact}
                        onChange={(e) => setStatusAutoReact(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-rose-500"></div>
                    </label>
                  </div>

                  {/* Reaction Emoji Selector */}
                  <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                        Reaction Emoji
                      </label>
                      <span className="text-lg">{statusReactEmoji}</span>
                    </div>

                    <div className="flex flex-wrap gap-2 items-center">
                      {['❤️', '🔥', '👏', '👍', '💚', '⚡', '✨', '🚀', '😍', '🎉'].map((emo) => (
                        <button
                          key={emo}
                          type="button"
                          onClick={() => setStatusReactEmoji(emo)}
                          className={`w-10 h-10 rounded-xl text-lg flex items-center justify-center transition cursor-pointer border ${
                            statusReactEmoji === emo
                              ? 'bg-rose-500/20 border-rose-500/50 shadow-md scale-105'
                              : 'bg-slate-900 border-slate-800 hover:bg-slate-800'
                          }`}
                        >
                          {emo}
                        </button>
                      ))}
                      <input
                        type="text"
                        value={statusReactEmoji}
                        onChange={(e) => setStatusReactEmoji(e.target.value.slice(0, 4))}
                        placeholder="Custom"
                        className="w-20 bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-2 text-center text-sm text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* 4. Auto-Tag Trigger & Cooldown Settings */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <Zap className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-white">Auto-Tag Trigger Modes</h2>
                    <p className="text-xs text-slate-400">
                      Configure when group messages from your account trigger automatic mass tags.
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-white">Auto-Tag Active on My Messages</h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      When enabled, sending messages in groups triggers automatic participant tagging.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={autoTagEnabled}
                      onChange={(e) => setAutoTagEnabled(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>
                </div>

                {/* Trigger Mode */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                    Trigger Mode
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setAutoTagTrigger('all')}
                      className={`p-3.5 rounded-xl text-left border transition cursor-pointer ${
                        autoTagTrigger === 'all'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                      }`}
                    >
                      <span className="block text-sm font-bold">Every Single Message (Automatic)</span>
                      <span className="block text-xs text-slate-400 mt-1">
                        Any message you send in any group tags all members without typing commands.
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setAutoTagTrigger('keyword')}
                      className={`p-3.5 rounded-xl text-left border transition cursor-pointer ${
                        autoTagTrigger === 'keyword'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                      }`}
                    >
                      <span className="block text-sm font-bold">Trigger Keyword Only</span>
                      <span className="block text-xs text-slate-400 mt-1">
                        Only tags when your message contains <code className="text-emerald-400">.everyone</code>
                      </span>
                    </button>
                  </div>
                </div>

                {autoTagTrigger === 'keyword' && (
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                      Trigger Keyword (Prefix: .)
                    </label>
                    <input
                      type="text"
                      value={autoTagKeyword}
                      onChange={(e) => setAutoTagKeyword(e.target.value)}
                      placeholder=".everyone"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                )}

                {/* Anti-Spam Cooldown */}
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                      Anti-Spam Group Cooldown
                    </label>
                    <span className="text-xs font-mono text-emerald-400 font-bold">{cooldownSeconds}s</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="30"
                    value={cooldownSeconds}
                    onChange={(e) => setCooldownSeconds(Number(e.target.value))}
                    className="w-full accent-emerald-500 bg-slate-800 h-2 rounded-lg cursor-pointer"
                  />
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    Prevents rapid repeated tagging in the same group within {cooldownSeconds} seconds.
                  </span>
                </div>

                {/* Save All Settings Button */}
                <button
                  type="button"
                  onClick={handleSaveSettings}
                  className="w-full py-3.5 px-4 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 transition-all shadow-lg shadow-emerald-600/25 flex items-center justify-center space-x-2 cursor-pointer active:scale-[0.99]"
                >
                  {saveSuccess ? (
                    <>
                      <Check className="w-5 h-5 text-white" />
                      <span>Settings &amp; Preferences Saved to Cloud SQL!</span>
                    </>
                  ) : (
                    <>
                      <Settings className="w-5 h-5" />
                      <span>Save All Automation Settings</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Right Column: Live Previews & Diagnostics */}
            <div className="lg:col-span-5 space-y-6">
              {/* Live Preview Card */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300 mb-4 flex items-center space-x-2">
                  <Terminal className="w-4 h-4 text-emerald-400" />
                  <span>Live Tag Preview ({mentionFormat})</span>
                </h3>

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800/90 font-sans text-xs space-y-3 leading-relaxed">
                  {mentionFormat === 'silent' ? (
                    <div className="p-3 rounded-lg bg-teal-950/40 border border-teal-500/30 text-teal-200">
                      <div className="font-bold text-teal-300 flex items-center space-x-1.5 mb-1">
                        <span>🔔</span>
                        <span>{botName.toUpperCase()} • SILENT NOTIFICATION</span>
                      </div>
                      <p className="text-slate-300">Notice text goes here...</p>
                      <p className="text-[11px] text-teal-400/80 italic mt-2">
                        All 42 group members notified silently without visible phone wall.
                      </p>
                      <div className="mt-2 text-[10px] text-slate-500 font-mono">
                        ⚡ Powered by {botName}
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-slate-200">
                      <div className="font-bold text-emerald-400 mb-1">
                        🏷️ ATTENTION EVERYONE 🏷️
                      </div>
                      <p className="text-slate-300">Notice text goes here...</p>
                      <p className="text-[11px] text-slate-400 font-mono mt-2 break-all">
                        @2348012345678 @2348098765432 @14155552671 ...
                      </p>
                      <div className="mt-2 text-[10px] text-slate-500 font-mono">
                        ⚡ Sent via {botName} Auto-Tag Engine
                      </div>
                    </div>
                  )}

                  <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
                    <span>Active Bot Identity:</span>
                    <strong className="text-emerald-400">{botName}</strong>
                  </div>
                </div>
              </div>

              {/* Status Automation Live Metrics Card */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300 mb-4 flex items-center space-x-2">
                  <Sparkles className="w-4 h-4 text-rose-400" />
                  <span>Stories &amp; Status Health</span>
                </h3>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                    <span className="text-slate-400 block text-[10px]">AUTO-VIEW</span>
                    <span className="font-bold text-sm text-emerald-400 mt-1 block">
                      {statusAutoView ? 'Active (Read on receipt)' : 'Disabled'}
                    </span>
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      {status?.stats.totalStatusesViewed || 0} statuses read
                    </span>
                  </div>

                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                    <span className="text-slate-400 block text-[10px]">AUTO-REACT</span>
                    <span className="font-bold text-sm text-rose-400 mt-1 block flex items-center space-x-1">
                      <span>{statusAutoReact ? 'Active' : 'Disabled'}</span>
                      <span>{statusReactEmoji}</span>
                    </span>
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      {status?.stats.totalStatusesReacted || 0} reactions sent
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: BROADCAST API */}
        {activeTab === 'broadcast' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 space-y-6">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
                <div className="flex items-center space-x-3 mb-6">
                  <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                    <Send className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-white">Queue-Backed Broadcast Studio</h2>
                    <p className="text-xs text-slate-400">
                      Executes <code className="font-mono text-cyan-400 bg-cyan-950/50 px-1.5 py-0.5 rounded">POST /send-broadcast</code> which enqueues jobs to BullMQ for asynchronous tagged delivery.
                    </p>
                  </div>
                </div>

                <form onSubmit={handleSendBroadcast} className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                        Target Group JID
                      </label>
                      {groups.length > 0 && (
                        <span className="text-[11px] text-cyan-400">
                          {groups.length} participating groups discovered
                        </span>
                      )}
                    </div>

                    {groups.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2.5">
                        {groups.slice(0, 5).map((g) => (
                          <button
                            key={g.id}
                            type="button"
                            onClick={() => setBroadcastJid(g.id)}
                            className={`px-2 py-1 rounded-lg text-xs font-medium transition cursor-pointer border flex items-center space-x-1.5 ${
                              broadcastJid === g.id
                                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-sm'
                                : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:text-white'
                            }`}
                          >
                            <span className="truncate max-w-[140px]">{g.subject}</span>
                            <span className="font-mono text-[10px] text-cyan-400">({g.participantCount})</span>
                          </button>
                        ))}
                      </div>
                    )}

                    <input
                      type="text"
                      value={broadcastJid}
                      onChange={(e) => setBroadcastJid(e.target.value)}
                      placeholder="e.g. 120363024890123456@g.us"
                      className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-4 py-3 text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500 shadow-sm"
                    />

                    {broadcastJid && (
                      <div className="mt-2 p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/80 flex items-center justify-between text-[11px] font-mono">
                        <span className="text-slate-400">STATUS:</span>
                        <span className={broadcastJid.endsWith('@g.us') ? 'text-emerald-400 font-semibold' : 'text-amber-400'}>
                          {broadcastJid.endsWith('@g.us') ? '✓ Valid WhatsApp Group JID' : '⚠ Must end with @g.us'}
                        </span>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                      Broadcast Announcement Message
                    </label>
                    <textarea
                      rows={4}
                      value={broadcastMessage}
                      onChange={(e) => setBroadcastMessage(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                      Optional Sender Admin JID (RBAC Check)
                    </label>
                    <input
                      type="text"
                      value={broadcastSender}
                      onChange={(e) => setBroadcastSender(e.target.value)}
                      placeholder="e.g. 14155552671@s.whatsapp.net (Leave empty for system broadcast)"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2 text-xs text-white font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>

                  {broadcastError && (
                    <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs flex items-center space-x-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{broadcastError}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={broadcastLoading}
                    className="w-full py-3 px-4 rounded-xl font-medium text-sm text-white bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 transition-all shadow-lg shadow-cyan-600/20 disabled:opacity-50 flex items-center justify-center space-x-2 cursor-pointer"
                  >
                    {broadcastLoading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Enqueuing Job to Message Queue...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>Enqueue Broadcast Job (POST /send-broadcast)</span>
                      </>
                    )}
                  </button>
                </form>

                {broadcastResponse && (
                  <div className="mt-6 p-4 rounded-xl bg-cyan-950/30 border border-cyan-500/30 text-xs space-y-2">
                    <div className="flex items-center space-x-2 text-cyan-300 font-semibold">
                      <Check className="w-4 h-4 text-cyan-400" />
                      <span>Job Enqueued in Message Queue (202 Accepted)</span>
                    </div>
                    <pre className="font-mono text-slate-300 bg-slate-950/80 p-3 rounded-lg border border-slate-800 text-[11px] overflow-x-auto">
                      {JSON.stringify(broadcastResponse, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>

            <div className="lg:col-span-5 space-y-6">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300 mb-3">
                  Asynchronous Delivery Specs
                </h3>
                <div className="space-y-3 text-xs text-slate-400">
                  <p>
                    Calls to <code className="text-cyan-400">POST /send-broadcast</code> return immediately with HTTP <code className="text-emerald-400">202 Accepted</code>.
                  </p>
                  <p>
                    The BullMQ background worker picks up the job, queries participants, tags everyone, and automatically retries up to 3 times if WhatsApp disconnects or drops.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: GROUP EXPLORER */}
        {activeTab === 'groups' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <div>
                <h2 className="text-lg font-semibold text-white">Joined WhatsApp Groups</h2>
                <p className="text-xs text-slate-400">
                  Inspect all groups this WhatsApp account is currently participating in.
                </p>
              </div>
              <button
                onClick={fetchGroups}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors flex items-center space-x-2"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh Group List</span>
              </button>
            </div>

            {groups.length === 0 ? (
              <div className="p-8 rounded-2xl bg-slate-900/60 border border-slate-800 text-center text-xs text-slate-500">
                Connect your account in the Pairing tab to load WhatsApp groups.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {groups.map((g) => (
                  <div key={g.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-all flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-bold text-white text-sm line-clamp-1">{g.subject}</h4>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-mono shrink-0">
                          {g.participantCount} members
                        </span>
                      </div>
                      <p className="text-xs font-mono text-slate-500 mt-2 truncate bg-slate-950 p-1.5 rounded">
                        {g.id}
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                      <button
                        onClick={() => copyToClipboard(g.id, g.id)}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs border border-slate-700 flex items-center space-x-1.5"
                      >
                        {copiedKey === g.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>Copy JID</span>
                      </button>

                      <button
                        onClick={() => {
                          setBroadcastJid(g.id);
                          setActiveTab('broadcast');
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 text-xs border border-cyan-500/30 flex items-center space-x-1"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Queue Broadcast</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 5: GOOGLE CLOUD SQL DATABASE */}
        {activeTab === 'database' && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <h2 className="text-lg font-semibold text-white">Google Cloud SQL (PostgreSQL) Architecture</h2>
              <p className="text-xs text-slate-400 mt-1">
                Schema stores session keys (<code className="text-cyan-400">baileys_sessions</code>), role management (<code className="text-cyan-400">bot_admins</code>), and queue history (<code className="text-cyan-400">broadcast_jobs</code>).
              </p>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
                  PostgreSQL DDL Schema (schema.sql)
                </h3>
                <button
                  onClick={() => copyToClipboard(schemaText, 'schema')}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs border border-slate-700 flex items-center space-x-1.5"
                >
                  {copiedKey === 'schema' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>Copy SQL</span>
                </button>
              </div>

              <pre className="bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs text-slate-300 overflow-x-auto leading-relaxed max-h-96 scrollbar-thin">
                {schemaText || `-- Loading schema.sql...`}
              </pre>
            </div>
          </div>
        )}

        {/* TAB 6: CLOUD RUN DEPLOYMENT */}
        {activeTab === 'deployment' && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <h2 className="text-lg font-semibold text-white">Google Cloud Run &amp; Redis Deployment</h2>
              <div className="mt-4 bg-slate-950 rounded-xl p-4 font-mono text-xs text-emerald-400 border border-slate-800 overflow-x-auto leading-relaxed">
                gcloud run deploy whatsapp-autotag-service \<br />
                &nbsp;&nbsp;--source . \<br />
                &nbsp;&nbsp;--region europe-west2 \<br />
                &nbsp;&nbsp;--platform managed \<br />
                &nbsp;&nbsp;--allow-unauthenticated \<br />
                &nbsp;&nbsp;--add-cloudsql-instances gen-lang-client-0737753108:europe-west2:baileys-db \<br />
                &nbsp;&nbsp;--set-env-vars INSTANCE_CONNECTION_NAME=gen-lang-client-0737753108:europe-west2:baileys-db \<br />
                &nbsp;&nbsp;--set-env-vars DB_NAME=baileys_db \<br />
                &nbsp;&nbsp;--set-env-vars DB_USER=postgres \<br />
                &nbsp;&nbsp;--set-env-vars DB_PASSWORD=your_password \<br />
                &nbsp;&nbsp;--min-instances 1 \<br />
                &nbsp;&nbsp;--max-instances 1 \<br />
                &nbsp;&nbsp;--memory 1Gi \<br />
                &nbsp;&nbsp;--port 3000
              </div>
            </div>
          </div>
        )}

        {/* TAB 7: ACTIVITY LOGS */}
        {activeTab === 'logs' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="text-lg font-semibold text-white">Live Activity &amp; Audit Logs</h2>
                <p className="text-xs text-slate-400">
                  Monitors message upserts, command executions, queue dispatches, and worker deliveries.
                </p>
              </div>
              <button
                onClick={fetchLogs}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs border border-slate-700 flex items-center space-x-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh Logs</span>
              </button>
            </div>

            <div className="space-y-2 max-h-[600px] overflow-y-auto scrollbar-thin pr-1">
              {logs.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  No activity logs recorded yet. Events will stream here automatically.
                </div>
              ) : (
                logs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 font-mono text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div className="flex items-center space-x-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-800 border border-slate-700 text-slate-300">
                        {log.type}
                      </span>
                      <span className="text-slate-200">{log.message}</span>
                    </div>
                    <span className="text-[10px] text-slate-500 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </main>
      </div>

      {/* ====================================================================== */}
      {/* MOBILE QUICK BOTTOM NAVIGATION BAR                                      */}
      {/* ====================================================================== */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-md border-t border-slate-800/90 px-3 py-1.5 flex items-center justify-around shadow-2xl">
        {[
          { id: 'pairing', label: 'Pairing', icon: Smartphone },
          { id: 'commands', label: 'Commands', icon: MessageSquare },
          { id: 'queue', label: 'Queue', icon: ListOrdered },
          { id: 'autotag', label: 'Auto-Tag', icon: Zap },
          { id: 'admins', label: 'Admins', icon: Shield },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabSelect(tab.id as any)}
              className={`flex flex-col items-center py-1 px-2 rounded-lg text-[10px] transition font-medium cursor-pointer ${
                active ? 'text-emerald-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className={`w-4 h-4 mb-0.5 ${active ? 'text-emerald-400' : 'text-slate-400'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="flex flex-col items-center py-1 px-2 rounded-lg text-[10px] text-slate-400 hover:text-slate-200 transition font-medium cursor-pointer"
        >
          <Menu className="w-4 h-4 mb-0.5 text-slate-400" />
          <span>All Tabs</span>
        </button>
      </nav>

      {/* Offline Toast Indicator */}
      <OfflineIndicator />

      {/* Backend Connection & Cloud SQL Credentials Modal */}
      {showBackendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl p-6 relative text-slate-200">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  <Globe className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Backend Connection &amp; Cloud SQL Credentials</h3>
                  <p className="text-xs text-slate-400">Configure remote server endpoints and verify database synchronization</p>
                </div>
              </div>
              <button
                onClick={() => setShowBackendModal(false)}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Current Status Overview */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-4">
              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Active URL</span>
                <p className="font-mono text-xs text-indigo-300 font-semibold truncate mt-1">
                  {backendUrl || 'Same Origin (/api)'}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">WhatsApp Socket</span>
                <p className="text-xs font-semibold capitalize text-emerald-400 mt-1 flex items-center space-x-1.5">
                  <span className={`w-2 h-2 rounded-full ${status?.status === 'connected' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                  <span>{status?.status || 'Connecting...'}</span>
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Cloud SQL State</span>
                <p className="text-xs font-semibold text-cyan-300 mt-1">
                  {status?.isDatabaseConnected ? 'PostgreSQL Active' : 'In-Memory Fallback'}
                </p>
              </div>
            </div>

            {/* Input & Test Controls */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Persistent Backend Server URL
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={customUrlInput}
                    onChange={(e) => setCustomUrlInput(e.target.value)}
                    placeholder="https://your-cloud-run-service.run.app (or leave empty for relative /api)"
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white font-mono placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    type="button"
                    disabled={pingTestStatus.testing}
                    onClick={() => testBackendConnection(customUrlInput)}
                    className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs transition-colors shrink-0 flex items-center justify-center space-x-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    {pingTestStatus.testing ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Zap className="w-3.5 h-3.5" />
                    )}
                    <span>Test Ping</span>
                  </button>
                </div>
              </div>

              {/* Ping Test Result Banner */}
              {pingTestStatus.message && (
                <div className={`p-3 rounded-xl text-xs flex items-center space-x-2 border ${
                  pingTestStatus.success
                    ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-200'
                    : 'bg-rose-950/50 border-rose-500/40 text-rose-200'
                }`}>
                  {pingTestStatus.success ? (
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  )}
                  <span className="font-mono">{pingTestStatus.message}</span>
                </div>
              )}

              {/* Quick Presets */}
              <div>
                <span className="block text-xs text-slate-400 mb-1.5 font-medium">Quick Presets:</span>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const url = 'https://ais-dev-kpjvnrrlc5ogpbuwfvnsj5-468433224078.europe-west2.run.app';
                      setCustomUrlInput(url);
                      testBackendConnection(url);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700 transition-colors flex items-center space-x-1.5 cursor-pointer"
                  >
                    <Server className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Cloud Run Instance (Europe West)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const url = 'http://localhost:3000';
                      setCustomUrlInput(url);
                      testBackendConnection(url);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700 transition-colors flex items-center space-x-1.5 cursor-pointer"
                  >
                    <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Localhost (Port 3000)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setCustomUrlInput('');
                      testBackendConnection('');
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700 transition-colors flex items-center space-x-1.5 cursor-pointer"
                  >
                    <Globe className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Same Origin / Vercel (/api)</span>
                  </button>
                </div>
              </div>

              {/* Vercel Environment Variables Guide */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-2">
                <div className="flex items-center space-x-2 text-indigo-300 font-semibold">
                  <Info className="w-4 h-4 text-indigo-400" />
                  <span>Permanent Vercel Frontend Connection</span>
                </div>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  To permanently connect your frontend on Vercel to your persistent Cloud Run backend without needing to re-enter this URL in every browser:
                </p>
                <div className="bg-slate-900 p-2.5 rounded-lg font-mono text-[11px] text-slate-200 border border-slate-800 space-y-1">
                  <div>1. Go to <strong>Vercel Dashboard &gt; Project &gt; Settings &gt; Environment Variables</strong></div>
                  <div>2. Add Key: <code className="text-emerald-400">VITE_BACKEND_URL</code></div>
                  <div>3. Add Value: <code className="text-cyan-300">{customUrlInput || 'https://ais-dev-kpjvnrrlc5ogpbuwfvnsj5-468433224078.europe-west2.run.app'}</code></div>
                  <div>4. Redeploy project on Vercel.</div>
                </div>
              </div>

              {/* Cloud SQL PostgreSQL Variables Reference */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-2">
                <div className="flex items-center space-x-2 text-cyan-300 font-semibold">
                  <Database className="w-4 h-4 text-cyan-400" />
                  <span>Google Cloud SQL (PostgreSQL) Configuration Reference</span>
                </div>
                <p className="text-slate-400 text-[11px]">
                  Configured on Cloud Run container for 100% session persistence across redeployments:
                </p>
                <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                  <div className="p-2 bg-slate-900 rounded border border-slate-800">
                    <span className="text-slate-500 block text-[10px]">SESSION_ID</span>
                    <span className="text-white">cloudsql_baileys_session</span>
                  </div>
                  <div className="p-2 bg-slate-900 rounded border border-slate-800">
                    <span className="text-slate-500 block text-[10px]">TABLE</span>
                    <span className="text-white">baileys_sessions</span>
                  </div>
                  <div className="p-2 bg-slate-900 rounded border border-slate-800">
                    <span className="text-slate-500 block text-[10px]">RBAC TABLE</span>
                    <span className="text-white">bot_admins</span>
                  </div>
                  <div className="p-2 bg-slate-900 rounded border border-slate-800">
                    <span className="text-slate-500 block text-[10px]">MIN INSTANCES</span>
                    <span className="text-emerald-400">1 (Keeps WebSocket alive)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => saveBackendUrl('')}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs transition-colors cursor-pointer"
              >
                Reset to Default
              </button>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setShowBackendModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => saveBackendUrl(customUrlInput)}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs shadow-lg shadow-emerald-600/20 transition-all flex items-center space-x-1.5 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Save &amp; Connect</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
