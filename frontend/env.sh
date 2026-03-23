#!/bin/sh
# env.sh — Gerador de configuração pública em Runtime para o container Nginx.
#
# WHITELIST DE SEGURANÇA: apenas variáveis explicitamente listadas aqui são
# expostas ao browser. Nunca adicione segredos (JWT_SECRET, tokens, senhas).
# Tudo que entrar neste arquivo será público e acessível por qualquer usuário.
#
# Referência: https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html
set -eu

# Helper: escapa caracteres especiais para JSON seguro
escape_json() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g; s/\t/\\t/g; s/\r/\\r/g'
}

# Gera o JSON com apenas variáveis PÚBLICAS (configurações de roteamento)
cat > /usr/share/nginx/html/runtime-config.json <<EOF
{
  "VITE_API_URL": "$(escape_json "${VITE_API_URL:-}")"
}
EOF

chmod 644 /usr/share/nginx/html/runtime-config.json
echo "✅ runtime-config.json gerado"
