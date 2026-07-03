class LinkedInScraper {
  constructor() {
      this.init();
      this.filters = {
        includeFullName: true,
        includeFirstName: false,
        includeLastName: false,
        includeCompany: true,
        includeTitle: true,
        includeTenure: true,
        includeLocation: true,
        includeStatus: true,
        exportAsCSV: false,
        includeColumnTitles: true
      };
    }


  async init() {
    await this.loadFilters();
  }

  async loadFilters() {
      return new Promise((resolve) => {
        chrome.storage.sync.get({
          includeFullName: true,
          includeFirstName: false,
          includeLastName: false,
          includeCompany: true,
          includeTitle: true,
          includeTenure: true,
          includeLocation: true,
          includeStatus: true,
          exportAsCSV: false,
          includeColumnTitles: true
        }, (items) => {
          this.filters = items;
          console.log('Loaded filters:', this.filters);
          resolve();
        });
      });
    }


  setupExportButton() {
    if (document.querySelector('.linkedin-export-btn')) {
      return;
    }

    const exportButton = document.createElement('button');
    exportButton.innerHTML = 'Export Data';
    exportButton.className = 'linkedin-export-btn';

    exportButton.style.cssText = `
      position: fixed;
      top: 80px;
      right: 20px;
      z-index: 9999;
      background-color: #0a66c2;
      color: white;
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-weight: bold;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    `;

    exportButton.onmouseover = () => {
      exportButton.style.backgroundColor = '#004182';
    };
    exportButton.onmouseout = () => {
      exportButton.style.backgroundColor = '#0a66c2';
    };

    exportButton.addEventListener('click', async () => {
      console.log('Export button clicked');
      try {
        await this.loadFilters();
        await this.handleExport();
      } catch (error) {
        console.error('Export error:', error);
      }
    });

    document.body.appendChild(exportButton);
  }

  // Helper method to detect if we're on a leads page
  isLeadsPage() {
    return window.location.href.includes("/sales/lists/") ||
      window.location.href.includes("/sales/lead/lists/") ||
      document.querySelector('.lists-detail__view-profile-name-link') !== null ||
      document.querySelector('[data-view-name="lead-lists-detail"]') !== null ||
      document.querySelector('table[data-view-name="lead-lists-table"]') !== null;
  }

  // Helper method to detect if we're on a regular LinkedIn search page
  isRegularSearchPage() {
    return window.location.href.includes("/search/results/people/") &&
      !window.location.href.includes("/sales/");
  }

  async scrollToBottom() {
    return new Promise(async (resolve) => {
      let lastHeight = document.documentElement.scrollHeight;
      let scrollAttempts = 0;
      const maxScrollAttempts = 50;

      const scrollInterval = setInterval(async () => {
        window.scrollTo(0, document.documentElement.scrollHeight);
        await new Promise(resolve => setTimeout(resolve, 1000));
        const newHeight = document.documentElement.scrollHeight;
        scrollAttempts++;

        if (newHeight === lastHeight || scrollAttempts >= maxScrollAttempts) {
          clearInterval(scrollInterval);
          window.scrollTo(0, 0);
          resolve();
        }
        lastHeight = newHeight;
      }, 1500);
    });
  }

  // New method to scrape regular LinkedIn search page data
  async scrapeRegularSearchData() {
    try {
      await this.scrollToBottom();

      // Try multiple selectors to find profile containers
      let profileContainers = document.querySelectorAll('[data-view-name="search-entity-result-universal-template"]');

      // Fallback: try finding by list items
      if (!profileContainers.length) {
        profileContainers = document.querySelectorAll('ul[role="list"] > li');
      }

      console.log('Found profile containers:', profileContainers.length);

      const profiles = [];
      for (const container of profileContainers) {
        // Extract name and profile URL
        const nameLink = container.querySelector('a[href*="/in/"]');
        if (!nameLink) continue; // Skip if no profile link found

        const profileUrl = nameLink.href;

        // Try multiple methods to extract the name
        let name = '';

        // Method 1: Look for span with dir="ltr" (some profiles)
        const nameSpan = nameLink.querySelector('span[dir="ltr"]');
        if (nameSpan && nameSpan.textContent.trim() && !nameSpan.textContent.includes('Status is offline')) {
          name = nameSpan.textContent.trim();
        }

        // Method 2: Get name from image alt attribute (most common)
        if (!name) {
          const profileImage = nameLink.querySelector('img[alt]');
          if (profileImage && profileImage.alt) {
            name = profileImage.alt.trim();
          }
        }

        // Method 3: Look for aria-label on the link itself
        if (!name && nameLink.getAttribute('aria-label')) {
          name = nameLink.getAttribute('aria-label').trim();
        }

        // Method 4: For profiles without photos, look for visually-hidden div with name
        if (!name) {
          const hiddenDivs = nameLink.querySelectorAll('div.visually-hidden');
          for (const div of hiddenDivs) {
            const text = div.textContent.trim();
            // Filter out non-name text
            if (text &&
                !text.includes('Status is offline') &&
                !text.includes('View') &&
                !text.includes('profile') &&
                text.length > 2 &&
                text.length < 100) {
              name = text;
              break;
            }
          }
        }

        // Skip if we still couldn't find a valid name
        if (!name || name.includes('Status is offline')) {
          console.log('Skipping profile - could not extract valid name');
          continue;
        }

        // Extract title if enabled
        let title = '';
        if (this.filters.includeTitle) {
          // Try multiple selectors for title
          const titleSelectors = [
            'div.t-14.t-black.t-normal', // Most specific for title
            '.entity-result__primary-subtitle',
            'div[class*="t-14"][class*="t-black"]',
            '[data-anonymize="title"]'
          ];

          for (const selector of titleSelectors) {
            const titleElement = container.querySelector(selector);
            if (titleElement && titleElement.textContent.trim() &&
                !titleElement.textContent.includes('Status is offline')) {
              title = titleElement.textContent.trim();
              break;
            }
          }

          // Fallback: look for any div that looks like a job title
          if (!title) {
            const allDivs = container.querySelectorAll('div');
            for (const div of allDivs) {
              const text = div.textContent.trim();
              // Check if it looks like a job title (contains "at" and is not too long)
              if (text.includes(' at ') &&
                  text.length < 150 &&
                  text !== name &&
                  !text.includes('Status is offline') &&
                  !text.includes('mutual connection')) {
                title = text;
                break;
              }
            }
          }
        }

        // Extract location if enabled
        let location = '';
        if (this.filters.includeLocation) {
          // Try multiple selectors for location
          const locationSelectors = [
            'div.t-14.t-normal:not(.t-black)', // Location has t-normal but not t-black
            '.entity-result__secondary-subtitle',
            'div[class*="t-14"][class*="t-normal"]:not([class*="t-black"])',
            '[data-anonymize="location"]'
          ];

          for (const selector of locationSelectors) {
            const locationElement = container.querySelector(selector);
            if (locationElement && locationElement.textContent.trim() &&
                !locationElement.textContent.includes('Status is offline') &&
                !locationElement.textContent.includes(' at ')) {
              location = locationElement.textContent.trim();
              break;
            }
          }

          // Fallback: look for text that looks like a location (city, state pattern)
          if (!location) {
            const allDivs = container.querySelectorAll('div');
            for (const div of allDivs) {
              const text = div.textContent.trim();
              // Check if it looks like a location (contains comma or state abbreviation)
              if ((text.includes(',') || /\b[A-Z]{2}\b/.test(text)) &&
                  text.length < 100 &&
                  text !== name &&
                  text !== title &&
                  !text.includes('Status is offline') &&
                  !text.includes(' at ') &&
                  !text.includes('mutual connection')) {
                location = text;
                break;
              }
            }
          }
        }

        const data = {
          fullName: name,
          profileUrl: profileUrl,
          title: title,
          location: location,
          tenure: '', // Not available on regular search
          status: '' // Not applicable for regular search
        };

        console.log('Scraped profile:', data);
        if (name) {
          profiles.push(data);
        }
      }

      return profiles;
    } catch (error) {
      console.error('Error scraping regular search profiles:', error);
      alert('Error finding profiles. Please make sure you are on a LinkedIn search results page.');
      return [];
    }
  }

  async scrapeProfileData() {
    try {
      await this.scrollToBottom();

      const profileElements = document.querySelectorAll('ol.artdeco-list li.artdeco-list__item');
      console.log('Found profile elements:', profileElements.length);

      if (!profileElements.length) {
        throw new Error('No profile elements found');
      }

      const profiles = [];
      for (const profile of profileElements) {
        const nameElement = profile.querySelector('a.list-detail__view-profile-link, div.artdeco-entity-lockup__title a');
        const name = nameElement ? nameElement.textContent.trim() : '';
        const profileUrl = nameElement ? nameElement.href : '';

        const companyElement = profile.querySelector('[data-anonymize="company-name"]');
        let company = '';
        if (companyElement) {
          company = companyElement.textContent.trim();
        } else {
          const separator = profile.querySelector('span.separator--middot');
          if (separator) {
            let node = separator.nextSibling;
            while (node) {
              if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
                company = node.textContent.trim();
                break;
              }
              node = node.nextSibling;
            }
          }
        }

        let title = '';
        if (this.filters.includeTitle) {
          const titleElement = profile.querySelector('span[data-anonymize="title"]');
          title = titleElement ? titleElement.textContent.trim() : '';
        }

        let tenure = '';
        if (this.filters.includeTenure) {
          tenure = this.extractTenure(profile);
        }

        let location = '';
        if (this.filters.includeLocation) {
          const locationElement = profile.querySelector('div.artdeco-entity-lockup__caption');
          location = locationElement ? locationElement.textContent.trim() : '';
        }

        const data = {
          fullName: name,
          profileUrl: profileUrl,
          company: company,
          title: title,
          tenure: tenure,
          location: location
        };

        console.log('Scraped profile:', data);
        if (name) {
          profiles.push(data);
        }
      }

      return profiles;

    } catch (error) {
      console.error('Error scraping profiles:', error);
      alert('Error finding profiles. Please make sure you are on a Sales Navigator search results page.');
      return [];
    }
  }

  // New method to scrape leads page data
  async scrapeLeadsPageData() {
    try {
      await this.scrollToBottom();

      // Try multiple selectors to find the table rows with lead data
      let leadRows = document.querySelectorAll('tbody tr');

      // If no rows found, try alternative selectors
      if (!leadRows.length) {
        leadRows = document.querySelectorAll('tr[data-row-id]');
      }

      if (!leadRows.length) {
        leadRows = document.querySelectorAll('table tr:not(:first-child)');
      }

      console.log('Found lead elements:', leadRows.length);

      const leads = [];
      for (const row of leadRows) {
        // Skip header rows or empty rows
        if (!row.querySelector('a[href*="/lead/"]') && !row.querySelector('a[href*="/people/"]')) {
          continue;
        }

        // Extract name - try multiple selectors
        let nameElement = row.querySelector('a[href*="/lead/"] span:first-child');
        if (!nameElement) {
          nameElement = row.querySelector('a[href*="/people/"] span:first-child');
        }
        if (!nameElement) {
          nameElement = row.querySelector('td:first-child a span:first-child');
        }

        const name = nameElement ? nameElement.textContent.trim() : '';
        const profileUrl = nameElement ? nameElement.closest('a').href : '';

        // Extract company from Account column (only linked companies have data-anonymize)
        const companyElement = row.querySelector('[data-anonymize="company-name"]');
        const company = companyElement ? companyElement.textContent.trim() : '';

        // Extract title if enabled - look for job title div
        let title = '';
        if (this.filters.includeTitle) {
          // Look for the job title div with data-anonymize="job-title"
          const titleElement = row.querySelector('div[data-anonymize="job-title"]');
          if (titleElement) {
            title = titleElement.textContent.trim();
          }
        }

        // Extract location from Geography column
        let location = '';
        if (this.filters.includeLocation) {
          // Geography is typically the 3rd column (Name, Account, Geography)
          const cells = row.querySelectorAll('td');
          if (cells.length >= 3) {
            location = cells[2].textContent.trim();
          }
        }

        // Extract outreach activity status
        let status = '';
        if (this.filters.includeStatus) {
          // Look for outreach activity column - usually has status like "Invitation sent"
          const statusSelectors = [
            '[data-anonymize="outreach-activity"]',
            'td:nth-child(5)', // Outreach activity is typically 5th column
            'td:nth-child(6)', // Sometimes 6th column
            '.outreach-activity',
            'td[title*="ago"]' // Status often has "X days ago" in title
          ];

          for (const selector of statusSelectors) {
            const statusElement = row.querySelector(selector);
            if (statusElement) {
              const statusText = statusElement.textContent.trim();
              // Filter out empty or irrelevant text
              if (statusText && statusText !== '-' && statusText !== 'No activity') {
                status = statusText;
                break;
              }
            }
          }

          // If still no status, check all cells for status-like content
          if (!status) {
            const cells = row.querySelectorAll('td');
            for (const cell of cells) {
              const text = cell.textContent.trim();
              if (text.includes('sent') || text.includes('Message') || text.includes('Invitation') ||
                text.includes('InMail') || text.includes('Connection')) {
                status = text;
                break;
              }
            }
          }
        }

        const data = {
          fullName: name,
          profileUrl: profileUrl,
          company: company,
          title: title,
          location: location,
          status: status,
          tenure: '' // Not available on leads pages
        };

        console.log('Scraped lead:', data);
        if (name) {
          leads.push(data);
        }
      }

      return leads;
    } catch (error) {
      console.error('Error scraping leads:', error);
      alert('Error finding leads. Please make sure you are on a LinkedIn Sales Navigator Leads page.');
      return [];
    }
  }

  extractTenure(profile) {
    const patterns = [
      /(\d+\s+years?\s+\d+\s+months?)\s+in\s+role/,
      /(\d+\s+years?\s+\d+\s+months?)\s+in\s+company/,
      /(\d+\s+years?\s+\d+\s+months?)/,
      /(\d+\s+months?)\s+in\s+role/,
      /(\d+\s+years?)\s+in\s+role/
    ];

    const text = profile.textContent;
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    const tenureSelectors = [
      'span[class*="time-period"]',
      'span[class*="duration"]',
      'div[class*="duration"]',
      'div[class*="time-period"]'
    ];

    for (const selector of tenureSelectors) {
      const element = profile.querySelector(selector);
      if (element) {
        const text = element.textContent.trim();
        if (text.includes('year') || text.includes('month')) {
          return text.split('·')[0].trim();
        }
      }
    }

    return '';
  }

  async mergeSentMessages(data) {
    return new Promise((resolve) => {
      chrome.storage.local.get({ sentMessages: {} }, (result) => {
        const sent = result.sentMessages;
        const merged = data.map(p => {
          const key = (p.fullName || '').trim().toLowerCase();
          const hit = sent[key];
          if (hit) {
            return Object.assign({}, p, { sentMessage: hit.message, sentDate: hit.date });
          }
          return p;
        });
        resolve(merged);
      });
    });
  }

  async handleExport() {
    console.log('Starting export process');
    let profiles;

    // Determine what page we're on and use the appropriate scraping method
    if (this.isLeadsPage()) {
      console.log('Detected Leads Page - using leads scraper');
      profiles = await this.scrapeLeadsPageData();
    } else if (this.isRegularSearchPage()) {
      console.log('Detected Regular LinkedIn Search Page - using regular search scraper');
      profiles = await this.scrapeRegularSearchData();
    } else {
      console.log('Detected Search Results Page - using profile scraper');
      profiles = await this.scrapeProfileData();
    }

    if (profiles && profiles.length > 0) {
      console.log(`Exporting ${profiles.length} profiles/leads`);

      profiles = await this.mergeSentMessages(profiles);

      if (this.filters.exportAsCSV) {
        this.exportToCSV(profiles);
        alert(`Export complete! ${profiles.length} profiles exported to CSV.`);
      } else {
        await this.copyToClipboard(profiles);
        this.showNotification(`${profiles.length} profiles copied to clipboard!`);
      }
    } else {
      alert('No profiles found to export.');
    }
  }

  async copyToClipboard(data) {
      // Create headers based on what data is available and settings
      const headers = [];
      if (this.filters.includeFullName) headers.push('Full Name');
      if (this.filters.includeFirstName) headers.push('First Name');
      if (this.filters.includeLastName) headers.push('Last Name');
      if (this.filters.includeCompany) headers.push('Company');
      if (this.filters.includeTitle) headers.push('Title');

      // Only include Tenure if we have tenure data (not available on leads pages)
      const hasTenure = data.some(item => item.tenure) && this.filters.includeTenure;
      if (hasTenure) headers.push('Tenure');

      if (this.filters.includeLocation) headers.push('Location');

      // Add Status if the setting is enabled AND status data exists
      const hasStatus = data.some(item => item.status) && this.filters.includeStatus;
      if (hasStatus) headers.push('Status');

      // Add Sent Date/Message when any prospect has recorded message data
      const hasSentMessage = data.some(item => item.sentMessage);
      if (hasSentMessage) {
        headers.push('Sent Date');
        headers.push('Sent Message');
      }

      // Helper to split name
      const splitName = (fullName) => {
        const parts = (fullName || '').trim().split(/\s+/);
        const firstName = parts[0] || '';
        const lastName = parts.slice(1).join(' ') || '';
        return { firstName, lastName };
      };

      // Generate rows array
      const rows = data.map(profile => {
        const row = [];
        if (this.filters.includeFullName) row.push(profile.fullName);
        if (this.filters.includeFirstName) row.push(splitName(profile.fullName).firstName);
        if (this.filters.includeLastName) row.push(splitName(profile.fullName).lastName);
        if (this.filters.includeCompany) row.push(profile.company || '');
        if (this.filters.includeTitle) row.push(profile.title || '');
        if (hasTenure) row.push(profile.tenure || '');
        if (this.filters.includeLocation) row.push(profile.location || '');
        if (hasStatus) row.push(profile.status || '');
        if (hasSentMessage) row.push(profile.sentDate || '');
        if (hasSentMessage) row.push(profile.sentMessage || '');
        return row;
      });

      // Create content array with headers
      const plainTextRows = this.filters.includeColumnTitles ? [headers.join('\t')] : [];
      plainTextRows.push(...rows.map(row => row.join('\t')));
      const plainText = plainTextRows.join('\n');

      // Create HTML content with hyperlinks and headers
      const htmlContent = [
        '<table>',
        this.filters.includeColumnTitles ? `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>` : '',
        ...rows.map((row, index) => {
          return `<tr>
            ${row.map((cell, cellIndex) => {
              // Add hyperlink to the first cell
              if (cellIndex === 0) {
                return `<td><a href="${data[index].profileUrl}">${cell}</a></td>`;
              }
              return `<td>${cell}</td>`;
            }).join('')}
          </tr>`;
        }),
        '</table>'
      ].join('');

      try {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/plain': new Blob([plainText], { type: 'text/plain' }),
            'text/html': new Blob([htmlContent], { type: 'text/html' })
          })
        ]);
        console.log('Data copied to clipboard');
      } catch (err) {
        console.error('Failed to copy:', err);
        // Fallback to plain text if rich copy fails
        try {
          await navigator.clipboard.writeText(plainText);
          console.log('Fallback: Data copied as plain text');
        } catch (fallbackErr) {
          console.error('Fallback copy failed:', fallbackErr);
          alert('Failed to copy data to clipboard');
        }
      }
    }


  exportToCSV(data) {
      // Create headers based on what data is available and settings
      const headers = [];
      if (this.filters.includeFullName) headers.push('Full Name');
      if (this.filters.includeFirstName) headers.push('First Name');
      if (this.filters.includeLastName) headers.push('Last Name');
      if (this.filters.includeCompany) headers.push('Company');
      if (this.filters.includeTitle) headers.push('Title');

      // Only include Tenure if we have tenure data (not available on leads pages)
      const hasTenure = data.some(item => item.tenure) && this.filters.includeTenure;
      if (hasTenure) headers.push('Tenure');

      if (this.filters.includeLocation) headers.push('Location');

      // Add Status if the setting is enabled AND status data exists
      const hasStatus = data.some(item => item.status) && this.filters.includeStatus;
      if (hasStatus) headers.push('Status');

      // Add Sent Date/Message when any prospect has recorded message data
      const hasSentMessage = data.some(item => item.sentMessage);
      if (hasSentMessage) {
        headers.push('Sent Date');
        headers.push('Sent Message');
      }

      // Helper to split name
      const splitName = (fullName) => {
        const parts = (fullName || '').trim().split(/\s+/);
        const firstName = parts[0] || '';
        const lastName = parts.slice(1).join(' ') || '';
        return { firstName, lastName };
      };

      const csvContent = [
        this.filters.includeColumnTitles ? headers.join(',') : '',
        ...data.map(profile => {
          const row = [];
          if (this.filters.includeFullName) row.push(this.createHyperlink(profile.fullName, profile.profileUrl));
          if (this.filters.includeFirstName) row.push(this.escapeCSV(splitName(profile.fullName).firstName));
          if (this.filters.includeLastName) row.push(this.escapeCSV(splitName(profile.fullName).lastName));
          if (this.filters.includeCompany) row.push(this.escapeCSV(profile.company || ''));
          if (this.filters.includeTitle) row.push(this.escapeCSV(profile.title || ''));
          if (hasTenure) row.push(this.escapeCSV(profile.tenure || ''));
          if (this.filters.includeLocation) row.push(this.escapeCSV(profile.location || ''));
          if (hasStatus) row.push(this.escapeCSV(profile.status || ''));
          if (hasSentMessage) row.push(this.escapeCSV(profile.sentDate || ''));
          if (hasSentMessage) row.push(this.escapeCSV(profile.sentMessage || ''));
          return row.join(',');
        })
      ].filter(row => row).join('\n');

      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', 'navassist_export.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }


  createHyperlink(text, url) {
    return `"=HYPERLINK(""${url}"",""${text}"")"`;
  }

  escapeCSV(str) {
    if (!str) return '""';
    return `"${str.replace(/"/g, '""')}"`;
  }

  showNotification(message) {
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background-color: #4CAF50;
      color: white;
      padding: 16px;
      border-radius: 4px;
      z-index: 10000;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      font-family: Arial, sans-serif;
      font-size: 16px;
      transition: opacity 0.5s ease-in-out;
    `;
    document.body.appendChild(notification);

    // Ensure the notification is visible
    setTimeout(() => {
      notification.style.opacity = '1';
    }, 100);

    setTimeout(() => {
      notification.style.opacity = '0';
      setTimeout(() => {
        document.body.removeChild(notification);
      }, 500);
    }, 3000);
  }
}

// Shared scraper instance
let scraperInstance = null;

function getOrCreateScraper() {
  if (!scraperInstance) {
    scraperInstance = new LinkedInScraper();
  }
  return scraperInstance;
}

// Initialize when the page is ready
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM Content Loaded - Initializing LinkedInScraper');
  getOrCreateScraper();
  SessionManager.init();
});

// Initialize after delay to ensure page is loaded
setTimeout(() => {
  console.log('Timeout - Initializing LinkedInScraper');
  getOrCreateScraper();
  SessionManager.init();
}, 2000);

// Initialize when URL changes
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    console.log('URL changed - Initializing LinkedInScraper');
    getOrCreateScraper();
    SessionManager.onPageChange();
  }
}).observe(document, { subtree: true, childList: true });


// ========== SESSION MANAGER ==========
// Always active — shows capture button and badge on LinkedIn pages

const SessionManager = {
  badge: null,
  captureBtn: null,
  initialized: false,

  isValidPage() {
    return window.location.href.includes('/sales/');
  },

  init() {
    if (this.initialized) return;
    this.initialized = true;

    // Listen for messages from popup
    // NOTE: sessionExport is currently unused (no sender). If re-enabled,
    // call scraper.mergeSentMessages(data) before exporting.
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'sessionExport') {
        this.handleExport(message.exportType, message.data).then(() => {
          sendResponse({ ok: true });
        });
        return true;
      }
    });

    // Show badge with current count and capture button
    if (!this.isValidPage()) return;
    chrome.runtime.sendMessage({ action: 'getSessionState' }, (response) => {
      if (response) {
        this.showBadge(response.count);
        setTimeout(() => this.showCaptureButton(), 2000);
      }
    });
  },

  onPageChange() {
    this.removeCaptureButton();
    if (!this.isValidPage()) {
      this.removeBadge();
      return;
    }
    chrome.runtime.sendMessage({ action: 'getSessionState' }, (response) => {
      if (response) {
        this.showBadge(response.count);
        setTimeout(() => {
          this.showCaptureButton();
          let checks = 0;
          const recheckInterval = setInterval(() => {
            checks++;
            if (!document.getElementById('session-capture-btn')) {
              this.showCaptureButton();
            }
            if (checks >= 5) clearInterval(recheckInterval);
          }, 2000);
        }, 2000);
      }
    });
  },

  // ===== Capture Button =====

  showCaptureButton(retries) {
    retries = retries || 0;
    this.removeCaptureButton();

    const scraper = getOrCreateScraper();
    let container = null;

    if (scraper.isLeadsPage()) {
      container = document.querySelector('table') || document.querySelector('tbody');
      if (container && container.tagName === 'TBODY') container = container.closest('table');
    } else {
      container = document.querySelector('ol.artdeco-list');
    }

    // Retry if container not found yet (LinkedIn loads content async)
    if (!container && retries < 10) {
      setTimeout(() => this.showCaptureButton(retries + 1), 1000);
      return;
    }

    this.captureBtn = document.createElement('button');
    this.captureBtn.id = 'session-capture-btn';
    this.captureBtn.textContent = 'Export Data';
    this.captureBtn.style.cssText = `
      display: block;
      margin: 30px 0 30px auto;
      background-color: #0a66c2;
      color: white;
      padding: 10px 28px;
      border: none;
      border-radius: 20px;
      cursor: pointer;
      font-weight: 600;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      transition: background-color 0.2s ease;
    `;

    this.captureBtn.onmouseover = () => {
      this.captureBtn.style.backgroundColor = '#084e96';
    };
    this.captureBtn.onmouseout = () => {
      this.captureBtn.style.backgroundColor = '#0a66c2';
    };

    this.captureBtn.addEventListener('click', () => this.captureCurrentPage());

    if (container && container.parentNode) {
      container.parentNode.insertBefore(this.captureBtn, container.nextSibling);
    } else {
      const main = document.querySelector('main') || document.body;
      main.appendChild(this.captureBtn);
    }

    // Show Finished button if data already exists from previous captures
    chrome.storage.local.get({ sessionData: [] }, (result) => {
      if (result.sessionData.length > 0 && !document.getElementById('session-finished-btn')) {
        this.insertFinishedButton();
      }
    });
  },

  removeCaptureButton() {
    const existing = document.getElementById('session-capture-btn');
    if (existing) existing.remove();
    this.captureBtn = null;
    // Also remove finished button and export options on page change
    const finished = document.getElementById('session-finished-btn');
    if (finished) finished.remove();
    const exportOpts = document.getElementById('session-export-options');
    if (exportOpts) exportOpts.remove();
  },

  insertFinishedButton() {
    const captureBtn = document.getElementById('session-capture-btn');
    if (!captureBtn) return;

    const finishedBtn = document.createElement('button');
    finishedBtn.id = 'session-finished-btn';
    finishedBtn.textContent = 'Finished';
    finishedBtn.style.cssText = `
      display: block;
      margin: 10px 0 10px auto;
      background-color: #4CAF50;
      color: white;
      padding: 10px 28px;
      border: none;
      border-radius: 20px;
      cursor: pointer;
      font-weight: 600;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      transition: background-color 0.2s ease;
    `;
    finishedBtn.onmouseover = () => { finishedBtn.style.backgroundColor = '#2e7d32'; };
    finishedBtn.onmouseout = () => { finishedBtn.style.backgroundColor = '#4CAF50'; };

    finishedBtn.addEventListener('click', () => {
      if (document.getElementById('session-export-options')) return;

      const wrapper = document.createElement('div');
      wrapper.id = 'session-export-options';
      wrapper.style.cssText = 'display: flex; gap: 8px; justify-content: flex-end; margin: 10px 0;';

      const copyBtn = document.createElement('button');
      copyBtn.textContent = 'Copy to Clipboard';
      copyBtn.style.cssText = `
        background-color: #0a66c2; color: white; padding: 8px 20px;
        border: none; border-radius: 20px; cursor: pointer; font-weight: 600; font-size: 13px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15); transition: background-color 0.2s ease;
      `;
      copyBtn.onmouseover = () => { copyBtn.style.backgroundColor = '#084e96'; };
      copyBtn.onmouseout = () => { copyBtn.style.backgroundColor = '#0a66c2'; };
      copyBtn.addEventListener('click', () => {
        chrome.storage.local.get({ sessionData: [] }, (result) => {
          if (!result.sessionData.length) return;
          const scraper = getOrCreateScraper();
          scraper.loadFilters().then(() => {
            scraper.mergeSentMessages(result.sessionData).then((merged) => {
              scraper.copyToClipboard(merged).then(() => {
                copyBtn.textContent = 'Copied!';
                setTimeout(() => { copyBtn.textContent = 'Copy to Clipboard'; }, 1500);
                this.insertResetButton(wrapper);
              });
            });
          });
        });
      });

      const csvBtn = document.createElement('button');
      csvBtn.textContent = 'Export as CSV';
      csvBtn.style.cssText = `
        background-color: #0a66c2; color: white; padding: 8px 20px;
        border: none; border-radius: 20px; cursor: pointer; font-weight: 600; font-size: 13px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15); transition: background-color 0.2s ease;
      `;
      csvBtn.onmouseover = () => { csvBtn.style.backgroundColor = '#084e96'; };
      csvBtn.onmouseout = () => { csvBtn.style.backgroundColor = '#0a66c2'; };
      csvBtn.addEventListener('click', () => {
        chrome.storage.local.get({ sessionData: [] }, (result) => {
          if (!result.sessionData.length) return;
          const scraper = getOrCreateScraper();
          scraper.loadFilters().then(() => {
            scraper.mergeSentMessages(result.sessionData).then((merged) => {
              scraper.exportToCSV(merged);
              this.insertResetButton(wrapper);
            });
          });
        });
      });

      const sfdcBtn = document.createElement('button');
      sfdcBtn.textContent = 'Send to SFDC via Quicksuite';
      sfdcBtn.style.cssText = `
        background-color: #0a66c2; color: white; padding: 8px 20px;
        border: none; border-radius: 20px; cursor: pointer; font-weight: 600; font-size: 13px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15); transition: background-color 0.2s ease;
      `;
      sfdcBtn.onmouseover = () => { sfdcBtn.style.backgroundColor = '#084e96'; };
      sfdcBtn.onmouseout = () => { sfdcBtn.style.backgroundColor = '#0a66c2'; };
      sfdcBtn.addEventListener('click', () => {
        chrome.storage.local.get({ sessionData: [] }, (result) => {
          if (!result.sessionData.length) {
            alert('No prospects captured. Capture some first.');
            return;
          }
          const scraper = getOrCreateScraper();
          scraper.mergeSentMessages(result.sessionData).then((merged) => {
            this.copySfdcImportPrompt(merged).then(() => {
              sfdcBtn.textContent = 'Copied!';
              setTimeout(() => { sfdcBtn.textContent = 'Send to SFDC via Quicksuite'; }, 1500);
              this.showSfdcConfirmation(wrapper);
              this.insertResetButton(wrapper);
            }).catch(() => {
              alert('Failed to copy to clipboard. Please try again.');
            });
          });
        });
      });

      const infoIcon = document.createElement('span');
      infoIcon.textContent = 'ⓘ';
      infoIcon.title = 'Copies a prompt for Quicksuite to add these prospects to Salesforce. Requires Quicksuite with Salesforce MCP.';
      infoIcon.style.cssText = `
        cursor: help;
        font-size: 16px;
        color: #65676b;
        display: inline-flex;
        align-items: center;
      `;

      wrapper.appendChild(copyBtn);
      wrapper.appendChild(csvBtn);
      wrapper.appendChild(sfdcBtn);
      wrapper.appendChild(infoIcon);
      finishedBtn.parentNode.insertBefore(wrapper, finishedBtn.nextSibling);
      finishedBtn.remove();
    });

    captureBtn.parentNode.insertBefore(finishedBtn, captureBtn.nextSibling);
  },

  async copySfdcImportPrompt(data) {
    const splitName = (fullName) => {
      const parts = (fullName || '').trim().split(/\s+/);
      return { firstName: parts[0] || '', lastName: parts.slice(1).join(' ') || '' };
    };

    const records = data.map(p => {
      const { firstName, lastName } = splitName(p.fullName);
      return {
        firstName,
        lastName,
        title: p.title || '',
        company: p.company || '',
        linkedInUrl: p.profileUrl || '',
        sentDate: p.sentDate || '',
        sentMessage: p.sentMessage || ''
      };
    });

    const prompt = this.buildSfdcImportPrompt(records);
    await navigator.clipboard.writeText(prompt);
  },

  buildSfdcImportPrompt(records) {
    const instructions = `Import the following LinkedIn prospects into Salesforce as Contacts.

