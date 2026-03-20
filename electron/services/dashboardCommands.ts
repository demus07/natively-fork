type DashboardCommandHandlers = {
  launchOverlay: (sessionId?: string) => Promise<void>;
};

let handlers: DashboardCommandHandlers | null = null;

export function registerDashboardCommandHandlers(nextHandlers: DashboardCommandHandlers): void {
  handlers = nextHandlers;
}

export async function launchOverlayFromDashboard(sessionId?: string): Promise<void> {
  if (!handlers) {
    throw new Error('Dashboard command handlers are not registered');
  }

  await handlers.launchOverlay(sessionId);
}
