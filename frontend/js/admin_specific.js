// Global variables for admin page
let adminStatsInterval;
let allProjects = [];
let allStudents = [];
let allTeachers = [];
let originalAllProjects = [];
let originalAllStudents = [];
let originalAllTeachers = [];
let currentSort = {
    projects: { key: 'name', order: 'asc' },
    students: { key: 'fullName', order: 'asc' },
    teachers: { key: 'fullName', order: 'asc' }
};

// --- Helper Functions (from dashboard_common.js, duplicated for safety) ---
const API_BASE_URL = "http://127.0.0.1:8001";

function getAuthToken() {
    return localStorage.getItem('accessToken');
}

function getAuthHeaders() {
  const token = getAuthToken();
  if (!token) {
      console.error("No auth token found, redirecting to login.");
      window.location.href = 'home.html';
  }
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
  };
}

function formatDate(dateString) {
    if (!dateString) return "N/A";
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return "Invalid Date";
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    } catch (e) {
        console.error("Error formatting date:", dateString, e);
        return "Invalid Date";
    }
}

function showAdminMessage(message, isError = false, page = 'dashboard') {
    let elementId;
    switch (page) {
        case 'projects':
            elementId = 'admin-projects-message';
            break;
        case 'students':
            elementId = 'admin-students-message';
            break;
        case 'teachers':
            elementId = 'admin-teachers-message';
            break;
        case 'add-student':
            elementId = 'add-student-message';
            break;
        case 'add-teacher':
            elementId = 'add-teacher-message';
            break;
        default:
            elementId = 'admin-dashboard-message';
    }
    
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = message;
        element.className = `text-sm font-medium p-3 rounded-lg ${
            isError 
                ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
        }`;
        
        // Auto-clear success messages
        if (!isError) {
            setTimeout(() => {
                if (element.textContent === message) {
                    element.textContent = '';
                    element.className = 'text-sm';
                }
            }, 3000);
        }
    }
}


// --- API Fetching Functions ---

async function loadAdminStats() {
    console.log("Fetching admin stats...");
    try {
        const response = await fetch(`${API_BASE_URL}/api/admin/stats`, {
            method: 'GET',
            headers: getAuthHeaders()
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || "Failed to fetch stats");
        }
        const stats = await response.json();

        // --- Main Stat Cards ---
        document.getElementById('stats-total-projects').textContent = stats.total_projects;
        document.getElementById('stats-total-students').textContent = stats.total_students;
        document.getElementById('stats-total-teachers').textContent = stats.total_teachers;

        // --- Project Oversight ---
        document.getElementById('stats-proj-total-2').textContent = stats.total_projects;
        document.getElementById('stats-proj-completed').textContent = stats.projects_completed;
        document.getElementById('stats-proj-inprogress').textContent = stats.projects_in_progress;
        document.getElementById('stats-proj-planning').textContent = stats.projects_planning;

        // --- Teachers Oversight ---
        document.getElementById('stats-teach-total').textContent = stats.total_teachers;
        document.getElementById('stats-teach-active').textContent = stats.active_teachers; // Using placeholder
        document.getElementById('stats-teach-guides').textContent = stats.guides_count;
        document.getElementById('stats-teach-inactive').textContent = stats.total_teachers - stats.active_teachers; // Using placeholder

        // --- Students Oversight ---
        document.getElementById('stats-stud-total').textContent = stats.total_students;
        document.getElementById('stats-stud-active').textContent = stats.active_students; // Using placeholder
        // Note: Solo/Team project stats were not in the model, keeping at 0
        document.getElementById('stats-stud-solo').textContent = '0'; // Placeholder
        document.getElementById('stats-stud-team').textContent = '0'; // Placeholder
        
    } catch (error) {
        console.error("Error loading admin stats:", error.message);
        showAdminMessage(error.message, true, 'dashboard');
        if (adminStatsInterval) clearInterval(adminStatsInterval); // Stop polling on error
    }
}