Rules:
1. Only use field values from the JSON below. Never infer or guess.
2. For each contact:
   a. Run search_accounts with the company name. Only use an accountId
      if the match is exact (case-insensitive) or an obvious variant
      (e.g., "Acme Corp" ↔ "Acme Corporation"). If unsure, skip and
      list under "Unmatched accounts".
   b. Before creating, run search_contacts filtered by the matched
      accountId and the prospect's firstName + lastName. If a match
      is found, use the existing contact — do not create a new one.
      Track it as a duplicate in the final report.
   c. If no duplicate, run create_contact with the provided fields
      plus the accountId.
   d. If sentMessage is non-empty, run create_task attached to the
      contact (whether newly created or existing duplicate) with:
        - Subject: "LinkedIn message sent"
        - Description: if sentDate is non-empty,
          "Sent {sentDate}:\n\n{sentMessage}"
          otherwise just {sentMessage}
        - Status: "Completed"
        - Type: "InMail"
      If sentMessage is empty, skip task creation for that contact.
3. Never create a contact without an accountId. Skip and list as
   unmatched if no account is found.
4. Omit any field not present in the JSON record — do not substitute
   or invent values.
5. Process sequentially. If three consecutive contacts fail for the
   same reason, stop and report.

After completion, output:
- Created: count and list of (name, contact ID)
- Duplicates skipped: count and list of (name, existing contact ID)
- Tasks created: count and list of (name, contact ID)
- Unmatched accounts: count and list of (name, company)
- Errors: count and list of (name, error)

