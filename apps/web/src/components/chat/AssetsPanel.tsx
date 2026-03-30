import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import type { User } from 'firebase/auth';
import { ArrowUpRight, Check, ChevronDown, FolderOpen, Loader2, Search, Trash2, Upload, UserRound, X } from 'lucide-react';
import type { AssetRecord, AssetRole, AssetScope, ProjectAssetContext, ProjectAssetLink } from '../../api/client';
import { observeAuthState } from '../../lib/auth';
import { deleteUserAsset, getProjectAssetContext, listUserAssets, updateProjectAssetContext, uploadUserAssetBase64 } from '../../lib/firestoreData';
import { useUiStore } from '../../stores';
import { ImageUploader } from '../ui/image-uploader';

type AssetsPanelProps = {
    projectId: string | null;
    onAttachAsset: (params: { asset: AssetRecord }) => void;
};

async function readFileAsDataUrl(file: File): Promise<string> {
    return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
        reader.onerror = () => reject(new Error('Failed to read file.'));
        reader.readAsDataURL(file);
    });
}

async function getImageDimensions(dataUrl: string): Promise<{ width: number; height: number } | null> {
    return await new Promise((resolve) => {
        const image = new Image();
        image.onload = () => resolve({ width: image.naturalWidth || 0, height: image.naturalHeight || 0 });
        image.onerror = () => resolve(null);
        image.src = dataUrl;
    });
}

function formatAssetMeta(asset: AssetRecord) {
    const parts: string[] = [];
    if (typeof asset.width === 'number' && typeof asset.height === 'number' && asset.width > 0 && asset.height > 0) {
        parts.push(`${asset.width}x${asset.height}`);
    }
    if (typeof asset.sizeBytes === 'number' && asset.sizeBytes > 0) {
        const kb = Math.max(1, Math.round(asset.sizeBytes / 1024));
        parts.push(`${kb} KB`);
    }
    return parts.join(' • ');
}

function matchesAssetSearch(asset: AssetRecord, query: string) {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return true;
    const haystack = [
        asset.name,
        asset.kind,
        asset.scope,
        ...(asset.tags || []),
    ]
        .join(' ')
        .toLowerCase();
    return haystack.includes(normalizedQuery);
}

const BRAND_ROLE_OPTIONS: Array<{ value: '' | AssetRole; label: string }> = [
    { value: '', label: 'No role' },
    { value: 'logo', label: 'Logo' },
    { value: 'product-shot', label: 'Product shot' },
    { value: 'illustration', label: 'Illustration' },
    { value: 'photo', label: 'Photo' },
    { value: 'brand-texture', label: 'Brand texture' },
];

function createEmptyProjectAssetContext(): ProjectAssetContext {
    return {
        version: 1,
        autoUseBrandAssets: false,
        links: [],
        updatedAt: '',
    };
}

function getProjectAssetLink(context: ProjectAssetContext | null, asset: AssetRecord): ProjectAssetLink | null {
    if (!context) return null;
    return context.links.find((link) => (
        link.assetId === asset.id
        && link.scope === asset.scope
        && ((link.projectId || '') === (asset.projectId || ''))
    )) || null;
}