async function loadAdminProjects() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/admin/projects`, {
            method: 'GET',
            headers: getAuthHeaders()
        });
        if (!response.ok) throw new Error("Failed to fetch projects");
        
        allProjects = await response.json();
        originalAllProjects = [...allProjects]; // Save a copy of the original order
        renderProjectTable(allProjects);
        updateSortIcons('projects'); // Set default sort icon
    } catch (error) {
        console.error("Error loading projects:", error);
        document.getElementById('project-table-body').innerHTML = `<tr><td colspan="6" class="p-4 text-center text-red-500">${error.message}</td></tr>`;
    }
}

async function loadAdminUsers(role, tableBodyId) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/admin/users?role=${role}`, {
            method: 'GET',
            headers: getAuthHeaders()
        });
        if (!response.ok) throw new Error(`Failed to fetch ${role}s`);
        
        const users = await response.json();
        
        if (role === 'Student') {
            allStudents = users;
            originalAllStudents = [...users]; // Save a copy
            renderUserTable(allStudents, tableBodyId, 'Student');
            updateSortIcons('students'); // Set default sort icon
        } else {
            allTeachers = users;
            originalAllTeachers = [...users]; // Save a copy
            renderUserTable(allTeachers, tableBodyId, 'Teacher');
            updateSortIcons('teachers'); // Set default sort icon
        }

    } catch (error) {
        console.error(`Error loading ${role}s:`, error);
        document.getElementById(tableBodyId).innerHTML = `<tr><td colspan="6" class="p-4 text-center text-red-500">${error.message}</td></tr>`;
    }
}

// --- DOM Rendering Functions ---

function renderProjectTable(projects) {
    const tableBody = document.getElementById('project-table-body');
    if (!tableBody) return;

    if (projects.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-subtext-light dark:text-subtext-dark">No projects found.</td></tr>`;
        return;
    }

    tableBody.innerHTML = projects.map(project => `
        <tr class="border-b border-border-light dark:border-border-dark">
            <td class="p-4 text-text-light dark:text-text-dark">${project.name}</td>
            <td class="p-4 text-subtext-light dark:text-subtext-dark">${project.ownerName || 'N/A'}</td>
            <td class="p-4 text-subtext-light dark:text-subtext-dark">${project.guideName || 'N/A'}</td>
            <td class="p-4">
                <span class="px-2 py-1 text-sm font-medium rounded-full">${project.status || 'N/A'}</span>
            </td>
            <td class="p-4 text-subtext-light dark:text-subtext-dark">${formatDate(project.deadline)}</td>
            <td class="p-4">
                <div class="flex gap-2">
                    <button onclick="openEditProjectModal('${project._id}')" class="p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-subtext-light dark:text-subtext-dark"><span class="material-icons text-base">edit</span></button>
                    <button onclick="deleteAdminProject('${project._id}')" class="p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-red-500"><span class="material-icons text-base">delete</span></button>
                </div>
            </td>
        </tr>
    `).join('');
}

function renderUserTable(users, tableBodyId, role) {
    const tableBody = document.getElementById(tableBodyId);
    if (!tableBody) return;

    if (users.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-subtext-light dark:text-subtext-dark">No ${role}s found.</td></tr>`;
        return;
    }

    tableBody.innerHTML = users.map(user => `
        <tr class="border-b border-border-light dark:border-border-dark">
            <td class="p-4 text-text-light dark:text-text-dark">${user.fullName}</td>
            <td class="p-4 text-subtext-light dark:text-subtext-dark">${user.email}</td>
            <td class="p-4 text-subtext-light dark:text-subtext-dark">${user.registrationNumber || 'N/A'}</td>
            <td class="p-4 text-subtext-light dark:text-subtext-dark">${user.department || 'N/A'}</td>
            <td class="p-4 text-subtext-light dark:text-subtext-dark">${formatDate(user.createdAt)}</td>
            <td class="p-4">
                <div class="flex gap-2">
                    <button onclick="openEditUserModal('${user._id}', '${role}')" class="p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-subtext-light dark:text-subtext-dark"><span class="material-icons text-base">edit</span></button>
                    <button onclick="deleteAdminUser('${user._id}', '${role}')" class="p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-red-500"><span class="material-icons text-base">delete</span></button>
                </div>
            </td>
        </tr>
    `).join('');
}

// --- Action Functions ---

