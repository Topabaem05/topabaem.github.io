document.addEventListener("DOMContentLoaded", () => {
    const toggleButtons = document.querySelectorAll("[data-menu-toggle]");

    toggleButtons.forEach((button) => {
        const menuId = button.getAttribute("data-menu-toggle");
        const menu = menuId ? document.getElementById(menuId) : null;

        if (!menu) {
            return;
        }

        const closeMenu = () => {
            if (!menu.classList.contains("hidden")) {
                menu.classList.add("hidden");
                button.setAttribute("aria-expanded", "false");
            }
        };

        button.addEventListener("click", () => {
            const isHidden = menu.classList.toggle("hidden");
            button.setAttribute("aria-expanded", (!isHidden).toString());
        });

        menu.querySelectorAll("a").forEach((link) => {
            link.addEventListener("click", closeMenu);
        });

        window.addEventListener("resize", () => {
            if (window.innerWidth >= 768) {
                closeMenu();
            }
        });
    });
});
