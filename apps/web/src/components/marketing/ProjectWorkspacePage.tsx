import { ArrowUp, ChevronLeft, ChevronRight, CircleStar, FolderOpen, Gem, House, LineSquiggle, Loader2, LogOut, Monitor, Moon, Palette, Plus, RefreshCcw, Search, Smile, Smartphone, Sparkles, Sun, Tablet, Trash2, X, Zap } from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { apiClient } from '../../api/client';
import type { DesignModelProfile } from '../../constants/designModels';
import logo from '../../assets/Ui-logo.png';
import type { User } from 'firebase/auth';
import { observeAuthState, signOutCurrentUser } from '../../lib/auth';
import { useUiStore } from '../../stores';
import { useOrbVisuals, type OrbActivityState } from '../../utils/orbVisuals';
import { ConfirmationDialog } from '../ui/ConfirmationDialog';
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
const SIDEBAR_EXPANDED_WIDTH = 264;
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
  {
    id: 'new-feature',
    title: 'New feature',
    detail: 'Project-aware planning is live for sharper first drafts and cleaner flows.',
    actionLabel: 'See changelog',
    accentClassName: 'border-indigo-300/20 bg-indigo-400/10 text-indigo-100',
    iconClassName: 'border-indigo-300/25 bg-indigo-400/12 text-indigo-200',
    Icon: Sparkles,
    path: '/changelog',
  },
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const starterPromptRef = useRef<HTMLTextAreaElement | null>(null);
  const avatarMenuRef = useRef<HTMLDivElement | null>(null);
  const styleMenuRef = useRef<HTMLDivElement | null>(null);

  const isLight = theme === 'light';
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
    ? 'bg-[var(--ui-surface-4)] text-[var(--ui-text)] ring-[var(--ui-border-light)] hover:bg-[var(--ui-surface-4)]'
    : stylePreset === 'vibrant'
      ? 'bg-emerald-400/15 text-emerald-200 ring-emerald-300/35 hover:bg-emerald-400/20'
      : stylePreset === 'luxury'
        ? 'bg-amber-400/15 text-amber-200 ring-amber-300/35 hover:bg-amber-400/20'
        : stylePreset === 'playful'
          ? 'bg-fuchsia-400/15 text-fuchsia-200 ring-fuchsia-300/35 hover:bg-fuchsia-400/20'
        : 'bg-indigo-400/15 text-indigo-200 ring-indigo-300/35 hover:bg-indigo-400/20';
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
    ? 'max-w-[160px] translate-x-0 opacity-100'
    : 'pointer-events-none max-w-0 -translate-x-2 opacity-0';
  const avatarMenuPositionClassName = sidebarExpanded ? 'left-full ml-3' : 'left-[56px]';
  const shellBadgeClassName = isLight
    ? 'border-slate-300/70 bg-white/85 text-slate-700'
    : 'border-white/10 bg-white/[0.04] text-slate-300';
  const accentButtonClassName = isLight
    ? 'border-indigo-200 bg-indigo-500 text-white hover:bg-indigo-600'
    : 'border-indigo-300/10 bg-indigo-500 text-white hover:bg-indigo-400';

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

  const focusComposer = () => {
    starterPromptRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    starterPromptRef.current?.focus();
  };

  useEffect(() => {
    if (!authReady || !isAuthenticated) return;
    void loadProjects();
  }, [authReady, isAuthenticated]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.innerWidth < 1024) {
      setSidebarExpanded(false);
    }
  }, []);

  useEffect(() => {
    const unsub = observeAuthState((user) => setAuthUser(user));
    return () => unsub();
  }, []);

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
    setCreatingFromPrompt(true);
    window.sessionStorage.setItem(
      LANDING_DRAFT_KEY,
      JSON.stringify({
        prompt: nextPrompt,
        images: starterImages,
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
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = typeof reader.result === 'string' ? reader.result : '';
        if (!base64) return;
        setStarterImages((prev) => [...prev, base64]);
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
      <div className="workspace-shell-frame flex h-full overflow-hidden p-2 md:p-3">
        <aside
          className="flex shrink-0 flex-col rounded-[28px] transition-[width] duration-300 ease-out"
          style={{ width: sidebarWidth }}
        >
          <div className={`flex items-center ${sidebarExpanded ? 'justify-between gap-3' : 'flex-col gap-2'}`}>
            <button
              type="button"
              onClick={() => onNavigate('/')}
              className={`group flex items-center rounded-[22px] transition-colors ${sidebarExpanded ? 'gap-3 px-2 py-2 hover:bg-[var(--workspace-soft)]' : 'h-12 w-12 justify-center hover:bg-[var(--workspace-soft)]'}`}
              title="Go to home"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center">
                <img src={logo} alt="EazyUI logo" className="h-5 w-5 object-contain" />
              </span>
              <span className={`overflow-hidden whitespace-nowrap text-left transition-all duration-300 ${sidebarLabelClassName}`}>
                <span className="block text-lg font-semibold text-[var(--ui-text)]">EazyUI</span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSidebarExpanded((expanded) => !expanded)}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-[var(--ui-text-subtle)] transition-colors hover:border-[var(--ui-border-light)] hover:text-[var(--ui-text)]"
              aria-label={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
              title={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
            >
              {sidebarExpanded ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
            </button>
          </div>

          {/* {sidebarExpanded && (
            <button
              type="button"
              onClick={focusComposer}
              className="mt-4 flex h-16 items-center justify-between rounded-[22px] border border-[var(--workspace-sidebar-border)] bg-[var(--workspace-soft)] px-4 text-left transition-colors hover:bg-[var(--workspace-soft-strong)]"
            >
              <div className="inline-flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[var(--workspace-soft-strong)] text-[var(--ui-text-subtle)]">
                  <Search size={16} />
                </span>
                <div>
                  <p className="text-sm font-medium text-[var(--ui-text)]">Search</p>
                  <p className="text-[11px] text-[var(--ui-text-subtle)]">Jump to your next build idea</p>
                </div>
              </div>
              <span className={`inline-flex items-center gap-2 rounded-2xl border px-2.5 py-2 text-[11px] font-semibold ${shellBadgeClassName}`}>
                <Search size={12} />
                Ctrl K
              </span>
            </button>
          )} */}

          <div className="mt-5 flex flex-1 flex-col overflow-hidden">
            {sidebarExpanded && (
              <p className="mb-2 px-2 text-[11px] uppercase tracking-[0.16em] text-[var(--ui-text-subtle)]">Menu</p>
            )}
            <nav className={`flex flex-col ${sidebarExpanded ? 'gap-1.5' : 'items-center gap-2'}`}>
              {sidebarNavItems.map(({ id, label, subtitle, Icon, active, onClick, iconClassName }) => (
                <button
                  key={id}
                  type="button"
                  onClick={onClick}
                  className={`group flex items-center transition-all duration-300 ${sidebarExpanded
                    ? `w-full gap-3 rounded-[22px] px-3 py-3 text-left ${active
                      ? 'border border-[var(--workspace-sidebar-border)] bg-[var(--workspace-soft-strong)] text-[var(--ui-text)] shadow-[0_12px_30px_rgba(0,0,0,0.08)]'
                      : 'text-[var(--ui-text-muted)] hover:bg-[var(--workspace-soft)] hover:text-[var(--ui-text)]'}`
                    : `h-12 w-12 justify-center rounded-2xl ${active
                      ? 'border border-[var(--workspace-sidebar-border)] bg-[var(--workspace-soft-strong)] text-[var(--ui-text)] shadow-[0_10px_24px_rgba(0,0,0,0.08)]'
                      : 'text-[var(--ui-text-subtle)] hover:bg-[var(--workspace-soft)] hover:text-[var(--ui-text)]'}`}`}
                  title={label}
                >
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-2xl ${active ? 'bg-[var(--workspace-soft)] text-[var(--ui-text)]' : 'bg-transparent text-current'} transition-colors`}>
                    <Icon size={16} className={iconClassName} />
                  </span>
                  <span className={`overflow-hidden whitespace-nowrap transition-all duration-300 ${sidebarLabelClassName}`}>
                    <span className="block text-sm font-medium text-[var(--ui-text)]">{label}</span>
                    <span className="block text-[11px] text-[var(--ui-text-subtle)]">{subtitle}</span>
                  </span>
                </button>
              ))}
            </nav>

            <div className="mt-auto flex flex-col gap-3 pt-5">
              {sidebarExpanded ? (
                <>

                  <button
                    type="button"
                    onClick={() => onNavigate('/changelog')}
                    className="flex items-center gap-3 rounded-[22px] border border-[var(--workspace-sidebar-border)] bg-[var(--workspace-soft)] px-3 py-3 text-left transition-colors hover:bg-[var(--workspace-soft-strong)]"
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-indigo-300/20 bg-indigo-400/12 text-indigo-300">
                      <Gem size={16} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-[var(--ui-text)]">New feature</span>
                      <span className="block text-[11px] leading-4 text-[var(--ui-text-subtle)]">Project-aware planning is live.</span>
                    </span>
                  </button>

                  <div className="rounded-[24px] border border-[var(--workspace-upgrade-border)] bg-[var(--workspace-upgrade-bg)] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.08)]">
                    <div className="flex items-start gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[var(--ui-bg)] text-[var(--color-text)]">
                        <Sparkles size={16} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--ui-text-subtle)]">upgrade plan</p>
                        <p className="mt-1 text-base font-semibold text-[var(--ui-text)]">Pro Plan</p>
                        <p className="mt-2 text-[12px] leading-5 text-[var(--ui-text-muted)]">
                          Upgrade to Pro to get the latest and exclusive workspace features.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onNavigate('/pricing')}
                      className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-2xl border border-white/30 bg-[var(--color-accent)] px-4 text-sm font-semibold text-[var(--workspace-upgrade-button-text)] transition-colors hover:bg-white"
                    >
                      Upgrade to Pro
                    </button>
                  </div>

                  <div className="rounded-[22px]">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--ui-text-subtle)] pl-3">Appearance</p>
                    <div className="mt-3 grid grid-cols-2 gap-2 rounded-2xl bg-[var(--workspace-soft-strong)] p-1">
                      <button
                        type="button"
                        onClick={() => setTheme('light')}
                        className={`inline-flex h-10 items-center justify-center gap-2 rounded-[14px] text-sm font-medium transition-colors ${theme === 'light'
                          ? 'bg-[var(--ui-surface-1)] text-[var(--ui-text)] shadow-[0_8px_18px_rgba(0,0,0,0.08)]'
                          : 'text-[var(--ui-text-subtle)] hover:text-[var(--ui-text)]'}`}
                      >
                        <Sun size={14} />
                        Light
                      </button>
                      <button
                        type="button"
                        onClick={() => setTheme('dark')}
                        className={`inline-flex h-10 items-center justify-center gap-2 rounded-[14px] text-sm font-medium transition-colors ${theme === 'dark'
                          ? 'bg-[var(--ui-surface-1)] text-[var(--ui-text)] shadow-[0_8px_18px_rgba(0,0,0,0.08)]'
                          : 'text-[var(--ui-text-subtle)] hover:text-[var(--ui-text)]'}`}
                      >
                        <Moon size={14} />
                        Dark
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
                      className="grid h-12 w-12 place-items-center rounded-2xl border border-[var(--workspace-sidebar-border)] bg-[var(--workspace-soft)] text-[var(--ui-text-muted)] transition-colors hover:bg-[var(--workspace-soft-strong)] hover:text-[var(--ui-text)]"
                      title={title}
                    >
                      <Icon size={16} />
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                    className="grid h-12 w-12 place-items-center rounded-2xl border border-[var(--workspace-sidebar-border)] bg-[var(--workspace-soft)] text-[var(--ui-text-muted)] transition-colors hover:bg-[var(--workspace-soft-strong)] hover:text-[var(--ui-text)]"
                    title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
                  >
                    {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
                  </button>
                </div>
              )}

              <div className="relative" ref={avatarMenuRef}>
                <button
                  type="button"
                  onClick={() => setOpenAvatarMenu((open) => !open)}
                  className={`flex w-full items-center overflow-hidden text-[12px] font-medium text-[var(--ui-text)] transition-all hover:bg-[var(--workspace-soft-strong)] ${sidebarExpanded ? 'border border-[var(--workspace-sidebar-border)] bg-[var(--workspace-soft)]  gap-3 rounded-[22px] px-2.5 py-2.5 text-left' : 'h-12 w-12 justify-center rounded-2xl'}`}
                  title="Account"
                >
                  <span className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-[var(--workspace-sidebar-border)] bg-[var(--ui-surface-2)]">
                    <img src={authPhotoUrl} alt={authDisplayName} className="h-full w-full object-cover" />
                  </span>
                  <span className={`overflow-hidden whitespace-nowrap transition-all duration-300 ${sidebarLabelClassName}`}>
                    <span className="block text-sm font-semibold text-[var(--ui-text)]">{authDisplayName}</span>
                    <span className="block text-[11px] text-[var(--ui-text-muted)]">{authEmail}</span>
                  </span>
                </button>
                {openAvatarMenu && (
                  <div className={`absolute bottom-0 ${avatarMenuPositionClassName} w-[220px] rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-popover)] p-3 shadow-[0_18px_50px_rgba(0,0,0,0.45)]`}>
                    <div className="flex items-center gap-2">
                      <div className="h-9 w-9 overflow-hidden rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-2)]">
                        <img src={authPhotoUrl} alt={authDisplayName} className="h-full w-full object-cover" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[var(--ui-text)]">{authDisplayName}</p>
                        <p className="truncate text-[11px] text-[var(--ui-text-muted)]">{authEmail}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleSignOut()}
                      className="mt-3 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-rose-300/30 bg-rose-500/10 text-xs font-medium uppercase tracking-[0.08em] text-rose-200 hover:bg-rose-500/20"
                    >
                      <LogOut size={13} />
                      Logout
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1 pl-2 md:pl-3">
          <div className="flex h-full flex-col overflow-hidden rounded-[30px] bg-[var(--ui-surface-1)] shadow-[var(--workspace-content-shadow)]">
            <div className="px-5 py-4 md:px-7">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  {/* <h1 className="mt-1 text-[24px] font-semibold tracking-[-0.03em] text-[var(--ui-text)] md:text-[30px]">Projects</h1> */}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] ${shellBadgeClassName}`}>
                    <FolderOpen size={12} />
                    {projects.length} projects
                  </span>
                  <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] ${shellBadgeClassName}`}>
                    {theme === 'light' ? <Sun size={12} /> : <Moon size={12} />}
                    {theme} mode
                  </span>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              <main className="relative mx-auto max-w-[1200px] px-4 py-8 md:px-7 md:py-10">
                <section className="mx-auto max-w-[920px] text-center">
                  <p className="inline-flex items-center gap-2 rounded-full border border-[var(--workspace-content-border)] bg-[var(--workspace-soft)] px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-[var(--ui-text-subtle)]">
                    <Sparkles size={12} />
                    Build faster in one workspace
                  </p>
                  <p className="mt-5 text-[42px] font-semibold leading-none tracking-[-0.04em] text-[var(--ui-text)] md:text-[58px]">
                    EazyUI Projects
                  </p>
                  <p className="mt-3 text-[15px] leading-7 text-[var(--ui-text-muted)]">
                    Type what you want to build and start a new project instantly.
                  </p>

                  <form
                    className="mt-8"
                    onSubmit={(event) => {
                      event.preventDefault();
                      handleCreateFromPrompt();
                    }}
                  >
                    <div className="mx-auto w-full rounded-[28px] border border-[var(--workspace-content-border)] bg-[var(--workspace-soft)] p-3 shadow-[0_18px_40px_rgba(0,0,0,0.06)]">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />
              {starterImages.length > 0 && (
                <div className="mb-2 flex gap-2 overflow-x-auto border-b border-[var(--ui-border)] px-1 pb-2">
                  {starterImages.map((img, idx) => (
                    <div key={`${idx}-${img.slice(0, 20)}`} className="relative group h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-[var(--ui-border)]">
                      <img src={img} alt="upload" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setStarterImages((prev) => prev.filter((_, i) => i !== idx))}
                        className="absolute inset-0 bg-black/45 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Remove attachment"
                      >
                        <X size={14} className="text-white" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-end gap-2 rounded-2xl px-1">
                <div className="flex min-w-0 flex-1 items-start gap-2">
                  <div className="-mt-1 -ml-0.5 h-9 w-9 shrink-0 rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-3)] p-[2px]">
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
                  <textarea
                    ref={starterPromptRef}
                    value={starterPrompt}
                    onChange={(event) => setStarterPrompt(event.target.value)}
                    onKeyDown={(event) => {
                      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                        event.preventDefault();
                        handleCreateFromPrompt();
                      }
                    }}
                    placeholder="What do you want to create?"
                    rows={3}
                    className="min-h-[64px] max-h-[220px] w-full resize-y border-0 bg-transparent px-3 py-2 text-[16px] leading-relaxed text-[var(--ui-text)] placeholder:text-[var(--ui-text-subtle)] focus:outline-none focus:ring-0"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!starterPrompt.trim() || creatingFromPrompt}
                  className={`h-10 w-10 shrink-0 rounded-[14px] border flex items-center justify-center transition-all disabled:opacity-40 ${accentButtonClassName}`}
                  title="Create project from request"
                >
                  {creatingFromPrompt ? <Loader2 size={16} className="animate-spin" /> : <ArrowUp size={18} />}
                </button>
              </div>
              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="grid h-9 w-9 place-items-center rounded-full bg-[var(--ui-surface-3)] text-[var(--ui-text-muted)] ring-1 ring-[var(--ui-border)] transition-all hover:bg-[var(--ui-surface-4)] hover:text-[var(--ui-text)]"
                    title="Add image"
                  >
                    <Plus size={18} />
                  </button>
                  <div className="flex items-center rounded-full bg-[var(--ui-surface-3)] p-1 ring-1 ring-[var(--ui-border)]">
                    {(['mobile', 'tablet', 'desktop'] as const).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setDeviceType(p)}
                        className={`p-1.5 rounded-full transition-all ${deviceType === p
                          ? 'bg-[var(--ui-surface-4)] text-[var(--ui-text)] shadow-sm'
                          : 'text-[var(--ui-text-subtle)] hover:bg-[var(--ui-surface-4)] hover:text-[var(--ui-text-muted)]'
                          }`}
                        title={`Generate for ${p}`}
                      >
                        {p === 'mobile' && <Smartphone size={14} />}
                        {p === 'tablet' && <Tablet size={14} />}
                        {p === 'desktop' && <Monitor size={14} />}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center rounded-full bg-[var(--ui-surface-3)] p-1 ring-1 ring-[var(--ui-border)]">
                  <button
                    type="button"
                    onClick={() => setModelProfile('fast')}
                    className={`h-8 w-8 rounded-full text-[11px] font-semibold transition-all inline-flex items-center justify-center ${modelProfile === 'fast'
                      ? 'bg-amber-500/20 text-[var(--ui-text)] ring-1 ring-amber-400/40'
                      : 'text-amber-400 hover:bg-[var(--ui-surface-4)] hover:text-amber-200'
                      }`}
                    title="Fast mode"
                  >
                    <Zap size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setModelProfile('quality')}
                    className={`h-8 w-8 rounded-full text-[11px] font-semibold transition-all inline-flex items-center justify-center ${modelProfile === 'quality'
                      ? 'bg-indigo-500/20 text-[var(--ui-text)] ring-1 ring-indigo-300/40'
                      : 'text-indigo-300 hover:bg-[var(--ui-surface-4)] hover:text-indigo-100'
                      }`}
                    title="Quality mode"
                  >
                    <Sparkles size={12} />
                  </button>
                </div>
                <div ref={styleMenuRef} className="relative hidden sm:flex items-center">
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
                            ? 'bg-indigo-500/20 text-[var(--ui-text)]'
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
              </div>
                    </div>
                  </form>
                </section>

                <section className="mt-16 md:mt-20">
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
                  className="h-4 w-4 cursor-pointer rounded border-[var(--ui-border)] bg-[var(--ui-surface-1)] text-[var(--ui-primary)]"
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
            <section className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {projects.map((project) => (
                <article key={project.id} className={`relative rounded-[24px] border p-4 shadow-[0_16px_32px_rgba(0,0,0,0.06)] ${selectedIdSet.has(project.id) ? 'border-[var(--ui-primary)] bg-[var(--ui-surface-3)]' : 'border-[var(--workspace-content-border)] bg-[var(--workspace-soft)]'}`}>
                  <div className="absolute left-3 top-3 z-10">
                    <input
                      type="checkbox"
                      checked={selectedIdSet.has(project.id)}
                      onChange={() => toggleProjectSelection(project.id)}
                      disabled={deletingIdSet.has(project.id)}
                      className="h-4 w-4 cursor-pointer rounded border-[var(--ui-border)] bg-[var(--ui-surface-1)] text-[var(--ui-primary)] disabled:cursor-not-allowed"
                      aria-label={`Select ${project.name || 'project'}`}
                    />
                  </div>
                  <div className="mb-3">
                    {(() => {
                      const persistedImages = (project.coverImageUrls || []).filter(Boolean);
                      const fallbackImage = project.coverImageUrl;
                      const primaryImage = persistedImages[0] || fallbackImage;
                      if (!primaryImage) {
                        return (
                          <div className="grid h-[130px] place-items-center rounded-xl border border-dashed border-[var(--ui-border)] bg-[var(--ui-surface-1)] text-[11px] text-[var(--ui-text-subtle)]">
                            Preview will appear after save
                          </div>
                        );
                      }
                      const secondaryImage = persistedImages[1];
                      const frameImages = secondaryImage ? [primaryImage, secondaryImage] : [primaryImage];
                      return (
                        <div className="relative flex h-[260px] items-center justify-center gap-3 overflow-hidden rounded-[20px] bg-[var(--workspace-soft-strong)] px-3 py-4">
                          {frameImages.map((imageUrl, index) => (
                            <div
                              key={`${project.id}-preview-${index}`}
                              className={`relative overflow-hidden rounded-[18px] border border-white/15 bg-[#080A12] shadow-[0_16px_30px_rgba(0,0,0,0.5)] ${frameImages.length > 1
                                ? index === 0
                                  ? 'h-[220px] w-[108px] -rotate-3'
                                  : 'h-[220px] w-[108px] rotate-3'
                                : 'h-[230px] w-[116px]'
                                }`}
                            >
                              <div className="absolute inset-[3px] overflow-hidden rounded-[15px] bg-[#121623]">
                                <img
                                  src={imageUrl}
                                  alt={`${project.name} preview ${index + 1}`}
                                  className="h-full w-full object-cover"
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
                  <div className="mt-4 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenProject(project.id)}
                      disabled={deletingIdSet.has(project.id)}
                      className="h-8 rounded-full border border-[var(--ui-border-light)] px-3 text-[11px] uppercase tracking-[0.08em] text-[var(--ui-text-muted)] hover:border-[var(--ui-border-light)] hover:text-[var(--ui-text)] disabled:opacity-50"
                    >
                      <span className="inline-flex items-center gap-1.5"><FolderOpen size={12} /> Open</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete([project.id])}
                      disabled={deletingIdSet.has(project.id) || deleteProgress !== null}
                      className="h-8 rounded-full border border-rose-300/35 bg-rose-500/10 px-3 text-[11px] uppercase tracking-[0.08em] text-[var(--color-error)] hover:bg-rose-500/20 disabled:opacity-50"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        {deletingIdSet.has(project.id) ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                        {deletingIdSet.has(project.id) ? 'Deleting' : 'Delete'}
                      </span>
                    </button>
                  </div>
                </article>
              ))}
            </section>
          )}
                </section>
              </main>
            </div>
          </div>
        </div>
      </div>
      <ConfirmationDialog />
    </div>
  );
}