async function handleAddUserForm(event, role) {
    event.preventDefault();
    const pageKey = role === 'Student' ? 'student' : 'teacher';
    const form = event.target;
    const button = form.querySelector('button[type="submit"]');
    
    showAdminMessage('Creating user...', false, pageKey);
    button.disabled = true;

    try {
        const userData = {
            fullName: document.getElementById(`full-name-add-${pageKey}`).value,
            registrationNumber: document.getElementById(`reg-number-add-${pageKey}`).value,
            email: document.getElementById(`reg-email-add-${pageKey}`).value,
            password: document.getElementById(`reg-password-add-${pageKey}`).value,
            department: document.getElementById(`department-add-${pageKey}`).value,
            role: document.getElementById(`user-type-add-${pageKey}`).value,
            securityQuestion: document.getElementById(`security-question-add-${pageKey}`).value,
            securityAnswer: document.getElementById(`security-answer-add-${pageKey}`).value,
        };

        const response = await fetch(`${API_BASE_URL}/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }, // Signup is public, no auth needed
            body: JSON.stringify(userData)
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.detail || `Failed to create ${role}`);
        }

        showAdminMessage(`${role} created successfully!`, false, pageKey);
        form.reset();
        
        // Refresh the corresponding user list
        if (role === 'Student') {
            loadAdminUsers('Student', 'student-table-body');
        } else {
            loadAdminUsers('Teacher', 'teacher-table-body');
        }
        
        // Go back to the user list page after success
        setTimeout(() => {
            if(window.showPage) window.showPage(role === 'Student' ? 'students-page' : 'teachers-page');
        }, 1500);

    } catch (error) {
        console.error(`Error adding ${role}:`, error);
        showAdminMessage(error.message, true, pageKey);
    } finally {
        button.disabled = false;
    }
}

async function deleteAdminUser(userId, role) {
    if (!confirm(`Are you sure you want to delete this ${role}? This action cannot be undone.`)) {
        return;
    }

    const pageKey = role === 'Student' ? 'students' : 'teachers';
    showAdminMessage('Deleting user...', false, pageKey);

    try {
        const response = await fetch(`${API_BASE_URL}/api/admin/users/${userId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || `Failed to delete ${role}`);
        }

        showAdminMessage(`${role} deleted successfully.`, false, pageKey);
        
        // Refresh the list
        if (role === 'Student') {
            loadAdminUsers('Student', 'student-table-body');
        } else {
            loadAdminUsers('Teacher', 'teacher-table-body');
        }

    } catch (error) {
        console.error(`Error deleting ${role}:`, error);
        showAdminMessage(error.message, true, pageKey);
    }
}

async function deleteAdminProject(projectId) {
    if (!confirm('Are you sure you want to delete this project? This will also remove all related invitations and cannot be undone.')) {
        return;
    }
    
    showAdminMessage('Deleting project...', false, 'projects');

    try {
        const response = await fetch(`${API_BASE_URL}/api/admin/projects/${projectId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || "Failed to delete project");
        }

        showAdminMessage('Project deleted successfully.', false, 'projects');
        loadAdminProjects(); // Refresh the project list

    } catch (error) {
        console.error('Error deleting project:', error);
        showAdminMessage(error.message, true, 'projects');
    }
}





function sortAdminTable(type, key) {
    let dataArray;
    let sortState;
    let tableId;
    let role;
    let searchInputId;

    if (type === 'projects') {
        dataArray = allProjects;
        sortState = currentSort.projects;
        searchInputId = 'project-search-input';
    } else if (type === 'students') {
        dataArray = allStudents;
        sortState = currentSort.students;
        role = 'Student';
        searchInputId = 'student-search-input';
    } else { // teachers
        dataArray = allTeachers;
        sortState = currentSort.teachers;
        role = 'Teacher';
        searchInputId = 'teacher-search-input';
    }

    // Determine new sort order
    let newOrder = 'asc';
    if (sortState.key === key && sortState.order === 'asc') {
        newOrder = 'desc';
    }

    // Sort the data
    dataArray.sort((a, b) => {
        let valA = a[key] || '';
        let valB = b[key] || '';

        // Handle special cases like dates
        if (key === 'createdAt' || key === 'deadline') {
            valA = new Date(valA || 0).getTime();
            valB = new Date(valB || 0).getTime();
        } else if (typeof valA === 'string') {
            valA = valA.toLowerCase();
            valB = valB.toLowerCase();
        }

        if (valA < valB) return newOrder === 'asc' ? -1 : 1;
        if (valA > valB) return newOrder === 'asc' ? 1 : -1;
        return 0;
    });

    // Update state
    sortState.key = key;
    sortState.order = newOrder;

    // Update UI
    updateSortIcons(type);

    // Re-run the search filter, which will re-render the table with sorted data
    document.getElementById(searchInputId).dispatchEvent(new Event('input'));
}

function updateSortIcons(type) {
    let sortState;
    if (type === 'projects') sortState = currentSort.projects;
    else if (type === 'students') sortState = currentSort.students;
    else sortState = currentSort.teachers;

    // Reset all icons for this table type
    document.querySelectorAll(`#${type}-page .sort-icon`).forEach(icon => {
        icon.textContent = 'unfold_more';
        icon.classList.remove('text-primary');
    });

    // Set the active icon
    const activeIcon = document.getElementById(`sort-icon-${type}-${sortState.key}`);
    if (activeIcon) {
        activeIcon.textContent = sortState.order === 'asc' ? 'arrow_upward' : 'arrow_downward';
        activeIcon.classList.add('text-primary');
    }
}

