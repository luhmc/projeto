const EXPORT_HISTORY_STORAGE_KEY = "uniformes-app-state-v3";

function formatDate(value) {
    if (!value) {
        return "Sem data";
    }

    const parts = String(value).split("-");
    if (parts.length !== 3) {
        return value;
    }

    return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function loadExportData() {
    const stored = window.localStorage.getItem(EXPORT_HISTORY_STORAGE_KEY);
    if (stored) {
        return JSON.parse(stored);
    }

    if (!window.UNIFORMES_DATA) {
        throw new Error("Dados do historico nao encontrados.");
    }

    return structuredClone(window.UNIFORMES_DATA);
}

function renderExport() {
    const data = loadExportData();
    const rows = [...data.movimentacoes].sort((a, b) => String(b.data).localeCompare(String(a.data)));

    document.title = "Historico de Movimentacoes PDF";
    document.body.innerHTML = `
        <style>
            body { font-family: "Segoe UI", Arial, sans-serif; margin: 32px; color: #102545; }
            h1 { margin: 0 0 6px; font-size: 28px; }
            p { margin: 0 0 20px; color: #526987; }
            table { width: 100%; border-collapse: collapse; }
            th, td { padding: 10px 8px; border-bottom: 1px solid #d7e1ef; text-align: left; font-size: 13px; }
            th { color: #35506f; font-size: 11px; text-transform: uppercase; letter-spacing: .08em; }
            @media print { body { margin: 16px; } }
        </style>
        <main>
            <h1>Historico de Movimentacoes</h1>
            <p>Documento pronto para imprimir ou salvar como PDF.</p>
            <table>
                <thead>
                    <tr>
                        <th>Data</th>
                        <th>Funcionario</th>
                        <th>Uniforme</th>
                        <th>Tamanho</th>
                        <th>Movimento</th>
                        <th>Quantidade</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.map(item => `
                        <tr>
                            <td>${escapeHtml(formatDate(item.data))}</td>
                            <td>${escapeHtml(item.funcionario)}</td>
                            <td>${escapeHtml(item.tipo)}</td>
                            <td>${escapeHtml(item.tamanho)}</td>
                            <td>${escapeHtml(item.movimento)}</td>
                            <td>${escapeHtml(item.quantidade)}</td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </main>
    `;

    window.setTimeout(() => window.print(), 150);
}

renderExport();
