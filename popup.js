document.addEventListener('DOMContentLoaded', function() {

    // ========== TABS ==========

    document.querySelectorAll('.tab-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
            document.querySelectorAll('.tab-content').forEach(function(c) { c.classList.remove('active'); });
            btn.classList.add('active');
            document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
        });
    });

    // ========== EXPORT TAB: FILTER SETTINGS ==========

    // Load saved settings
    chrome.storage.sync.get({
        includeFullName: true,
        includeFirstName: false,
        includeLastName: false,
        includeTitle: true,
        includeTenure: true,
        includeLocation: true,
        includeStatus: true,
        exportAsCSV: false
    }, function(items) {
        document.getElementById('includeFullName').checked = items.includeFullName;
        document.getElementById('includeFirstName').checked = items.includeFirstName;
        document.getElementById('includeLastName').checked = items.includeLastName;
        document.getElementById('includeTitle').checked = items.includeTitle;
        document.getElementById('includeTenure').checked = items.includeTenure;
        document.getElementById('includeLocation').checked = items.includeLocation;
        document.getElementById('includeStatus').checked = items.includeStatus;
        updateHeadersDisplay(items);
    });

    // Chevron toggle for name sub-options
    document.getElementById('fullNameRow').addEventListener('click', function(e) {
        if (e.target.closest('.toggle-switch')) return;
        const sub = document.getElementById('nameSubToggles');
        const chevron = document.getElementById('nameChevron');
        const isOpen = sub.style.display !== 'none';
        sub.style.display = isOpen ? 'none' : 'block';
        chevron.style.transform = isOpen ? '' : 'rotate(90deg)';
    });

    // Save settings when button is clicked
    document.getElementById('saveFilters').addEventListener('click', function() {
        const settings = {
            includeFullName: document.getElementById('includeFullName').checked,
            includeFirstName: document.getElementById('includeFirstName').checked,
            includeLastName: document.getElementById('includeLastName').checked,
            includeTitle: document.getElementById('includeTitle').checked,
            includeTenure: document.getElementById('includeTenure').checked,
            includeLocation: document.getElementById('includeLocation').checked,
            includeStatus: document.getElementById('includeStatus').checked
        };

        chrome.storage.sync.set(settings, function() {
            const button = document.getElementById('saveFilters');
            button.textContent = 'Saved!';
            button.style.backgroundColor = '#2e7d32';
            setTimeout(() => {
                button.textContent = 'Save Settings';
                button.style.backgroundColor = '';
            }, 1500);
            updateHeadersDisplay(settings);
        });
    });

    // Update headers display on toggle change
    ['includeFullName', 'includeFirstName', 'includeLastName', 'includeTitle', 'includeTenure', 'includeLocation', 'includeStatus'].forEach(id => {
        document.getElementById(id).addEventListener('change', function() {
            updateHeadersDisplay({
                includeFullName: document.getElementById('includeFullName').checked,
                includeFirstName: document.getElementById('includeFirstName').checked,
                includeLastName: document.getElementById('includeLastName').checked,
                includeTitle: document.getElementById('includeTitle').checked,
                includeTenure: document.getElementById('includeTenure').checked,
                includeLocation: document.getElementById('includeLocation').checked,
                includeStatus: document.getElementById('includeStatus').checked
            });
        });
    });

    // Copy headers button
    document.getElementById('copyHeaders').addEventListener('click', function() {
        const headers = getSelectedHeaders();
        navigator.clipboard.writeText(headers.join('\t')).then(() => {
            const button = this;
            button.textContent = 'Copied!';
            button.style.backgroundColor = '#2e7d32';
            setTimeout(() => {
                button.textContent = 'Copy Headers';
                button.style.backgroundColor = '';
            }, 1500);
        });
    });

    // ========== EXPORT TAB: CAPTURED DATA ==========

    // Load captured count on popup open
    loadCapturedCount();

    // Reset captured data
    document.getElementById('resetBtn').addEventListener('click', function() {
        chrome.storage.local.set({ sessionData: [], capturedUrls: [] }, function() {
            loadCapturedCount();
        });
    });

    // ========== MESSAGING TAB: TEMPLATES ==========

    // Load saved templates
    chrome.storage.local.get(['subjectTemplate', 'messageTemplate'], function(result) {
        if (result.subjectTemplate) {
            document.getElementById('subjectTemplate').value = result.subjectTemplate;
        }
        if (result.messageTemplate) {
            document.getElementById('messageTemplate').value = result.messageTemplate;
        }
    });

    // Save templates
    document.getElementById('saveTemplates').addEventListener('click', function() {
        const subjectTemplate = document.getElementById('subjectTemplate').value;
        const messageTemplate = document.getElementById('messageTemplate').value;

        chrome.storage.local.set({
            subjectTemplate: subjectTemplate,
            messageTemplate: messageTemplate
        }, function() {
            const button = document.getElementById('saveTemplates');
            button.textContent = 'Saved!';
            button.style.backgroundColor = '#2e7d32';
            setTimeout(() => {
                button.textContent = 'Save Templates';
                button.style.backgroundColor = '';
            }, 1500);
        });
    });

}); // end DOMContentLoaded

// ========== HELPER FUNCTIONS ==========

function getSelectedHeaders() {
    const headers = [];
    if (document.getElementById('includeFullName').checked) headers.push('Full Name');
    if (document.getElementById('includeFirstName').checked) headers.push('First Name');
    if (document.getElementById('includeLastName').checked) headers.push('Last Name');
    if (document.getElementById('includeTitle').checked) headers.push('Title');
    if (document.getElementById('includeTenure').checked) headers.push('Tenure');
    if (document.getElementById('includeLocation').checked) headers.push('Location');
    if (document.getElementById('includeStatus').checked) headers.push('Status');
    return headers;
}

function updateHeadersDisplay(settings) {
    const headers = [];
    if (settings.includeFullName) headers.push('Full Name');
    if (settings.includeFirstName) headers.push('First Name');
    if (settings.includeLastName) headers.push('Last Name');
    if (settings.includeTitle) headers.push('Title');
    if (settings.includeTenure) headers.push('Tenure');
    if (settings.includeLocation) headers.push('Location');
    if (settings.includeStatus) headers.push('Status');
    document.getElementById('headersText').textContent = headers.join('  |  ');
}

function loadCapturedCount() {
    chrome.storage.local.get({ sessionData: [] }, function(result) {
        document.getElementById('capturedCount').textContent = result.sessionData.length;
    });
}
