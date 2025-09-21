#!/bin/bash

# Script de build para o Render
echo "Iniciando processo de build..."

# Instalar dependências
echo "Instalando dependências..."
npm install

# Verificar se DATABASE_URL está definida
if [ -z "$DATABASE_URL" ]; then
  echo "ERRO: Variável de ambiente DATABASE_URL não definida. As migrações não podem ser executadas."
  exit 1
fi

# Sincronizar schema do banco de dados usando método seguro
echo "Sincronizando schema do banco de dados..."
node migrate.js

# Build do projeto
echo "Fazendo build do projeto..."
npm run build

echo "Build concluído com sucesso!"


