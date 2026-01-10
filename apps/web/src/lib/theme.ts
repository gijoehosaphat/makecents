import { ThemeOptions, createTheme, lighten } from '@mui/material/styles'

declare module '@mui/material/styles/createPalette' {
  interface Palette {
    money: { positive: string; negative: string }
    hover: { paper: string }
  }

  interface PaletteOptions {
    money?: { positive: string; negative: string }
    hover?: { paper: string }
  }
}

const bodyFont = 'Lato, Helvetica, sans-serif'
const unit = 4

const baseTheme: ThemeOptions = {
  // See https://material-ui.com/customization/default-theme/

  // Adapted from our own Breakpoints.js
  // breakpoints: {
  //   values: {
  //     xs: 0,
  //     sm: 768,
  //     md: 992,
  //     lg: 1600,
  //     xl: 1920,
  //   },
  // },

  typography: {
    fontFamily: bodyFont,
    fontSize: 12,
    h1: { fontFamily: bodyFont, fontSize: 18, fontWeight: '700' },
    h2: { fontFamily: bodyFont, fontSize: 17, fontWeight: '600' },
    h3: { fontFamily: bodyFont, fontSize: 16, fontWeight: '500' },
    h4: { fontFamily: bodyFont, fontSize: 15, fontWeight: '400' },
    h5: { fontFamily: bodyFont, fontSize: 14, fontWeight: '300' },
    h6: { fontFamily: bodyFont, fontSize: 13, fontWeight: '200' },
    // title: { fontFamily: headingFont },
    // headline: { fontFamily: headingFont },
  },

  // palette: {
  //   mode: 'light',
  //   primary: {
  //     main: 'rgb(52, 115, 169)',
  //   },
  //   secondary: {
  //     main: '#00965c',
  //   },
  //   error: {
  //     main: '#EB011E',
  //   },
  //   background: {
  //     default: '#ffffff',
  //   },
  // },
  palette: {
    mode: 'dark',
    primary: {
      main: '#5893df',
    },
    secondary: {
      main: '#2ec5d3',
    },
    background: {
      default: '#192231',
      paper: '#24344d',
    },
    money: {
      positive: '#00ff00bb',
      negative: '#ff0000bb',
    },
    hover: {
      paper: '#24344d66',
    },
  },

  shape: {
    borderRadius: 4,
  },

  spacing: unit,
  // spacing: {
  //   unit,
  // },

  components: {
    MuiDialogTitle: {
      styleOverrides: { root: { fontFamily: bodyFont, fontSize: 17, fontWeight: '600' } },
    },
    // MuiTextField: {
    //   defaultProps: {
    //     variant: 'outlined',
    //   },
    // },
    // MuiFormControl: {
    //   defaultProps: {
    //     margin: 'normal',
    //     variant: 'outlined',
    //   },
    //   styleOverrides: {
    //     // The default margins aren't symmetrical, which makes it difficult to
    //     // nicely center things placed next to a form control. These values add up
    //     // to the defaults from material-ui.
    //     marginNormal: {
    //       // marginTop: 16,
    //       // marginBottom: 8,
    //       marginTop: 12,
    //       marginBottom: 12,
    //     },
    //     marginDense: {
    //       // marginTop: 8,
    //       // marginBottom: 4,
    //       marginTop: 6,
    //       marginBottom: 6,
    //     },
    //   },
    // },
    // MuiTabs: {
    //   defaultProps: {
    //     variant: 'scrollable',
    //     scrollButtons: false,
    //     textColor: 'inherit',
    //     indicatorColor: 'secondary',
    //   },
    // },
    // MuiListItemIcon: {
    //   styleOverrides: {
    //     root: {
    //       minWidth: 40,
    //     },
    //   },
    // },
    // MuiButton: {
    //   styleOverrides: {
    //     root: {
    //       textTransform: 'none',
    //     },
    //     contained: {
    //       boxShadow: 'none',
    //       [`&${buttonClasses.focusVisible}`]: {
    //         boxShadow: 'none',
    //       },
    //       '&:active': {
    //         boxShadow: 'none',
    //       },
    //     },
    //   },
    // },
    // MuiFab: {
    //   styleOverrides: {
    //     root: {
    //       boxShadow: 'none',
    //       [`&${fabClasses.focusVisible}`]: {
    //         boxShadow: 'none',
    //       },
    //       '&:active': {
    //         boxShadow: 'none',
    //       },
    //     },
    //   },
    // },
    // MuiUseMediaQuery: {
    //   defaultProps: {
    //     // Helps `useMediaQuery`, with `noSsr: false` it always returns "false"
    //     // at first.
    //     // This could probably be set for more mui components.
    //     noSsr: true,
    //   },
    // },
  },
}

export const lightTheme = createTheme(baseTheme)

export const darkTheme = createTheme({
  ...baseTheme,
  palette: {
    ...baseTheme.palette,
    mode: 'dark',
    contrastThreshold: 3,
    primary: {
      // Our primary color clashes with our dark background.
      main: lighten(lightTheme.palette.primary.main, 0.3),
    },
    background: {
      default: 'rgb(50, 50, 50)',
    },
  },
})
