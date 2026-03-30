import { ArrowUp, Check, ChevronLeft, ChevronRight, CircleStar, FolderOpen, Gem, LineSquiggle, Loader2, LogOut, Menu, Monitor, Moon, Palette, Plus, RefreshCcw, Smile, Smartphone, Sparkles, Sun, Tablet, Trash2, X, Zap } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { apiClient, type BillingSummary } from '../../api/client';
import type { DesignModelProfile } from '../../constants/designModels';
import logo from '../../assets/Ui-logo.png';
import eazyuiWordmark from '../../assets/eazyui-text-edit.png';
import eazyuiWordmarkLight from '../../assets/eazyui-text-edit-light.png';
import type { User } from 'firebase/auth';
import { observeAuthState, signOutCurrentUser } from '../../lib/auth';
import { useUiStore } from '../../stores';
import { useOrbVisuals, type OrbActivityState } from '../../utils/orbVisuals';
import {
  extractComposerInlineReferences,
  findComposerReferenceTrigger,
  formatComposerUrlReferenceToken,
  getFilteredComposerReferenceRootOptions,
  normalizeComposerReferenceUrl,
  replaceComposerReferenceTrigger,
  type ComposerReferenceTextRange,
} from '../../utils/composerReferences';
import { ConfirmationDialog } from '../ui/ConfirmationDialog';
import { ComposerAttachmentStack, MAX_COMPOSER_ATTACHMENTS } from '../ui/ComposerAttachmentStack';
import { ComposerAddMenu } from '../ui/ComposerAddMenu';
import { ComposerInlineReferenceInput, type ComposerInlineReferenceInputHandle } from '../ui/ComposerInlineReferenceInput';
import { ComposerReferenceMenu } from '../ui/ComposerReferenceMenu';
import { Orb } from '../ui/Orb';

type ProjectWorkspacePageProps = {
  authReady: boolean;
  isAuthenticated: boolean;
  onNavigate: (path: string, search?: string) => void;
  onOpenProject: (projectId: string) => void;
};

type ProjectListItem = {
  id: string;
  name: string;
  updatedAt: string;
  screenCount?: number;
  hasSnapshot?: boolean;
  coverImageUrl?: string;
  coverImageUrls?: string[];
};

const LANDING_DRAFT_KEY = 'eazyui:landing-draft';
const SIDEBAR_EXPANDED_WIDTH = 288;
const SIDEBAR_COLLAPSED_WIDTH = 88;

