# Uniformes App

Protótipo visual local criado a partir da planilha `CONTROLE UNIFORMES TECNICOS.xlsx`.

## Arquivos

- `import-data.ps1`: extrai as abas principais do Excel para `data.json`
- `index.html`: interface visual do protótipo
- `styles.css`: identidade visual da tela
- `app.js`: renderização do dashboard

## Como atualizar os dados

```powershell
powershell -ExecutionPolicy Bypass -File .\import-data.ps1
```

## Como abrir

Abra `index.html` no navegador.
