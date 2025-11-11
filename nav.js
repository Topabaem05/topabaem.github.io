document.addEventListener("DOMContentLoaded", () => {
    const menuControllers = [];

    document.querySelectorAll("[data-menu-button]").forEach((button) => {
        const targetId = button.getAttribute("data-menu-target");
        if (!targetId) return;

        const menu = document.getElementById(targetId);
        if (!menu) return;

        const openMenu = () => {
            menu.classList.remove("hidden");
            button.setAttribute("aria-expanded", "true");
        };

        const closeMenu = () => {
            menu.classList.add("hidden");
            button.setAttribute("aria-expanded", "false");
        };

        const toggleMenu = () => {
            const isHidden = menu.classList.contains("hidden");
            menuControllers.forEach(({ close }) => close());
            if (isHidden) {
                openMenu();
            } else {
                closeMenu();
            }
        };

        button.addEventListener("click", (event) => {
            event.stopPropagation();
            toggleMenu();
        });

        menu.querySelectorAll("a").forEach((link) => {
            link.addEventListener("click", () => {
                closeMenu();
            });
        });

        menuControllers.push({ menu, button, close: closeMenu });
    });

    if (menuControllers.length === 0) {
        return;
    }

    document.addEventListener("click", (event) => {
        menuControllers.forEach(({ menu, button, close }) => {
            const isOpen = !menu.classList.contains("hidden");
            if (!isOpen) return;

            const clickedInsideMenu = menu.contains(event.target);
            const clickedButton = button.contains(event.target);

            if (!clickedInsideMenu && !clickedButton) {
                close();
            }
        });
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            menuControllers.forEach(({ close }) => close());
        }
    });
});
