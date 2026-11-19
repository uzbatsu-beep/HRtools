import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { applyAppearance, readAppearance } from './theme';
import './index.css';

applyAppearance(readAppearance());

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