// Make sort functions globally accessible from HTML
window.sortAdminTable = sortAdminTable;
window.updateSortIcons = updateSortIcons;

// --- Search/Filter Functions ---
function setupSearchListeners() {
    // Project Search
    const projectSearch = document.getElementById('project-search-input');
    projectSearch.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const filtered = allProjects.filter(p => 
            p.name.toLowerCase().includes(query) ||
            (p.ownerName && p.ownerName.toLowerCase().includes(query)) ||
            (p.guideName && p.guideName.toLowerCase().includes(query)) ||
            (p.status && p.status.toLowerCase().includes(query))
        );
        renderProjectTable(filtered);
    });

    document.getElementById('project-search-reset').addEventListener('click', () => {
        projectSearch.value = ''; // Clear search
        allProjects = [...originalAllProjects]; // Reset data to original
        currentSort.projects = { key: 'name', order: 'asc' }; // Reset sort state
        updateSortIcons('projects'); // Reset icons
        renderProjectTable(allProjects); // Re-render with original data
    });

    // Student Search
    const studentSearch = document.getElementById('student-search-input');
    studentSearch.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const filtered = allStudents.filter(u => 
            u.fullName.toLowerCase().includes(query) ||
            u.email.toLowerCase().includes(query) ||
            (u.registrationNumber && u.registrationNumber.toLowerCase().includes(query)) ||
            (u.department && u.department.toLowerCase().includes(query))
        );
        renderUserTable(filtered, 'student-table-body', 'Student');
    });

    document.getElementById('student-search-reset').addEventListener('click', () => {
        studentSearch.value = ''; // Clear search
        allStudents = [...originalAllStudents]; // Reset data
        currentSort.students = { key: 'fullName', order: 'asc' }; // Reset sort
        updateSortIcons('students'); // Reset icons
        renderUserTable(allStudents, 'student-table-body', 'Student');
    });
    
    document.getElementById('teacher-search-reset').addEventListener('click', () => {
        teacherSearch.value = ''; // Clear search
        allTeachers = [...originalAllTeachers]; // Reset data
        currentSort.teachers = { key: 'fullName', order: 'asc' }; // Reset sort
        updateSortIcons('teachers'); // Reset icons
        renderUserTable(allTeachers, 'teacher-table-body', 'Teacher');
    });
}

// --- Modal Edit Functions ---
    
const modal = document.getElementById('admin-edit-modal');
const modalTitle = document.getElementById('modal-title');
const modalFormBody = document.getElementById('modal-form-body');
const modalSaveBtn = document.getElementById('modal-save-btn');
const modalCancelBtn = document.getElementById('modal-cancel-btn');
const modalCloseBtn = document.getElementById('modal-close-btn');
const modalOverlay = document.getElementById('modal-overlay');
const modalMessage = document.getElementById('modal-message');

