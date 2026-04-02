function resolveBackAction() {
    const historyBackButton = document.querySelector("[data-history-back]");
    if (historyBackButton) {
        return () => {
            const fallbackHref = historyBackButton.getAttribute("data-fallback-href") || "./index.html";
            const referrer = document.referrer || "";
            const sameOriginReferrer = referrer.startsWith(window.location.origin);

            if (window.history.length > 1 && sameOriginReferrer) {
                window.history.back();
                return;
            }

            window.location.href = fallbackHref;
        };
    }

    const backLink = document.querySelector("[data-esc-back]");
    if (backLink) {
        return () => {
            window.location.href = backLink.getAttribute("href");
        };
    }

    return null;
}

function closeOpenMenus() {
    let closedAny = false;
    document.querySelectorAll("[data-page-menu].is-open").forEach(menu => {
        menu.classList.remove("is-open");
        const toggle = menu.querySelector(".page-menu-toggle");
        if (toggle) {
            toggle.setAttribute("aria-expanded", "false");
        }
        closedAny = true;
    });
    return closedAny;
}

document.addEventListener("DOMContentLoaded", () => {
    const pageId = document.body.getAttribute("data-page");
    const historyBackButton = document.querySelector("[data-history-back]");

    if (historyBackButton) {
        historyBackButton.addEventListener("click", () => {
            const action = resolveBackAction();
            if (action) {
                action();
            }
        });
    }

    document.querySelectorAll("[data-page-menu]").forEach(menu => {
        const toggle = menu.querySelector(".page-menu-toggle");
        const panel = menu.querySelector(".page-menu-panel");

        if (!toggle || !panel) {
            return;
        }

        const closeMenu = () => {
            menu.classList.remove("is-open");
            toggle.setAttribute("aria-expanded", "false");
        };

        toggle.addEventListener("click", event => {
            event.stopPropagation();
            const willOpen = !menu.classList.contains("is-open");
            document.querySelectorAll("[data-page-menu].is-open").forEach(otherMenu => {
                otherMenu.classList.remove("is-open");
                const otherToggle = otherMenu.querySelector(".page-menu-toggle");
                if (otherToggle) {
                    otherToggle.setAttribute("aria-expanded", "false");
                }
            });
            menu.classList.toggle("is-open", willOpen);
            toggle.setAttribute("aria-expanded", willOpen ? "true" : "false");
        });

        panel.querySelectorAll("[data-page-link]").forEach(link => {
            if (link.getAttribute("data-page-link") === pageId) {
                link.classList.add("is-current");
            }
        });

        document.addEventListener("click", event => {
            if (!menu.contains(event.target)) {
                closeMenu();
            }
        });
    });
});

window.addEventListener("keydown", event => {
    if (event.key !== "Escape") {
        return;
    }

    if (closeOpenMenus()) {
        event.preventDefault();
        return;
    }

    const action = resolveBackAction();
    if (action) {
        event.preventDefault();
        action();
    }
}, true);