const workspaceSignals = [
  {
    id: 'upgrade-plan',
    title: 'Upgrade plan',
    detail: 'Unlock faster queues, larger credit caps, and premium workspace tools.',
    actionLabel: 'View plans',
    accentClassName: 'border-amber-300/20 bg-amber-400/10 text-amber-100',
    iconClassName: 'border-amber-300/25 bg-amber-400/12 text-amber-200',
    Icon: Gem,
    path: '/pricing',
  },
  // {
  //   id: 'new-feature',
  //   title: 'New feature',
  //   detail: 'Project-aware planning is live for sharper first drafts and cleaner flows.',
  //   actionLabel: 'more',
  //   accentClassName: 'border-indigo-300/20 bg-indigo-400/10 text-indigo-100',
  //   iconClassName: 'border-indigo-300/25 bg-indigo-400/12 text-indigo-200',
  //   Icon: Sparkles,
  //   path: '/changelog',
  // },
] as const;

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function sortProjects(items: ProjectListItem[]) {
  return [...items].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export function ProjectWorkspacePage({ authReady, isAuthenticated, onNavigate, onOpenProject }: ProjectWorkspacePageProps) {
  const requestConfirmation = useUiStore((state) => state.requestConfirmation);
  const theme = useUiStore((state) => state.theme);
  const setTheme = useUiStore((state) => state.setTheme);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingIds, setDeletingIds] = useState<string[]>([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [deleteProgress, setDeleteProgress] = useState<{ total: number; completed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starterPrompt, setStarterPrompt] = useState('');
  const [creatingFromPrompt, setCreatingFromPrompt] = useState(false);
  const [starterImages, setStarterImages] = useState<string[]>([]);
  const [deviceType, setDeviceType] = useState<'mobile' | 'tablet' | 'desktop'>('mobile');
  const [stylePreset, setStylePreset] = useState<'modern' | 'minimal' | 'vibrant' | 'luxury' | 'playful'>('modern');
  const [modelProfile, setModelProfile] = useState<DesignModelProfile>('quality');
  const [showStyleMenu, setShowStyleMenu] = useState(false);
  const [modelTemperature, setModelTemperature] = useState(() => apiClient.getComposerTemperature());
  const [openAvatarMenu, setOpenAvatarMenu] = useState(false);
  const [billingSummary, setBillingSummary] = useState<BillingSummary | null>(null);
  const [isReferenceMenuOpen, setIsReferenceMenuOpen] = useState(false);
  const [referenceMenuMode, setReferenceMenuMode] = useState<'root' | 'url'>('root');
  const [referenceRootQuery, setReferenceRootQuery] = useState('');
  const [referenceActiveIndex, setReferenceActiveIndex] = useState(0);
  const [referenceUrlDraft, setReferenceUrlDraft] = useState('');
  const [referenceIncludeScrapedImages, setReferenceIncludeScrapedImages] = useState(false);
  const [referenceEditingUrl, setReferenceEditingUrl] = useState<string | null>(null);
  const [referenceImageUrls, setReferenceImageUrls] = useState<string[]>([]);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const starterPromptRef = useRef<ComposerInlineReferenceInputHandle | null>(null);
  const avatarMenuRef = useRef<HTMLDivElement | null>(null);
  const styleMenuRef = useRef<HTMLDivElement | null>(null);
  const referenceMenuRef = useRef<HTMLDivElement | null>(null);
  const referenceUrlInputRef = useRef<HTMLInputElement | null>(null);
  const addMenuRef = useRef<HTMLDivElement | null>(null);
  const referenceTriggerRangeRef = useRef<ComposerReferenceTextRange | null>(null);

  const isLight = theme === 'light';
  const shouldReduceMotion = useReducedMotion();
  const workspaceWordmark = isLight ? eazyuiWordmarkLight : eazyuiWordmark;
  const authDisplayName = authUser?.displayName || authUser?.email?.split('@')[0] || 'User';
  const authEmail = authUser?.email || 'No email';
  const authPhotoUrl = authUser?.photoURL
    || authUser?.providerData.find((provider) => Boolean(provider?.photoURL))?.photoURL
    || `https://ui-avatars.com/api/?name=${encodeURIComponent(authDisplayName)}&background=111827&color=ffffff&size=128&rounded=true`;
  const deletingIdSet = new Set(deletingIds);
  const selectedIdSet = new Set(selectedProjectIds);
  const hasSelectedProjects = selectedProjectIds.length > 0;
  const allSelected = projects.length > 0 && projects.every((project) => selectedIdSet.has(project.id));
  const workspaceOrbActivity: OrbActivityState = creatingFromPrompt
    ? 'thinking'
    : starterPrompt.trim().length > 0
      ? 'talking'
      : 'idle';
  const { agentState: workspaceOrbState, colors: workspaceOrbColors } = useOrbVisuals(workspaceOrbActivity);
  const workspaceOrbInput = creatingFromPrompt ? 0.55 : 0.18;
  const workspaceOrbOutput = creatingFromPrompt ? 0.88 : starterPrompt.trim().length > 0 ? 0.44 : 0.2;
  const StyleIcon = stylePreset === 'minimal'
    ? LineSquiggle
    : stylePreset === 'vibrant'
      ? Palette
      : stylePreset === 'luxury'
        ? Gem
        : stylePreset === 'playful'
          ? Smile
          : CircleStar;
  const styleButtonTone = stylePreset === 'minimal'
    ? 'bg-[color:color-mix(in_srgb,var(--ui-primary)_12%,var(--ui-surface-4))] text-[var(--ui-text)] ring-[color:color-mix(in_srgb,var(--ui-primary)_30%,transparent)] hover:bg-[color:color-mix(in_srgb,var(--ui-primary)_16%,var(--ui-surface-4))]'
    : stylePreset === 'vibrant'
      ? 'bg-emerald-400/15 text-emerald-200 ring-emerald-300/35 hover:bg-emerald-400/20'
      : stylePreset === 'luxury'
        ? 'bg-amber-400/15 text-amber-200 ring-amber-300/35 hover:bg-amber-400/20'
        : stylePreset === 'playful'
          ? 'bg-fuchsia-400/15 text-fuchsia-200 ring-fuchsia-300/35 hover:bg-fuchsia-400/20'
        : 'bg-[color:color-mix(in_srgb,var(--ui-primary)_16%,transparent)] text-[color:color-mix(in_srgb,var(--ui-primary)_62%,white)] ring-[color:color-mix(in_srgb,var(--ui-primary)_38%,transparent)] hover:bg-[color:color-mix(in_srgb,var(--ui-primary)_22%,transparent)]';
  const sidebarNavItems = [
    // {
    //   id: 'workspace-home',
    //   label: 'Workspace Home',
    //   subtitle: 'Overview',
    //   Icon: House,
    //   active: false,
    //   iconClassName: '',
    //   onClick: () => onNavigate('/app'),
    // },
    {
      id: 'projects',
      label: 'Projects',
      subtitle: 'Library',
      Icon: FolderOpen,
      active: true,
      iconClassName: '',
      onClick: () => onNavigate('/app/projects'),
    },
    {
      id: 'new-project',
      label: 'New Project',
      subtitle: 'Start fresh',
      Icon: Plus,
      active: false,
      iconClassName: '',
      onClick: () => onNavigate('/app/projects/new'),
    },
    {
      id: 'refresh-projects',
      label: 'Refresh',
      subtitle: 'Sync list',
      Icon: RefreshCcw,
      active: false,
      onClick: () => void loadProjects(),
      iconClassName: loading ? 'animate-spin' : '',
    },
  ] as const;
  const sidebarWidth = sidebarExpanded ? SIDEBAR_EXPANDED_WIDTH : SIDEBAR_COLLAPSED_WIDTH;
  const sidebarLabelClassName = sidebarExpanded
    ? 'min-w-0 max-w-[184px] translate-x-0 opacity-100'
    : 'pointer-events-none max-w-0 -translate-x-2 opacity-0';
  const avatarMenuPositionClassName = sidebarExpanded ? 'bottom-full left-0 right-0 mb-3' : 'bottom-0 left-full ml-3';
  const avatarMenuWidthClassName = sidebarExpanded ? 'w-full' : 'w-[260px]';
  const shellBadgeClassName = isLight
    ? 'border-slate-300/70 bg-white/85 text-slate-700'
    : 'border-white/10 bg-white/[0.04] text-slate-300';
  const accentButtonClassName = 'border-[var(--ui-primary)] bg-[var(--ui-primary)] text-white shadow-[0_14px_34px_color-mix(in_srgb,var(--ui-primary)_26%,transparent)] hover:bg-[var(--ui-primary-hover)]';
  const rootReferenceOptions = getFilteredComposerReferenceRootOptions(referenceRootQuery, false);

  async function loadProjects() {
    if (!authReady || !isAuthenticated) return;
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.listProjects();
      setProjects(sortProjects(res.projects || []));
    } catch (err) {
      setError((err as Error).message || 'Failed to load projects.');
    } finally {
      setLoading(false);
    }
  }

  async function loadBillingSummary() {
    if (!authReady || !isAuthenticated) return;
    try {
      const response = await apiClient.getBillingSummary();
      setBillingSummary(response.summary);
    } catch {
      setBillingSummary(null);
    }
  }

  const closeReferenceMenu = () => {
    setIsReferenceMenuOpen(false);
    setReferenceMenuMode('root');
    setReferenceRootQuery('');
    setReferenceActiveIndex(0);
    setReferenceUrlDraft('');
    setReferenceIncludeScrapedImages(false);
    setReferenceEditingUrl(null);
    referenceTriggerRangeRef.current = null;
  };

  const closeAddMenu = () => {
    setIsAddMenuOpen(false);
  };

  const syncReferenceTrigger = (value: string, cursor: number) => {
    const match = findComposerReferenceTrigger(value, cursor);
    if (!match) {
      closeReferenceMenu();
      return;
    }
    referenceTriggerRangeRef.current = match.range;
    setReferenceRootQuery(match.query);
    setReferenceMenuMode('root');
    setIsReferenceMenuOpen(true);
  };

  const openUrlReferenceInput = (source: 'trigger' | 'append' = 'trigger') => {
    if (source === 'append') {
      const currentValue = starterPromptRef.current?.getValue() ?? starterPrompt;
      referenceTriggerRangeRef.current = {
        start: currentValue.length,
        end: currentValue.length,
      };
    }
    setReferenceMenuMode('url');
    setReferenceActiveIndex(0);
    setReferenceUrlDraft('');
    setReferenceIncludeScrapedImages(false);
    setReferenceEditingUrl(null);
    setIsReferenceMenuOpen(true);
  };

  const submitUrlReference = () => {
    const normalized = normalizeComposerReferenceUrl(referenceUrlDraft);
    if (!normalized) return;
    const range = referenceTriggerRangeRef.current;
    if (!range) return;
    const source = starterPromptRef.current?.getValue() ?? starterPrompt;
    const result = replaceComposerReferenceTrigger(source, range, formatComposerUrlReferenceToken(normalized));
    setStarterPrompt(result.value);
    setReferenceImageUrls((prev) => {
      const next = new Set(prev);
      if (referenceEditingUrl) next.delete(referenceEditingUrl);
      if (referenceIncludeScrapedImages) next.add(normalized);
      else next.delete(normalized);
      return Array.from(next);
    });
    closeReferenceMenu();
    window.setTimeout(() => {
      const target = starterPromptRef.current;
      if (!target) return;
      target.focus();
      target.setSelectionRange(result.cursor, result.cursor);
    }, 0);
  };

  const handleReferenceTokenClick = (reference: { kind: 'url' | 'screen'; range: { start: number; end: number }; url?: string }) => {
    if (reference.kind !== 'url' || !reference.url) return;
    closeAddMenu();
    referenceTriggerRangeRef.current = reference.range;
    setReferenceMenuMode('url');
    setReferenceActiveIndex(0);
    setReferenceUrlDraft(reference.url);
    setReferenceIncludeScrapedImages(referenceImageUrls.includes(reference.url));
    setReferenceEditingUrl(reference.url);
    setIsReferenceMenuOpen(true);
  };

  useEffect(() => {
    if (!authReady || !isAuthenticated) return;
    void loadProjects();
    void loadBillingSummary();
  }, [authReady, isAuthenticated]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const syncViewport = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobileViewport(mobile);
      if (mobile) {
        setSidebarExpanded(false);
      } else {
        setIsMobileSidebarOpen(false);
      }
    };

    syncViewport();
    window.addEventListener('resize', syncViewport);
    return () => window.removeEventListener('resize', syncViewport);
  }, []);

  useEffect(() => {
    if (!isMobileSidebarOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMobileSidebarOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isMobileSidebarOpen]);

  useEffect(() => {
    const unsub = observeAuthState((user) => setAuthUser(user));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setBillingSummary(null);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!avatarMenuRef.current) return;
      if (avatarMenuRef.current.contains(event.target as Node)) return;
      setOpenAvatarMenu(false);
    };
    if (openAvatarMenu) {
      window.addEventListener('mousedown', onPointerDown);
    }
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [openAvatarMenu]);

  useEffect(() => {
    if (!showStyleMenu) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!styleMenuRef.current) return;
      if (styleMenuRef.current.contains(event.target as Node)) return;
      setShowStyleMenu(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowStyleMenu(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [showStyleMenu]);

  useEffect(() => {
    if (!isReferenceMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (referenceMenuRef.current?.contains(event.target as Node)) return;
      if (starterPromptRef.current?.element?.contains(event.target as Node)) return;
      closeReferenceMenu();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isReferenceMenuOpen, referenceMenuMode]);

  useEffect(() => {
    if (!isReferenceMenuOpen || referenceMenuMode !== 'url') return;
    referenceUrlInputRef.current?.focus();
  }, [isReferenceMenuOpen, referenceMenuMode]);

  useEffect(() => {
    if (!isAddMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (addMenuRef.current?.contains(event.target as Node)) return;
      closeAddMenu();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeAddMenu();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isAddMenuOpen]);

  useEffect(() => {
    apiClient.setComposerTemperature(modelTemperature);
  }, [modelTemperature]);

  useEffect(() => {
    const available = new Set(projects.map((project) => project.id));
    setSelectedProjectIds((prev) => prev.filter((id) => available.has(id)));
  }, [projects]);

  const performDelete = async (ids: string[]) => {
    const uniqueIds = Array.from(new Set(ids));
    if (uniqueIds.length === 0) return;

    setError(null);
    const deletingSet = new Set(uniqueIds);
    setDeleteProgress({ total: uniqueIds.length, completed: 0 });
    setDeletingIds((prev) => Array.from(new Set([...prev, ...uniqueIds])));
    setSelectedProjectIds((prev) => prev.filter((id) => !deletingSet.has(id)));

    let removedProjects: ProjectListItem[] = [];
    setProjects((prev) => {
      removedProjects = prev.filter((project) => deletingSet.has(project.id));
      return prev.filter((project) => !deletingSet.has(project.id));
    });

    const failedIds: string[] = [];
    let completed = 0;
    await Promise.all(
      uniqueIds.map(async (projectId) => {
        try {
          await apiClient.deleteProject(projectId);
        } catch {
          failedIds.push(projectId);
        } finally {
          completed += 1;
          setDeleteProgress((prev) => (prev ? { ...prev, completed } : prev));
        }
      })
    );

    if (failedIds.length > 0) {
      const failedSet = new Set(failedIds);
      const restoreItems = removedProjects.filter((project) => failedSet.has(project.id));
      setProjects((prev) => sortProjects([...prev, ...restoreItems]));
      setError(
        failedIds.length === 1
          ? 'Failed to delete one project. It has been restored.'
          : `Failed to delete ${failedIds.length} projects. They have been restored.`
      );
    }

    setDeletingIds((prev) => prev.filter((id) => !deletingSet.has(id)));
    setDeleteProgress(null);
  };

  const handleDelete = async (ids: string[]) => {
    const uniqueIds = Array.from(new Set(ids));
    if (uniqueIds.length === 0) return;
    const ok = await requestConfirmation({
      title: uniqueIds.length === 1 ? 'Delete project?' : `Delete ${uniqueIds.length} projects?`,
      message: uniqueIds.length === 1
        ? 'This project, its screens, and saved chat history will be permanently removed.'
        : 'These projects, their screens, and saved chat histories will be permanently removed.',
      confirmLabel: uniqueIds.length === 1 ? 'Delete Project' : `Delete ${uniqueIds.length} Projects`,
      cancelLabel: 'Cancel',
      tone: 'danger',
    });
    if (!ok) return;
    await performDelete(uniqueIds);
  };

  const creditBalanceLabel = billingSummary
    ? `${billingSummary.balanceCredits.toLocaleString()} credits`
    : 'Credits unavailable';
  const creditPlanLabel = billingSummary?.planLabel || 'Free plan';

  const toggleProjectSelection = (projectId: string) => {
    if (deletingIdSet.has(projectId)) return;
    setSelectedProjectIds((prev) => (
      prev.includes(projectId) ? prev.filter((id) => id !== projectId) : [...prev, projectId]
    ));
  };

  const toggleSelectAllProjects = () => {
    const selectableIds = projects
      .map((project) => project.id)
      .filter((projectId) => !deletingIdSet.has(projectId));
    if (selectableIds.length === 0) return;
    const shouldSelectAll = selectableIds.some((projectId) => !selectedIdSet.has(projectId));
    setSelectedProjectIds((prev) => {
      const prevSet = new Set(prev);
      if (shouldSelectAll) {
        selectableIds.forEach((projectId) => prevSet.add(projectId));
      } else {
        selectableIds.forEach((projectId) => prevSet.delete(projectId));
      }
      return Array.from(prevSet);
    });
  };

  const handleCreateFromPrompt = () => {
    const nextPrompt = starterPrompt.trim();
    if (!nextPrompt) return;
    const parsedReferences = extractComposerInlineReferences(nextPrompt);
    setCreatingFromPrompt(true);
    window.sessionStorage.setItem(
      LANDING_DRAFT_KEY,
      JSON.stringify({
        prompt: parsedReferences.cleanedText.trim(),
        images: starterImages,
        referenceUrls: parsedReferences.urlReferences.map((item) => item.url),
        referenceImageUrls: referenceImageUrls.filter((url) => parsedReferences.urlReferences.some((item) => item.url === url)),
        platform: deviceType,
        stylePreset,
        modelProfile,
        modelTemperature,
      })
    );
    onNavigate('/app/projects/new');
  };

  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;
    const availableSlots = Math.max(0, MAX_COMPOSER_ATTACHMENTS - starterImages.length);
    if (availableSlots === 0) {
      event.target.value = '';
      return;
    }
    Array.from(files).slice(0, availableSlots).forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = typeof reader.result === 'string' ? reader.result : '';
        if (!base64) return;
        setStarterImages((prev) => (prev.length >= MAX_COMPOSER_ATTACHMENTS ? prev : [...prev, base64]));
      };
      reader.readAsDataURL(file);
    });
    event.target.value = '';
  };

  const handleSignOut = async () => {
    try {
      await signOutCurrentUser();
      onNavigate('/auth/login');
    } catch {
      setError('Failed to log out. Please try again.');
    } finally {
      setOpenAvatarMenu(false);
    }
  };

  if (!authReady) {
    return <div className="h-screen w-screen grid place-items-center bg-[#06070B] text-gray-300">Loading workspace...</div>;
  }

  if (!isAuthenticated) {
    return <div className="h-screen w-screen grid place-items-center bg-[#06070B] text-rose-200">You need to be logged in.</div>;
  }

  return (
    <div className="h-screen w-screen text-[var(--ui-text)]">
      {isMobileViewport && isMobileSidebarOpen && (
        <div
          className="fixed inset-0 z-[120] bg-[color:color-mix(in_srgb,var(--workspace-backdrop)_82%,black)]/85 backdrop-blur-md lg:hidden"
          onClick={() => setIsMobileSidebarOpen(false)}
        >
          <div
            className="flex h-full w-full max-w-[23rem] flex-col border-r border-[var(--workspace-sidebar-border)] bg-[var(--ui-surface-1)] px-3 pb-4 pt-3"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="rounded-[28px] border border-[var(--workspace-sidebar-border)] bg-[color:color-mix(in_srgb,var(--workspace-soft-strong)_62%,transparent)] p-3">
              <div className="flex items-start justify-between gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileSidebarOpen(false);
                    onNavigate('/');
                  }}
                  className="flex items-center gap-3 rounded-[20px] text-left transition-colors hover:bg-[var(--workspace-soft)]"
                >
                  <span className="grid h-11 w-11 place-items-center rounded-[18px] bg-[var(--workspace-soft)]">
                    <img src={logo} alt="EazyUI logo" className="h-5 w-5 object-contain" />
                  </span>
                  <span>
                    <span className="block text-base font-semibold tracking-[-0.03em] text-[var(--ui-text)]">EazyUI</span>
                    <span className="block text-[11px] uppercase tracking-[0.14em] text-[var(--ui-text-subtle)]">Project workspace</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsMobileSidebarOpen(false)}
                  className="grid h-11 w-11 place-items-center rounded-[18px] border border-[var(--workspace-sidebar-border)] bg-[var(--workspace-soft)] text-[var(--ui-text-muted)] transition-colors hover:text-[var(--ui-text)]"
                  aria-label="Close menu"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="mt-3 flex items-center justify-between rounded-[20px] bg-[var(--workspace-soft)] px-3 py-2">
                <span className="text-[11px] uppercase tracking-[0.14em] text-[var(--ui-text-subtle)]">Library</span>
                <span className="text-sm font-semibold text-[var(--ui-text)]">{projects.length} projects</span>
              </div>
            </div>

            <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                <div className="rounded-[28px] border border-[var(--workspace-sidebar-border)] bg-[color:color-mix(in_srgb,var(--workspace-soft-strong)_56%,transparent)] p-2">
                  <p className="px-2 pb-2 pt-1 text-[11px] uppercase tracking-[0.16em] text-[var(--ui-text-subtle)]">Menu</p>
                  <nav className="flex flex-col gap-1.5">
                    {sidebarNavItems.map(({ id, label, subtitle, Icon, active, onClick, iconClassName }) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => {
                          setIsMobileSidebarOpen(false);
                          onClick();
                        }}
                        className={`flex w-full items-center gap-3 rounded-[22px] px-3 py-3 text-left transition-all ${active
                          ? 'border border-[var(--workspace-sidebar-border)] bg-[var(--ui-surface-1)] text-[var(--ui-text)]'
                          : 'text-[var(--ui-text-muted)] hover:bg-[var(--workspace-soft)] hover:text-[var(--ui-text)]'}`}
                      >
                        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-[18px] ${active ? 'bg-[var(--workspace-soft)] text-[var(--ui-text)]' : 'bg-transparent text-current'} transition-colors`}>
                          <Icon size={16} className={iconClassName} />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-[var(--ui-text)]">{label}</span>
                          <span className="block text-[11px] text-[var(--ui-text-subtle)]">{subtitle}</span>
                        </span>
                      </button>
                    ))}
                  </nav>
                </div>
              </div>

              <div className="mt-4 shrink-0">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {workspaceSignals.map(({ id, title, detail, actionLabel, accentClassName, iconClassName, Icon, path }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        setIsMobileSidebarOpen(false);
                        onNavigate(path);
                      }}
                      className={`flex min-w-0 items-start gap-2.5 rounded-[20px] border px-3 py-2.5 text-left transition-colors ${accentClassName}`}
                    >
                      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-[14px] border ${iconClassName}`}>
                        <Icon size={15} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-semibold leading-snug text-[var(--ui-text)]">{title}</span>
                        <span className="mt-0.5 line-clamp-2 block text-[10px] leading-4 text-[var(--ui-text-muted)]">{detail}</span>
                        <span className="mt-1.5 inline-flex text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--ui-text)]">
                          {actionLabel}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>

                <div className="mt-4 rounded-[22px] border border-[var(--workspace-sidebar-border)] bg-[color:color-mix(in_srgb,var(--workspace-soft-strong)_54%,transparent)] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--ui-text-subtle)]">Appearance</p>
                      <p className="mt-1 text-sm font-medium text-[var(--ui-text)]">Theme</p>
                    </div>
                    {theme === 'light' ? <Sun size={15} className="text-[var(--ui-text-subtle)]" /> : <Moon size={15} className="text-[var(--ui-text-subtle)]" />}
                  </div>
                  <div className="mt-2.5 grid grid-cols-1 gap-1.5 rounded-[18px] bg-[var(--workspace-soft-strong)] p-1 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setTheme('light')}
                      className={`inline-flex h-10 items-center justify-between gap-2 rounded-[13px] px-3 text-[13px] font-medium transition-colors sm:justify-center ${theme === 'light'
                        ? 'bg-[var(--ui-surface-1)] text-[var(--ui-text)]'
                        : 'cursor-pointer text-[var(--ui-text-subtle)] hover:bg-[color:color-mix(in_srgb,var(--workspace-soft)_82%,transparent)] hover:text-[var(--ui-text)]'}`}
                    >
                      <span className="inline-flex items-center gap-2">
                        <Sun size={14} />
                        Light
                      </span>
                      {theme === 'light' ? <Check size={13} className="text-[var(--ui-primary)]" /> : null}
                    </button>
                    <button
                      type="button"
                      onClick={() => setTheme('dark')}
                      className={`inline-flex h-10 items-center justify-between gap-2 rounded-[13px] px-3 text-[13px] font-medium transition-colors sm:justify-center ${theme === 'dark'
                        ? 'bg-[var(--ui-surface-1)] text-[var(--ui-text)]'
                        : 'cursor-pointer text-[var(--ui-text-subtle)] hover:bg-[color:color-mix(in_srgb,var(--workspace-soft)_82%,transparent)] hover:text-[var(--ui-text)]'}`}
                    >
                      <span className="inline-flex items-center gap-2">
                        <Moon size={14} />
                        Dark
                      </span>
                      {theme === 'dark' ? <Check size={13} className="text-[var(--ui-primary)]" /> : null}
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-[28px] border border-[var(--workspace-sidebar-border)] bg-[color:color-mix(in_srgb,var(--workspace-soft-strong)_56%,transparent)] p-3">
                <div className="flex items-center gap-3 rounded-[22px] bg-[var(--workspace-soft)] px-3 py-3 text-left">
                  <span className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-[var(--workspace-sidebar-border)] bg-[var(--ui-surface-2)]">
                    <img src={authPhotoUrl} alt={authDisplayName} className="h-full w-full object-cover" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-[var(--ui-text)]">{authDisplayName}</span>
                    <span className="block truncate text-[11px] text-[var(--ui-text-muted)]">{authEmail}</span>
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsMobileSidebarOpen(false);
                      onNavigate('/pricing');
                    }}
                    className="inline-flex h-10 items-center justify-center rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ui-text)]"
                  >
                    Billing
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsMobileSidebarOpen(false);
                      void handleSignOut();
                    }}
                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-2xl border border-rose-300/30 bg-rose-500/10 px-3 text-xs font-medium uppercase tracking-[0.08em] text-rose-200"
                  >
                    <LogOut size={13} />
                    Logout
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="workspace-shell-frame flex h-full overflow-hidden p-2 md:p-3">
        <aside
          className="hidden h-full min-h-0 shrink-0 flex-col overflow-visible rounded-[28px] bg-transparent transition-[width] duration-300 ease-out lg:flex"
          style={{ width: sidebarWidth }}
        >
          <div className={`flex h-full min-h-0 flex-col ${sidebarExpanded ? 'gap-3' : 'items-center gap-3'}`}>
            <div className={`shrink-0 rounded-[28px] border border-[var(--workspace-sidebar-border)] bg-[color:color-mix(in_srgb,var(--workspace-soft-strong)_58%,transparent)] ${sidebarExpanded ? 'p-3.5' : 'px-2 py-3'}`}>
              <div className={`flex ${sidebarExpanded ? 'items-start justify-between gap-3' : 'flex-col items-center gap-3'}`}>
                <button
                  type="button"
                  onClick={() => onNavigate('/')}
                  className={`group flex items-center rounded-[22px] text-left transition-colors ${sidebarExpanded ? 'gap-3' : 'flex-col gap-2'}`}
                  title="Go to home"
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[18px] bg-[var(--workspace-soft)]">
                    <img src={logo} alt="EazyUI logo" className="h-5 w-5 object-contain" />
                  </span>
                  <span className={`min-w-0 overflow-hidden text-left transition-all duration-300 ${sidebarLabelClassName}`}>
                    <span className="block text-[11px] uppercase tracking-[0.14em] text-[var(--ui-text-subtle)]">Workspace</span>
                    <span className="mt-1 block text-lg font-semibold tracking-[-0.03em] text-[var(--ui-text)]">EazyUI</span>
                    <span className="block text-[11px] text-[var(--ui-text-muted)]">Project control center</span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setSidebarExpanded((expanded) => !expanded)}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-[18px] border border-[var(--workspace-sidebar-border)] bg-[var(--workspace-soft)] text-[var(--ui-text-subtle)] transition-colors hover:text-[var(--ui-text)]"
                  aria-label={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
                  title={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
                >
                  {sidebarExpanded ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
                </button>
              </div>

              {sidebarExpanded ? (
                <div className="mt-3 flex items-center justify-between rounded-[20px] bg-[var(--workspace-soft)] px-3 py-2">
                  <span className="text-[11px] uppercase tracking-[0.14em] text-[var(--ui-text-subtle)]">Projects</span>
                  <span className="text-sm font-semibold text-[var(--ui-text)]">{projects.length}</span>
                </div>
              ) : null}
            </div>

            <div className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] border border-[var(--workspace-sidebar-border)] bg-[color:color-mix(in_srgb,var(--workspace-soft-strong)_52%,transparent)] ${sidebarExpanded ? 'p-3' : 'px-2 py-3'}`}>
              {sidebarExpanded ? (
                <p className="px-2 pb-2 pt-1 text-[11px] uppercase tracking-[0.16em] text-[var(--ui-text-subtle)]">Menu</p>
              ) : (
                <div className="mx-auto mb-3 h-6 w-px rounded-full bg-[var(--workspace-sidebar-border)]" />
              )}
              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                <nav className={`flex flex-col ${sidebarExpanded ? 'gap-1.5' : 'items-center gap-2.5'}`}>
                  {sidebarNavItems.map(({ id, label, subtitle, Icon, active, onClick, iconClassName }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={onClick}
                      className={`group flex items-center transition-all duration-300 ${sidebarExpanded
                        ? `w-full gap-3 rounded-[22px] px-3 py-3 text-left ${active
                          ? 'border border-[var(--workspace-sidebar-border)] bg-[var(--ui-surface-1)] text-[var(--ui-text)]'
                          : 'text-[var(--ui-text-muted)] hover:bg-[var(--workspace-soft)] hover:text-[var(--ui-text)]'}`
                        : `h-12 w-12 justify-center rounded-[18px] ${active
                          ? 'border border-[var(--workspace-sidebar-border)] bg-[var(--ui-surface-1)] text-[var(--ui-text)]'
                          : 'text-[var(--ui-text-subtle)] hover:bg-[var(--workspace-soft)] hover:text-[var(--ui-text)]'}`}`}
                      title={label}
                    >
                      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-[16px] ${active ? 'bg-[var(--workspace-soft)] text-[var(--ui-text)]' : 'bg-transparent text-current'} transition-colors`}>
                        <Icon size={16} className={iconClassName} />
                      </span>
                      <span className={`min-w-0 overflow-hidden transition-all duration-300 ${sidebarLabelClassName}`}>
                        <span className="block text-sm font-medium text-[var(--ui-text)]">{label}</span>
                        <span className="block text-[11px] text-[var(--ui-text-subtle)]">{subtitle}</span>
                      </span>
                    </button>
                  ))}
                </nav>
              </div>

              <div className="mt-4 shrink-0">
                <div className="flex flex-col gap-3 pb-1">
                  {sidebarExpanded ? (
                    <>
                      <div className="rounded-[22px] border border-[var(--workspace-sidebar-border)] bg-[color:color-mix(in_srgb,var(--workspace-soft)_92%,transparent)] p-2.5">
                        <div className="flex items-start gap-3">
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[14px] border border-amber-300/20 bg-amber-400/10 text-amber-200">
                            <Sparkles size={14} />
                          </span>
                          <div className="min-w-0">
                            <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--ui-text-subtle)]">Workspace signals</p>
                            <p className="mt-0.5 text-[13px] font-semibold text-[var(--ui-text)]">Plans and updates</p>
                          </div>
                        </div>
                        <div className="mt-2.5 flex flex-col gap-1.5">
                          {workspaceSignals.map(({ id, title, detail, actionLabel, path, Icon, iconClassName }) => (
                            <button
                              key={id}
                              type="button"
                              onClick={() => onNavigate(path)}
                              className="flex min-w-0 items-start gap-2.5 rounded-[16px] border border-[var(--workspace-sidebar-border)] bg-[var(--workspace-soft)] px-3 py-2.5 text-left transition-colors hover:bg-[var(--ui-surface-1)]"
                            >
                              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-[12px] border ${iconClassName}`}>
                                <Icon size={13} />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="flex items-center justify-between gap-2">
                                  <span className="block text-[12px] font-semibold leading-snug text-[var(--ui-text)]">{title}</span>
                                  <span className="shrink-0 text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--ui-text-subtle)]">{actionLabel}</span>
                                </span>
                                <span className="mt-0.5 block text-[10px] leading-4 text-[var(--ui-text-muted)]">{detail}</span>
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-[22px] border border-[var(--workspace-sidebar-border)] bg-[color:color-mix(in_srgb,var(--workspace-soft)_88%,transparent)] p-2.5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--ui-text-subtle)]">Appearance</p>
                            <p className="mt-0.5 text-[13px] font-medium text-[var(--ui-text)]">Theme</p>
                          </div>
                          {theme === 'light' ? <Sun size={15} className="text-[var(--ui-text-subtle)]" /> : <Moon size={15} className="text-[var(--ui-text-subtle)]" />}
                        </div>
                        <div className="mt-2.5 flex flex-col gap-1.5 rounded-[18px] bg-[var(--workspace-soft-strong)] p-1">
                          <button
                            type="button"
                            onClick={() => setTheme('light')}
                            className={`inline-flex h-9 items-center justify-between gap-3 rounded-[13px] px-3 text-left text-[12px] font-medium transition-colors ${theme === 'light'
                              ? 'bg-[var(--ui-surface-1)] text-[var(--ui-text)]'
                              : 'cursor-pointer text-[var(--ui-text-subtle)] hover:bg-[color:color-mix(in_srgb,var(--workspace-soft)_82%,transparent)] hover:text-[var(--ui-text)]'}`}
                          >
                            <span className="inline-flex items-center gap-2">
                              <Sun size={14} />
                              <span>Light</span>
                            </span>
                            <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-[var(--ui-text-subtle)]">
                              <span>Clear</span>
                              {theme === 'light' ? <Check size={12} className="text-[var(--ui-primary)]" /> : null}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setTheme('dark')}
                            className={`inline-flex h-9 items-center justify-between gap-3 rounded-[13px] px-3 text-left text-[12px] font-medium transition-colors ${theme === 'dark'
                              ? 'bg-[var(--ui-surface-1)] text-[var(--ui-text)]'
                              : 'cursor-pointer text-[var(--ui-text-subtle)] hover:bg-[color:color-mix(in_srgb,var(--workspace-soft)_82%,transparent)] hover:text-[var(--ui-text)]'}`}
                          >
                            <span className="inline-flex items-center gap-2">
                              <Moon size={14} />
                              <span>Dark</span>
                            </span>
                            <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-[var(--ui-text-subtle)]">
                              <span>Focus</span>
                              {theme === 'dark' ? <Check size={12} className="text-[var(--ui-primary)]" /> : null}
                            </span>
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      {workspaceSignals.map(({ id, title, Icon, path }) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => onNavigate(path)}
                          className="grid h-12 w-12 place-items-center rounded-[18px] border border-[var(--workspace-sidebar-border)] bg-[var(--workspace-soft)] text-[var(--ui-text-muted)] transition-colors hover:bg-[var(--ui-surface-1)] hover:text-[var(--ui-text)]"
                          title={title}
                        >
                          <Icon size={16} />
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                        className="grid h-12 w-12 place-items-center rounded-[18px] border border-[var(--workspace-sidebar-border)] bg-[var(--workspace-soft)] text-[var(--ui-text-muted)] transition-colors hover:bg-[var(--ui-surface-1)] hover:text-[var(--ui-text)]"
                        title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
                      >
                        {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="relative z-20 shrink-0" ref={avatarMenuRef}>
              <button
                type="button"
                onClick={() => setOpenAvatarMenu((open) => !open)}
                className={`flex w-full items-center overflow-hidden border border-[var(--workspace-sidebar-border)] bg-[color:color-mix(in_srgb,var(--workspace-soft-strong)_56%,transparent)] text-[12px] font-medium text-[var(--ui-text)] transition-all hover:bg-[var(--workspace-soft)] ${sidebarExpanded ? 'gap-3 rounded-[24px] px-2.5 py-2.5 text-left' : 'h-14 w-14 justify-center rounded-[22px]'}`}
                title="Account"
              >
                <span className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-[var(--workspace-sidebar-border)] bg-[var(--ui-surface-2)]">
                  <img src={authPhotoUrl} alt={authDisplayName} className="h-full w-full object-cover" />
                </span>
                <span className={`min-w-0 overflow-hidden transition-all duration-300 ${sidebarLabelClassName}`}>
                  <span className="block text-sm font-semibold text-[var(--ui-text)]">{authDisplayName}</span>
                  <span className="block text-[11px] text-[var(--ui-text-muted)]">{authEmail}</span>
                </span>
              </button>
              {openAvatarMenu && (
                <div className={`absolute z-40 ${avatarMenuPositionClassName} ${avatarMenuWidthClassName} rounded-[24px] border border-[var(--ui-border)] bg-[color:color-mix(in_srgb,var(--ui-popover)_94%,transparent)] p-3 shadow-[0_28px_60px_rgba(0,0,0,0.28)] backdrop-blur-xl`}>
                  <div className="flex items-center gap-2">
                    <div className="h-9 w-9 overflow-hidden rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-2)]">
                      <img src={authPhotoUrl} alt={authDisplayName} className="h-full w-full object-cover" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--ui-text)]">{authDisplayName}</p>
                      <p className="truncate text-[11px] text-[var(--ui-text-muted)]">{authEmail}</p>
                    </div>
                  </div>
                  <div className="mt-3 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)]/80 px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ui-text-subtle)]">Current plan</p>
                        <p className="mt-1 text-sm font-semibold text-[var(--ui-text)]">{creditPlanLabel}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ui-text-subtle)]">Balance</p>
                        <p className="mt-1 text-sm font-semibold text-[var(--ui-text)]">{creditBalanceLabel}</p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setOpenAvatarMenu(false);
                        onNavigate('/pricing');
                      }}
                      className="inline-flex h-10 items-center justify-center rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ui-text)] transition-colors hover:bg-[var(--ui-surface-3)]"
                    >
                      Billing
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void loadBillingSummary();
                      }}
                      className="inline-flex h-10 items-center justify-center rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ui-text)] transition-colors hover:bg-[var(--ui-surface-3)]"
                    >
                      Refresh
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleSignOut()}
                    className="mt-3 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-2xl border border-rose-300/30 bg-rose-500/10 text-xs font-medium uppercase tracking-[0.08em] text-rose-200 transition-colors hover:bg-rose-500/20"
                  >
                    <LogOut size={13} />
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1 lg:pl-3">
          <div className="flex h-full flex-col overflow-hidden rounded-[30px] bg-[var(--ui-surface-1)] shadow-[var(--workspace-content-shadow)]">
            <div className="px-4 py-4 md:px-7">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIsMobileSidebarOpen(true)}
                    className="grid h-11 w-11 place-items-center rounded-2xl border border-[var(--workspace-sidebar-border)] bg-[var(--workspace-soft)] text-[var(--ui-text-muted)] lg:hidden"
                    aria-label="Open workspace menu"
                  >
                    <Menu size={18} />
                  </button>
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--ui-text-subtle)] lg:hidden">Workspace</p>
                    {/* <h1 className="mt-1 text-[24px] font-semibold tracking-[-0.03em] text-[var(--ui-text)] md:text-[30px]">Projects</h1> */}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] ${shellBadgeClassName}`}>
                    <FolderOpen size={12} />
                    {projects.length} projects
                  </span>
                  <span className={`hidden items-center gap-2 rounded-full border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] sm:inline-flex ${shellBadgeClassName}`}>
                    {theme === 'light' ? <Sun size={12} /> : <Moon size={12} />}
                    {theme} mode
                  </span>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              <main className="relative mx-auto max-w-[1200px] px-4 py-8 md:px-7 md:py-10">
                <motion.section
                  className="mx-auto max-w-[920px] text-center"
                  initial={shouldReduceMotion ? false : { opacity: 0, y: 18 }}
                  animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
                  transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                >
                  <motion.p
                    className="inline-flex items-center gap-2 rounded-full border border-[var(--workspace-content-border)] bg-[var(--workspace-soft)] px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-[var(--ui-primary)]"
                    initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
                    animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
                    transition={{ duration: 0.48, delay: 0.04, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <Sparkles size={12} />
                    Build faster in one workspace
                  </motion.p>
                  <motion.p
                    className="mt-5 text-[32px] font-semibold leading-none tracking-[-0.04em] text-[var(--ui-text)] sm:text-[38px] md:text-[58px]"
                    initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
                    animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
                    transition={{ duration: 0.58, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <span className="relative inline-flex align-baseline">
                      <span className="sr-only">EazyUI</span>
                      <img
                        src={workspaceWordmark}
                        alt=""
                        aria-hidden="true"
                        className="relative top-[16px] md:top-[20px] -right-[10px] h-[1.78em] w-auto  object-contain"
                      />
                    </span>{' '}
                    Projects
                  </motion.p>
                  <motion.p
                    className="mt-3 text-[15px] leading-7 text-[var(--ui-text-muted)]"
                    initial={shouldReduceMotion ? false : { opacity: 0, y: 14 }}
                    animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
                    transition={{ duration: 0.52, delay: 0.16, ease: [0.22, 1, 0.36, 1] }}
                  >
                    Type what you want to build and start a new project instantly.
                  </motion.p>

                  <motion.form
                    className="mt-8"
                    onSubmit={(event) => {
                      event.preventDefault();
                      handleCreateFromPrompt();
                    }}
                    initial={shouldReduceMotion ? false : { opacity: 0, y: 20, scale: 0.985 }}
                    animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.62, delay: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  >
            <div className="relative mx-auto w-full overflow-visible">
              <ComposerAttachmentStack
                images={starterImages}
                onRemove={(index) => setStarterImages((prev) => prev.filter((_, i) => i !== index))}
              />
              <div className="relative z-10 rounded-[24px] border border-[color:color-mix(in_srgb,var(--ui-primary)_18%,var(--workspace-content-border))] bg-[var(--workspace-soft)] p-2.5 text-left sm:p-3 md:rounded-[28px] md:p-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <div className="flex items-start gap-2 px-1">
                  <div className="mt-0.5 hidden h-9 w-9 shrink-0 rounded-full border border-[color:color-mix(in_srgb,var(--ui-primary)_18%,var(--ui-border))] bg-[color:color-mix(in_srgb,var(--ui-primary)_8%,var(--ui-surface-3))] p-[2px] sm:block">
                    <Orb
                      className="h-full w-full"
                      colors={workspaceOrbColors}
                      seed={7307}
                      agentState={workspaceOrbState}
                      volumeMode="manual"
                      manualInput={workspaceOrbInput}
                      manualOutput={workspaceOrbOutput}
                    />
                  </div>
                  <ComposerInlineReferenceInput
                    ref={starterPromptRef}
                    value={starterPrompt}
                    onChange={(nextValue, cursor) => {
                      setStarterPrompt(nextValue);
                      syncReferenceTrigger(nextValue, cursor);
                    }}
                    onSelectionChange={syncReferenceTrigger}
                    onReferenceClick={handleReferenceTokenClick}
                    onKeyDown={(event) => {
                      if (isReferenceMenuOpen) {
                        if (referenceMenuMode === 'root' && rootReferenceOptions.length > 0) {
                          if (event.key === 'ArrowDown') {
                            event.preventDefault();
                            setReferenceActiveIndex((prev) => (prev + 1) % rootReferenceOptions.length);
                            return;
                          }
                          if (event.key === 'ArrowUp') {
                            event.preventDefault();
                            setReferenceActiveIndex((prev) => (prev - 1 + rootReferenceOptions.length) % rootReferenceOptions.length);
                            return;
                          }
                          if (event.key === 'Escape') {
                            event.preventDefault();
                            closeReferenceMenu();
                            return;
                          }
                          if (event.key === 'Enter' && !event.shiftKey) {
                            event.preventDefault();
                            const choice = rootReferenceOptions[referenceActiveIndex] || rootReferenceOptions[0];
                            if (choice?.key === 'url') openUrlReferenceInput('trigger');
                            return;
                          }
                        }
                        if (referenceMenuMode === 'url' && event.key === 'Escape') {
                          event.preventDefault();
                          closeReferenceMenu();
                          return;
                        }
                      }
                      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                        event.preventDefault();
                        handleCreateFromPrompt();
                      }
                    }}
                    placeholder="What do you want to create?"
                    placeholderClassName="px-2 py-1 text-left"
                    className="no-focus-ring w-full min-h-[88px] max-h-[240px] overflow-y-auto border-0 bg-transparent px-1 py-1 text-[15px] leading-normal text-left text-[var(--ui-text)] ring-0 focus:border-0 focus:outline-none focus:ring-0 sm:px-2 sm:text-[16px]"
                  />
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-[var(--ui-border)] pt-2">
                <div className="flex items-center gap-2.5">
                  <div className="relative">
                    <motion.button
                      type="button"
                      onClick={() => {
                        setIsReferenceMenuOpen(false);
                        if (isAddMenuOpen) {
                          closeAddMenu();
                          return;
                        }
                        setIsAddMenuOpen(true);
                      }}
                      className="grid h-9 w-9 place-items-center rounded-full bg-[var(--ui-surface-1)] text-[var(--ui-text-muted)] ring-1 ring-[color:color-mix(in_srgb,var(--ui-primary)_18%,var(--ui-border))] transition-all hover:bg-[var(--ui-surface-1)] hover:text-[var(--ui-primary)]"
                      title="Add to prompt"
                      whileHover={shouldReduceMotion ? undefined : { y: -1 }}
                      whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
                    >
                      <Plus size={18} />
                    </motion.button>
                    {isAddMenuOpen && (
                      <ComposerAddMenu
                        menuRef={addMenuRef}
                        onAddFiles={() => {
                          closeAddMenu();
                          fileInputRef.current?.click();
                        }}
                        onAddUrl={() => {
                          closeAddMenu();
                          openUrlReferenceInput('append');
                        }}
                      />
                    )}
                  </div>
                  <div className="flex items-center rounded-full bg-[var(--ui-surface-1)] p-1 ring-1 ring-[var(--ui-border)]">
                    {(['mobile', 'tablet', 'desktop'] as const).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setDeviceType(p)}
                        className={`p-1.5 rounded-full transition-all ${deviceType === p
                          ? 'bg-[var(--ui-primary)] text-[var(--ui-text)] shadow-sm'
                          : 'text-[var(--ui-text-subtle)] hover:text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-1)]'
                          }`}
                        title={`Generate for ${p}`}
                      >
                        {p === 'mobile' && <Smartphone size={15} />}
                        {p === 'tablet' && <Tablet size={15} />}
                        {p === 'desktop' && <Monitor size={15} />}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center rounded-full bg-[var(--ui-surface-1)] p-1 ring-1 ring-[var(--ui-border)]">
                    <button
                      type="button"
                      onClick={() => setModelProfile('fast')}
                      className={`h-8 w-8 rounded-full text-[11px] font-semibold transition-all inline-flex items-center justify-center ${modelProfile === 'fast'
                        ? 'bg-[var(--ui-surface-1)] text-amber-400 ring-1 ring-amber-400/40'
                        : 'text-amber-400 hover:text-amber-200 hover:bg-[var(--ui-surface-1)]'
                        }`}
                      title="Fast mode"
                    >
                      <Zap size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setModelProfile('quality')}
                      className={`h-8 w-8 rounded-full text-[11px] font-semibold transition-all inline-flex items-center justify-center ${modelProfile === 'quality'
                        ? 'bg-[var(--ui-surface-1)] text-[var(--ui-primary)] ring-1 ring-[color:color-mix(in_srgb,var(--ui-primary)_42%,transparent)]'
                        : 'text-[color:color-mix(in_srgb,var(--ui-primary)_70%,white)] hover:text-[var(--ui-primary)] hover:bg-[var(--ui-surface-1)]'
                        }`}
                      title="Quality mode"
                    >
                      <Sparkles size={12} />
                    </button>
                  </div>
                  <div ref={styleMenuRef} className="relative flex items-center">
                    <button
                      type="button"
                      onClick={() => setShowStyleMenu((open) => !open)}
                      className={`h-9 w-9 rounded-full ring-1 transition-all inline-flex items-center justify-center ${styleButtonTone}`}
                      title="Select style preset"
                    >
                      <StyleIcon size={14} />
                    </button>
                    {showStyleMenu && (
                      <div className="absolute bottom-12 right-0 w-56 bg-[var(--ui-popover)] border border-[var(--ui-border)] rounded-xl shadow-2xl p-2 z-50">
                        {(['modern', 'minimal', 'vibrant', 'luxury', 'playful'] as const).map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setStylePreset(preset)}
                            className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wide transition-colors ${stylePreset === preset
                              ? 'bg-[color:color-mix(in_srgb,var(--ui-primary)_18%,transparent)] text-[var(--ui-primary)]'
                              : 'text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-4)]'
                              }`}
                          >
                            {preset}
                          </button>
                        ))}
                        <div className="mt-2 border-t border-[var(--ui-border)] pt-2 px-1">
                          <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.08em] text-[var(--ui-text-subtle)]">
                            <span>Temporary</span>
                            <span>{modelTemperature.toFixed(2)}</span>
                          </div>
                          <label className="mt-1.5 block text-[11px] text-[var(--ui-text-muted)]">
                            Temperature
                            <input
                              type="range"
                              min={0}
                              max={2}
                              step={0.01}
                              value={modelTemperature}
                              onChange={(event) => {
                                const numeric = Number(event.target.value);
                                if (!Number.isFinite(numeric)) return;
                                setModelTemperature(Math.max(0, Math.min(2, numeric)));
                              }}
                              className="mt-2 w-full accent-[var(--ui-primary)] cursor-pointer"
                            />
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                  <motion.button
                    type="submit"
                    disabled={!starterPrompt.trim() || creatingFromPrompt}
                    className={`h-10 w-10 shrink-0 rounded-full border flex items-center justify-center transition-all disabled:opacity-40 ${accentButtonClassName}`}
                    title="Create project from request"
                    whileHover={shouldReduceMotion ? undefined : { y: -1, scale: 1.02 }}
                    whileTap={shouldReduceMotion ? undefined : { scale: 0.98 }}
                  >
                    {creatingFromPrompt ? <Loader2 size={16} className="animate-spin" /> : <ArrowUp size={15} />}
                  </motion.button>
                </div>
              </div>
              {isReferenceMenuOpen && (
                <ComposerReferenceMenu
                  activeIndex={referenceActiveIndex}
                  menuMode={referenceMenuMode}
                  menuRef={referenceMenuRef}
                  onCancel={closeReferenceMenu}
                  onRootOptionHover={setReferenceActiveIndex}
                  onScreenHover={setReferenceActiveIndex}
                  onSelectRootOption={(key) => {
                    if (key === 'url') openUrlReferenceInput('trigger');
                  }}
                  onSubmitUrl={submitUrlReference}
                  includeScrapedImages={referenceIncludeScrapedImages}
                  rootOptions={rootReferenceOptions}
                  urlDraft={referenceUrlDraft}
                  urlInputRef={referenceUrlInputRef}
                  onIncludeScrapedImagesChange={setReferenceIncludeScrapedImages}
                  onUrlDraftChange={setReferenceUrlDraft}
                />
              )}
              </div>
            </div>
                  </motion.form>
                </motion.section>

                <motion.section
                  className="mt-16 md:mt-20"
                  initial={shouldReduceMotion ? false : { opacity: 0, y: 22 }}
                  animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
                  transition={{ duration: 0.58, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
                >
          <h1 className="text-[34px] md:text-[52px] leading-[0.96] font-semibold tracking-[-0.03em]">Your Projects</h1>
          <p className="mt-3 text-sm text-[var(--ui-text-muted)]">Open, continue, or remove projects saved in Firestore/Storage.</p>

          {error && (
            <div className="mt-5 rounded-2xl border border-rose-300/35 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          )}

          {deleteProgress && (
            <div className="mt-5 rounded-2xl border border-[var(--ui-border-light)] bg-[var(--ui-surface-2)] px-4 py-3 text-sm text-[var(--ui-text)]">
              <span className="inline-flex items-center gap-2">
                <Loader2 size={14} className="animate-spin text-[var(--color-accent)]" />
                Deleting projects... {deleteProgress.completed}/{deleteProgress.total}
              </span>
            </div>
          )}

          {!loading && projects.length > 0 && hasSelectedProjects && (
            <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-4 py-3">
              <label className="inline-flex items-center gap-2 text-sm text-[var(--ui-text-muted)]">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAllProjects}
                  className="ui-check"
                />
                Select all
              </label>
              <span className="text-xs text-[var(--ui-text-subtle)]">
                {hasSelectedProjects ? `${selectedProjectIds.length} selected` : 'No project selected'}
              </span>
              <button
                type="button"
                onClick={() => void handleDelete(selectedProjectIds)}
                disabled={!hasSelectedProjects || deleteProgress !== null}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-rose-300/35 bg-rose-500/10 px-3 text-[11px] uppercase tracking-[0.08em] text-[var(--color-error)] hover:bg-rose-500/20 disabled:opacity-50"
              >
                {deleteProgress ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                Delete selected
              </button>
            </div>
          )}

          {loading && (
            <div className="mt-6 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-5 py-4 text-sm text-[var(--ui-text-muted)]">
              Loading projects...
            </div>
          )}

          {!loading && projects.length === 0 && (
            <div className="mt-6 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-5 py-7 text-sm text-[var(--ui-text-muted)]">
              No projects yet. Start with New Project.
            </div>
          )}

          {!loading && projects.length > 0 && (
            <section className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-3">
              {projects.map((project, index) => (
                <motion.article
                  key={project.id}
                  className={`relative rounded-[22px] border p-3 shadow-[0_16px_32px_rgba(0,0,0,0.06)] sm:rounded-[24px] sm:p-4 ${selectedIdSet.has(project.id) ? 'border-[var(--ui-primary)] bg-[var(--ui-surface-3)]' : 'border-[var(--workspace-content-border)] bg-[var(--workspace-soft)]'}`}
                  initial={shouldReduceMotion ? false : { opacity: 0, y: 24, scale: 0.985 }}
                  animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.42, delay: Math.min(index * 0.04, 0.24), ease: [0.22, 1, 0.36, 1] }}
                  whileHover={shouldReduceMotion ? undefined : { y: -4 }}
                >
                  <div className="absolute left-3 top-3 z-10">
                    <input
                      type="checkbox"
                      checked={selectedIdSet.has(project.id)}
                      onChange={() => toggleProjectSelection(project.id)}
                      disabled={deletingIdSet.has(project.id)}
                      className="ui-check"
                      aria-label={`Select ${project.name || 'project'}`}
                    />
                  </div>
                  <div className="mb-3">
                    {(() => {
                      const frameImages = Array.from(new Set([
                        ...(project.coverImageUrls || []).filter(Boolean),
                        project.coverImageUrl || '',
                      ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0))).slice(0, 2);
                      if (frameImages.length === 0) {
                        return (
                          <div className="grid h-[130px] place-items-center rounded-xl border border-dashed border-[var(--ui-border)] bg-[var(--ui-surface-1)] text-[11px] text-[var(--ui-text-subtle)]">
                            Preview will appear after save
                          </div>
                        );
                      }
                      return (
                        <div className="relative flex h-[210px] items-center justify-center gap-2 overflow-hidden rounded-[18px] bg-[var(--workspace-soft-strong)] px-2 py-3 sm:h-[260px] sm:gap-3 sm:rounded-[20px] sm:px-3 sm:py-4">
                          {frameImages.map((imageUrl, index) => (
                            <div
                              key={`${project.id}-preview-${index}`}
                              className={`relative overflow-hidden rounded-[18px] border border-white/15 bg-[#080A12] shadow-[0_16px_30px_rgba(0,0,0,0.5)] ${frameImages.length > 1
                                ? index === 0
                                  ? 'h-[170px] w-[82px] -rotate-3 sm:h-[220px] sm:w-[108px]'
                                  : 'h-[170px] w-[82px] rotate-3 sm:h-[220px] sm:w-[108px]'
                                : 'h-[182px] w-[92px] sm:h-[230px] sm:w-[116px]'
                                }`}
                            >
                              <div className="absolute inset-[3px] overflow-hidden rounded-[15px] bg-[#121623]">
                                <img
                                  src={imageUrl}
                                  alt={`${project.name} preview ${index + 1}`}
                                  className="h-full w-full object-contain"
                                  loading="lazy"
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[16px] font-semibold text-[var(--ui-text)]">{project.name || 'Untitled project'}</p>
                      <p className="mt-1 truncate text-[11px] text-[var(--ui-text-subtle)]">{project.id}</p>
                    </div>
                    <span className={`text-[10px] uppercase tracking-[0.08em] ${project.hasSnapshot ? 'text-emerald-300' : 'text-amber-300'}`}>
                      {project.hasSnapshot ? 'Backed up' : 'Meta only'}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-[11px] text-[var(--ui-text-muted)]">
                    <span>Updated {formatDate(project.updatedAt)}</span>
                    <span>{project.screenCount ?? 0} screens</span>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenProject(project.id)}
                      disabled={deletingIdSet.has(project.id)}
                      className="h-9 rounded-full border border-[var(--ui-border-light)] px-3 text-[11px] uppercase tracking-[0.08em] text-[var(--ui-text-muted)] hover:border-[var(--ui-border-light)] hover:text-[var(--ui-text)] disabled:opacity-50"
                    >
                      <span className="inline-flex items-center gap-1.5"><FolderOpen size={12} /> Open</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete([project.id])}
                      disabled={deletingIdSet.has(project.id) || deleteProgress !== null}
                      className="h-9 rounded-full border border-rose-300/35 bg-rose-500/10 px-3 text-[11px] uppercase tracking-[0.08em] text-[var(--color-error)] hover:bg-rose-500/20 disabled:opacity-50"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        {deletingIdSet.has(project.id) ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                        {deletingIdSet.has(project.id) ? 'Deleting' : 'Delete'}
                      </span>
                    </button>
                  </div>
                </motion.article>
              ))}
            </section>
          )}
                </motion.section>
              </main>
            </div>
          </div>
        </div>
      </div>
      <ConfirmationDialog />
    </div>
  );
}
