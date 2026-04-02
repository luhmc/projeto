const STORAGE_KEY = "uniformes-app-state-v3";
const UNIFORM_LABELS = {
    "Camiseta Manga Curta": "Manga Curta",
    "Camiseta Manga Longa": "Manga Longa",
    "Calca": "Calcas"
};

let appState;
let inventoryExpanded = {};
let employeeExpanded = {};
let employeesExpanded = false;

function loadData() {
    if (!window.UNIFORMES_DATA) {
        throw new Error("Nao foi possivel carregar os dados gerados pela planilha.");
    }

    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
        return JSON.parse(stored);
    }

    const seed = structuredClone(window.UNIFORMES_DATA);
    seed.meta = {
        source: seed.origem,
        baseUpdatedAt: seed.atualizadoEm,
        localUpdatedAt: seed.atualizadoEm,
        hasLocalChanges: false
    };
    return normalizeState(seed);
}

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

function normalizeCompareKey(value) {
    return normalizeText(value)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toUpperCase();
}

function normalizePossessionText(value) {
    return normalizeText(value)
        .replaceAll("Calca:", "Calcas:")
        .replaceAll("Calcas:", "Calcas:");
}

function normalizeState(state) {
    state.estoque = state.estoque.map(item => ({ ...item, tipo: normalizeText(item.tipo), tamanho: normalizeText(item.tamanho) }));
    state.funcionarios = state.funcionarios.map(employee => ({ ...employee, nome: normalizeText(employee.nome).toUpperCase(), setor: normalizeText(employee.setor).toUpperCase(), uniformesEmPosse: normalizePossessionText(employee.uniformesEmPosse) }));
    state.movimentacoes = state.movimentacoes.map(item => ({ ...item, tipo: normalizeText(item.tipo), tamanho: normalizeText(item.tamanho), funcionario: normalizeText(item.funcionario).toUpperCase(), movimento: normalizeText(item.movimento).toUpperCase() }));
    return state;
}

function saveState() {
    appState.meta.localUpdatedAt = new Date().toISOString();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
}

function resetState() {
    window.localStorage.removeItem(STORAGE_KEY);
    appState = loadData();
}

function getTodayIso() {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - offset).toISOString().slice(0, 10);
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

function getEmployeePossessionMap(employee) {
    const possession = { "Manga Curta": 0, "Manga Longa": 0, "Calcas": 0 };
    const raw = normalizePossessionText(employee.uniformesEmPosse || "");
    raw.split("|").forEach(part => {
        const [label, amount] = part.split(":").map(item => item && item.trim());
        const parsed = Number.parseInt(amount, 10);
        if (label && Number.isFinite(parsed)) {
            possession[label] = parsed;
        }
    });
    return possession;
}

function formatEmployeePossession(possession) {
    return `Manga Curta: ${possession["Manga Curta"] || 0} | Manga Longa: ${possession["Manga Longa"] || 0} | Calcas: ${possession["Calcas"] || 0}`;
}

function renderEmployeePossessionBlocks(employee) {
    const possession = getEmployeePossessionMap(employee);
    const items = [
        { label: "Manga Curta", value: possession["Manga Curta"] || 0 },
        { label: "Manga Longa", value: possession["Manga Longa"] || 0 },
        { label: "Calcas", value: possession["Calcas"] || 0 }
    ];

    return `
        <div class="employee-possession-grid">
            ${items.map(item => `
                <div class="employee-possession-card">
                    <span class="employee-possession-label">${item.label}</span>
                    <strong class="employee-possession-value">${item.value}</strong>
                </div>
            `).join("")}
        </div>
    `;
}

function getEmployeeByName(name) {
    const cleanName = normalizeText(name).toUpperCase();
    return appState.funcionarios.find(employee => employee.nome === cleanName);
}

function updateEmployeePossession(employeeName, uniformType, delta) {
    const employee = getEmployeeByName(employeeName);
    if (!employee) {
        return;
    }

    const label = UNIFORM_LABELS[normalizeText(uniformType)];
    if (!label) {
        return;
    }

    const possession = getEmployeePossessionMap(employee);
    possession[label] = Math.max(0, (possession[label] || 0) + delta);
    employee.uniformesEmPosse = formatEmployeePossession(possession);
}

