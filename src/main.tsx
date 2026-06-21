import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

/* Ionic core (scoped to ion-* elements) */
import '@ionic/react/css/core.css';
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';

/* Penny design tokens + components (loaded last so it wins) */
import './theme/tokens.css';

import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
