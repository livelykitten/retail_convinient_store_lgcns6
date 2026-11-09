import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/black-han-sans/400.css';
import '@fontsource/noto-sans-kr/400.css';
import '@fontsource/noto-sans-kr/500.css';
import '@fontsource/noto-sans-kr/700.css';
import App from './App';
import './style.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