function getInventoryItem(type, size) {
    const cleanType = normalizeText(type);
    const cleanSize = normalizeText(size);
    return appState.estoque.find(item => item.tipo === cleanType && item.tamanho === cleanSize);
}

function findExistingTypeName(type) {
    const targetKey = normalizeCompareKey(type);
    return appState.estoque.find(item => normalizeCompareKey(item.tipo) === targetKey)?.tipo || null;
}

function tokenizeCompareKey(value) {
    return normalizeCompareKey(value).split(" ").filter(Boolean);
}

function findBestTypeMatch(type) {
    const rawKey = normalizeCompareKey(type);
    if (!rawKey) {
        return null;
    }

    const exact = findExistingTypeName(type);
    if (exact) {
        return exact;
    }

    const targetTokens = tokenizeCompareKey(type);
    const uniqueTypes = getOrderedTypes();
    let bestMatch = null;
    let bestScore = 0;

    uniqueTypes.forEach(existingType => {
        const existingKey = normalizeCompareKey(existingType);
        const existingTokens = tokenizeCompareKey(existingType);
        let score = 0;

        if (existingKey.includes(rawKey) || rawKey.includes(existingKey)) {
            score += 4;
        }

        targetTokens.forEach(token => {
            if (existingTokens.includes(token)) {
                score += 3;
            } else if (existingTokens.some(existingToken => existingToken.includes(token) || token.includes(existingToken))) {
                score += 1;
            }
        });

        if (score > bestScore) {
            bestScore = score;
            bestMatch = existingType;
        }
    });

    return bestScore >= 3 ? bestMatch : null;
}

function canDeleteInventoryItem(type, size) {
    const cleanType = normalizeText(type);
    const cleanSize = normalizeText(size);

    const hasMovements = appState.movimentacoes.some(item => item.tipo === cleanType && item.tamanho === cleanSize);
    if (hasMovements) {
        return { allowed: false, reason: "Nao e possivel excluir item que ja possui lancamentos." };
    }

    return { allowed: true };
}

function deleteInventoryItem(type, size) {
    const check = canDeleteInventoryItem(type, size);
    if (!check.allowed) {
        throw new Error(check.reason);
    }

    const cleanType = normalizeText(type);
    const cleanSize = normalizeText(size);
    appState.estoque = appState.estoque.filter(item => !(item.tipo === cleanType && item.tamanho === cleanSize));
    appState.meta.hasLocalChanges = true;
}

function createUniform(type, size) {
    const existingTypeName = findBestTypeMatch(type);
    const cleanType = existingTypeName || normalizeText(type);
    const cleanSize = normalizeText(size).toUpperCase();

    if (!cleanType || !cleanSize) {
        throw new Error("Informe o tipo do uniforme e o tamanho.");
    }

    if (getInventoryItem(cleanType, cleanSize)) {
        throw new Error("Esse uniforme com esse tamanho ja existe.");
    }

    appState.estoque.push({
        tipo: cleanType,
        tamanho: cleanSize,
        quantidadeInicial: 0,
        quantidadeAtual: 0
    });
    appState.meta.hasLocalChanges = true;
}

function getStockStatus(item) {
    if (item.quantidadeAtual <= 1) {
        return { label: "Critico", className: "status-critical" };
    }
    if (item.quantidadeAtual <= 4) {
        return { label: "Baixo", className: "status-warning" };
    }
    return { label: "Saudavel", className: "status-ok" };
}

function getDiscardSummary() {
    const discarded = appState.movimentacoes.filter(item => item.movimento === "DESCARTE");
    const total = discarded.reduce((sum, item) => sum + item.quantidade, 0);
    return { total, records: discarded.slice(0, 8) };
}

function ensureCompraOption(select) {
    if (!select.querySelector('option[value="COMPRA"]')) {
        const option = document.createElement("option");
        option.value = "COMPRA";
        option.textContent = "COMPRA";
        select.prepend(option);
    }
}

