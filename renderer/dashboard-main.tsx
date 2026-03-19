import { createRoot } from 'react-dom/client';
import DashboardApp from './DashboardApp';
import './index.css';

const container = document.getElementById('dashboard-root');
if (container) {
  const root = createRoot(container);
  root.render(<DashboardApp />);
}
