const STORAGE_KEY = "uniformes-app-state-v3";

function normalizeText(value) {
    if (!value) {
        return "";
    }

    return String(value)
        .replaceAll("MANUTENÃ‡ÃƒO", "MANUTENCAO")
        .replaceAll("MANUTEN��O", "MANUTENCAO")
        .replaceAll("MANUTEN??O", "MANUTENCAO")
        .replaceAll("MANUTENÇÃO", "MANUTENCAO")
        .replaceAll("CalÃ§a", "Calca")
        .replaceAll("CalÃ§as", "Calcas")
        .replaceAll("Calça", "Calca")
        .replaceAll("Calças", "Calcas")
        .replace(/MANUTEN[^A-Z0-9 ]*O/gi, "MANUTENCAO")
        .trim();
}

function normalizeState(state) {
    state.movimentacoes = state.movimentacoes.map(item => ({
        ...item,
        tipo: normalizeText(item.tipo),
        tamanho: normalizeText(item.tamanho),
        funcionario: normalizeText(item.funcionario).toUpperCase(),
        movimento: normalizeText(item.movimento).toUpperCase()
    }));
    return state;
}

function loadHistoryData() {
    if (!window.UNIFORMES_DATA) {
        throw new Error("Nao foi possivel carregar os dados do historico.");
    }

    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
        return normalizeState(JSON.parse(stored));
    }

    return normalizeState(structuredClone(window.UNIFORMES_DATA));
}

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

function getSortedMovements(data) {
    return [...data.movimentacoes].sort((a, b) => String(b.data).localeCompare(String(a.data)));
}

function renderStats(data) {
    const movements = getSortedMovements(data);
    const entregas = movements.filter(item => item.movimento === "ENTREGA").length;
    const devolucoes = movements.filter(item => item.movimento === "DEVOLUCAO").length;
    const descartes = movements.filter(item => item.movimento === "DESCARTE").length;

    document.getElementById("history-stats").innerHTML = [
        { label: "Total", value: movements.length },
        { label: "Entregas", value: entregas },
        { label: "Devolucoes", value: devolucoes },
        { label: "Descartes", value: descartes }
    ].map(stat => `<article class="stat-card"><span>${stat.label}</span><strong>${stat.value}</strong></article>`).join("");
}

function renderResults(data) {
    const term = document.getElementById("history-search").value.trim().toLowerCase();
    const kind = document.getElementById("history-kind").value;

    const filtered = getSortedMovements(data).filter(item => {
        const matchesKind = !kind || item.movimento === kind;
        const matchesTerm = !term || `${item.funcionario} ${item.tipo} ${item.tamanho} ${item.movimento}`.toLowerCase().includes(term);
        return matchesKind && matchesTerm;
    });

    document.getElementById("history-results").innerHTML = filtered.length
        ? filtered.map(item => `
            <article class="history-item">
                <div class="history-item-top">
                    <div>
                        <h3>${item.tipo} ${item.tamanho}</h3>
                        <p class="meta-line">${item.funcionario}</p>
                    </div>
                    <span class="badge ${item.movimento === "DESCARTE" ? "status-critical" : item.movimento === "ENTRADA" ? "status-ok" : "status-warning"}">${item.movimento}</span>
                </div>
                <div class="history-item-meta">
                    <span>Quantidade: ${item.quantidade}</span>
                    <span>Data: ${formatDate(item.data)}</span>
                </div>
            </article>
        `).join("")
        : `<div class="empty-state">Nenhuma movimentacao encontrada para esse filtro.</div>`;
}

function exportHistory(data) {
    const exportWindow = window.open("./export-historico.html", "_blank");
    if (!exportWindow) {
        throw new Error("Nao foi possivel abrir a pagina de exportacao.");
    }
}

function init() {
    try {
        const data = loadHistoryData();
        renderStats(data);
        renderResults(data);

        document.getElementById("history-search").addEventListener("input", () => renderResults(data));
        document.getElementById("history-kind").addEventListener("change", () => renderResults(data));
        document.getElementById("history-export").addEventListener("click", () => exportHistory(data));
    } catch (error) {
        document.body.innerHTML = `<main class="app-shell"><div class="panel"><h1>Erro ao carregar historico</h1><p>${error.message}</p></div></main>`;
    }
}

init();
