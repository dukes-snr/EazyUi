import { ArrowUp, FolderOpen, House, LogOut, Monitor, Plus, RefreshCcw, Smartphone, Sparkles, Tablet, Trash2, X, Zap } from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { apiClient } from '../../api/client';
import type { DesignModelProfile } from '../../constants/designModels';
import logo from '../../assets/Ui-logo.png';
import type { User } from 'firebase/auth';
import { observeAuthState, signOutCurrentUser } from '../../lib/auth';

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
};

const LANDING_DRAFT_KEY = 'eazyui:landing-draft';

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export function ProjectWorkspacePage({ authReady, isAuthenticated, onNavigate, onOpenProject }: ProjectWorkspacePageProps) {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
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

  const loadProjects = async () => {
    if (!authReady || !isAuthenticated) return;
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.listProjects();
      setProjects(res.projects || []);
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

  const handleDelete = async (id: string) => {
    const ok = window.confirm('Delete this project permanently?');
    if (!ok) return;
    try {
      setBusyId(id);
      await apiClient.deleteProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setError((err as Error).message || 'Failed to delete project.');
    } finally {
      setBusyId(null);
    }
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
    <div className="min-h-screen w-screen bg-[--ui-bg] text-white">
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
            className="grid h-10 w-10 place-items-center rounded-2xl text-gray-400 hover:bg-white/[0.08] hover:text-white"
            title="Workspace Home"
          >
            <House size={16} />
          </button>
          <button
            type="button"
            onClick={() => onNavigate('/app/projects')}
            className="grid h-10 w-10 place-items-center rounded-2xl bg-white/[0.10] text-white ring-1 ring-white/15"
            title="Projects"
          >
            <FolderOpen size={16} />
          </button>
          <button
            type="button"
            onClick={() => onNavigate('/app/projects/new')}
            className="grid h-10 w-10 place-items-center rounded-2xl text-gray-400 hover:bg-white/[0.08] hover:text-white"
            title="New Project"
          >
            <Plus size={16} />
          </button>
          <button
            type="button"
            onClick={() => void loadProjects()}
            className="grid h-10 w-10 place-items-center rounded-2xl text-gray-400 hover:bg-white/[0.08] hover:text-white"
            title="Refresh Projects"
          >
            <RefreshCcw size={16} />
          </button>
        </nav>

        <div className="relative mt-6" ref={avatarMenuRef}>
          <button
            type="button"
            onClick={() => setOpenAvatarMenu((open) => !open)}
            className="grid h-10 w-10 place-items-center overflow-hidden rounded-full border border-white/15 bg-white/[0.07] text-[12px] font-medium text-gray-200 hover:border-white/30"
            title="Account"
          >
            <img src={authPhotoUrl} alt={authDisplayName} className="h-full w-full object-cover" />
          </button>
          {openAvatarMenu && (
            <div className="absolute bottom-0 left-[56px] w-[220px] rounded-2xl border border-white/15 bg-[#12141C] p-3 shadow-[0_18px_50px_rgba(0,0,0,0.45)]">
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 overflow-hidden rounded-full border border-white/15 bg-black/30">
                  <img src={authPhotoUrl} alt={authDisplayName} className="h-full w-full object-cover" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{authDisplayName}</p>
                  <p className="truncate text-[11px] text-gray-400">{authEmail}</p>
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

      <div className="pl-[74px]">

      <main className="relative mx-auto max-w-[1200px] px-4 py-10 md:px-7">
        <section className="mx-auto max-w-[860px] pt-[100px] text-center">
          <p className="text-[44px] md:text-[58px] leading-none tracking-[-0.03em] font-semibold text-white/95">
            EazyUI Projects
          </p>
          <p className="mt-3 text-[15px] text-gray-400">Type what you want to build and start a new project instantly.</p>

          <form
            className="mt-8"
            onSubmit={(event) => {
              event.preventDefault();
              handleCreateFromPrompt();
            }}
          >
            <div className="mx-auto w-full rounded-[20px] border border-white/10 bg-[linear-gradient(90deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] p-3 ">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />
              {starterImages.length > 0 && (
                <div className="mb-2 flex gap-2 overflow-x-auto px-1 pb-2 border-b border-white/10">
                  {starterImages.map((img, idx) => (
                    <div key={`${idx}-${img.slice(0, 20)}`} className="relative group w-14 h-14 rounded-lg overflow-hidden border border-white/15 shrink-0">
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
              <div className="flex h-14 items-center rounded-full px-1">
                {/* <Sparkles size={16} className="shrink-0 text-gray-500" /> */}
                <input
                  type="text"
                  value={starterPrompt}
                  onChange={(event) => setStarterPrompt(event.target.value)}
                  placeholder="What do you want to create?"
                  className="h-full flex-1 border-0 bg-transparent px-3 text-[16px] text-gray-100 placeholder:text-gray-500 focus:outline-none focus:ring-0"
                />
                <button
                  type="submit"
                  disabled={!starterPrompt.trim() || creatingFromPrompt}
                  className="w-9 h-9 rounded-[12px] flex items-center justify-center transition-all bg-indigo-500 text-white hover:bg-indigo-400 disabled:opacity-40"
                  title="Create project from request"
                >
                  <ArrowUp size={18} />
                </button>
              </div>
              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06] text-gray-300 hover:text-white hover:bg-white/[0.12] transition-all ring-1 ring-white/10"
                    title="Add image"
                  >
                    <Plus size={18} />
                  </button>
                  <div className="flex items-center bg-white/[0.06] rounded-full p-1 ring-1 ring-white/10">
                    {(['mobile', 'tablet', 'desktop'] as const).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setDeviceType(p)}
                        className={`p-1.5 rounded-full transition-all ${deviceType === p
                          ? 'bg-white/[0.12] text-white shadow-sm'
                          : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.08]'
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
                <div className="flex items-center bg-white/[0.06] rounded-full p-1 ring-1 ring-white/10">
                  <button
                    type="button"
                    onClick={() => setModelProfile('fast')}
                    className={`h-8 w-8 rounded-full text-[11px] font-semibold transition-all inline-flex items-center justify-center ${modelProfile === 'fast'
                      ? 'bg-amber-500/20 text-white ring-1 ring-amber-400/40'
                      : 'text-amber-400 hover:text-amber-200 hover:bg-white/[0.08]'
                      }`}
                    title="Fast mode"
                  >
                    <Zap size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setModelProfile('quality')}
                    className={`h-8 w-8 rounded-full text-[11px] font-semibold transition-all inline-flex items-center justify-center ${modelProfile === 'quality'
                      ? 'bg-indigo-500/20 text-white ring-1 ring-indigo-300/40'
                      : 'text-indigo-300 hover:text-indigo-100 hover:bg-white/[0.08]'
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

        <section className="mt-[200px]">
          <h1 className="text-[34px] md:text-[52px] leading-[0.96] font-semibold tracking-[-0.03em]">Your Projects</h1>
          <p className="mt-3 text-sm text-gray-400">Open, continue, or remove projects saved in Firestore/Storage.</p>

          {error && (
            <div className="mt-5 rounded-2xl border border-rose-300/35 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          )}

          {loading && (
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 text-sm text-gray-400">
              Loading projects...
            </div>
          )}

          {!loading && projects.length === 0 && (
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-7 text-sm text-gray-400">
              No projects yet. Start with New Project.
            </div>
          )}

          {!loading && projects.length > 0 && (
            <section className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {projects.map((project) => (
                <article key={project.id} className="rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[16px] font-semibold text-white truncate">{project.name || 'Untitled project'}</p>
                      <p className="mt-1 text-[11px] text-gray-500 truncate">{project.id}</p>
                    </div>
                    <span className={`text-[10px] uppercase tracking-[0.08em] ${project.hasSnapshot ? 'text-emerald-300' : 'text-amber-300'}`}>
                      {project.hasSnapshot ? 'Backed up' : 'Meta only'}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-[11px] text-gray-400">
                    <span>Updated {formatDate(project.updatedAt)}</span>
                    <span>{project.screenCount ?? 0} screens</span>
                  </div>
                  <div className="mt-4 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenProject(project.id)}
                      disabled={busyId === project.id}
                      className="h-8 rounded-full border border-white/20 px-3 text-[11px] uppercase tracking-[0.08em] text-gray-200 hover:text-white hover:border-white/35 disabled:opacity-50"
                    >
                      <span className="inline-flex items-center gap-1.5"><FolderOpen size={12} /> Open</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(project.id)}
                      disabled={busyId === project.id}
                      className="h-8 rounded-full border border-rose-300/35 bg-rose-500/10 px-3 text-[11px] uppercase tracking-[0.08em] text-rose-200 hover:bg-rose-500/20 disabled:opacity-50"
                    >
                      <span className="inline-flex items-center gap-1.5"><Trash2 size={12} /> Delete</span>
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
  );
}
