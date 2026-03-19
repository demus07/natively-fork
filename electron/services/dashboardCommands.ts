type DashboardCommandHandlers = {
  launchOverlay: () => Promise<void>;
};

let handlers: DashboardCommandHandlers | null = null;

export function registerDashboardCommandHandlers(nextHandlers: DashboardCommandHandlers): void {
  handlers = nextHandlers;
}

export async function launchOverlayFromDashboard(): Promise<void> {
  if (!handlers) {
    throw new Error('Dashboard command handlers are not registered');
  }

  await handlers.launchOverlay();
}
