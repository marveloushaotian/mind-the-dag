import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AccountProfileProvider } from './AccountProfile';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AccountProfileProvider><App /></AccountProfileProvider>
  </StrictMode>,
);
