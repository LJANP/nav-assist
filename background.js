chrome.runtime.onInstalled.addListener(() => {
  console.log('NavAssist');
});

// Handle session data from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'sessionAddProspects') {
    chrome.storage.local.get({ sessionData: [], capturedUrls: [] }, function(result) {
      const existingUrls = new Set(result.capturedUrls);
      const newProspects = [];

      for (const prospect of message.prospects) {
        if (prospect.profileUrl && !existingUrls.has(prospect.profileUrl)) {
          existingUrls.add(prospect.profileUrl);
          newProspects.push(prospect);
        }
      }

      const updatedData = result.sessionData.concat(newProspects);
      const updatedUrls = Array.from(existingUrls);

      chrome.storage.local.set({
        sessionData: updatedData,
        capturedUrls: updatedUrls
      }, function() {
        sendResponse({
          added: newProspects.length,
          total: updatedData.length
        });
      });
    });
    return true; // keep message channel open for async response
  }

  if (message.action === 'getSessionState') {
    chrome.storage.local.get({
      sessionActive: false,
      sessionData: []
    }, function(result) {
      sendResponse({
        active: result.sessionActive,
        count: result.sessionData.length
      });
    });
    return true;
  }

  if (message.action === 'recordSentMessage') {
    const target = (message.fullName || '').trim().toLowerCase();
    if (!target || !message.message) {
      sendResponse({ recorded: false });
      return true;
    }
    chrome.storage.local.get({ sentMessages: {} }, function(result) {
      const sent = result.sentMessages;
      sent[target] = {
        message: message.message,
        date: formatSentDate(new Date()),
        campaign: message.campaign || ''
      };
      chrome.storage.local.set({ sentMessages: sent }, function() {
        sendResponse({ recorded: true });
      });
    });
    return true;
  }
});

function formatSentDate(d) {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return mm + '/' + dd + '/' + yy;
}
