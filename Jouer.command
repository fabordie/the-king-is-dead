#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js est requis. Téléchargez-le sur https://nodejs.org puis relancez."
  read -r -p "Appuyez sur Entrée pour fermer…"
  exit 1
fi
node lancer.js
