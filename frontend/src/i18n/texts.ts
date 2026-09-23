/**
 * All user-facing texts of the application, in Polish, in one module (so they can
 * be reviewed and changed in one place). Components must not hard-code UI strings.
 */
export const T = {
  appName: 'Aplikacja kierowcy',
  common: {
    loading: 'Ładowanie…',
    save: 'Zapisz',
    cancel: 'Anuluj',
    back: 'Wróć',
    retry: 'Spróbuj ponownie',
    unexpectedError: 'Coś poszło nie tak. Spróbuj ponownie za chwilę.',
    networkError: 'Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie.',
    required: 'To pole jest wymagane',
  },
  nav: {
    documents: 'Dokumenty',
    add: 'Dodaj',
    profile: 'Profil',
    logout: 'Wyloguj',
    mainNavigation: 'Nawigacja główna',
  },
  login: {
    title: 'Logowanie',
    username: 'Login',
    password: 'Hasło',
    submit: 'Zaloguj się',
    submitting: 'Logowanie…',
    noAccount: 'Nie masz konta?',
    registerLink: 'Zarejestruj się',
    invalidCredentials: 'Nieprawidłowy login lub hasło.',
    tooManyAttempts: (minutes: number) =>
      `Zbyt wiele nieudanych prób logowania. Spróbuj ponownie za ${minutes} min.`,
    sessionExpired: 'Sesja wygasła. Zaloguj się ponownie.',
  },
  register: {
    title: 'Rejestracja',
    username: 'Login',
    usernameHint: '3–30 znaków: litery, cyfry i _',
    email: 'Adres e-mail',
    password: 'Hasło',
    passwordHint: 'Min. 8 znaków, wielka litera, cyfra i znak specjalny',
    confirmPassword: 'Powtórz hasło',
    submit: 'Załóż konto',
    submitting: 'Zakładanie konta…',
    haveAccount: 'Masz już konto?',
    loginLink: 'Zaloguj się',
  },
  home: {
    title: 'Moje dokumenty',
    greeting: (name: string) => `Witaj, ${name}!`,
  },
  notFound: {
    title: 'Nie znaleziono strony',
    goHome: 'Przejdź do dokumentów',
  },
} as const;
