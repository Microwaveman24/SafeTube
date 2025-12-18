async function loadDashboard() {
    const token = localStorage.getItem("access_token");

    if (!token) {
        alert("Not logged in");
        window.location.href = "/login";
        return;
    }

    const response = await fetch("/api/dash/main_data", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
        }
    });

    if (!response.ok) {
        alert("Session expired. Please log in again.");
        localStorage.removeItem("access_token");
        window.location.href = "/login";
        return;
    }

    const data = await response.json();

    document.getElementById("parentEmail").textContent = data.parent_email;

    const list = document.getElementById("childrenList");
    list.innerHTML = "";

    if (data.children.length === 0) {
        list.innerHTML = "<li>No children linked</li>";
        return;
    }

    data.children.forEach(name => {
        const li = document.createElement("li");
        li.textContent = name;
        list.appendChild(li);
    });
}

async function addChild() {
    const token = localStorage.getItem("access_token");
    const nameInput = document.getElementById("childNameInput");
    const status = document.getElementById("childStatus");

    const name = nameInput.value.trim();
    if (!name) {
        status.textContent = "Please enter a child name.";
        return;
    }

    status.textContent = "Creating child...";

    const response = await fetch("/api/auth/create_child", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ name })
    });

    if (!response.ok) {
        status.textContent = "Failed to create child.";
        return;
    }

    status.textContent = "Child created successfully!";
    nameInput.value = "";

    // Refresh child list
    loadDashboard();
}

document.addEventListener("DOMContentLoaded", () => {
    loadDashboard();
    document.getElementById("addChildBtn").addEventListener("click", addChild);
});
