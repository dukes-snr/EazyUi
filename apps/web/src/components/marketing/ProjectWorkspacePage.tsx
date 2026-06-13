import { ArrowUp, Check, ChevronLeft, ChevronRight, CircleHelp, CircleStar, FolderOpen, Gem, Home, LayoutGrid, LineSquiggle, Loader2, LogOut, Menu, Monitor, Moon, MoreHorizontal, Palette, Plus, RefreshCcw, Smile, Smartphone, Sparkles, Sun, Tablet, Trash2, X, Zap } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { apiClient, type BillingSummary, type HtmlScreen } from '../../api/client';
import type { DesignModelProfile } from '../../constants/designModels';
import eazyuiWordmark from '../../assets/eazyui-text-edit.png';
import eazyuiWordmarkLight from '../../assets/eazyui-text-edit-light.png';
import type { User } from 'firebase/auth';
import { observeAuthState, signOutCurrentUser } from '../../lib/auth';
import { useOnboardingStore, useUiStore } from '../../stores';
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
import { GuideBubbleOverlay, type GuideBubbleStep } from '../ui/GuideBubbleOverlay';
import { ReadonlyDeviceNode } from '../canvas/DeviceNode';

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
const SIDEBAR_EXPANDED_WIDTH = 290;
const SIDEBAR_COLLAPSED_WIDTH = 48;
const WORKSPACE_GUIDE_ID = 'workspace-first-run';

const WORKSPACE_GUIDE_STEPS: GuideBubbleStep[] = [
  {
    id: 'workspace-new-project',
    targetId: 'workspace-nav-new-project',
    title: 'Start a blank project',
    body: 'Use this when you want a fresh project directly without writing a prompt first.',
    placement: 'right',
  },
  {
    id: 'workspace-starter-prompt',
    targetId: 'workspace-starter-prompt',
    title: 'Describe what you want to build',
    body: 'Write the screen, flow, or product idea here. You can also add references and images before generating.',
    placement: 'bottom',
  },
  {
    id: 'workspace-create-submit',
    targetId: 'workspace-create-submit',
    title: 'Generate from your prompt',
    body: 'Press this to turn your request into a new project workspace.',
    placement: 'left',
  },
  {
    id: 'workspace-project-library',
    targetId: 'workspace-project-library',
    title: 'Come back to any project here',
    body: 'Everything you create appears in this list so you can reopen it and keep editing later.',
    placement: 'top',
  },
];

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

type ProjectIconPalette = {
  background: string;
  foreground: '#000000' | '#ffffff';
};

function projectFallbackColor(projectId: string): ProjectIconPalette {
  let hash = 0;
  for (let index = 0; index < projectId.length; index += 1) {
    hash = ((hash << 5) - hash) + projectId.charCodeAt(index);
    hash |= 0;
  }
  return {
    background: `hsl(${Math.abs(hash) % 360} 58% 46%)`,
    foreground: '#ffffff',
  };
}

function readableForeground(red: number, green: number, blue: number): ProjectIconPalette['foreground'] {
  const luminance = ((0.2126 * red) + (0.7152 * green) + (0.0722 * blue)) / 255;
  return luminance > 0.62 ? '#000000' : '#ffffff';
}

function sampleImageColor(image: HTMLImageElement): ProjectIconPalette | null {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(image, 0, 0, 8, 8);
    const pixels = context.getImageData(0, 0, 8, 8).data;
    let red = 0;
    let green = 0;
    let blue = 0;
    let count = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 3] < 128) continue;
      const max = Math.max(pixels[index], pixels[index + 1], pixels[index + 2]);
      const min = Math.min(pixels[index], pixels[index + 1], pixels[index + 2]);
      if (max > 245 && min > 235) continue;
      red += pixels[index];
      green += pixels[index + 1];
      blue += pixels[index + 2];
      count += 1;
    }
    if (!count) return null;
    const averageRed = Math.round(red / count);
    const averageGreen = Math.round(green / count);
    const averageBlue = Math.round(blue / count);
    return {
      background: `rgb(${averageRed} ${averageGreen} ${averageBlue})`,
      foreground: readableForeground(averageRed, averageGreen, averageBlue),
    };
  } catch {
    return null;
  }
}

type ProjectScreenTransition = {
  direction: -1 | 1;
  phase: 'out' | 'enter';
};