function closeAdminModal() {
    modal.classList.add('hidden');
    modalFormBody.innerHTML = '<p>Loading...</p>'; // Clear form
    modalMessage.style.display = 'none'; // Hide message
}

function showModalMessage(message, isError = false) {
    modalMessage.textContent = message;
    modalMessage.className = `text-sm p-4 rounded-lg mx-6 ${
        isError 
            ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
            : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
    }`;
    modalMessage.style.display = 'block';
}

function openEditUserModal(userId, role) {
    const dataArray = (role === 'Student') ? allStudents : allTeachers;
    const user = dataArray.find(u => u._id === userId);
    if (!user) return;
    
    modalTitle.textContent = `Edit ${role}: ${user.fullName}`;
    
    // Build the form
    modalFormBody.innerHTML = `
        <input type="hidden" id="edit-user-id" value="${user._id}">
        <div>
            <label for="edit-fullName" class="text-sm font-medium text-text-light dark:text-text-dark">Full Name</label>
            <input type="text" id="edit-fullName" class="form-input w-full mt-1" value="${user.fullName}">
        </div>
        <div>
            <label for="edit-email" class="text-sm font-medium text-text-light dark:text-text-dark">Email</label>
            <input type="email" id="edit-email" class="form-input w-full mt-1" value="${user.email}">
        </div>
        <div>
            <label for="edit-regNumber" class="text-sm font-medium text-text-light dark:text-text-dark">Registration Number</label>
            <input type="text" id="edit-regNumber" class="form-input w-full mt-1" value="${user.registrationNumber || ''}">
        </div>
        <div>
            <label for="edit-department" class="text-sm font-medium text-text-light dark:text-text-dark">Department</label>
            <select id="edit-department" class="form-select w-full mt-1">
                <option value="Computer Science" ${user.department === 'Computer Science' ? 'selected' : ''}>Computer Science</option>
                <option value="Electrical Engineering" ${user.department === 'Electrical Engineering' ? 'selected' : ''}>Electrical Engineering</option>
                <option value="Mechanical Engineering" ${user.department === 'Mechanical Engineering' ? 'selected' : ''}>Mechanical Engineering</option>
                <option value="Business Administration" ${user.department === 'Business Administration' ? 'selected' : ''}>Business Administration</option>
            </select>
        </div>
    `;
    
    // Set the save button's action
    modalSaveBtn.onclick = () => handleSaveUser(userId, role);
    modal.classList.remove('hidden');
}

function openEditProjectModal(projectId) {
    const project = allProjects.find(p => p._id === projectId);
    if (!project) return;
    
    modalTitle.textContent = `Edit Project: ${project.name}`;
    
    // Build the form
    modalFormBody.innerHTML = `
        <input type="hidden" id="edit-project-id" value="${project._id}">
        <div>
            <label for="edit-name" class="text-sm font-medium text-text-light dark:text-text-dark">Project Name</label>
            <input type="text" id="edit-name" class="form-input w-full mt-1" value="${project.name}">
        </div>
        <div>
            <label for="edit-ownerName" class="text-sm font-medium text-text-light dark:text-text-dark">Owner Name</label>
            <input type="text" id="edit-ownerName" class="form-input w-full mt-1" value="${project.ownerName || ''}">
        </div>
        <div>
            <label for="edit-guideName" class="text-sm font-medium text-text-light dark:text-text-dark">Guide Name (Leave blank for 'N/A')</label>
            <input type="text" id="edit-guideName" class="form-input w-full mt-1" value="${project.guideName || ''}">
        </div>
        <div>
            <label for="edit-status" class="text-sm font-medium text-text-light dark:text-text-dark">Status</label>
            <select id="edit-status" class="form-select w-full mt-1">
                <option value="Planning" ${project.status === 'Planning' ? 'selected' : ''}>Planning</option>
                <option value="Active" ${project.status === 'Active' ? 'selected' : ''}>Active</option>
                <option value="Completed" ${project.status === 'Completed' ? 'selected' : ''}>Completed</option>
                <option value="Inactive" ${project.status === 'Inactive' ? 'selected' : ''}>Inactive</option>
            </select>
        </div>
    `;
    
    // Set the save button's action
    modalSaveBtn.onclick = () => handleSaveProject(projectId);
    modal.classList.remove('hidden');
}

