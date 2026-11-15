# Poradnik SwitchHosts

[← README](../README.pl.md) · [English](guide.md)

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

- [Node.js](https://nodejs.org/) 24 LTS
- [Rust](https://www.rust-lang.org/tools/install) >= 1.90
- Zależności systemowe Tauri, zobacz [Wymagania Tauri](https://v2.tauri.app/start/prerequisites/)

### Tworzenie

Poniższe polecenia należy uruchamiać w katalogu głównym repozytorium. Ścieżka do zbudowanych pakietów jest podana względem tego katalogu.

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
