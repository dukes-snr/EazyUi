import { ArrowUp, FolderOpen, House, Loader2, LogOut, Monitor, Plus, RefreshCcw, Smartphone, Sparkles, Tablet, Trash2, X, Zap } from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { apiClient } from '../../api/client';
import type { DesignModelProfile } from '../../constants/designModels';
import logo from '../../assets/Ui-logo.png';
import type { User } from 'firebase/auth';
import { observeAuthState, signOutCurrentUser } from '../../lib/auth';
import { useUiStore } from '../../stores';
import { ConfirmationDialog } from '../ui/ConfirmationDialog';

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
  const [authUser, setAuthUser] = useState<User | null>(null);
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
  const [modelProfile, setModelProfile] = useState<DesignModelProfile>('quality');
  const [openAvatarMenu, setOpenAvatarMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const avatarMenuRef = useRef<HTMLDivElement | null>(null);

  const authDisplayName = authUser?.displayName || authUser?.email?.split('@')[0] || 'User';
  const authEmail = authUser?.email || 'No email';
  const authPhotoUrl = authUser?.photoURL
    || authUser?.providerData.find((provider) => Boolean(provider?.photoURL))?.photoURL
    || `https://ui-avatars.com/api/?name=${encodeURIComponent(authDisplayName)}&background=111827&color=ffffff&size=128&rounded=true`;
  const deletingIdSet = new Set(deletingIds);
  const selectedIdSet = new Set(selectedProjectIds);
  const hasSelectedProjects = selectedProjectIds.length > 0;
  const allSelected = projects.length > 0 && projects.every((project) => selectedIdSet.has(project.id));

  const loadProjects = async () => {
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
  };

  useEffect(() => {
    if (!authReady || !isAuthenticated) return;
    void loadProjects();
  }, [authReady, isAuthenticated]);

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
        stylePreset: 'modern',
        modelProfile,
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
    <div className="h-screen w-screen bg-[--ui-bg] text-[var(--ui-text)]">
      <aside className="fixed inset-y-0 left-0 z-30 flex w-[74px] flex-col items-center border-r border-white/10 bg-[--ui-bg] px-3 py-4">
        <button
          type="button"
          onClick={() => onNavigate('/')}
          className="grid h-10 w-10 place-items-center"
          title="Go to home"
        >
          <img src={logo} alt="EazyUI logo" className="h-5 w-5 object-contain" />
        </button>

        <nav className="mt-7 flex flex-1 flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate('/app')}
            className="grid h-10 w-10 place-items-center rounded-2xl text-[var(--ui-text-subtle)] hover:bg-[var(--ui-surface-3)] hover:text-[var(--ui-text)]"
            title="Workspace Home"
          >
            <House size={16} />
          </button>
          <button
            type="button"
            onClick={() => onNavigate('/app/projects')}
            className="grid h-10 w-10 place-items-center rounded-2xl bg-[var(--ui-surface-3)] text-[var(--ui-text)] ring-1 ring-[var(--ui-border)]"
            title="Projects"
          >
            <FolderOpen size={16} />
          </button>
          <button
            type="button"
            onClick={() => onNavigate('/app/projects/new')}
            className="grid h-10 w-10 place-items-center rounded-2xl text-[var(--ui-text-subtle)] hover:bg-[var(--ui-surface-3)] hover:text-[var(--ui-text)]"
            title="New Project"
          >
            <Plus size={16} />
          </button>
          <button
            type="button"
            onClick={() => void loadProjects()}
            className="grid h-10 w-10 place-items-center rounded-2xl text-[var(--ui-text-subtle)] hover:bg-[var(--ui-surface-3)] hover:text-[var(--ui-text)]"
            title="Refresh Projects"
          >
            <RefreshCcw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </nav>

        <div className="relative mt-6" ref={avatarMenuRef}>
          <button
            type="button"
            onClick={() => setOpenAvatarMenu((open) => !open)}
            className="grid h-10 w-10 place-items-center overflow-hidden rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-3)] text-[12px] font-medium text-[var(--ui-text)] hover:border-[var(--ui-border-light)]"
            title="Account"
          >
            <img src={authPhotoUrl} alt={authDisplayName} className="h-full w-full object-cover" />
          </button>
          {openAvatarMenu && (
            <div className="absolute bottom-0 left-[56px] w-[220px] rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-popover)] p-3 shadow-[0_18px_50px_rgba(0,0,0,0.45)]">
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
      </aside>

      <div className="h-screen overflow-y-auto pl-[74px]">

      <main className="relative mx-auto max-w-[1200px] px-4 py-10 md:px-7">
        <section className="mx-auto max-w-[860px] pt-[100px] text-center">
          <p className="text-[44px] md:text-[58px] leading-none tracking-[-0.03em] font-semibold text-[var(--ui-text)]">
            EazyUI Projects
          </p>
          <p className="mt-3 text-[15px] text-[var(--ui-text-muted)]">Type what you want to build and start a new project instantly.</p>

          <form
            className="mt-8"
            onSubmit={(event) => {
              event.preventDefault();
              handleCreateFromPrompt();
            }}
          >
            <div className="mx-auto w-full rounded-[20px] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3 ">
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
                <textarea
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
                  className="min-h-[64px] max-h-[220px] flex-1 resize-y border-0 bg-transparent px-3 py-2 text-[16px] leading-relaxed text-[var(--ui-text)] placeholder:text-[var(--ui-text-subtle)] focus:outline-none focus:ring-0"
                />
                <button
                  type="submit"
                  disabled={!starterPrompt.trim() || creatingFromPrompt}
                  className="h-9 w-9 shrink-0 rounded-[12px] flex items-center justify-center transition-all bg-indigo-500 text-white hover:bg-indigo-400 disabled:opacity-40"
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
              </div>
            </div>
          </form>
        </section>

        <section className="mt-[100px]">
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
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-rose-300/35 bg-rose-500/10 px-3 text-[11px] uppercase tracking-[0.08em] text-rose-200 hover:bg-rose-500/20 disabled:opacity-50"
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
                <article key={project.id} className={`relative rounded-2xl border p-4 ${selectedIdSet.has(project.id) ? 'border-[var(--ui-primary)] bg-[var(--ui-surface-3)]' : 'border-[var(--ui-border)] bg-[var(--ui-surface-2)]'}`}>
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
                      const hasMultipleScreens = (project.screenCount ?? 0) > 1;
                      const secondaryImage = persistedImages[1] || (hasMultipleScreens ? primaryImage : undefined);
                      const frameImages = secondaryImage ? [primaryImage, secondaryImage] : [primaryImage];
                      return (
                        <div className="relative flex h-[260px] items-center justify-center gap-3 overflow-hidden r px-3 py-4">
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
                      className="h-8 rounded-full border border-rose-300/35 bg-rose-500/10 px-3 text-[11px] uppercase tracking-[0.08em] text-rose-200 hover:bg-rose-500/20 disabled:opacity-50"
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
      <ConfirmationDialog />
    </div>
  );
}
