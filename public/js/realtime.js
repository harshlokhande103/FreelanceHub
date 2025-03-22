// Connect to Socket.IO server
const socket = io();

// Handle job updates
socket.on('newJob', (job) => {
    console.log('New job received:', job);
    addJobToPage(job);
});

socket.on('updateJob', (updatedJob) => {
    console.log('Job update received:', updatedJob);
    updateJobOnPage(updatedJob);
});

socket.on('deleteJob', (jobId) => {
    console.log('Job deletion received:', jobId);
    removeJobFromPage(jobId);
});

// Handle notifications
socket.on('newNotification', (notification) => {
    console.log('New notification received:', notification);
    updateNotificationCount();
    addNotificationToDropdown(notification);
});

// Helper functions
function addJobToPage(job) {
    const jobsContainer = document.querySelector('.job-posts');
    if (!jobsContainer) return;

    const jobHtml = `
        <div class="job-post p-4 border-bottom" data-job-id="${job.id}">
            <div class="d-flex justify-content-between">
                <h4>${job.title}</h4>
                <div class="dropdown">
                    <button class="btn btn-link" type="button" data-bs-toggle="dropdown">
                        <i class="fas fa-ellipsis-v"></i>
                    </button>
                    <ul class="dropdown-menu">
                        <li><a class="dropdown-item" href="/edit-job/${job.id}">Edit</a></li>
                        <li><a class="dropdown-item text-danger" href="#" onclick="confirmDelete('${job.id}')">Delete</a></li>
                    </ul>
                </div>
            </div>
            <div class="job-details mt-3">
                <p>${job.description}</p>
                <div class="skills mt-2">
                    ${job.skills.map(skill => `<span class="badge bg-secondary me-1">${skill}</span>`).join('')}
                </div>
            </div>
        </div>
    `;

    jobsContainer.insertAdjacentHTML('afterbegin', jobHtml);
}

function updateJobOnPage(updatedJob) {
    const jobElement = document.querySelector(`[data-job-id="${updatedJob.id}"]`);
    if (!jobElement) return;

    const titleElement = jobElement.querySelector('h4');
    const descriptionElement = jobElement.querySelector('.job-details p');
    const skillsElement = jobElement.querySelector('.skills');

    if (titleElement) titleElement.textContent = updatedJob.title;
    if (descriptionElement) descriptionElement.textContent = updatedJob.description;
    if (skillsElement) {
        skillsElement.innerHTML = updatedJob.skills
            .map(skill => `<span class="badge bg-secondary me-1">${skill}</span>`)
            .join('');
    }
}

function removeJobFromPage(jobId) {
    const jobElement = document.querySelector(`[data-job-id="${jobId}"]`);
    if (jobElement) jobElement.remove();
}

function updateNotificationCount() {
    const countBadge = document.querySelector('#notificationDropdown .badge');
    if (countBadge) {
        const currentCount = parseInt(countBadge.textContent) || 0;
        countBadge.textContent = currentCount + 1;
    }
}

function addNotificationToDropdown(notification) {
    const dropdownMenu = document.querySelector('#notificationDropdown + .dropdown-menu');
    if (!dropdownMenu) return;

    const notificationHtml = `
        <li>
            <div class="dropdown-item notification-item">
                <div class="d-flex justify-content-between">
                    <strong>${notification.freelancerName}</strong>
                    <small>${new Date(notification.createdAt).toLocaleDateString()}</small>
                </div>
                <p class="mb-1">is interested in your job: "${notification.jobTitle}"</p>
                <div class="d-flex justify-content-between mt-2">
                    <a href="/freelancer-profile/${notification.freelancerId}" class="btn btn-sm btn-primary">
                        View Profile
                    </a>
                    <a href="/mark-notification-read/${notification.id}" class="btn btn-sm btn-outline-secondary">
                        Mark as Read
                    </a>
                </div>
            </div>
        </li>
    `;

    // Remove 'no notifications' message if it exists
    const noNotificationsElement = dropdownMenu.querySelector('.dropdown-item:only-child');
    if (noNotificationsElement && noNotificationsElement.textContent.includes('No new notifications')) {
        noNotificationsElement.remove();
    }

    // Add divider if there are other notifications
    if (dropdownMenu.children.length > 0) {
        dropdownMenu.insertAdjacentHTML('afterbegin', '<li><hr class="dropdown-divider"></li>');
    }

    dropdownMenu.insertAdjacentHTML('afterbegin', notificationHtml);
}