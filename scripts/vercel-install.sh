#!/usr/bin/env bash
# ===========================================================================
# Install command custom para Vercel.
#
# Necesitamos forzar la instalacion del binario nativo platform-specific
# del @anthropic-ai/claude-agent-sdk (linux-x64), porque la optional dep no
# se instala correctamente desde el lockfile generado en Windows.
#
# Pasos:
# 1. npm install regular (sigue el lockfile).
# 2. Instalar el tarball del binario linux-x64 directo desde el registry
#    de npm, bypaseando el lockfile y la verificacion de OS.
# 3. chmod +x al binario (el paquete no declara "bin" asi que npm no lo
#    marca como ejecutable).
# 4. ls de verificacion (sale en build logs).
# ===========================================================================

set -e

echo "=== vercel-install.sh: arranca ==="

npm install

echo "=== Instalando binario linux-x64 via tarball ==="
npm install --no-save --no-package-lock \
  https://registry.npmjs.org/@anthropic-ai/claude-agent-sdk-linux-x64/-/claude-agent-sdk-linux-x64-0.3.143.tgz

BIN_DIR="node_modules/@anthropic-ai/claude-agent-sdk-linux-x64"

echo "=== Contenido del paquete instalado ==="
ls -la "$BIN_DIR"

echo "=== Marcando binario como ejecutable ==="
chmod +x "$BIN_DIR/claude"

echo "=== Permisos finales del binario ==="
ls -la "$BIN_DIR/claude"

echo "=== file (tipo del binario) ==="
file "$BIN_DIR/claude" || true

echo "=== vercel-install.sh: ok ==="
