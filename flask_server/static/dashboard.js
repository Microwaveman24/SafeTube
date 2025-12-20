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

    // Parent email
    document.getElementById("parentEmail").textContent = data.parent_email;

    // Children list
    const list = document.getElementById("childrenList");
    list.innerHTML = "";

    if (!data.children || data.children.length === 0) {
        list.innerHTML = "<li>No children linked</li>";
        return;
    }

    data.children.forEach(child => {
        const li = document.createElement("li");
        li.className = "child-row";

        li.innerHTML = `
            <span class="child-name">${child.name}</span>
            <div class="child-actions">
                <button onclick="connectDevice(${child.id})">
                    Connect Device
                </button>
                <button onclick="viewProfile(${child.id})">
                    View Profile
                </button>
            </div>
        `;

        list.appendChild(li);
    });
}

// --------------------
// Add Child
// --------------------
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

    loadDashboard();
}

// --------------------
// Connect Device
// --------------------
async function connectDevice(childId) {
    const res = await fetch("/api/dash/generate_pair_code", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${localStorage.getItem("access_token")}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ child_id: childId })
    });

    if (!res.ok) {
        alert("Failed to generate pairing code");
        return;
    }

    const data = await res.json();
    alert(`Enter this code in the child's device:\n\n${data.code}`);
}

// --------------------
// Placeholder for later
// --------------------
function viewProfile(childId) {
    alert(`Child profile page coming soon (ID: ${childId})`);
}

// --------------------
document.addEventListener("DOMContentLoaded", () => {
    loadDashboard();
    document
        .getElementById("addChildBtn")
        .addEventListener("click", addChild);
});
