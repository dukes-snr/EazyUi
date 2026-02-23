import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './styles/index.css';

function isSandboxCookieSecurityError(input: unknown): boolean {
    const message = String(
        (input as { message?: unknown })?.message
        ?? (input as { reason?: { message?: unknown } })?.reason?.message
        ?? input
        ?? ''
    ).toLowerCase();

    return (
        message.includes("failed to set the 'cookie' property on 'document'")
        && message.includes('sandboxed')
        && message.includes('allow-same-origin')
    );
}

// Some browser extensions inject scripts into sandboxed iframes and trigger noisy cookie SecurityErrors.
// Suppress only this known, non-actionable class so real app errors remain visible.
window.addEventListener('error', (event) => {
    if (!isSandboxCookieSecurityError(event.error ?? event.message)) return;
    event.preventDefault();
}, true);

window.addEventListener('unhandledrejection', (event) => {
    if (!isSandboxCookieSecurityError(event.reason)) return;
    event.preventDefault();
});

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 1000 * 60 * 5, // 5 minutes
            refetchOnWindowFocus: false,
        },
    },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <QueryClientProvider client={queryClient}>
            <App />
        </QueryClientProvider>
    </React.StrictMode>
);