async function handleSaveUser(userId, role) {
    const pageKey = (role === 'Student') ? 'students' : 'teachers';
    
    // 1. Get data from form
    const updateData = {
        fullName: document.getElementById('edit-fullName').value,
        email: document.getElementById('edit-email').value,
        registrationNumber: document.getElementById('edit-regNumber').value,
        department: document.getElementById('edit-department').value,
    };
    
    showModalMessage('Saving...', false);
    modalSaveBtn.disabled = true;

    try {
        const response = await fetch(`${API_BASE_URL}/api/admin/users/${userId}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(updateData)
        });
        
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || `Failed to update ${role}`);
        
        showAdminMessage(`${role} updated successfully.`, false, pageKey);
        closeAdminModal();
        
        // Reload the list
        if (role === 'Student') {
            loadAdminUsers('Student', 'student-table-body');
        } else {
            loadAdminUsers('Teacher', 'teacher-table-body');
        }
        
    } catch (error) {
        console.error(`Error updating ${role}:`, error);
        showModalMessage(error.message, true);
    } finally {
        modalSaveBtn.disabled = false;
    }
}

async function handleSaveProject(projectId) {
    // 1. Get data from form
    const updateData = {
        name: document.getElementById('edit-name').value,
        ownerName: document.getElementById('edit-ownerName').value,
        guideName: document.getElementById('edit-guideName').value,
        status: document.getElementById('edit-status').value,
    };
    
    showModalMessage('Saving...', false);
    modalSaveBtn.disabled = true;

    try {
        const response = await fetch(`${API_BASE_URL}/api/admin/projects/${projectId}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(updateData)
        });
        
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "Failed to update project");
        
        showAdminMessage('Project updated successfully.', false, 'projects');
        closeAdminModal();
        loadAdminProjects(); // Reload the project list
        
    } catch (error) {
        console.error('Error updating project:', error);
        showModalMessage(error.message, true);
    } finally {
        modalSaveBtn.disabled = false;
    }
}

// --- Initialization ---

document.addEventListener('DOMContentLoaded', () => {
    // Check for token and user info (from dashboard_common.js)
    if (typeof populateUserInfo !== 'function') {
        console.error("dashboard_common.js is not loaded or populateUserInfo is missing.");
        return;
    }

    populateUserInfo().then(() => {
        // User is populated, check if Admin
        if (projectHubUser && projectHubUser.role !== 'Admin') {
            alert('Access Denied. You are not an administrator.');
            window.location.href = 'home.html';
            return;
        }

        // --- Load all data on init ---
        loadAdminStats();
        loadAdminProjects();
        loadAdminUsers('Student', 'student-table-body');
        loadAdminUsers('Teacher', 'teacher-table-body');
        
        // --- Setup periodic refresh for stats (Level 2 Real-time) ---
        adminStatsInterval = setInterval(loadAdminStats, 10000); // Refresh stats every 10 seconds

        // --- Hook up forms ---
        document.getElementById('add-student-form').addEventListener('submit', (e) => handleAddUserForm(e, 'Student'));
        document.getElementById('add-teacher-form').addEventListener('submit', (e) => handleAddUserForm(e, 'Teacher'));
        
        // --- Hook up search bars ---
        setupSearchListeners();

        // --- ADD THIS: Hook up modal close buttons ---
        modalCancelBtn.addEventListener('click', closeAdminModal);
        modalCloseBtn.addEventListener('click', closeAdminModal);
        modalOverlay.addEventListener('click', closeAdminModal);
        
        // --- Hook up logout ---
        const logoutLink = document.getElementById('logout-link');
        if (logoutLink) {
            logoutLink.addEventListener('click', (e) => {
                e.preventDefault();
                localStorage.removeItem('accessToken');
                window.location.href = 'home.html';
            });
        }
        
    }).catch(error => {
        console.error("Failed to initialize admin dashboard:", error);
        // This likely means the token was invalid, so populateUserInfo redirected
    });
});