function sortAlphabetically(values) {
    return [...values].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function getOrderedTypes() {
    return sortAlphabetically([...new Set(appState.estoque.map(item => item.tipo))]);
}

function getOrderedSizesByType(type) {
    const cleanType = normalizeText(type);
    const sizes = [...new Set(appState.estoque.filter(item => item.tipo === cleanType).map(item => item.tamanho))];

    if (cleanType.includes("Camiseta")) {
        const preferredOrder = ["P", "M", "G", "GG", "EG"];
        const knownSizes = preferredOrder.filter(size => sizes.includes(size));
        const customSizes = sortAlphabetically(sizes.filter(size => !preferredOrder.includes(size)));
        return knownSizes.concat(customSizes);
    }

    return sortAlphabetically(sizes);
}

function getOrderedInventoryItems(items) {
    const typeOrder = getOrderedTypes();

    return [...items].sort((a, b) => {
        const typeCompare = typeOrder.indexOf(a.tipo) - typeOrder.indexOf(b.tipo);
        if (typeCompare !== 0) {
            return typeCompare;
        }

        const sizeOrder = getOrderedSizesByType(a.tipo);
        return sizeOrder.indexOf(a.tamanho) - sizeOrder.indexOf(b.tamanho);
    });
}

function getGroupedInventoryItems(items) {
    const groups = new Map();
    getOrderedInventoryItems(items).forEach(item => {
        if (!groups.has(item.tipo)) {
            groups.set(item.tipo, []);
        }
        groups.get(item.tipo).push(item);
    });
    return groups;
}

function resetMovementForm() {
    const movementDate = document.getElementById("movement-date");
    const movementEmployee = document.getElementById("movement-employee");
    const movementType = document.getElementById("movement-type");
    const movementSize = document.getElementById("movement-size");
    const movementKind = document.getElementById("movement-kind");
    const movementQuantity = document.getElementById("movement-quantity");

    movementDate.value = getTodayIso();
    movementEmployee.value = "";
    movementEmployee.disabled = false;
    movementType.value = "";
    movementSize.innerHTML = `<option value="">Selecionar</option>`;
    movementKind.value = "";
    movementQuantity.value = "";
}

function applyMovement({ date, employeeName, type, size, quantity, movement }) {
    const inventoryItem = getInventoryItem(type, size);
    if (!inventoryItem) {
        throw new Error("Nao encontrei esse item no estoque para o uniforme e tamanho selecionados.");
    }

    const normalizedMovement = normalizeText(movement).toUpperCase();
    let normalizedEmployee = normalizeText(employeeName).toUpperCase();

    if (normalizedMovement === "ENTREGA") {
        if (inventoryItem.quantidadeAtual < quantity) {
            throw new Error("Estoque insuficiente para essa entrega.");
        }
        inventoryItem.quantidadeAtual -= quantity;
        updateEmployeePossession(normalizedEmployee, type, quantity);
    }

    if (normalizedMovement === "DEVOLUCAO") {
        const employee = getEmployeeByName(normalizedEmployee);
        if (!employee) {
            throw new Error("Funcionario nao encontrado.");
        }
        const label = UNIFORM_LABELS[normalizeText(type)];
        const possession = getEmployeePossessionMap(employee);
        if ((possession[label] || 0) < quantity) {
            throw new Error("O funcionario nao possui essa quantidade para devolver.");
        }
        inventoryItem.quantidadeAtual += quantity;
        updateEmployeePossession(normalizedEmployee, type, -quantity);
    }

    if (normalizedMovement === "DESCARTE") {
        const employee = getEmployeeByName(normalizedEmployee);
        if (employee) {
            const label = UNIFORM_LABELS[normalizeText(type)];
            const possession = getEmployeePossessionMap(employee);
            if ((possession[label] || 0) < quantity) {
                throw new Error("O funcionario nao possui essa quantidade para descarte.");
            }
            updateEmployeePossession(normalizedEmployee, type, -quantity);
        } else {
            if (inventoryItem.quantidadeAtual < quantity) {
                throw new Error("Estoque insuficiente para descarte.");
            }
            inventoryItem.quantidadeAtual -= quantity;
        }
    }

    if (normalizedMovement === "ENTRADA") {
        inventoryItem.quantidadeAtual += quantity;
        inventoryItem.quantidadeInicial += quantity;
        normalizedEmployee = "COMPRA";
    }

    appState.movimentacoes.unshift({ data: date, tipo: normalizeText(type), tamanho: normalizeText(size), funcionario: normalizedEmployee, quantidade: quantity, movimento: normalizedMovement });
    appState.meta.hasLocalChanges = true;
}

function undoLastMovement() {
    const lastMovement = appState.movimentacoes[0];
    if (!lastMovement) {
        throw new Error("Nao ha lancamentos para desfazer.");
    }

    const inventoryItem = getInventoryItem(lastMovement.tipo, lastMovement.tamanho);
    if (!inventoryItem) {
        throw new Error("Nao encontrei o item de estoque do ultimo lancamento.");
    }

    if (lastMovement.movimento === "ENTREGA") {
        inventoryItem.quantidadeAtual += lastMovement.quantidade;
        updateEmployeePossession(lastMovement.funcionario, lastMovement.tipo, -lastMovement.quantidade);
    }

    if (lastMovement.movimento === "DEVOLUCAO") {
        const employee = getEmployeeByName(lastMovement.funcionario);
        if (!employee) {
            throw new Error("Funcionario nao encontrado para desfazer devolucao.");
        }
        const label = UNIFORM_LABELS[normalizeText(lastMovement.tipo)];
        const possession = getEmployeePossessionMap(employee);
        if (inventoryItem.quantidadeAtual < lastMovement.quantidade) {
            throw new Error("Estoque insuficiente para desfazer a devolucao.");
        }
        if ((possession[label] || 0) + lastMovement.quantidade < 0) {
            throw new Error("Nao foi possivel recalcular a posse do funcionario.");
        }
        inventoryItem.quantidadeAtual -= lastMovement.quantidade;
        updateEmployeePossession(lastMovement.funcionario, lastMovement.tipo, lastMovement.quantidade);
    }

    if (lastMovement.movimento === "DESCARTE") {
        const employee = getEmployeeByName(lastMovement.funcionario);
        if (employee) {
            updateEmployeePossession(lastMovement.funcionario, lastMovement.tipo, lastMovement.quantidade);
        } else {
            inventoryItem.quantidadeAtual += lastMovement.quantidade;
        }
    }

    if (lastMovement.movimento === "ENTRADA") {
        if (inventoryItem.quantidadeAtual < lastMovement.quantidade || inventoryItem.quantidadeInicial < lastMovement.quantidade) {
            throw new Error("Nao foi possivel desfazer essa entrada de estoque.");
        }
        inventoryItem.quantidadeAtual -= lastMovement.quantidade;
        inventoryItem.quantidadeInicial -= lastMovement.quantidade;
    }

    appState.movimentacoes.shift();
    appState.meta.hasLocalChanges = true;
}

function renderHeaderMeta(data) {
    const sourceFile = document.getElementById("source-file");
    const updatedAt = document.getElementById("updated-at");
    if (sourceFile) {
        sourceFile.textContent = data.meta.hasLocalChanges ? `${normalizeText(data.meta.source)} + alteracoes locais` : normalizeText(data.meta.source);
    }
    if (updatedAt) {
        updatedAt.textContent = `Base ${data.meta.baseUpdatedAt} | Ultima alteracao local ${formatDate(String(data.meta.localUpdatedAt).slice(0, 10))}`;
    }
}

function renderStats(data) {
    const stockTotal = data.estoque.reduce((sum, item) => sum + item.quantidadeAtual, 0);
    const employeeCount = data.funcionarios.length;
    const movementCount = data.movimentacoes.length;
    const discardCount = data.movimentacoes.filter(item => item.movimento === "DESCARTE").length;
    const stats = [
        { label: "Pecas em estoque", value: stockTotal },
        { label: "Funcionarios", value: employeeCount },
        { label: "Movimentacoes", value: movementCount },
        { label: "Descartes", value: discardCount }
    ];
    document.getElementById("stats-grid").innerHTML = stats.map(stat => `<article class="stat-card"><span>${stat.label}</span><strong>${stat.value}</strong></article>`).join("");
}

function renderInventory(data, filterText = "") {
    const term = filterText.trim().toLowerCase();
    const items = data.estoque.filter(item => !term || `${item.tipo} ${item.tamanho}`.toLowerCase().includes(term));
    const groups = getGroupedInventoryItems(items);

    document.getElementById("inventory-groups").innerHTML = groups.size
        ? [...groups.entries()].map(([type, groupItems]) => {
            const total = groupItems.reduce((sum, item) => sum + item.quantidadeAtual, 0);
            const expanded = Boolean(inventoryExpanded[type]);
            return `
                <section class="inventory-group">
                    <button class="inventory-toggle" type="button" data-inventory-toggle="${type}">
                        <span class="inventory-type">${type}</span>
                        <span class="inventory-total">Total: ${total}</span>
                        <span class="inventory-chevron">${expanded ? "Ocultar" : "Ver tamanhos"}</span>
                    </button>
                    ${expanded ? `
                        <div class="inventory-details">
                            ${groupItems.map(item => {
                                const status = getStockStatus(item);
                                return `
                                    <div class="inventory-row">
                                        <span class="inventory-size">${item.tamanho}</span>
                                        <span class="inventory-stock">Estoque: ${item.quantidadeAtual}</span>
                                        <span class="badge ${status.className}">${status.label}</span>
                                        <button class="danger-button" type="button" data-delete-stock="${item.tipo}||${item.tamanho}">Excluir</button>
                                    </div>
                                `;
                            }).join("")}
                        </div>
                    ` : ""}
                </section>
            `;
        }).join("")
        : `<div class="empty-state">Nenhum item encontrado para esse filtro.</div>`;
}

function renderDiscardMonitor() {
    const discard = getDiscardSummary();
    document.getElementById("discard-total").textContent = `${discard.total} item(ns) descartado(s)`;
    const discardList = document.getElementById("discard-list");
    discardList.className = "stack-list compact";
    discardList.innerHTML = discard.records.map(item => `
        <article class="low-stock-item">
            <h3>${item.tipo} ${item.tamanho}</h3>
            <div class="meta-line">${item.quantidade} un. | ${item.funcionario}</div>
            <div class="meta-line">${formatDate(item.data)}</div>
        </article>
    `).join("") || `<div class="empty-state">Nenhum descarte registrado ainda.</div>`;
}

function renderEmployees(data, filterText = "") {
    const term = filterText.trim().toLowerCase();
    const employees = [...data.funcionarios]
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
        .filter(employee => !term || `${employee.nome} ${employee.setor}`.toLowerCase().includes(term));
    const visibleEmployees = term || employeesExpanded ? employees : employees.slice(0, 5);
    document.getElementById("employees-summary").textContent = `${visibleEmployees.length} funcionario(s) exibidos de ${employees.length}.`;
    document.getElementById("employees-list").innerHTML = visibleEmployees.map(employee => {
        const expanded = Boolean(employeeExpanded[employee.nome]);
        return `
            <article class="employee-card employee-group">
                <button class="employee-toggle" type="button" data-employee-toggle="${employee.nome}">
                    <span class="employee-toggle-name">${employee.nome}</span>
                    <span class="employee-toggle-sector">${employee.setor}</span>
                    <span class="employee-toggle-chevron">${expanded ? "Ocultar" : "Ver detalhes"}</span>
                </button>
                ${expanded ? `
                    <div class="employee-details">
                        ${renderEmployeePossessionBlocks(employee)}
                        <div class="employee-actions">
                            <button class="mini-button" type="button" data-delete-employee="${employee.nome}">Excluir funcionario</button>
                        </div>
                    </div>
                ` : ""}
            </article>
        `;
    }).join("") || `<div class="empty-state">Nenhum funcionario encontrado.</div>`;

    const toggle = document.getElementById("employees-toggle");
    if (toggle) {
        toggle.textContent = employeesExpanded || term ? "Mostrar apenas os 5 primeiros" : "Ver lista completa";
        toggle.style.display = employees.length > 5 ? "inline-flex" : "none";
    }
}

function renderMovements(data) {
    const sortedMovements = [...data.movimentacoes].sort((a, b) => String(b.data).localeCompare(String(a.data)));
    const movements = sortedMovements.slice(0, 3);
    document.getElementById("movements-list").innerHTML = movements.map(item => `<article class="timeline-item"><h3>${item.tipo} ${item.tamanho}</h3><div class="meta-line">${item.funcionario}</div><div class="meta-line">${item.movimento} de ${item.quantidade} unidade(s)</div><div class="meta-line">${formatDate(item.data)}</div></article>`).join("");
    const toggle = document.getElementById("movements-toggle");
    if (toggle) {
        toggle.style.display = sortedMovements.length > 3 ? "inline-flex" : "none";
    }
}

function fillMovementOptions() {
    const employeeSelect = document.getElementById("movement-employee");
    const typeSelect = document.getElementById("movement-type");
    const sizeSelect = document.getElementById("movement-size");
    const employeeOptions = sortAlphabetically(appState.funcionarios.map(employee => employee.nome));
    employeeSelect.innerHTML = [`<option value="">Selecionar</option>`]
        .concat(employeeOptions.map(name => `<option value="${name}">${name}</option>`))
        .join("");
    ensureCompraOption(employeeSelect);
    const uniqueTypes = getOrderedTypes();
    typeSelect.innerHTML = [`<option value="">Selecionar</option>`]
        .concat(uniqueTypes.map(type => `<option value="${type}">${type}</option>`))
        .join("");
    const syncSizes = () => {
        const selectedType = typeSelect.value;
        if (!selectedType) {
            sizeSelect.innerHTML = `<option value="">Selecionar</option>`;
            return;
        }
        const matchingSizes = getOrderedSizesByType(selectedType);
        sizeSelect.innerHTML = [`<option value="">Selecionar</option>`]
            .concat(matchingSizes.map(size => `<option value="${size}">${size}</option>`))
            .join("");
    };
    typeSelect.onchange = syncSizes;
    syncSizes();
}

function renderAll() {
    renderHeaderMeta(appState);
    renderStats(appState);
    renderInventory(appState, document.getElementById("inventory-filter")?.value || "");
    renderDiscardMonitor();
    renderEmployees(appState, document.getElementById("employee-filter")?.value || "");
    renderMovements(appState);
    wireEmployeeDeleteButtons();
    wireEmployeeToggleButtons();
    wireInventoryDeleteButtons();
    wireInventoryToggleButtons();
}

function setFeedback(message, tone = "") {
    const feedback = document.getElementById("form-feedback");
    feedback.textContent = message;
    feedback.className = `form-feedback${tone ? ` is-${tone}` : ""}`;
}

function downloadState() {
    const exportWindow = window.open("./export-uniformes.html", "_blank");
    if (!exportWindow) {
        throw new Error("Nao foi possivel abrir a pagina de exportacao.");
    }
}

function wireFilters() {
    document.getElementById("inventory-filter").addEventListener("input", event => {
        renderInventory(appState, event.target.value);
        wireInventoryDeleteButtons();
        wireInventoryToggleButtons();
    });
    document.getElementById("employee-filter").addEventListener("input", event => {
        renderEmployees(appState, event.target.value);
        wireEmployeeDeleteButtons();
        wireEmployeeToggleButtons();
    });
}

function wireEmployeeDeleteButtons() {
    document.querySelectorAll("[data-delete-employee]").forEach(button => {
        button.onclick = () => {
            const employeeName = button.getAttribute("data-delete-employee");
            const employee = getEmployeeByName(employeeName);
            if (!employee) {
                return;
            }
            const possession = getEmployeePossessionMap(employee);
            const totalPossession = Object.values(possession).reduce((sum, value) => sum + value, 0);
            if (totalPossession > 0) {
                setFeedback("Nao e possivel excluir funcionario com uniforme em posse.", "error");
                return;
            }
            appState.funcionarios = appState.funcionarios.filter(item => item.nome !== employeeName);
            appState.meta.hasLocalChanges = true;
            saveState();
            fillMovementOptions();
            renderAll();
            setFeedback("Funcionario excluido com sucesso.", "success");
        };
    });
}

function wireInventoryDeleteButtons() {
    document.querySelectorAll("[data-delete-stock]").forEach(button => {
        button.onclick = () => {
            const value = button.getAttribute("data-delete-stock") || "";
            const [type, size] = value.split("||");
            try {
                deleteInventoryItem(type, size);
                saveState();
                fillMovementOptions();
                renderAll();
                resetMovementForm();
                setFeedback("Item de estoque excluido com sucesso.", "success");
            } catch (error) {
                setFeedback(error.message, "error");
            }
        };
    });
}

function wireInventoryToggleButtons() {
    document.querySelectorAll("[data-inventory-toggle]").forEach(button => {
        button.onclick = () => {
            const type = button.getAttribute("data-inventory-toggle");
            inventoryExpanded[type] = !inventoryExpanded[type];
            renderInventory(appState, document.getElementById("inventory-filter")?.value || "");
            wireInventoryDeleteButtons();
            wireInventoryToggleButtons();
        };
    });
}

function wireEmployeeToggleButtons() {
    document.querySelectorAll("[data-employee-toggle]").forEach(button => {
        button.onclick = () => {
            const name = button.getAttribute("data-employee-toggle");
            employeeExpanded[name] = !employeeExpanded[name];
            renderEmployees(appState, document.getElementById("employee-filter")?.value || "");
            wireEmployeeDeleteButtons();
            wireEmployeeToggleButtons();
        };
    });
}

function wireActions() {
    const movementDate = document.getElementById("movement-date");
    const movementForm = document.getElementById("movement-form");
    const movementKind = document.getElementById("movement-kind");
    const movementEmployee = document.getElementById("movement-employee");
    const employeeForm = document.getElementById("employee-form");
    const employeeName = document.getElementById("employee-name");
    const employeeSector = document.getElementById("employee-sector");
    const uniformForm = document.getElementById("uniform-form");
    const uniformType = document.getElementById("uniform-type");
    const uniformSize = document.getElementById("uniform-size");
    const movementsToggle = document.getElementById("movements-toggle");
    const employeesToggle = document.getElementById("employees-toggle");
    resetMovementForm();

    const syncEmployeeForMovement = () => {
        if (movementKind.value === "ENTRADA") {
            movementEmployee.value = "COMPRA";
            movementEmployee.disabled = true;
        } else {
            if (movementEmployee.value === "COMPRA") {
                movementEmployee.selectedIndex = movementEmployee.options.length > 1 ? 1 : 0;
            }
            movementEmployee.disabled = false;
        }
    };

    movementKind.addEventListener("change", syncEmployeeForMovement);
    syncEmployeeForMovement();

    movementForm.addEventListener("submit", event => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        try {
            applyMovement({ date: form.get("date"), employeeName: form.get("employee"), type: form.get("type"), size: form.get("size"), quantity: Number.parseInt(form.get("quantity"), 10), movement: form.get("kind") });
            saveState();
            fillMovementOptions();
            renderAll();
            setFeedback("Movimentacao registrada com sucesso.", "success");
            fillMovementOptions();
            resetMovementForm();
            syncEmployeeForMovement();
        } catch (error) {
            setFeedback(error.message, "error");
        }
    });

    employeeForm.addEventListener("submit", event => {
        event.preventDefault();
        const name = normalizeText(employeeName.value).toUpperCase();
        const sector = normalizeText(employeeSector.value).toUpperCase();
        if (!name || !sector) {
            setFeedback("Informe nome e setor para cadastrar funcionario.", "error");
            return;
        }
        if (getEmployeeByName(name)) {
            setFeedback("Ja existe um funcionario com esse nome.", "error");
            return;
        }
        appState.funcionarios.unshift({ nome: name, setor: sector, uniformesEmPosse: "Manga Curta: 0 | Manga Longa: 0 | Calcas: 0" });
        appState.meta.hasLocalChanges = true;
        saveState();
        fillMovementOptions();
        renderAll();
        event.currentTarget.reset();
        setFeedback("Funcionario cadastrado com sucesso.", "success");
    });

    uniformForm.addEventListener("submit", event => {
        event.preventDefault();
        try {
            createUniform(uniformType.value, uniformSize.value);
            saveState();
            fillMovementOptions();
            renderAll();
            event.currentTarget.reset();
            setFeedback("Uniforme cadastrado com sucesso.", "success");
        } catch (error) {
            setFeedback(error.message, "error");
        }
    });

    document.getElementById("undo-button").addEventListener("click", () => {
        try {
            undoLastMovement();
            saveState();
            fillMovementOptions();
            renderAll();
            resetMovementForm();
            syncEmployeeForMovement();
            setFeedback("Ultimo lancamento desfeito com sucesso.", "success");
        } catch (error) {
            setFeedback(error.message, "error");
        }
    });

    document.getElementById("export-button").addEventListener("click", () => {
        downloadState();
        setFeedback("Abri o documento pronto para imprimir ou salvar em PDF.", "success");
    });

    movementsToggle.addEventListener("click", () => {
        window.location.href = "./historico.html";
    });

    employeesToggle.addEventListener("click", () => {
        employeesExpanded = !employeesExpanded;
        renderEmployees(appState, document.getElementById("employee-filter")?.value || "");
        wireEmployeeDeleteButtons();
        wireEmployeeToggleButtons();
    });

}

function init() {
    try {
        appState = loadData();
        fillMovementOptions();
        renderAll();
        wireFilters();
        wireActions();
    } catch (error) {
        document.body.innerHTML = `<main class="app-shell"><div class="panel"><h1>Erro ao carregar dados</h1><p>${error.message}</p></div></main>`;
    }
}

init();



