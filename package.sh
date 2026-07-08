#!/usr/bin/env bash
# Empaquette l'extension pour publication sur le Chrome Web Store.
# Génère dist/<nom>-v<version>.zip à partir de la liste explicite FILES
# ci-dessous (uniquement les fichiers réellement utilisés par l'extension).
#
# Cette approche par liste blanche exclut donc automatiquement tout le
# reste, notamment : .git/ (Git), .idea/ (PhpStorm/JetBrains), .claude/ et
# CLAUDE.md (Claude Code), README.md, package.sh lui-même, dist/, .gitkeep,
# ainsi que tout futur fichier de config d'outil/IDE non listé ici.
#
# Usage : ./package.sh

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

VERSION=$(grep -m1 '"version"' manifest.json | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')
if [ -z "$VERSION" ]; then
  echo "Erreur : impossible de lire \"version\" dans manifest.json." >&2
  exit 1
fi

# Fichiers/dossiers réellement chargés par l'extension (voir manifest.json et
# les balises <link>/<script> des pages HTML). À mettre à jour si de nouveaux
# fichiers source sont ajoutés au projet.
FILES=(
  manifest.json
  background.js
  contentScript.js
  popup.html
  popup.js
  styles.css
  options.html
  options.js
  options.css
  hn-tree.html
  hn-tree.js
  hn-tree.css
  scrap-tool.html
  scrap-tool.js
  scrap-tool.css
  icons
)

for f in "${FILES[@]}"; do
  if [ ! -e "$f" ]; then
    echo "Erreur : fichier attendu introuvable : $f" >&2
    exit 1
  fi
done

DIST_DIR="${PROJECT_ROOT}/dist"
PACKAGE_NAME="410-gone-seo-geo-tools-v${VERSION}.zip"
OUTPUT_ABS="${DIST_DIR}/${PACKAGE_NAME}"

mkdir -p "$DIST_DIR"
rm -f "$OUTPUT_ABS"

STAGE_DIR=$(mktemp -d)
trap 'rm -rf "$STAGE_DIR"' EXIT
cp -r "${FILES[@]}" "$STAGE_DIR"/

if command -v zip >/dev/null 2>&1; then
  (cd "$STAGE_DIR" && zip -r -X -q "$OUTPUT_ABS" .)
elif command -v powershell.exe >/dev/null 2>&1; then
  # Environnement Windows sans utilitaire 'zip' (ex: Git Bash par défaut) :
  # on retombe sur Compress-Archive de PowerShell.
  WIN_OUTPUT="$(cd "$DIST_DIR" && pwd -W)/${PACKAGE_NAME}"
  WIN_OUTPUT="${WIN_OUTPUT//\//\\}"
  (cd "$STAGE_DIR" && powershell.exe -NoProfile -NonInteractive -Command "Compress-Archive -Path * -DestinationPath '${WIN_OUTPUT}' -Force")
else
  echo "Erreur : ni 'zip' ni 'powershell.exe' ne sont disponibles pour créer l'archive." >&2
  echo "Installez 'zip' (ex: 'sudo apt-get install zip', 'brew install zip', 'pacman -S zip') puis relancez ce script." >&2
  exit 1
fi

echo "Paquet créé : ${OUTPUT_ABS}"
