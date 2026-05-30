// background.js
// Opens the side panel when the user clicks the extension icon.

chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});
