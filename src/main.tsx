import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { registerBloomServiceWorker } from './serviceWorker';
import './styles.css';

registerBloomServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
