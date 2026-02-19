import { FolderOpen, Plus, RefreshCcw, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { apiClient } from '../../api/client';

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

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export function ProjectWorkspacePage({ authReady, isAuthenticated, onNavigate, onOpenProject }: ProjectWorkspacePageProps) {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  if (!authReady) {
    return <div className="h-screen w-screen grid place-items-center bg-[#06070B] text-gray-300">Loading workspace...</div>;
  }

  if (!isAuthenticated) {
    return <div className="h-screen w-screen grid place-items-center bg-[#06070B] text-rose-200">You need to be logged in.</div>;
  }

  return (
    <div className="min-h-screen w-screen bg-[#06070B] text-white">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_15%_10%,rgba(99,102,241,0.14),transparent_32%),radial-gradient(circle_at_86%_8%,rgba(56,189,248,0.10),transparent_26%)]" />
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#06070B]/88 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-4 md:px-7">
          <button
            type="button"
            onClick={() => onNavigate('/')}
            className="text-[12px] uppercase tracking-[0.16em] text-gray-300 hover:text-white"
          >
            EazyUI Workspace
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadProjects()}
              className="h-9 rounded-full border border-white/20 px-4 text-[11px] uppercase tracking-[0.08em] text-gray-300 hover:text-white hover:border-white/40"
            >
              <span className="inline-flex items-center gap-2"><RefreshCcw size={13} /> Refresh</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('/app', '?new=1')}
              className="h-9 rounded-full bg-white px-4 text-[11px] uppercase tracking-[0.08em] text-[#0b1020] font-semibold hover:bg-gray-200"
            >
              <span className="inline-flex items-center gap-2"><Plus size={13} /> New Project</span>
            </button>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-[1200px] px-4 md:px-7 py-10">
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
      </main>
    </div>
  );
}
