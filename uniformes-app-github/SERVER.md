# Servidor Local

Use este comando no PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File D:\projetos\uniformes-app\serve.ps1
```

O app deve ficar disponivel em:

- `http://localhost:8080/`
- `http://192.168.200.156:8080/`

# Acesso Externo

Para acessar de qualquer lugar com seguranca, use um tunel privado apontando para:

- `http://localhost:8080`

Ferramentas recomendadas:

- `Tailscale`
- `Cloudflare Tunnel`

# Atualizar Dados

```powershell
powershell -ExecutionPolicy Bypass -File D:\projetos\uniformes-app\import-data.ps1
powershell -ExecutionPolicy Bypass -File D:\projetos\uniformes-app\import-gerador.ps1
```
