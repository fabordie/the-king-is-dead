#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js est requis. Installez-le (https://nodejs.org ou votre gestionnaire de paquets) puis relancez."
  exit 1
fi
node lancer.js
