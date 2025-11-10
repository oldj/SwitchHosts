# SwitchHosts

- [English](README.md)
- [简体中文](README.zh_hans.md)
- [繁體中文](README.zh_hant.md)

Strona główna: [https://switchhosts.vercel.app](https://switchhosts.vercel.app)

SwitchHosts to aplikacja do zarządzania plikiem hosts, zbudowana na bazie [Electron](http://electron.atom.io/), [React](https://facebook.github.io/react/), [Jotai](https://jotai.org/), [Chakra UI](https://chakra-ui.com/), [CodeMirror](http://codemirror.net/) i innych.

## Zrzut ekranu

<img src="https://raw.githubusercontent.com/oldj/SwitchHosts/master/screenshots/sh_light.png" alt="Zrzut" width="960">

## Funkcje

- Szybkie przełączanie hostów
- Podświetlanie składni
- Hosty zdalne
- Przełączanie z paska systemowego

## Instalacja

### Pobieranie

Możesz pobrać kod źródłowy i zbudować go samodzielnie, lub pobrać wbudowaną wersję z poniższych linków:

- [Strona pobierania SwitchHosts (GitHub release)](https://github.com/oldj/SwitchHosts/releases)

Możesz także zainstalować wbudowaną wersję używając [menedżera pakietów Chocolatey](https://community.chocolatey.org/packages/switchhosts):
```powershell
choco install switchhosts
```

## Kopia zapasowa

SwitchHosts przechowuje dane w `~/.SwitchHosts` (lub folder `.SwitchHosts` w ścieżce domowej bieżącego użytkownika na Windows), folder `~/.SwitchHosts/data` zawiera dane, podczas gdy folder `~/.SwitchHosts/config` zawiera różne informacje konfiguracyjne.

## Tworzenie i budowanie

### Tworzenie

- Zainstaluj [Node.js](https://nodejs.org/)
- Przejdź do folderu `./`, uruchom `npm install` aby zainstalować biblioteki zależności
- Uruchom `npm run dev` aby uruchomić serwer deweloperski
- Następnie uruchom `npm run start` aby uruchomić aplikację do tworzenia lub debugowania

### Budowanie i pakowanie

- Zaleca się użycie [electron-builder](https://github.com/electron-userland/electron-builder) do pakowania
- Przejdź do folderu `./`
- Uruchom `npm run build`
- Uruchom `npm run make`, jeśli wszystko pójdzie dobrze, spakowane pliki będą w folderze `./dist`.
- Ta komenda może zająć kilka minut gdy uruchamiasz ją po raz pierwszy, ponieważ potrzebuje czasu na pobranie plików zależności. Możesz pobrać zależności ręcznie [tutaj](https://github.com/electron/electron/releases), lub [lustro Taobao](https://npmmirror.com/mirrors/electron/), a następnie zapisz pliki do `~/.electron`. Możesz sprawdzić [Dokumentację Electron](http://electron.atom.io/docs/) aby uzyskać więcej informacji.

```bash
# budowanie
npm run build

# pakowanie
npm run make # spakowane pliki będą w ./dist
```

## Prawa autorskie

SwitchHosts to wolne i otwarte oprogramowanie, wydane na licencji [Apache License](./LICENSE).
