import type { ProjectRepository } from './project-repository.js';
import type { EazyUiProjectPayload, RequestContext } from './types.js';

export const MCP_RESOURCES = [
  {
    uri: 'eazyui://project/{projectId}/summary',
    name: 'Project Summary',
    description: 'High-level project metadata, design system snapshot, and screen list.',
    mimeType: 'application/json',
  },
  {
    uri: 'eazyui://project/{projectId}/screens',
    name: 'Project Screens',
    description: 'Screen-level metadata with small HTML previews.',
    mimeType: 'application/json',
  },
  {
    uri: 'eazyui://project/{projectId}/design-system',
    name: 'Project Design System',
    description: 'Current design-system object as stored in project designSpec.',
    mimeType: 'application/json',
  },
  {
    uri: 'eazyui://project/{projectId}/chat/recent?limit=50',
    name: 'Recent Chat',
    description: 'Recent chat messages from saved chatState.',
    mimeType: 'application/json',
  },
] as const;

export async function readResource(
  projectRepo: ProjectRepository,
  context: RequestContext,
  uri: string,
): Promise<Record<string, unknown>> {
  const parsed = parseResourceUri(uri);
  if (!context.uid) {
    throw new Error('Unauthorized: missing user context');
  }
  const project = await projectRepo.getProject(context.uid, parsed.projectId);

  if (parsed.resource === 'summary') {
    return buildSummary(project);
  }
  if (parsed.resource === 'screens') {
    return buildScreens(project);
  }
  if (parsed.resource === 'design-system') {
    return {
      projectId: project.projectId,
      designSystem: project.designSpec?.designSystem || null,
      updatedAt: project.updatedAt,
    };
  }

  return buildRecentChat(project, parsed.limit || 50);
}

function parseResourceUri(uri: string): {
  projectId: string;
  resource: 'summary' | 'screens' | 'design-system' | 'chat';
  limit?: number;
} {
  const match = /^eazyui:\/\/project\/([^/]+)\/([^?]+)(?:\?(.*))?$/i.exec(uri.trim());
  if (!match) {
    throw new Error(`Unsupported resource URI: ${uri}`);
  }

  const projectId = decodeURIComponent(match[1]);
  const rawPath = match[2].toLowerCase();
  const queryString = match[3] || '';
  const searchParams = new URLSearchParams(queryString);

  if (rawPath === 'summary') {
    return { projectId, resource: 'summary' };
  }
  if (rawPath === 'screens') {
    return { projectId, resource: 'screens' };
  }
  if (rawPath === 'design-system') {
    return { projectId, resource: 'design-system' };
  }
  if (rawPath === 'chat/recent') {
    const limitParam = Number(searchParams.get('limit') || '50');
    return {
      projectId,
      resource: 'chat',
      limit: Number.isFinite(limitParam) ? Math.max(1, Math.min(200, limitParam)) : 50,
    };
  }

  throw new Error(`Unsupported resource path in URI: ${uri}`);
}

function buildSummary(project: EazyUiProjectPayload): Record<string, unknown> {
  const screens = Array.isArray(project.designSpec?.screens) ? project.designSpec.screens : [];
  return {
    projectId: project.projectId,
    name: project.designSpec?.name,
    description: project.designSpec?.description,
    updatedAt: project.updatedAt,
    createdAt: project.createdAt,
    screenCount: screens.length,
    screens: screens.map((screen) => ({
      screenId: screen.screenId,
      name: screen.name,
      width: screen.width,
      height: screen.height,
    })),
    hasDesignSystem: Boolean(project.designSpec?.designSystem),
    designSystem: project.designSpec?.designSystem || null,
  };
}

function buildScreens(project: EazyUiProjectPayload): Record<string, unknown> {
  const screens = Array.isArray(project.designSpec?.screens) ? project.designSpec.screens : [];
  return {
    projectId: project.projectId,
    count: screens.length,
    screens: screens.map((screen) => ({
      screenId: screen.screenId,
      name: screen.name,
      width: screen.width,
      height: screen.height,
      htmlPreview: screen.html.slice(0, 600),
      htmlChars: screen.html.length,
    })),
  };
}

function buildRecentChat(project: EazyUiProjectPayload, limit: number): Record<string, unknown> {
  const rawMessages = extractSavedChatMessages(project.chatState);
  const recent = rawMessages.slice(-1 * limit);
  return {
    projectId: project.projectId,
    limit,
    count: recent.length,
    messages: recent,
  };
}

function extractSavedChatMessages(chatState: unknown): Array<Record<string, unknown>> {
  if (!chatState || typeof chatState !== 'object') return [];
  const maybeMessages = (chatState as { messages?: unknown }).messages;
  if (!Array.isArray(maybeMessages)) return [];
  return maybeMessages
    .filter((message): message is Record<string, unknown> => Boolean(message && typeof message === 'object'))
    .map((message) => ({
      role: message.role,
      content: typeof message.content === 'string' ? message.content : '',
      createdAt: message.createdAt || message.timestamp || null,
      status: message.status || null,
    }));
}