Contacts:
`;
    return instructions + JSON.stringify(records, null, 2);
  },

  showSfdcConfirmation(wrapper) {
    const existing = document.getElementById('sfdc-confirmation-msg');
    if (existing) existing.remove();

    const msg = document.createElement('div');
    msg.id = 'sfdc-confirmation-msg';
    msg.textContent = '✓ Copied! Open Quicksuite, paste, and press Enter.';
    msg.style.cssText = `
      text-align: right;
      color: #057642;
      font-size: 13px;
      font-weight: 500;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 8px 0;
    `;
    wrapper.parentNode.insertBefore(msg, wrapper.nextSibling);

    setTimeout(() => {
      if (msg.parentNode) msg.remove();
    }, 4000);
  },
  insertResetButton(wrapper) {
    if (document.getElementById('session-reset-btn')) return;

    const resetBtn = document.createElement('button');
    resetBtn.id = 'session-reset-btn';
    resetBtn.textContent = 'Reset';
    resetBtn.style.cssText = `
      display: block;
      margin: 10px 0 10px auto;
      background: none;
      color: #65676b;
      border: 1px solid #65676b;
      padding: 8px 20px;
      border-radius: 20px;
      cursor: pointer;
      font-weight: 600;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      transition: color 0.2s ease, border-color 0.2s ease;
    `;
    resetBtn.onmouseover = () => { resetBtn.style.color = '#d32f2f'; resetBtn.style.borderColor = '#d32f2f'; };
    resetBtn.onmouseout = () => { resetBtn.style.color = '#65676b'; resetBtn.style.borderColor = '#65676b'; };

    resetBtn.addEventListener('click', () => {
      chrome.storage.local.set({ sessionData: [], capturedUrls: [], sentMessages: {} }, () => {
        this.updateBadge(0);
        wrapper.remove();
        resetBtn.remove();
      });
    });

    wrapper.parentNode.insertBefore(resetBtn, wrapper.nextSibling);
  },

  formatForClipboard(data, filters) {
    const splitName = (fullName) => {
      const parts = (fullName || '').trim().split(/\s+/);
      return { firstName: parts[0] || '', lastName: parts.slice(1).join(' ') || '' };
    };
    const headers = [];
    if (filters.includeFullName) headers.push('Full Name');
    if (filters.includeFirstName) headers.push('First Name');
    if (filters.includeLastName) headers.push('Last Name');
    if (filters.includeCompany) headers.push('Company');
    if (filters.includeTitle) headers.push('Title');
    const hasTenure = data.some(item => item.tenure) && filters.includeTenure;
    if (hasTenure) headers.push('Tenure');
    if (filters.includeLocation) headers.push('Location');
    const hasStatus = data.some(item => item.status) && filters.includeStatus;
    if (hasStatus) headers.push('Status');
    const rows = data.map(profile => {
      const row = [];
      if (filters.includeFullName) row.push(profile.fullName || '');
      if (filters.includeFirstName) row.push(splitName(profile.fullName).firstName);
      if (filters.includeLastName) row.push(splitName(profile.fullName).lastName);
      if (filters.includeCompany) row.push(profile.company || '');
      if (filters.includeTitle) row.push(profile.title || '');
      if (hasTenure) row.push(profile.tenure || '');
      if (filters.includeLocation) row.push(profile.location || '');
      if (hasStatus) row.push(profile.status || '');
      return row.join('\t');
    });
    return [headers.join('\t'), ...rows].join('\n');
  },

  async captureCurrentPage() {
    const scraper = getOrCreateScraper();
    await scraper.loadFilters();

    let profiles;
    if (scraper.isLeadsPage()) {
      profiles = this.scrapeLeadsFromDOM();
    } else {
      profiles = this.scrapeProfilesFromDOM();
    }

    if (profiles && profiles.length > 0) {
      chrome.runtime.sendMessage({
        action: 'sessionAddProspects',
        prospects: profiles
      }, (response) => {
        if (response) {
          console.log(`Captured ${response.added} new, ${response.total} total`);
          this.updateBadge(response.total);
          this.flashBadgeGreen();
          if (this.captureBtn) {
            this.captureBtn.textContent = `Captured ${response.added}!`;
            this.captureBtn.style.backgroundColor = '#2e7d32';
            setTimeout(() => {
              if (this.captureBtn) {
                this.captureBtn.textContent = 'Export Data';
                this.captureBtn.style.backgroundColor = '#0a66c2';
              }
            }, 1500);
          }
          // Show Finished button after first successful capture
          if (!document.getElementById('session-finished-btn')) {
            this.insertFinishedButton();
          }
        }
      });
    }
  },

  scrapeProfilesFromDOM() {
    const profiles = [];
    const elements = document.querySelectorAll('ol.artdeco-list li.artdeco-list__item');

    for (const profile of elements) {
      const nameElement = profile.querySelector('a.list-detail__view-profile-link, div.artdeco-entity-lockup__title a');
      const name = nameElement ? nameElement.textContent.trim() : '';
      const profileUrl = nameElement ? nameElement.href : '';
      if (!name || !profileUrl) continue;

      const titleElement = profile.querySelector('span[data-anonymize="title"]');
      const title = titleElement ? titleElement.textContent.trim() : '';

      const companyElement = profile.querySelector('[data-anonymize="company-name"]');
      let company = '';
      if (companyElement) {
        company = companyElement.textContent.trim();
      } else {
        const separator = profile.querySelector('span.separator--middot');
        if (separator) {
          let node = separator.nextSibling;
          while (node) {
            if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
              company = node.textContent.trim();
              break;
            }
            node = node.nextSibling;
          }
        }
      }

      const locationElement = profile.querySelector('div.artdeco-entity-lockup__caption');
      const location = locationElement ? locationElement.textContent.trim() : '';

      let tenure = '';
      const tenurePatterns = [
        /(\d+\s+years?\s+\d+\s+months?)\s+in\s+role/,
        /(\d+\s+years?\s+\d+\s+months?)\s+in\s+company/,
        /(\d+\s+years?\s+\d+\s+months?)/,
        /(\d+\s+months?)\s+in\s+role/,
        /(\d+\s+years?)\s+in\s+role/
      ];
      const text = profile.textContent;
      for (const pattern of tenurePatterns) {
        const match = text.match(pattern);
        if (match && match[1]) { tenure = match[1].trim(); break; }
      }

      profiles.push({ fullName: name, profileUrl, company, title, tenure, location, status: '' });
    }
    return profiles;
  },

  scrapeLeadsFromDOM() {
    const leads = [];
    let rows = document.querySelectorAll('tbody tr');
    if (!rows.length) rows = document.querySelectorAll('tr[data-row-id]');

    for (const row of rows) {
      if (!row.querySelector('a[href*="/lead/"]') && !row.querySelector('a[href*="/people/"]')) continue;

      let nameElement = row.querySelector('a[href*="/lead/"] span:first-child');
      if (!nameElement) nameElement = row.querySelector('a[href*="/people/"] span:first-child');
      if (!nameElement) nameElement = row.querySelector('td:first-child a span:first-child');

      const name = nameElement ? nameElement.textContent.trim() : '';
      const profileUrl = nameElement ? nameElement.closest('a').href : '';
      if (!name || !profileUrl) continue;

      const titleElement = row.querySelector('div[data-anonymize="job-title"]');
      const title = titleElement ? titleElement.textContent.trim() : '';

      const companyElement = row.querySelector('[data-anonymize="company-name"]');
      const company = companyElement ? companyElement.textContent.trim() : '';

      let location = '';
      const cells = row.querySelectorAll('td');
      if (cells.length >= 3) location = cells[2].textContent.trim();

      let status = '';
      const statusSelectors = ['[data-anonymize="outreach-activity"]', 'td:nth-child(5)', 'td:nth-child(6)'];
      for (const selector of statusSelectors) {
        const el = row.querySelector(selector);
        if (el) {
          const t = el.textContent.trim();
          if (t && t !== '-' && t !== 'No activity') { status = t; break; }
        }
      }

      leads.push({ fullName: name, profileUrl, company, title, tenure: '', location, status });
    }
    return leads;
  },

  // ===== Badge UI =====

  showBadge(count) {
    this.removeBadge();
    this.badge = document.createElement('div');
    this.badge.id = 'session-badge';
    this.badge.textContent = `Session: ${count} captured`;
    this.badge.style.cssText = `
      position: fixed;
      top: 80px;
      right: 20px;
      z-index: 9999;
      background-color: rgba(10, 102, 194, 0.9);
      color: white;
      padding: 8px 18px;
      border: none;
      border-radius: 20px;
      font-weight: 600;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      transition: background-color 0.3s ease;
      pointer-events: none;
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    `;
    document.body.appendChild(this.badge);
  },

  updateBadge(count) {
    if (this.badge) {
      this.badge.textContent = `Session: ${count} captured`;
    }
  },

  flashBadgeGreen() {
    if (!this.badge) return;
    this.badge.style.backgroundColor = '#4CAF50';
    setTimeout(() => {
      if (this.badge) {
        this.badge.style.backgroundColor = '#0a66c2';
      }
    }, 1500);
  },

  removeBadge() {
    const existing = document.getElementById('session-badge');
    if (existing) existing.remove();
    this.badge = null;
  },

  // ===== Session Export =====

  async handleExport(exportType, data) {
    const scraper = getOrCreateScraper();
    await scraper.loadFilters();

    if (exportType === 'csv') {
      scraper.exportToCSV(data);
    }
  }
};