function LiveProjectScreenPreview({
  screen,
  transition,
}: {
  screen: HtmlScreen;
  transition?: ProjectScreenTransition;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const screenWidth = Math.max(Number(screen.width) || 402, 1);
  const screenHeight = Math.max(Number(screen.height) || 874, 1);
  const deviceWidth = screenWidth;
  const deviceHeight = screenHeight;
  const transitionClassName = transition
    ? `is-${transition.phase}-${transition.direction === 1 ? 'next' : 'previous'}`
    : '';

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const updateScale = () => {
      const availableWidth = viewport.clientWidth;
      const availableHeight = viewport.clientHeight;
      const scale = Math.min(availableWidth / deviceWidth, availableHeight / deviceHeight, 1);
      viewport.style.setProperty('--project-preview-scale', String(scale));
      viewport.style.setProperty('--project-preview-width', `${deviceWidth * scale}px`);
      viewport.style.setProperty('--project-preview-height', `${deviceHeight * scale}px`);
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [deviceHeight, deviceWidth]);

  return (
    <div ref={viewportRef} className="workspace-project-card__live-viewport">
      <div className={`workspace-project-card__live-device ${transitionClassName}`}>
        <ReadonlyDeviceNode
          screenId={screen.screenId}
          html={screen.html}
          width={screenWidth}
          height={screenHeight}
          displayMode="clean"
        />
      </div>
    </div>
  );
}

function LoadingProjectScreenPreview() {
  return (
    <div className="workspace-project-card__live-viewport" aria-label="Loading project screens" role="status">
      <div className="workspace-project-card__live-device workspace-project-card__loading-device">
        <ReadonlyDeviceNode loading displayMode="clean" />
      </div>
    </div>
  );
}

export function ProjectWorkspacePage({ authReady, isAuthenticated, onNavigate, onOpenProject }: ProjectWorkspacePageProps) {
  const requestConfirmation = useUiStore((state) => state.requestConfirmation);
  const theme = useUiStore((state) => state.theme);
  const setTheme = useUiStore((state) => state.setTheme);
  const activeGuideId = useOnboardingStore((state) => state.activeGuideId);
  const guideStepIndex = useOnboardingStore((state) => state.stepIndex);
  const seenGuideIds = useOnboardingStore((state) => state.seenGuideIds);
  const startGuide = useOnboardingStore((state) => state.startGuide);
  const nextGuideStep = useOnboardingStore((state) => state.nextStep);
  const prevGuideStep = useOnboardingStore((state) => state.prevStep);
  const finishGuide = useOnboardingStore((state) => state.finishGuide);
  const skipGuide = useOnboardingStore((state) => state.skipGuide);
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
  const [openProjectMenuId, setOpenProjectMenuId] = useState<string | null>(null);
  const [projectIconColors, setProjectIconColors] = useState<Record<string, ProjectIconPalette>>({});
  const [projectScreens, setProjectScreens] = useState<Record<string, HtmlScreen[]>>({});
  const [activeProjectScreenIndexes, setActiveProjectScreenIndexes] = useState<Record<string, number>>({});
  const [projectScreenTransitions, setProjectScreenTransitions] = useState<Record<string, ProjectScreenTransition>>({});
  const projectScreenTransitionTimersRef = useRef<Record<string, number[]>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const starterPromptRef = useRef<ComposerInlineReferenceInputHandle | null>(null);
  const avatarMenuRef = useRef<HTMLDivElement | null>(null);
  const styleMenuRef = useRef<HTMLDivElement | null>(null);
  const referenceMenuRef = useRef<HTMLDivElement | null>(null);
  const referenceUrlInputRef = useRef<HTMLInputElement | null>(null);
  const addMenuRef = useRef<HTMLDivElement | null>(null);
  const referenceTriggerRangeRef = useRef<ComposerReferenceTextRange | null>(null);

  const isLight = true;
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
  const StyleIcon = stylePreset === 'minimal'
    ? LineSquiggle
    : stylePreset === 'vibrant'
      ? Palette
      : stylePreset === 'luxury'
        ? Gem
        : stylePreset === 'playful'
          ? Smile
          : CircleStar;
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
  const workspaceOwnerLabel = authDisplayName === 'User' ? 'Your workspace' : `${authDisplayName}'s workspace`;
  const sidebarRecentProjects = projects.slice(0, 3);
  const sidebarPrimaryLabel = projects[0]?.name || 'Projects';
  const avatarMenuPositionClassName = 'top-[50px] left-full ml-5';
  const avatarMenuWidthClassName = 'w-[260px]';
  const shellBadgeClassName = 'border-black/10 bg-white/55 text-[#505050] backdrop-blur-md';
  const avatarMenuCardClassName = isLight
    ? 'border-black/10 bg-[var(--ui-surface-3)] text-slate-700'
    : 'border-white/[0.08] bg-[var(--ui-surface-3)] text-slate-200';
  const avatarMenuDividerClassName = isLight ? 'bg-black/10' : 'bg-white/[0.08]';
  const avatarMenuRowClassName = isLight
    ? 'text-slate-700 hover:bg-black/[0.03]'
    : 'text-slate-200 hover:bg-white/[0.04]';
  const avatarMenuMutedIconClassName = isLight ? 'text-slate-400' : 'text-slate-500';
  const avatarMenuStrongTextClassName = isLight ? 'text-slate-900' : 'text-slate-50';
  const avatarMenuMutedTextClassName = isLight ? 'text-slate-500' : 'text-slate-400';
  const desktopWorkspaceBgClassName = 'workspace-cream-root';
  const desktopSidebarClassName = 'workspace-cream-sidebar border-r border-black/[0.07]';
  const desktopSidebarToggleClassName = 'border-black/[0.08] bg-white text-[#6f6a62] shadow-sm hover:bg-[#f4f4f4] hover:text-black';
  const desktopSidebarHoverClassName = 'hover:bg-black/[0.035]';
  const desktopSidebarSurfaceClassName = 'bg-white/65 shadow-[0_1px_0_rgba(255,255,255,0.8)_inset] hover:bg-white';
  const desktopSidebarDividerClassName = 'bg-black/[0.07]';
  const desktopSidebarInlineHoverClassName = 'hover:bg-black/[0.04] hover:text-black';
  const projectWorkspaceSurfaceClassName = 'workspace-cream-content';
  const rootReferenceOptions = getFilteredComposerReferenceRootOptions(referenceRootQuery, false);
  const hasSeenWorkspaceGuide = seenGuideIds.includes(WORKSPACE_GUIDE_ID);
  const isWorkspaceGuideActive = activeGuideId === WORKSPACE_GUIDE_ID;
  const activeWorkspaceGuideStep = isWorkspaceGuideActive ? WORKSPACE_GUIDE_STEPS[guideStepIndex] || null : null;

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
    if (!authReady || !isAuthenticated || projects.length === 0) return;
    let cancelled = false;

    const projectsToLoad = projects.filter((project) => !projectScreens[project.id]);
    if (projectsToLoad.length === 0) return;

    void Promise.allSettled(projectsToLoad.map(async (project) => {
      const response = await apiClient.getProject(project.id);
      return {
        projectId: project.id,
        screens: (response.designSpec?.screens || []).filter((screen) => Boolean(screen?.html)),
      };
    })).then((results) => {
      if (cancelled) return;
      const loadedScreens: Record<string, HtmlScreen[]> = {};
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          loadedScreens[result.value.projectId] = result.value.screens;
        } else {
          loadedScreens[projectsToLoad[index].id] = [];
        }
      });
      if (Object.keys(loadedScreens).length > 0) {
        setProjectScreens((current) => ({ ...current, ...loadedScreens }));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [authReady, isAuthenticated, projectScreens, projects]);

  useEffect(() => () => {
    Object.values(projectScreenTransitionTimersRef.current).flat().forEach((timer) => window.clearTimeout(timer));
  }, []);

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
    if (!authReady || !isAuthenticated || loading || isMobileViewport || hasSeenWorkspaceGuide || activeGuideId) return;
    const timeoutId = window.setTimeout(() => {
      startGuide(WORKSPACE_GUIDE_ID);
    }, 500);
    return () => window.clearTimeout(timeoutId);
  }, [activeGuideId, authReady, hasSeenWorkspaceGuide, isAuthenticated, isMobileViewport, loading, startGuide]);

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
    if (!openProjectMenuId) return;
    const closeMenu = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-project-options]')) return;
      setOpenProjectMenuId(null);
    };
    document.addEventListener('pointerdown', closeMenu);
    return () => document.removeEventListener('pointerdown', closeMenu);
  }, [openProjectMenuId]);

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
    return <div className="h-screen w-screen grid place-items-center bg-white text-[#505050]">Loading workspace...</div>;
  }

  if (!isAuthenticated) {
    return <div className="h-screen w-screen grid place-items-center bg-white text-rose-700">You need to be logged in.</div>;
  }

  return (
    <div className={`h-screen w-screen overflow-hidden text-[var(--ui-text)] [font-family:'Schibsted_Grotesk',sans-serif] ${desktopWorkspaceBgClassName}`}>
      {isMobileViewport && isMobileSidebarOpen && (
        <div
          className="fixed inset-0 z-[120] bg-[color:color-mix(in_srgb,var(--workspace-backdrop)_82%,black)]/85 backdrop-blur-md lg:hidden"
          onClick={() => setIsMobileSidebarOpen(false)}
        >
          <div
            className={`flex h-full w-full max-w-[15rem] flex-col border-r ${desktopSidebarClassName}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex h-full min-h-0 flex-col px-3 py-4">
              <div className="relative z-20">
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsMobileSidebarOpen(false);
                      onNavigate('/app/projects');
                    }}
                    className={`flex min-w-0 flex-1 items-center gap-3 rounded-[14px] px-1 py-1 text-left transition-colors ${desktopSidebarHoverClassName}`}
                    title="Account"
                  >
                    <span className={`h-9 w-9 shrink-0 overflow-hidden rounded-[11px] border ${isLight ? 'border-black/[0.08] bg-[#ece4d8]' : 'border-white/[0.08] bg-[#24262d]'}`}>
                      <img src={authPhotoUrl} alt={authDisplayName} className="h-full w-full object-cover" />
                    </span>
                    <span className="min-w-0 overflow-hidden">
                      <span className="block truncate text-[13px] font-medium text-[var(--ui-text)]">{workspaceOwnerLabel}</span>
                      <span className="block text-[11px] text-[var(--ui-text-muted)]">1 Member</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsMobileSidebarOpen(false)}
                    className={`grid h-9 w-9 place-items-center rounded-[12px] border transition-colors ${desktopSidebarToggleClassName}`}
                    aria-label="Close menu"
                    title="Close menu"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsMobileSidebarOpen(false);
                  if (projects[0]?.id) {
                    onOpenProject(projects[0].id);
                    return;
                  }
                  onNavigate('/app/projects');
                }}
                className={`mt-4 flex items-center justify-between rounded-[10px] px-3 py-2.5 transition-colors ${desktopSidebarSurfaceClassName}`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="grid h-4 w-4 place-items-center rounded-full bg-white/10 text-[8px] text-[var(--ui-text-subtle)]">
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  </span>
                  <span className="truncate text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--ui-text)]">{sidebarPrimaryLabel}</span>
                </span>
                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-300">New</span>
              </button>

              <div className={`mt-4 h-px ${desktopSidebarDividerClassName}`} />

              <div className="min-h-0 flex-1 overflow-y-auto">
                <nav className="mt-4 flex flex-col gap-1">
                  {sidebarNavItems.map(({ id, label, Icon, active, onClick, iconClassName }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        setIsMobileSidebarOpen(false);
                        onClick();
                      }}
                      className={`group flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-left transition-colors ${active
                        ? `${desktopSidebarSurfaceClassName} text-[var(--ui-text)]`
                        : `text-[var(--ui-text-muted)] ${desktopSidebarInlineHoverClassName}`}`}
                    >
                      <span className="grid h-4 w-4 place-items-center text-[var(--ui-text-subtle)]">
                        <Icon size={14} className={iconClassName} />
                      </span>
                      <span className="truncate text-[14px] font-medium">{label}</span>
                    </button>
                  ))}
                </nav>

                <div className="mt-5 space-y-5 pb-4">
                  <div>
                    <p className="text-[11px] font-medium text-[var(--ui-text-subtle)]">Favorites</p>
                    <p className="mt-3 text-[12px] text-[var(--ui-text-subtle)]">No favorites yet</p>
                  </div>

                  <div>
                    <p className="text-[11px] font-medium text-[var(--ui-text-subtle)]">Recent Projects</p>
                    <div className="mt-3 space-y-2">
                      {sidebarRecentProjects.length > 0 ? sidebarRecentProjects.map((project) => (
                        <button
                          key={project.id}
                          type="button"
                          onClick={() => {
                            setIsMobileSidebarOpen(false);
                            onOpenProject(project.id);
                          }}
                          className={`block w-full truncate rounded-[10px] px-2 py-1 text-left text-[13px] text-[var(--ui-text-muted)] transition-colors ${desktopSidebarInlineHoverClassName}`}
                          title={project.name}
                        >
                          {project.name || 'Untitled project'}
                        </button>
                      )) : (
                        <p className="text-[12px] text-[var(--ui-text-subtle)]">No recent projects yet</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <p className="text-[11px] font-medium text-[var(--ui-text-subtle)]">Workspace</p>
                    <button
                      type="button"
                      onClick={() => {
                        setIsMobileSidebarOpen(false);
                        onNavigate('/app/projects');
                      }}
                      className={`mt-3 flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-left text-[var(--ui-text-muted)] transition-colors ${desktopSidebarInlineHoverClassName}`}
                    >
                      <LayoutGrid size={14} className="text-[var(--ui-text-subtle)]" />
                      <span className="text-[14px] font-medium">All Workspace</span>
                    </button>
                  </div>

                  <div>
                    <p className="text-[11px] font-medium text-[var(--ui-text-subtle)]">Private</p>
                    <button
                      type="button"
                      onClick={() => {
                        setIsMobileSidebarOpen(false);
                        onNavigate('/app/projects');
                      }}
                      className={`mt-3 flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-left text-[var(--ui-text-muted)] transition-colors ${desktopSidebarInlineHoverClassName}`}
                    >
                      <LayoutGrid size={14} className="text-[var(--ui-text-subtle)]" />
                      <span className="text-[14px] font-medium">All Private</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileSidebarOpen(false);
                    onNavigate('/');
                  }}
                  className={`grid h-9 w-9 place-items-center rounded-[12px] border transition-colors ${isLight
                    ? 'border-black/[0.08] bg-black/[0.04] text-slate-500 hover:text-slate-900 hover:bg-black/[0.08]'
                    : 'border-white/[0.08] bg-white/[0.04] text-[var(--ui-text-muted)] hover:bg-white/[0.08] hover:text-[var(--ui-text)]'}`}
                  title="Home"
                >
                  <Home size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                  className={`grid h-9 w-9 place-items-center rounded-[12px] border transition-colors ${isLight
                    ? 'border-black/[0.08] bg-black/[0.04] text-slate-500 hover:text-slate-900 hover:bg-black/[0.08]'
                    : 'border-white/[0.08] bg-white/[0.04] text-[var(--ui-text-muted)] hover:bg-white/[0.08] hover:text-[var(--ui-text)]'}`}
                  title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
                >
                  {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileSidebarOpen(false);
                    startGuide(WORKSPACE_GUIDE_ID);
                  }}
                  className={`grid h-9 w-9 place-items-center rounded-[12px] border transition-colors ${isLight
                    ? 'border-black/[0.08] bg-black/[0.04] text-slate-500 hover:text-slate-900 hover:bg-black/[0.08]'
                    : 'border-white/[0.08] bg-white/[0.04] text-[var(--ui-text-muted)] hover:bg-white/[0.08] hover:text-[var(--ui-text)]'}`}
                  title="Get help"
                >
                  <CircleHelp size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileSidebarOpen(false);
                    void handleSignOut();
                  }}
                  className="grid h-9 w-9 place-items-center rounded-[12px] border border-rose-400/18 bg-rose-500/10 text-rose-300 transition-colors hover:bg-rose-500/16"
                  title="Logout"
                >
                  <LogOut size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="workspace-shell-frame flex h-full overflow-hidden">
        <aside
          className={`relative z-30 hidden h-full min-h-0 shrink-0 flex-col overflow-visible transition-[width] duration-300 ease-out lg:flex ${desktopSidebarClassName}`}
          style={{ width: sidebarWidth }}
        >
          <button
            type="button"
            onClick={() => setSidebarExpanded((expanded) => !expanded)}
            className={`absolute right-0 top-5 z-[110] grid h-8 w-8 translate-x-[150%] place-items-center rounded-full border transition-colors ${desktopSidebarToggleClassName}`}
            aria-label={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
            title={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {sidebarExpanded ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
          </button>
          <div className={`flex h-full min-h-0 flex-col ${sidebarExpanded ? 'px-3 py-4' : 'items-center px-2 py-4'}`}>
            <div className="relative z-20" ref={avatarMenuRef}>
              <div className="flex">
                <button
                  type="button"
                  onClick={() => setOpenAvatarMenu((open) => !open)}
                  className={`flex min-w-0 flex-1 items-center text-left transition-colors ${sidebarExpanded ? `gap-3 rounded-[14px] px-1 py-1 ${desktopSidebarHoverClassName}` : 'justify-center'}`}
                  title="Account"
                >
                  <span className={`h-9 w-9 shrink-0 overflow-hidden rounded-[11px] border ${isLight ? 'border-black/[0.08] bg-[#ece4d8]' : 'border-white/[0.08] bg-[#24262d]'}`}>
                    <img src={authPhotoUrl} alt={authDisplayName} className="h-full w-full object-cover" />
                  </span>
                  <span className={`min-w-0 overflow-hidden transition-all duration-300 ${sidebarLabelClassName}`}>
                    <span className="block truncate text-[13px] font-medium text-[var(--ui-text)]">{workspaceOwnerLabel}</span>
                    <span className="block text-[11px] text-[var(--ui-text-muted)]">1 Member</span>
                  </span>
                </button>
              </div>
              {openAvatarMenu && (
                <div className={`absolute z-[120] ${avatarMenuPositionClassName} ${avatarMenuWidthClassName} rounded-[22px] border p-4 ${avatarMenuCardClassName}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={`truncate text-[15px] font-semibold ${avatarMenuStrongTextClassName}`}>{authDisplayName}</p>
                      <p className={`mt-1 truncate text-[13px] ${avatarMenuMutedTextClassName}`}>{authEmail}</p>
                    </div>
                    <div className={`h-12 w-12 overflow-hidden rounded-full ${isLight ? 'bg-[#dff6f8]' : 'bg-[#2a2c34]'}`}>
                      <img src={authPhotoUrl} alt={authDisplayName} className="h-full w-full object-cover" />
                    </div>
                  </div>

                  <div className={`mt-4 h-px ${avatarMenuDividerClassName}`} />

                  <div className="mt-2 space-y-1">
                    <button
                      type="button"
                      onClick={() => {
                        setOpenAvatarMenu(false);
                        onNavigate('/pricing');
                      }}
                      className={`flex w-full items-center justify-between rounded-[12px] px-2 py-3 text-left transition-colors ${avatarMenuRowClassName}`}
                    >
                      <span className="inline-flex items-center gap-3">
                        <Gem size={16} className={avatarMenuMutedIconClassName} />
                        <span className="text-[14px] font-medium">Credits</span>
                      </span>
                      <span className={`inline-flex items-center gap-3 text-[14px] ${avatarMenuMutedTextClassName}`}>
                        <span>{billingSummary?.balanceCredits ?? '...'}</span>
                        <ChevronRight size={16} />
                      </span>
                    </button>
                    <div className={`h-px ${avatarMenuDividerClassName}`} />
                    <button
                      type="button"
                      onClick={() => {
                        setOpenAvatarMenu(false);
                        onNavigate('/app/projects');
                      }}
                      className={`flex w-full items-center gap-3 rounded-[12px] px-2 py-3 text-left transition-colors ${avatarMenuRowClassName}`}
                    >
                      <FolderOpen size={16} className={avatarMenuMutedIconClassName} />
                      <span className="text-[14px] font-medium">Workspace</span>
                    </button>
                    <div className={`h-px ${avatarMenuDividerClassName}`} />
                    <button
                      type="button"
                      onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                      className={`flex w-full items-center justify-between rounded-[12px] px-2 py-3 text-left transition-colors ${isLight ? 'bg-black/[0.04]' : 'bg-white/[0.05]'} ${avatarMenuRowClassName}`}
                    >
                      <span className="inline-flex items-center gap-3">
                        <Palette size={16} className={avatarMenuMutedIconClassName} />
                        <span className={`text-[14px] font-medium ${avatarMenuStrongTextClassName}`}>Settings</span>
                      </span>
                      <span className={`text-[12px] ${avatarMenuMutedTextClassName}`}>{theme === 'light' ? 'Light' : 'Dark'}</span>
                    </button>
                    <div className={`h-px ${avatarMenuDividerClassName}`} />
                    <button
                      type="button"
                      onClick={() => {
                        setOpenAvatarMenu(false);
                        onNavigate('/');
                      }}
                      className={`flex w-full items-center justify-between rounded-[12px] px-2 py-3 text-left transition-colors ${avatarMenuRowClassName}`}
                    >
                      <span className="inline-flex items-center gap-3">
                        <Home size={16} className={avatarMenuMutedIconClassName} />
                        <span className="text-[14px] font-medium">Homepage</span>
                      </span>
                      <ChevronRight size={16} className={avatarMenuMutedIconClassName} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void loadProjects()}
                      className={`flex w-full items-center justify-between rounded-[12px] px-2 py-3 text-left transition-colors ${avatarMenuRowClassName}`}
                    >
                      <span className="inline-flex items-center gap-3">
                        <RefreshCcw size={16} className={`${avatarMenuMutedIconClassName} ${loading ? 'animate-spin' : ''}`} />
                        <span className="text-[14px] font-medium">Refresh Projects</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOpenAvatarMenu(false);
                        startGuide(WORKSPACE_GUIDE_ID);
                      }}
                      className={`flex w-full items-center justify-between rounded-[12px] px-2 py-3 text-left transition-colors ${avatarMenuRowClassName}`}
                    >
                      <span className="inline-flex items-center gap-3">
                        <CircleHelp size={16} className={avatarMenuMutedIconClassName} />
                        <span className="text-[14px] font-medium">Get Help</span>
                      </span>
                      <ChevronRight size={16} className={avatarMenuMutedIconClassName} />
                    </button>
                  </div>

                  <div className={`mt-3 border-t pt-2 ${isLight ? 'border-black/10' : 'border-white/[0.08]'}`}>
                    <button
                      type="button"
                      onClick={() => void handleSignOut()}
                      className={`flex w-full items-center gap-3 rounded-[12px] px-2 py-3 text-left transition-colors ${avatarMenuRowClassName}`}
                    >
                      <LogOut size={16} className={avatarMenuMutedIconClassName} />
                      <span className="text-[14px] font-medium">Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => onNavigate('/app/projects/new')}
              data-guide-id="workspace-nav-new-project"
              className={`mt-4 flex items-center justify-between transition-colors ${sidebarExpanded ? `rounded-[10px] px-3 py-2.5 ${desktopSidebarSurfaceClassName}` : 'h-11 w-11 justify-center bg-transparent'}`}
              title="Start new project"
            >
              <span className={`flex min-w-0 items-center gap-2 ${sidebarExpanded ? '' : 'w-full justify-center'}`}>
                <span className={`grid h-4 w-4 place-items-center text-[8px] ${sidebarExpanded ? 'rounded-full bg-white/10 text-[var(--ui-text-subtle)]' : 'mx-auto text-[var(--ui-text-muted)]'}`}>
                  <Plus size={10} />
                </span>
                <span className={`truncate text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--ui-text)] ${sidebarExpanded ? '' : 'hidden'}`}>{sidebarPrimaryLabel}</span>
              </span>
              {sidebarExpanded ? (
                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">New</span>
              ) : null}
            </button>

            <div className={`mt-4 h-px ${desktopSidebarDividerClassName} ${sidebarExpanded ? '' : 'w-8'}`} />

            <div className="min-h-0 flex-1 overflow-y-auto">
              <nav className={`mt-4 flex flex-col ${sidebarExpanded ? 'gap-1' : 'items-center gap-4'}`}>
                {sidebarNavItems.map(({ id, label, Icon, active, onClick, iconClassName }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={onClick}
                    className={`group flex items-center transition-colors ${sidebarExpanded
                      ? `gap-3 rounded-[10px] px-2 py-2 text-left ${desktopSidebarInlineHoverClassName}`
                      : 'h-5 w-5 justify-center bg-transparent'}`}
                    title={label}
                  >
                    <span className={`grid h-4 w-4 shrink-0 place-items-center ${active ? 'text-[var(--ui-text)]' : 'text-[var(--ui-text-subtle)] group-hover:text-[var(--ui-text)]'}`}>
                      <Icon size={14} className={iconClassName} />
                    </span>
                    <span className={`min-w-0 overflow-hidden text-[13px] ${active ? 'text-[var(--ui-text)]' : 'text-[var(--ui-text-muted)]'} ${sidebarLabelClassName}`}>
                      {label}
                    </span>
                  </button>
                ))}
              </nav>

              {sidebarExpanded ? (
                <>
                  <div className="mt-6">
                    <p className="text-[11px] font-medium text-[var(--ui-text-subtle)]">Favorites</p>
                    <p className="mt-3 text-[12px] text-[var(--ui-text-subtle)]/80">No favorites yet</p>
                  </div>

                  <div className="mt-6">
                    <p className="text-[11px] font-medium text-[var(--ui-text-subtle)]">Recent Projects</p>
                    <div className="mt-3 flex flex-col gap-2">
                      {sidebarRecentProjects.length > 0 ? sidebarRecentProjects.map((project) => (
                        <button
                          key={project.id}
                          type="button"
                          onClick={() => onOpenProject(project.id)}
                          className={`truncate rounded-[8px] px-2 py-1.5 text-left text-[12px] text-[var(--ui-text-muted)] transition-colors ${desktopSidebarInlineHoverClassName}`}
                          title={project.name || 'Untitled project'}
                        >
                          {project.name || 'Untitled project'}
                        </button>
                      )) : (
                        <p className="text-[12px] text-[var(--ui-text-subtle)]/80">No recent projects</p>
                      )}
                    </div>
                  </div>

                  <div className="mt-6">
                    <p className="text-[11px] font-medium text-[var(--ui-text-subtle)]">Workspace</p>
                    <button
                      type="button"
                      onClick={() => onNavigate('/app/projects')}
                      className={`mt-3 inline-flex items-center gap-2 rounded-[8px] px-2 py-1.5 text-[12px] text-[var(--ui-text-muted)] transition-colors ${desktopSidebarInlineHoverClassName}`}
                    >
                      <FolderOpen size={13} />
                      All Workspace
                    </button>
                  </div>

                  <div className="mt-5">
                    <p className="text-[11px] font-medium text-[var(--ui-text-subtle)]">Private</p>
                    <button
                      type="button"
                      onClick={() => onNavigate('/pricing')}
                      className={`mt-3 inline-flex items-center gap-2 rounded-[8px] px-2 py-1.5 text-[12px] text-[var(--ui-text-muted)] transition-colors ${desktopSidebarInlineHoverClassName}`}
                    >
                      <Gem size={13} />
                      All Private
                    </button>
                  </div>
                </>
              ) : null}
            </div>

            <div className={`mt-4 ${sidebarExpanded ? 'flex items-center justify-end gap-2.5' : 'flex flex-col items-end gap-4'}`}>
              <button
                type="button"
                onClick={() => onNavigate('/pricing')}
                className={`grid h-9 w-9 place-items-center transition-colors ${sidebarExpanded
                  ? `rounded-[12px] border border-[color:color-mix(in_srgb,var(--ui-text)_12%,transparent)] bg-[color:color-mix(in_srgb,var(--ui-text)_7%,transparent)] text-[var(--ui-text)] ${desktopSidebarInlineHoverClassName}`
                  : 'text-[var(--ui-text)] hover:text-[var(--ui-primary)]'}`}
                title="Billing"
              >
                <Gem size={16} />
              </button>
              <button
                type="button"
                onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                className={`grid h-9 w-9 place-items-center transition-colors ${sidebarExpanded
                  ? `rounded-[12px] border border-[color:color-mix(in_srgb,var(--ui-text)_12%,transparent)] bg-[color:color-mix(in_srgb,var(--ui-text)_7%,transparent)] text-[var(--ui-text)] ${desktopSidebarInlineHoverClassName}`
                  : 'text-[var(--ui-text)] hover:text-[var(--ui-primary)]'}`}
                title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
              >
                {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
              </button>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                className={`grid h-9 w-9 place-items-center transition-colors ${sidebarExpanded
                  ? 'rounded-[12px] border border-rose-400/18 bg-rose-500/10 text-rose-300 hover:bg-rose-500/16'
                  : 'text-rose-300 hover:text-rose-200'}`}
                title="Logout"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <div className={`flex h-full flex-col overflow-hidden ${projectWorkspaceSurfaceClassName}`}>
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
              <main className="relative mx-auto max-w-[1560px] px-3 py-8 md:px-5 md:py-10 xl:px-6">
                <motion.section
                  className="mx-auto max-w-[920px] text-center"
                  initial={shouldReduceMotion ? false : { opacity: 0, y: 18 }}
                  animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
                  transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                >
                  <motion.p
                    className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-[#505050] shadow-[0_7px_18px_rgba(13,18,15,0.08)]"
                    initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
                    animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
                    transition={{ duration: 0.48, delay: 0.04, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <Sparkles size={12} />
                    Build faster in one workspace
                  </motion.p>
                  <motion.p
                    className="mt-6 font-['Fustat',sans-serif] text-[38px] font-bold leading-[0.96] tracking-[-0.055em] text-black sm:text-[48px] md:text-[64px]"
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
                    className="mt-4 font-['Fustat',sans-serif] text-[17px] font-medium leading-7 tracking-[-0.02em] text-[#505050]"
                    initial={shouldReduceMotion ? false : { opacity: 0, y: 14 }}
                    animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
                    transition={{ duration: 0.52, delay: 0.16, ease: [0.22, 1, 0.36, 1] }}
                  >
                    Type what you want to build and start a new project instantly.
                  </motion.p>

                  <motion.form
                    className="mt-10"
                    onSubmit={(event) => {
                      event.preventDefault();
                      handleCreateFromPrompt();
                    }}
                    initial={shouldReduceMotion ? false : { opacity: 0, y: 20, scale: 0.985 }}
                    animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.62, delay: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  >
            <div className="relative isolate mx-auto w-full max-w-[728px] overflow-visible">
              <ComposerAttachmentStack
                images={starterImages}
                onRemove={(index) => setStarterImages((prev) => prev.filter((_, i) => i !== index))}
                className="workspace-landing-composer__attachments"
              />
              <div
                data-guide-id="workspace-starter-prompt"
                className="workspace-landing-composer"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <div className="workspace-landing-composer__meta">
                  <div>
                    <span>{billingSummary?.balanceCredits ?? '...'} credits</span>
                    <button type="button" onClick={() => onNavigate('/pricing')}>Upgrade</button>
                  </div>
                  <span><Sparkles size={14} /> Powered by GPT-4o</span>
                </div>
                <div className="workspace-landing-composer__input">
                <div className="workspace-landing-composer__editor">
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
                    placeholder="Type question..."
                    placeholderClassName="text-left text-black/60"
                    className="no-focus-ring min-h-[74px] max-h-[160px] w-full overflow-y-auto border-0 bg-transparent p-0 text-left text-[16px] leading-6 text-black ring-0 focus:border-0 focus:outline-none focus:ring-0"
                  />
                </div>
                <div className="workspace-landing-composer__footer">
                <div className="workspace-landing-composer__tools">
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
                      className="workspace-landing-composer__tool"
                      title="Add to prompt"
                      whileHover={shouldReduceMotion ? undefined : { y: -1 }}
                      whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
                    >
                      <Plus size={14} />
                      <span>Add</span>
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
                  <div className="workspace-landing-composer__segmented">
                    {(['mobile', 'tablet', 'desktop'] as const).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setDeviceType(p)}
                        className={`workspace-landing-composer__segment ${deviceType === p
                          ? 'is-active'
                          : ''
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
                <div className="workspace-landing-composer__settings">
                  <div className="workspace-landing-composer__segmented">
                    <button
                      type="button"
                      onClick={() => setModelProfile('fast')}
                      className={`workspace-landing-composer__segment ${modelProfile === 'fast'
                        ? 'is-active'
                        : ''
                        }`}
                      title="Fast mode"
                    >
                      <Zap size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setModelProfile('quality')}
                      className={`workspace-landing-composer__segment ${modelProfile === 'quality'
                        ? 'is-active'
                        : ''
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
                      className="workspace-landing-composer__tool workspace-landing-composer__style"
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
                    data-guide-id="workspace-create-submit"
                    className="workspace-landing-composer__submit"
                    title="Create project from request"
                    whileHover={shouldReduceMotion ? undefined : { y: -1, scale: 1.02 }}
                    whileTap={shouldReduceMotion ? undefined : { scale: 0.98 }}
                  >
                    {creatingFromPrompt ? <Loader2 size={16} className="animate-spin" /> : <ArrowUp size={15} />}
                  </motion.button>
                </div>
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
                  data-guide-id="workspace-project-library"
                  className="mt-16 md:mt-20"
                  initial={shouldReduceMotion ? false : { opacity: 0, y: 22 }}
                  animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
                  transition={{ duration: 0.58, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
                >
          <h1 className="font-['Fustat',sans-serif] text-[36px] font-bold leading-[0.96] tracking-[-0.045em] text-black md:text-[54px]">Your Projects</h1>
          <p className="mt-3 font-['Fustat',sans-serif] text-[15px] font-medium text-[#66615a]">Open, continue, or remove your saved interface projects.</p>

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
            <section className="workspace-project-gallery mt-7">
              {projects.map((project, index) => (
                <motion.article
                  key={project.id}
                  className={`workspace-project-card group relative ${selectedIdSet.has(project.id) ? 'is-selected' : ''}`}
                  initial={shouldReduceMotion ? false : { opacity: 0, y: 24, scale: 0.985 }}
                  animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.42, delay: Math.min(index * 0.04, 0.24), ease: [0.22, 1, 0.36, 1] }}
                  whileHover={shouldReduceMotion ? undefined : { y: -7 }}
                  onClick={() => onOpenProject(project.id)}
                >
                  <div className="workspace-project-card__media">
                    {(() => {
                      const screens = projectScreens[project.id] || [];
                      const activeScreenIndex = Math.min(
                        activeProjectScreenIndexes[project.id] || 0,
                        Math.max(screens.length - 1, 0),
                      );
                      const activeScreen = screens[activeScreenIndex];
                      const screensLoaded = Object.prototype.hasOwnProperty.call(projectScreens, project.id);
                      const screenImage = Array.from(new Set([
                        ...(project.coverImageUrls || []).filter(Boolean),
                        project.coverImageUrl || '',
                      ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0)))[0];
                      const changeScreen = (direction: -1 | 1) => {
                        if (projectScreenTransitions[project.id]) return;
                        if (shouldReduceMotion) {
                          setActiveProjectScreenIndexes((current) => ({
                            ...current,
                            [project.id]: (activeScreenIndex + direction + screens.length) % screens.length,
                          }));
                          return;
                        }

                        setProjectScreenTransitions((current) => ({
                          ...current,
                          [project.id]: { direction, phase: 'out' },
                        }));
                        const swapTimer = window.setTimeout(() => {
                          setActiveProjectScreenIndexes((current) => ({
                            ...current,
                            [project.id]: ((current[project.id] || 0) + direction + screens.length) % screens.length,
                          }));
                          setProjectScreenTransitions((current) => ({
                            ...current,
                            [project.id]: { direction, phase: 'enter' },
                          }));
                        }, 180);
                        const finishTimer = window.setTimeout(() => {
                          setProjectScreenTransitions((current) => {
                            const next = { ...current };
                            delete next[project.id];
                            return next;
                          });
                          delete projectScreenTransitionTimersRef.current[project.id];
                        }, 430);
                        projectScreenTransitionTimersRef.current[project.id] = [swapTimer, finishTimer];
                      };

                      if (!screensLoaded) {
                        return <LoadingProjectScreenPreview />;
                      }

                      if (activeScreen) {
                        const indicatorCount = Math.min(screens.length, 5);
                        const activeIndicator = screens.length <= 5
                          ? activeScreenIndex
                          : Math.round((activeScreenIndex / Math.max(screens.length - 1, 1)) * 4);

                        return (
                          <>
                            {screens.length > 1 && (
                              <button
                                type="button"
                                className="workspace-project-card__gallery-arrow is-previous"
                                aria-label={`Show previous screen in ${project.name || 'project'}`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  changeScreen(-1);
                                }}
                              >
                                <ChevronLeft size={20} strokeWidth={1.8} />
                              </button>
                            )}
                            <LiveProjectScreenPreview
                              screen={activeScreen}
                              transition={projectScreenTransitions[project.id]}
                            />
                            {screens.length > 1 && (
                              <button
                                type="button"
                                className="workspace-project-card__gallery-arrow is-next"
                                aria-label={`Show next screen in ${project.name || 'project'}`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  changeScreen(1);
                                }}
                              >
                                <ChevronRight size={20} strokeWidth={1.8} />
                              </button>
                            )}
                            {screens.length > 1 && (
                              <div className="workspace-project-card__gallery-dots" aria-label={`${activeScreenIndex + 1} of ${screens.length} screens`}>
                                {Array.from({ length: indicatorCount }, (_, dotIndex) => (
                                  <span
                                    key={`${project.id}-indicator-${dotIndex}`}
                                    className={dotIndex === activeIndicator ? 'is-active' : ''}
                                  />
                                ))}
                              </div>
                            )}
                          </>
                        );
                      }
                      if (!screenImage) {
                        return (
                          <div className="workspace-project-card__empty">
                            {projectScreens[project.id] ? 'Preview will appear after save' : 'Loading screens...'}
                          </div>
                        );
                      }
                      return (
                        <img
                          src={screenImage}
                          alt={`${project.name || 'Project'} preview`}
                          className="workspace-project-card__screen"
                          loading="lazy"
                          onLoad={(event) => {
                            const sampledColor = sampleImageColor(event.currentTarget);
                            if (!sampledColor) return;
                            setProjectIconColors((current) => (
                              current[project.id]?.background === sampledColor.background
                                && current[project.id]?.foreground === sampledColor.foreground
                            )
                              ? current
                              : { ...current, [project.id]: sampledColor });
                          }}
                        />
                      );
                    })()}
                  </div>
                  <div className="workspace-project-card__details">
                    <span
                      className="workspace-project-card__mark"
                      style={{
                        backgroundColor: (projectIconColors[project.id] || projectFallbackColor(project.id)).background,
                        color: (projectIconColors[project.id] || projectFallbackColor(project.id)).foreground,
                      }}
                    >
                      {(project.name || 'E').slice(0, 1).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p>{project.name || 'Untitled project'}</p>
                      <span>{project.screenCount ?? 0} screens · Updated {formatDate(project.updatedAt)}</span>
                    </div>
                    <div className="workspace-project-card__options" data-project-options>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setOpenProjectMenuId((current) => current === project.id ? null : project.id);
                        }}
                        aria-label={`Options for ${project.name || 'project'}`}
                        aria-expanded={openProjectMenuId === project.id}
                      >
                        <MoreHorizontal size={18} />
                      </button>
                      {openProjectMenuId === project.id && (
                        <div className="workspace-project-card__menu">
                          <button type="button" onClick={(event) => { event.stopPropagation(); setOpenProjectMenuId(null); onOpenProject(project.id); }}>
                            <FolderOpen size={14} /> Open project
                          </button>
                          <button type="button" onClick={(event) => { event.stopPropagation(); toggleProjectSelection(project.id); }}>
                            <Check size={14} /> {selectedIdSet.has(project.id) ? 'Deselect' : 'Select'}
                          </button>
                          <button className="is-danger" type="button" onClick={(event) => { event.stopPropagation(); setOpenProjectMenuId(null); void handleDelete([project.id]); }}>
                            <Trash2 size={14} /> Delete project
                          </button>
                        </div>
                      )}
                    </div>
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
      <GuideBubbleOverlay
        step={activeWorkspaceGuideStep}
        stepIndex={guideStepIndex}
        stepCount={WORKSPACE_GUIDE_STEPS.length}
        onPrev={prevGuideStep}
        onSkip={skipGuide}
        onNext={() => {
          if (guideStepIndex >= WORKSPACE_GUIDE_STEPS.length - 1) {
            finishGuide();
            return;
          }
          nextGuideStep(WORKSPACE_GUIDE_STEPS.length);
        }}
      />
      <ConfirmationDialog />
    </div>
  );
}
