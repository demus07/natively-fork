import { createRoot } from 'react-dom/client';
import SetupApp from './SetupApp';
import './index.css';

const container = document.getElementById('setup-root');
if (container) {
  const root = createRoot(container);
  root.render(<SetupApp />);
}
