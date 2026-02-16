export function canUseBrowserNotifications(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window;
}

export async function requestBrowserNotificationPermissionIfNeeded(): Promise<NotificationPermission | 'unsupported'> {
    if (!canUseBrowserNotifications()) return 'unsupported';
    if (Notification.permission === 'default') {
        try {
            return await Notification.requestPermission();
        } catch {
            return Notification.permission;
        }
    }
    return Notification.permission;
}

export function notifyWhenInBackground(title: string, body: string): boolean {
    if (!canUseBrowserNotifications()) return false;
    if (Notification.permission !== 'granted') return false;
    if (typeof document !== 'undefined' && document.visibilityState === 'visible' && document.hasFocus()) {
        return false;
    }

    try {
        const notification = new Notification(title, {
            body,
            tag: 'eazyui-background-status',
        });
        notification.onclick = () => {
            window.focus();
            notification.close();
        };
        return true;
    } catch {
        return false;
    }
}
