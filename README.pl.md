<div align="center" markdown="1">
  <sup>Special thanks to:</sup>
  <br>
  <a href="https://go.warp.dev/SwitchHosts">
    <img alt="Warp sponsorship" width="400" src="https://github.com/user-attachments/assets/bb4a0222-12bf-4c79-bb80-a8ed4672b801" />
  </a>

### [Warp, the intelligent terminal for developers](https://go.warp.dev/SwitchHosts)
[Available for MacOS, Linux, & Windows](https://go.warp.dev/SwitchHosts)<br>

</div>

---

# SwitchHosts

- [English](README.md)
- [简体中文](README.zh_hans.md)
- [繁體中文](README.zh_hant.md)

Strona główna: [https://switchhosts.vercel.app](https://switchhosts.vercel.app)

SwitchHosts to aplikacja do zarządzania plikiem hosts, zbudowana na bazie [Tauri](https://tauri.app/), [React](https://facebook.github.io/react/), [Jotai](https://jotai.org/), [Mantine](https://mantine.dev/) i innych.

## Zrzut ekranu

<img src="https://raw.githubusercontent.com/oldj/SwitchHosts/master/screenshots/sh_light.png" alt="Zrzut aplikacji" width="960">

## Funkcje

- Zarządzanie wpisami hosts: systemowymi, lokalnymi, zdalnymi, grupami i folderami
- Szybkie przełączanie hosts z głównego okna lub zasobnika systemowego
- Podświetlanie składni plików hosts
- Wyszukiwanie i zamiana w wielu wpisach hosts
- Ręczne, zaplanowane lub startowe odświeżanie zdalnych hosts
- Import i eksport danych hosts, w tym import kopii zapasowej z URL
- Przenoszenie wpisów do kosza oraz późniejsze przywracanie lub trwałe usuwanie
- Preferencje dla trybu zapisu, proxy, sprawdzania aktualizacji, uruchamiania przy logowaniu, polecenia po zastosowaniu i lokalnego HTTP API

## Instalacja

### Pobieranie

Możesz pobrać kod źródłowy i zbudować go samodzielnie, lub pobrać wbudowaną wersję z poniższych linków:

- [Pobierz najnowszą wersję SwitchHosts (GitHub release)](https://github.com/oldj/SwitchHosts/releases)

Możesz także zainstalować build używając [menedżera pakietów Chocolatey](https://community.chocolatey.org/packages/switchhosts):
```powershell
choco install switchhosts
```

## Kopia zapasowa

SwitchHosts przechowuje dane w `~/.SwitchHosts` (lub folder `.SwitchHosts` w ścieżce domowej bieżącego użytkownika na Windows). Układ danych v5:

- `~/.SwitchHosts/manifest.json` przechowuje drzewo hosts
- `~/.SwitchHosts/entries/` przechowuje zawartość lokalnych i zdalnych hosts
- `~/.SwitchHosts/trashcan.json` przechowuje wpisy kosza
- `~/.SwitchHosts/internal/config.json` przechowuje preferencje
- `~/.SwitchHosts/internal/histories/` przechowuje historię systemowego pliku hosts i uruchomień poleceń

Aby wykonać pełną ręczną kopię zapasową, skopiuj cały folder `~/.SwitchHosts`. Eksport w aplikacji tworzy JSON z kopią zapasową danych hosts; nie zawiera preferencji ani historii.

## Tworzenie i budowanie

### Wymagania wstępne

- [Node.js](https://nodejs.org/)
- [Rust](https://www.rust-lang.org/tools/install)
- Zależności systemowe Tauri, zobacz [Wymagania Tauri](https://v2.tauri.app/start/prerequisites/)

### Tworzenie

- Uruchom `npm install` aby zainstalować zależności
- Uruchom `npm run tauri:dev` aby uruchomić aplikację w trybie deweloperskim

### Budowanie i pakowanie

- Uruchom `npm run tauri:build` aby utworzyć wersję produkcyjną
- Spakowane pliki będą w `./src-tauri/target/release/bundle/`

```bash
# tworzenie
npm run tauri:dev

# budowanie produkcyjne
npm run tauri:build
```

## Prawa autorskie

SwitchHosts to wolne i otwarte oprogramowanie, wydane na licencji [Apache License](./LICENSE).
