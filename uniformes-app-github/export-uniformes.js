const EXPORT_STORAGE_KEY = "uniformes-app-state-v3";

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
    const stored = window.localStorage.getItem(EXPORT_STORAGE_KEY);
    if (stored) {
        return JSON.parse(stored);
    }

    if (!window.UNIFORMES_DATA) {
        throw new Error("Dados de uniformes nao encontrados.");
    }

    return structuredClone(window.UNIFORMES_DATA);
}

function renderExport() {
    const data = loadExportData();
    const stockTotal = data.estoque.reduce((sum, item) => sum + item.quantidadeAtual, 0);
    const discardCount = data.movimentacoes.filter(item => item.movimento === "DESCARTE").length;
    const rows = [...data.movimentacoes].sort((a, b) => String(b.data).localeCompare(String(a.data)));

    document.title = "Controle de Uniformes PDF";
    document.body.innerHTML = `
        <style>
            body { font-family: "Segoe UI", Arial, sans-serif; margin: 32px; color: #102545; }
            h1 { margin: 0 0 6px; font-size: 28px; }
            p { margin: 0 0 20px; color: #526987; }
            .stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 24px; }
            .stat { padding: 12px; background: #f4f7fb; border-radius: 10px; }
            .stat span { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: #526987; margin-bottom: 6px; }
            .stat strong { font-size: 24px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { padding: 10px 8px; border-bottom: 1px solid #d7e1ef; text-align: left; font-size: 13px; }
            th { color: #35506f; font-size: 11px; text-transform: uppercase; letter-spacing: .08em; }
            @media print { body { margin: 16px; } }
        </style>
        <main>
            <h1>Controle de Uniformes</h1>
            <p>Documento pronto para imprimir ou salvar como PDF.</p>
            <section class="stats">
                <div class="stat"><span>Pecas em estoque</span><strong>${escapeHtml(stockTotal)}</strong></div>
                <div class="stat"><span>Funcionarios</span><strong>${escapeHtml(data.funcionarios.length)}</strong></div>
                <div class="stat"><span>Movimentacoes</span><strong>${escapeHtml(data.movimentacoes.length)}</strong></div>
                <div class="stat"><span>Descartes</span><strong>${escapeHtml(discardCount)}</strong></div>
            </section>
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
