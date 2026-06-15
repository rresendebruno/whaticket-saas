import React, { createContext, useState, useContext, useMemo } from "react";
import PropTypes from "prop-types";
import { createMuiTheme, ThemeProvider as MUIThemeProvider } from "@material-ui/core/styles";
import { ptBR } from "@material-ui/core/locale";
import { CssBaseline } from "@material-ui/core";

const ThemeContext = createContext();

const getLocale = () => {
  const lang = localStorage.getItem("i18nextLng") || "";
  const code = lang.substring(0, 2) + lang.substring(3, 5);
  return code === "ptBR" ? ptBR : {};
};

const buildTheme = (darkMode) =>
  createMuiTheme(
    {
      scrollbarStyles: {
        "&::-webkit-scrollbar": { width: "8px", height: "8px" },
        "&::-webkit-scrollbar-thumb": {
          boxShadow: "inset 0 0 6px rgba(0, 0, 0, 0.3)",
          backgroundColor: darkMode ? "#555" : "#e8e8e8",
        },
      },
      palette: {
        type: darkMode ? "dark" : "light",
        primary: { main: "#2576d2" },
        ...(darkMode && {
          background: {
            default: "#121212",
            paper: "#1e1e1e",
          },
          text: {
            primary: "#e0e0e0",
            secondary: "#aaaaaa",
          },
        }),
      },
    },
    getLocale()
  );

export const ThemeProvider = ({ children }) => {
  const [darkMode, setDarkMode] = useState(
    () => localStorage.getItem("darkMode") === "true"
  );

  const toggleTheme = () => {
    setDarkMode(prev => {
      const next = !prev;
      localStorage.setItem("darkMode", String(next));
      return next;
    });
  };

  const theme = useMemo(() => buildTheme(darkMode), [darkMode]);
  const contextValue = useMemo(() => ({ darkMode, toggleTheme }), [darkMode]);

  return (
    <ThemeContext.Provider value={contextValue}>
      <MUIThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </MUIThemeProvider>
    </ThemeContext.Provider>
  );
};

ThemeProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export const useThemeContext = () => useContext(ThemeContext);
