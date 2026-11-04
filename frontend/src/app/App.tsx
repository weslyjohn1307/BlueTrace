import React from 'react';
import { AppRouter } from './AppRouter';
import { ThemeProvider } from './ThemeContext';

export const App: React.FC = () => {
  return <ThemeProvider><AppRouter /></ThemeProvider>;
};

export default App;