export function AssetsPanel({ projectId, onAttachAsset }: AssetsPanelProps) {
    const pushToast = useUiStore((state) => state.pushToast);
    const [authUser, setAuthUser] = useState<User | null>(null);
    const [scope, setScope] = useState<AssetScope>('project');
    const [assets, setAssets] = useState<AssetRecord[]>([]);
    const [projectBrandContext, setProjectBrandContext] = useState<ProjectAssetContext | null>(null);
    const [loading, setLoading] = useState(false);
    const [projectBrandLoading, setProjectBrandLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [attachingId, setAttachingId] = useState<string | null>(null);
    const [brandSavingKey, setBrandSavingKey] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [isDragActive, setIsDragActive] = useState(false);
    const [pendingFiles, setPendingFiles] = useState<File[]>([]);
    const [openAssetDetailsId, setOpenAssetDetailsId] = useState<string | null>(null);
    const [isRoleMenuOpen, setIsRoleMenuOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        const unsubscribe = observeAuthState((user) => setAuthUser(user));
        return () => unsubscribe();
    }, []);

    const canUseProjectScope = Boolean(projectId);
    const effectiveScope = scope === 'project' && !canUseProjectScope ? 'account' : scope;

    const loadAssets = useCallback(async () => {
        if (!authUser) {
            setAssets([]);
            setError('');
            return;
        }
        if (effectiveScope === 'project' && !projectId) {
            setAssets([]);
            setError('');
            return;
        }
        setLoading(true);
        setError('');
        try {
            const nextAssets = await listUserAssets({
                uid: authUser.uid,
                scope: effectiveScope,
                projectId: effectiveScope === 'project' ? projectId || undefined : undefined,
            });
            setAssets(nextAssets);
        } catch (loadError) {
            setError((loadError as Error).message || 'Failed to load assets.');
        } finally {
            setLoading(false);
        }
    }, [authUser, effectiveScope, projectId]);

    useEffect(() => {
        void loadAssets();
    }, [loadAssets]);

    useEffect(() => {
        let active = true;
        if (!authUser || !projectId) {
            setProjectBrandContext(null);
            setProjectBrandLoading(false);
            return () => {
                active = false;
            };
        }

        setProjectBrandLoading(true);
        void getProjectAssetContext({ uid: authUser.uid, projectId })
            .then((context) => {
                if (!active) return;
                setProjectBrandContext(context || createEmptyProjectAssetContext());
            })
            .catch((loadError) => {
                if (!active) return;
                console.warn('[AssetsPanel] Failed to load project asset context', loadError);
                setProjectBrandContext(createEmptyProjectAssetContext());
            })
            .finally(() => {
                if (active) {
                    setProjectBrandLoading(false);
                }
            });

        return () => {
            active = false;
        };
    }, [authUser, projectId]);

    const activeProjectBrandContext = projectBrandContext || createEmptyProjectAssetContext();

    const persistProjectBrandContext = useCallback(async (
        nextContext: ProjectAssetContext,
        savingKey: string,
        successMessage?: string
    ) => {
        if (!authUser || !projectId) return;
        setBrandSavingKey(savingKey);
        try {
            const saved = await updateProjectAssetContext({
                uid: authUser.uid,
                projectId,
                context: nextContext,
            });
            setProjectBrandContext(saved);
            if (successMessage) {
                pushToast({
                    kind: 'success',
                    title: 'Brand context updated',
                    message: successMessage,
                    durationMs: 1800,
                });
            }
        } catch (saveError) {
            const message = (saveError as Error).message || 'Failed to update project brand assets.';
            pushToast({ kind: 'error', title: 'Save failed', message });
        } finally {
            setBrandSavingKey(null);
        }
    }, [authUser, projectId, pushToast]);

    const updateAssetProjectLink = useCallback(async (
        asset: AssetRecord,
        updater: (current: ProjectAssetLink | null) => ProjectAssetLink | null
    ) => {
        if (!authUser || !projectId) return;
        const currentContext = projectBrandContext || createEmptyProjectAssetContext();
        const currentLink = getProjectAssetLink(currentContext, asset);
        const baseLinks = currentContext.links.filter((link) => !(
            link.assetId === asset.id
            && link.scope === asset.scope
            && ((link.projectId || '') === (asset.projectId || ''))
        ));
        const nextLink = updater(currentLink);
        const nextLinks = nextLink ? [...baseLinks, nextLink] : baseLinks;
        const nextContext: ProjectAssetContext = {
            version: 1,
            autoUseBrandAssets: currentContext.autoUseBrandAssets === true,
            links: nextLinks,
            updatedAt: new Date().toISOString(),
        };
        await persistProjectBrandContext(nextContext, asset.id);
    }, [authUser, persistProjectBrandContext, projectBrandContext, projectId]);

    const handleUploadClick = () => {
        fileInputRef.current?.click();
    };

    const uploadFiles = useCallback(async (files: File[]) => {
        if (!authUser || files.length === 0) return;
        if (effectiveScope === 'project' && !projectId) {
            pushToast({ kind: 'error', title: 'No project selected', message: 'Project assets need an active project.' });
            return;
        }

        setUploading(true);
        setError('');
        let uploadedCount = 0;
        let lastErrorMessage = '';

        for (const file of files) {
            try {
                const dataUrl = await readFileAsDataUrl(file);
                const dimensions = await getImageDimensions(dataUrl);
                await uploadUserAssetBase64({
                    uid: authUser.uid,
                    scope: effectiveScope,
                    projectId: effectiveScope === 'project' ? projectId || undefined : undefined,
                    fileName: file.name,
                    base64DataUrl: dataUrl,
                    mimeType: file.type || 'image/jpeg',
                    sizeBytes: file.size,
                    ...(dimensions ? dimensions : {}),
                });
                uploadedCount += 1;
            } catch (uploadError) {
                lastErrorMessage = (uploadError as Error).message || `Could not upload ${file.name}.`;
            }
        }

        try {
            if (uploadedCount > 0) {
                pushToast({
                    kind: 'success',
                    title: uploadedCount === 1 ? 'Asset uploaded' : 'Assets uploaded',
                    message: uploadedCount === 1
                        ? `Saved to ${effectiveScope === 'project' ? 'this project' : 'your account'} assets.`
                        : `${uploadedCount} assets were saved to ${effectiveScope === 'project' ? 'this project' : 'your account'} assets.`,
                });
                await loadAssets();
            }
            if (lastErrorMessage) {
                setError(lastErrorMessage);
                pushToast({ kind: 'error', title: 'Upload failed', message: lastErrorMessage });
            }
        } finally {
            setUploading(false);
        }
    }, [authUser, effectiveScope, loadAssets, projectId, pushToast]);

    const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []);
        event.currentTarget.value = '';
        await uploadFiles(files);
    };

    const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        if (event.dataTransfer.types.includes('Files')) {
            setIsDragActive(true);
        }
    };

    const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        if (event.dataTransfer.types.includes('Files')) {
            event.dataTransfer.dropEffect = 'copy';
            setIsDragActive(true);
        }
    };

    const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setIsDragActive(false);
    };

    const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setIsDragActive(false);
        const files = Array.from(event.dataTransfer.files || []).filter((file) => file.type.startsWith('image/'));
        await uploadFiles(files);
    };

    const handleDelete = async (asset: AssetRecord) => {
        if (!authUser) return;
        setDeletingId(asset.id);
        setError('');
        try {
            await deleteUserAsset({
                uid: authUser.uid,
                scope: asset.scope,
                asset,
            });
            setAssets((current) => current.filter((item) => item.id !== asset.id));
            pushToast({
                kind: 'info',
                title: 'Asset removed',
                message: `${asset.name} was deleted from ${asset.scope === 'project' ? 'this project' : 'your account'} assets.`,
            });
        } catch (deleteError) {
            const message = (deleteError as Error).message || 'Could not delete asset.';
            setError(message);
            pushToast({ kind: 'error', title: 'Delete failed', message });
        } finally {
            setDeletingId(null);
        }
    };

    const handleAttach = async (asset: AssetRecord) => {
        setAttachingId(asset.id);
        setError('');
        try {
            onAttachAsset({ asset });
            pushToast({
                kind: 'success',
                title: 'Asset attached',
                message: `${asset.name} was added to the current prompt.`,
                durationMs: 2200,
            });
        } catch (attachError) {
            const message = (attachError as Error).message || 'Could not attach asset.';
            setError(message);
            pushToast({ kind: 'error', title: 'Attach failed', message });
        } finally {
            setAttachingId(null);
        }
    };

    const emptyLabel = useMemo(() => {
        if (!authUser) return 'Sign in to start saving reusable assets.';
        if (effectiveScope === 'project' && !projectId) return 'Open a project to save project-only assets.';
        return effectiveScope === 'project'
            ? 'Upload images for this project so they can be reused in prompts and edits.'
            : 'Upload personal assets once and reuse them across projects.';
    }, [authUser, effectiveScope, projectId]);

    const filteredAssets = useMemo(
        () => assets.filter((asset) => matchesAssetSearch(asset, searchQuery)),
        [assets, searchQuery]
    );
    const pinnedCount = activeProjectBrandContext.links.filter((link) => link.pinned).length;
    const preferredLogo = activeProjectBrandContext.links.find((link) => link.isPreferredLogo);
    const keyBrandCount = activeProjectBrandContext.links.filter((link) => link.isKeyBrandAsset).length;
    const isEmptyState = !loading && assets.length === 0;
    const activeAssetDetails = openAssetDetailsId ? assets.find((asset) => asset.id === openAssetDetailsId) || null : null;

    useEffect(() => {
        setPendingFiles([]);
        setOpenAssetDetailsId(null);
        setIsRoleMenuOpen(false);
    }, [effectiveScope, projectId]);

    useEffect(() => {
        setIsRoleMenuOpen(false);
    }, [openAssetDetailsId]);

    const handlePendingUpload = useCallback(async () => {
        if (pendingFiles.length === 0) return;
        await uploadFiles(pendingFiles);
        setPendingFiles([]);
    }, [pendingFiles, uploadFiles]);

    return (
        <div
            className={`relative flex h-full flex-col overflow-hidden px-4 py-4 transition-colors ${isDragActive ? 'bg-[color:color-mix(in_srgb,var(--ui-primary)_6%,transparent)]' : ''}`}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={(event) => void handleDrop(event)}
        >
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleFileChange}
            />

            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="inline-flex items-center gap-2 rounded-full bg-[var(--ui-surface-2)] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--ui-text-subtle)]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--ui-primary)]" />
                        Assets
                    </div>
                    <h3 className="mt-3 text-[24px] font-semibold leading-[1.02] tracking-[-0.04em] text-[var(--ui-text)]">Saved media library</h3>
                    <p className="mt-2 max-w-[300px] text-[12px] leading-relaxed text-[var(--ui-text-muted)]">
                        Reuse visuals across prompts and edits without uploading the same files again.
                    </p>
                </div>

                {!isEmptyState ? (
                    <button
                        type="button"
                        onClick={handleUploadClick}
                        disabled={!authUser || uploading || (effectiveScope === 'project' && !projectId)}
                        className="inline-flex h-10 items-center gap-2 rounded-full bg-[var(--ui-primary)] px-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-white disabled:opacity-60"
                    >
                        {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                        {uploading ? 'Uploading' : 'Upload'}
                    </button>
                ) : null}
            </div>

            <div className="mt-5 inline-flex w-full rounded-[18px] bg-[var(--ui-surface-2)] p-1">
                <button
                    type="button"
                    onClick={() => setScope('project')}
                    disabled={!projectId}
                    className={`flex-1 rounded-[14px] px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors ${effectiveScope === 'project' ? 'bg-[var(--ui-surface-1)] text-[var(--ui-text)]' : 'cursor-pointer text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]'} disabled:cursor-not-allowed disabled:opacity-45`}
                >
                    <span className="inline-flex items-center gap-1.5">
                        <FolderOpen size={12} />
                        Project
                        {effectiveScope === 'project' ? <Check size={12} className="text-[var(--ui-primary)]" /> : null}
                    </span>
                </button>
                <button
                    type="button"
                    onClick={() => setScope('account')}
                    className={`flex-1 rounded-[14px] px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors ${effectiveScope === 'account' ? 'bg-[var(--ui-surface-1)] text-[var(--ui-text)]' : 'cursor-pointer text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]'}`}
                >
                    <span className="inline-flex items-center gap-1.5">
                        <UserRound size={12} />
                        Account
                        {effectiveScope === 'account' ? <Check size={12} className="text-[var(--ui-primary)]" /> : null}
                    </span>
                </button>
            </div>

            {!isEmptyState ? (
                <div className="mt-4 border-t border-[var(--ui-border)] pt-4">
                    <div className="flex items-end justify-between gap-3">
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--ui-text-subtle)]">Add assets</p>
                            <p className="mt-1 text-[12px] text-[var(--ui-text-muted)]">
                                Drop fresh images here, then save them to this {effectiveScope === 'project' ? 'project' : 'account'} library.
                            </p>
                        </div>
                        {pendingFiles.length > 0 ? (
                            <button
                                type="button"
                                onClick={() => void handlePendingUpload()}
                                disabled={uploading}
                                className="inline-flex h-9 items-center gap-2 rounded-full bg-[var(--ui-primary)] px-4 text-[10px] font-semibold uppercase tracking-[0.12em] text-white disabled:opacity-60"
                            >
                                {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                                Save {pendingFiles.length}
                            </button>
                        ) : null}
                    </div>
                    <ImageUploader
                        files={pendingFiles}
                        onChange={setPendingFiles}
                        maxFiles={8}
                        maxSize={6}
                        accept="image/jpeg,image/png,image/webp,image/svg+xml"
                        compact
                        className="mt-3"
                    />
                </div>
            ) : null}

            {!isEmptyState ? (
                <div className="mt-4">
                    <label className="flex items-center gap-3 px-1 py-2">
                        <Search size={14} className="text-[var(--ui-text-subtle)]" />
                        <input
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                            placeholder="Search by asset name or tag"
                            className="w-full bg-transparent text-[12px] text-[var(--ui-text)] outline-none placeholder:text-[var(--ui-text-subtle)]"
                        />
                        <span className="shrink-0 rounded-full bg-[var(--ui-surface-2)] px-2 py-1 text-[10px] font-medium text-[var(--ui-text-muted)]">{filteredAssets.length}</span>
                    </label>
                    <p className="mt-2 text-[11px] leading-5 text-[var(--ui-text-muted)]">
                        Showing {filteredAssets.length} of {assets.length} assets.
                    </p>
                </div>
            ) : null}

            {authUser && projectId && !isEmptyState ? (
                <div className="mt-4 border-t border-[var(--ui-border)] pt-4">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--ui-text-subtle)]">Project brand context</p>
                            <p className="mt-1 text-[12px] leading-relaxed text-[var(--ui-text-muted)]">
                                {projectBrandLoading
                                    ? 'Loading pinned assets and defaults...'
                                    : `${pinnedCount} pinned, ${keyBrandCount} key brand asset${keyBrandCount === 1 ? '' : 's'}${preferredLogo ? ', preferred logo selected.' : ', no preferred logo yet.'}`}
                            </p>
                        </div>
                        <label className="inline-flex items-center gap-2 rounded-full bg-[var(--ui-surface-1)] px-3 py-1.5 text-[11px] text-[var(--ui-text)]">
                            <input
                                type="checkbox"
                                checked={activeProjectBrandContext.autoUseBrandAssets}
                                disabled={projectBrandLoading || brandSavingKey === 'auto'}
                                className="ui-check"
                                onChange={(event) => void persistProjectBrandContext({
                                    ...activeProjectBrandContext,
                                    autoUseBrandAssets: event.target.checked,
                                    updatedAt: new Date().toISOString(),
                                }, 'auto', event.target.checked
                                    ? 'Saved project brand assets will be sent automatically.'
                                    : 'Automatic project brand assets are turned off.')}
                            />
                            Use automatically
                        </label>
                    </div>
                </div>
            ) : null}

            {error ? (
                <div className="mt-3 rounded-2xl bg-red-500/12 px-3 py-3 text-xs text-red-200">
                    {error}
                </div>
            ) : null}

            <div className="mt-4 flex-1 overflow-y-auto">
                {loading ? (
                    <div className="flex h-full items-center justify-center text-[var(--ui-text-muted)]">
                        <Loader2 size={16} className="animate-spin" />
                    </div>
                ) : assets.length === 0 ? (
                    <div className="flex h-full items-center">
                        <div className="w-full">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--ui-text-subtle)]">
                                {effectiveScope === 'project' ? 'Project library' : 'Account library'}
                            </div>
                            <h4 className="mt-2 text-[26px] font-semibold tracking-[-0.04em] text-[var(--ui-text)]">
                                {effectiveScope === 'project' ? 'No saved assets yet' : 'Start your reusable media set'}
                            </h4>
                            <p className="mt-2 max-w-[320px] text-[13px] leading-6 text-[var(--ui-text-muted)]">{emptyLabel}</p>
                            <ImageUploader
                                files={pendingFiles}
                                onChange={setPendingFiles}
                                maxFiles={8}
                                maxSize={6}
                                accept="image/jpeg,image/png,image/webp,image/svg+xml"
                                className="mt-5"
                            />
                            <div className="mt-4 flex flex-wrap items-center gap-3">
                                <button
                                    type="button"
                                    onClick={() => void handlePendingUpload()}
                                    disabled={!authUser || pendingFiles.length === 0 || uploading || (effectiveScope === 'project' && !projectId)}
                                    className="inline-flex h-10 items-center gap-2 rounded-full bg-[var(--ui-primary)] px-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-white disabled:opacity-60"
                                >
                                    {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                                    {uploading ? 'Uploading' : pendingFiles.length > 0 ? `Save ${pendingFiles.length} image${pendingFiles.length === 1 ? '' : 's'}` : 'Select images'}
                                </button>
                                <span className="text-[11px] text-[var(--ui-text-muted)]">PNG, JPG, SVG, or WebP. Drag and drop also works.</span>
                            </div>
                        </div>
                    </div>
                ) : filteredAssets.length === 0 ? (
                    <div className="flex h-full items-center">
                        <div className="w-full border-t border-[var(--ui-border)] pt-6">
                            <p className="text-[12px] leading-relaxed text-[var(--ui-text-muted)]">
                                No assets match "{searchQuery.trim()}" in this scope.
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="divide-y divide-[var(--ui-border)]">
                        {filteredAssets.map((asset) => {
                            const projectLink = getProjectAssetLink(activeProjectBrandContext, asset);
                            return (
                            <article key={asset.id} className="py-4 first:pt-0 last:pb-0">
                                <div className="flex items-center gap-4">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="truncate text-[15px] font-semibold text-[var(--ui-text)]">{asset.name}</p>
                                                <p className="mt-1 text-[11px] text-[var(--ui-text-muted)]">{formatAssetMeta(asset) || 'Saved image asset'}</p>
                                            </div>
                                            <p className="shrink-0 text-[10px] uppercase tracking-[0.16em] text-[var(--ui-text-subtle)]">
                                                {new Date(asset.createdAt || '').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                            </p>
                                        </div>
                                        <p className="mt-2 text-[10px] uppercase tracking-[0.16em] text-[var(--ui-text-subtle)]">
                                            {asset.scope === 'project' ? 'Project asset' : 'Account asset'}
                                        </p>
                                        {(projectLink?.pinned || projectLink?.role || projectLink?.isPreferredLogo || projectLink?.isKeyBrandAsset) ? (
                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                            {projectLink?.pinned ? (
                                                <span className="rounded-full border border-amber-500/30 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-amber-200">Pinned</span>
                                            ) : null}
                                            {projectLink?.role ? (
                                                <span className="rounded-full border border-sky-500/30 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-sky-200">{projectLink.role}</span>
                                            ) : null}
                                            {projectLink?.isPreferredLogo ? (
                                                <span className="rounded-full border border-emerald-500/30 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-emerald-200">Preferred logo</span>
                                            ) : null}
                                            {projectLink?.isKeyBrandAsset ? (
                                                <span className="rounded-full border border-fuchsia-500/30 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-fuchsia-200">Key brand</span>
                                            ) : null}
                                        </div>
                                    ) : null}
                                        <div className="mt-3 flex items-center gap-3">
                                            <button
                                                type="button"
                                                onClick={() => void handleAttach(asset)}
                                                disabled={attachingId === asset.id}
                                                className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ui-primary)]"
                                            >
                                                {attachingId === asset.id ? <Loader2 size={12} className="animate-spin" /> : <ArrowUpRight size={12} />}
                                                Use in prompt
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="h-[72px] w-[104px] shrink-0 overflow-hidden rounded-[18px] bg-[var(--ui-surface-2)]">
                                            <img src={asset.downloadUrl} alt={asset.name} className="h-full w-full object-cover" />
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setOpenAssetDetailsId((current) => current === asset.id ? null : asset.id)}
                                            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--ui-border)] text-[var(--ui-text-muted)] transition-colors hover:border-[var(--ui-text-subtle)] hover:text-[var(--ui-text)]"
                                            aria-label={`Toggle details for ${asset.name}`}
                                        >
                                            <ChevronDown size={16} className={openAssetDetailsId === asset.id ? 'rotate-180' : ''} />
                                        </button>
                                    </div>
                                </div>
                            </article>
                        );})}
                    </div>
                )}
            </div>

            {activeAssetDetails ? (
                <div
                    className="absolute inset-0 z-20 flex items-end bg-black/35"
                    onClick={() => setOpenAssetDetailsId(null)}
                >
                    <div
                        className="max-h-[86%] w-full overflow-y-auto rounded-t-[30px] border-t border-[var(--ui-border)] bg-[var(--ui-surface-1)] px-4 pb-6 pt-4"
                        onClick={(event) => event.stopPropagation()}
                    >
                        {(() => {
                            const asset = activeAssetDetails;
                            const projectLink = getProjectAssetLink(activeProjectBrandContext, asset);
                            const isSavingBrandState = brandSavingKey === asset.id;
                            return (
                                <>
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="min-w-0">
                                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--ui-text-subtle)]">Asset details</p>
                                            <h4 className="mt-2 truncate text-[20px] font-semibold tracking-[-0.03em] text-[var(--ui-text)]">{asset.name}</h4>
                                            <p className="mt-1 text-[12px] text-[var(--ui-text-muted)]">{formatAssetMeta(asset) || 'Saved image asset'}</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setOpenAssetDetailsId(null)}
                                            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--ui-border)] text-[var(--ui-text-muted)] transition-colors hover:text-[var(--ui-text)]"
                                            aria-label="Close asset details"
                                        >
                                            <X size={16} />
                                        </button>
                                    </div>

                                    <div className="mt-4 overflow-hidden rounded-[24px] bg-[var(--ui-surface-2)]">
                                        <img src={asset.downloadUrl} alt={asset.name} className="h-[220px] w-full object-cover" />
                                    </div>

                                    <div className="mt-4 flex flex-wrap items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => void handleAttach(asset)}
                                            disabled={attachingId === asset.id}
                                            className="inline-flex h-10 items-center gap-2 rounded-full bg-[var(--ui-primary)] px-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-white disabled:opacity-60"
                                        >
                                            {attachingId === asset.id ? <Loader2 size={13} className="animate-spin" /> : <ArrowUpRight size={13} />}
                                            Use in prompt
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => void handleDelete(asset)}
                                            disabled={deletingId === asset.id}
                                            className="inline-flex h-10 items-center gap-2 rounded-full border border-red-500/30 px-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-red-200 disabled:opacity-60"
                                        >
                                            {deletingId === asset.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                                            Remove
                                        </button>
                                    </div>

                                    {projectId ? (
                                        <div className="mt-6 border-t border-[var(--ui-border)] pt-5">
                                            <div className="flex items-center justify-between gap-3">
                                                <div>
                                                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--ui-text-subtle)]">Project usage</p>
                                                    <p className="mt-1 text-[12px] leading-5 text-[var(--ui-text-muted)]">
                                                        Assign a role, pin it, or make it the default logo for this project.
                                                    </p>
                                                </div>
                                                {isSavingBrandState ? <Loader2 size={14} className="animate-spin text-[var(--ui-text-muted)]" /> : null}
                                            </div>

                                            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                                                <button
                                                    type="button"
                                                    disabled={isSavingBrandState}
                                                    onClick={() => void updateAssetProjectLink(asset, (current) => {
                                                        const nextPinned = !current?.pinned;
                                                        if (!nextPinned && !current?.role && !current?.isPreferredLogo && !current?.isKeyBrandAsset) {
                                                            return null;
                                                        }
                                                        return {
                                                            assetId: asset.id,
                                                            scope: asset.scope,
                                                            ...(asset.projectId ? { projectId: asset.projectId } : {}),
                                                            ...(current?.role ? { role: current.role } : {}),
                                                            ...(nextPinned ? { pinned: true } : {}),
                                                            ...(current?.isPreferredLogo ? { isPreferredLogo: true } : {}),
                                                            ...(current?.isKeyBrandAsset ? { isKeyBrandAsset: true } : {}),
                                                        };
                                                    })}
                                                    className={`rounded-[18px] border px-4 py-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-colors ${projectLink?.pinned ? 'border-amber-500/30 bg-amber-500/10 text-amber-100' : 'border-[color:color-mix(in_srgb,var(--ui-border-light)_70%,transparent)] text-[var(--ui-text)] hover:bg-[var(--ui-surface-2)]'} disabled:opacity-60`}
                                                >
                                                    <span className="block text-[11px] font-semibold uppercase tracking-[0.12em]">
                                                        {projectLink?.pinned ? 'Pinned to project' : 'Pin to project'}
                                                    </span>
                                                    <span className={`mt-1 block text-[12px] leading-5 ${projectLink?.pinned ? 'text-amber-100/80' : 'text-[var(--ui-text-muted)]'}`}>
                                                        Keep this asset close to the project brand context.
                                                    </span>
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={isSavingBrandState}
                                                    onClick={() => void updateAssetProjectLink(asset, (current) => {
                                                        const shouldEnable = !current?.isKeyBrandAsset;
                                                        if (!shouldEnable && !current?.pinned && !current?.role && !current?.isPreferredLogo) {
                                                            return null;
                                                        }
                                                        return {
                                                            assetId: asset.id,
                                                            scope: asset.scope,
                                                            ...(asset.projectId ? { projectId: asset.projectId } : {}),
                                                            ...(current?.role ? { role: current.role } : {}),
                                                            ...(current?.pinned ? { pinned: true } : {}),
                                                            ...(current?.isPreferredLogo ? { isPreferredLogo: true } : {}),
                                                            ...(shouldEnable ? { isKeyBrandAsset: true } : {}),
                                                        };
                                                    })}
                                                    className={`rounded-[18px] border px-4 py-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-colors ${projectLink?.isKeyBrandAsset ? 'border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-100' : 'border-[color:color-mix(in_srgb,var(--ui-border-light)_70%,transparent)] text-[var(--ui-text)] hover:bg-[var(--ui-surface-2)]'} disabled:opacity-60`}
                                                >
                                                    <span className="block text-[11px] font-semibold uppercase tracking-[0.12em]">
                                                        {projectLink?.isKeyBrandAsset ? 'Key brand asset' : 'Mark as key brand'}
                                                    </span>
                                                    <span className={`mt-1 block text-[12px] leading-5 ${projectLink?.isKeyBrandAsset ? 'text-fuchsia-100/80' : 'text-[var(--ui-text-muted)]'}`}>
                                                        Flag it as a reusable visual for prompts and edits.
                                                    </span>
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={isSavingBrandState}
                                                    onClick={() => {
                                                        const existingLinks = activeProjectBrandContext.links;
                                                        const assetKeyMatches = (link: ProjectAssetLink) => (
                                                            link.assetId === asset.id
                                                            && link.scope === asset.scope
                                                            && ((link.projectId || '') === (asset.projectId || ''))
                                                        );
                                                        const currentIsPreferred = Boolean(projectLink?.isPreferredLogo);
                                                        const nextLinks = existingLinks
                                                            .map((link) => ({
                                                                ...link,
                                                                isPreferredLogo: assetKeyMatches(link) ? !currentIsPreferred : false,
                                                            }))
                                                            .filter((link) => link.pinned || link.role || link.isKeyBrandAsset || link.isPreferredLogo);
                                                        if (!existingLinks.some(assetKeyMatches) && !currentIsPreferred) {
                                                            nextLinks.push({
                                                                assetId: asset.id,
                                                                scope: asset.scope,
                                                                ...(asset.projectId ? { projectId: asset.projectId } : {}),
                                                                isPreferredLogo: true,
                                                                role: projectLink?.role || 'logo',
                                                                ...(projectLink?.pinned ? { pinned: true } : {}),
                                                                ...(projectLink?.isKeyBrandAsset ? { isKeyBrandAsset: true } : {}),
                                                            });
                                                        }
                                                        void persistProjectBrandContext({
                                                            ...activeProjectBrandContext,
                                                            links: nextLinks,
                                                            updatedAt: new Date().toISOString(),
                                                        }, asset.id, currentIsPreferred ? 'Preferred logo cleared.' : 'Preferred logo updated.');
                                                    }}
                                                    className={`rounded-[18px] border px-4 py-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-colors ${projectLink?.isPreferredLogo ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100' : 'border-[color:color-mix(in_srgb,var(--ui-border-light)_70%,transparent)] text-[var(--ui-text)] hover:bg-[var(--ui-surface-2)]'} disabled:opacity-60`}
                                                >
                                                    <span className="block text-[11px] font-semibold uppercase tracking-[0.12em]">
                                                        {projectLink?.isPreferredLogo ? 'Preferred logo' : 'Set as default logo'}
                                                    </span>
                                                    <span className={`mt-1 block text-[12px] leading-5 ${projectLink?.isPreferredLogo ? 'text-emerald-100/80' : 'text-[var(--ui-text-muted)]'}`}>
                                                        Use this asset first whenever the project needs a logo.
                                                    </span>
                                                </button>
                                            </div>

                                            <div className="relative mt-4 border-t border-[var(--ui-border)] pt-4">
                                                <div className="flex items-center justify-between gap-3">
                                                    <div>
                                                        <p className="text-[11px] font-medium text-[var(--ui-text)]">Brand role</p>
                                                        <p className="mt-1 text-[12px] text-[var(--ui-text-muted)]">
                                                            Choose how this asset should be interpreted in project prompts.
                                                        </p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        disabled={isSavingBrandState}
                                                        onClick={() => setIsRoleMenuOpen((current) => !current)}
                                                        className="inline-flex min-w-[170px] items-center justify-between gap-3 rounded-[16px] border border-[var(--ui-border)] px-4 py-3 text-left text-[12px] text-[var(--ui-text)] transition-colors hover:bg-[var(--ui-surface-2)] disabled:opacity-60"
                                                    >
                                                        <span>{BRAND_ROLE_OPTIONS.find((option) => option.value === (projectLink?.role || ''))?.label || 'No role'}</span>
                                                        <ChevronDown size={14} className={isRoleMenuOpen ? 'rotate-180' : ''} />
                                                    </button>
                                                </div>
                                                {isRoleMenuOpen ? (
                                                    <div className="absolute bottom-full right-0 z-10 mb-2 min-w-[210px] overflow-hidden rounded-[18px] border border-[var(--ui-border)] bg-[var(--ui-surface-1)] shadow-2xl shadow-black/25">
                                                        {BRAND_ROLE_OPTIONS.map((option) => {
                                                            const isActive = option.value === (projectLink?.role || '');
                                                            return (
                                                                <button
                                                                    key={option.value || 'none'}
                                                                    type="button"
                                                                    disabled={isSavingBrandState}
                                                                    onClick={() => {
                                                                        setIsRoleMenuOpen(false);
                                                                        void updateAssetProjectLink(asset, (current) => {
                                                                            const nextRole = option.value as '' | AssetRole;
                                                                            if (!nextRole && !current?.pinned && !current?.isPreferredLogo && !current?.isKeyBrandAsset) {
                                                                                return null;
                                                                            }
                                                                            return {
                                                                                assetId: asset.id,
                                                                                scope: asset.scope,
                                                                                ...(asset.projectId ? { projectId: asset.projectId } : {}),
                                                                                ...(nextRole ? { role: nextRole } : {}),
                                                                                ...(current?.pinned ? { pinned: true } : {}),
                                                                                ...(current?.isPreferredLogo ? { isPreferredLogo: true } : {}),
                                                                                ...(current?.isKeyBrandAsset ? { isKeyBrandAsset: true } : {}),
                                                                            };
                                                                        });
                                                                    }}
                                                                    className={`flex w-full items-center justify-between px-4 py-3 text-left text-[12px] transition-colors ${isActive ? 'bg-[var(--ui-surface-2)] text-[var(--ui-text)]' : 'text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)]'} disabled:opacity-60`}
                                                                >
                                                                    <span>{option.label}</span>
                                                                    {isActive ? <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ui-primary)]">Active</span> : null}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                ) : null}
                                            </div>
                                        </div>
                                    ) : null}
                                </>
                            );
                        })()}
                    </div>
                </div>
            ) : null}

            {isDragActive ? (
                <div className="pointer-events-none absolute inset-4 flex items-center justify-center rounded-[28px] border border-dashed border-[color:color-mix(in_srgb,var(--ui-primary)_40%,transparent)] bg-[color:color-mix(in_srgb,var(--ui-primary)_8%,var(--ui-surface-1))]">
                    <div className="rounded-[22px] bg-[var(--ui-surface-1)] px-5 py-4 text-center">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ui-primary)]">Drop to save</div>
                        <div className="mt-2 text-[12px] text-[var(--ui-text-muted)]">Images will be added to the current asset scope.</div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
