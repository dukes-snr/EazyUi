const showcaseImageModules = import.meta.glob('../assets/screens-img/*.{png,jpg,jpeg,webp,avif,gif}', {
    eager: true,
    import: 'default',
}) as Record<string, string>;

export const SHOWCASE_SCREEN_IMAGES: string[] = Object.entries(showcaseImageModules)
    .sort(([pathA], [pathB]) => pathA.localeCompare(pathB, undefined, { numeric: true, sensitivity: 'base' }))
    .map(([, source]) => source)
    .filter((source): source is string => typeof source === 'string' && source.length > 0);

